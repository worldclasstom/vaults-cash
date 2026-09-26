/**
 * Targets: a ladder of narrow single-sided Uniswap v4 positions between the
 * current price and a price the user believes in.
 *
 *   up   — "I think it goes to $X": the deposit is swapped into the asset and
 *          parked in rungs ABOVE the current price. As price climbs through a
 *          rung it sells that slice into the quote, paying the pool fee on
 *          every trade that crosses it. Close = everything to the stablecoin.
 *   down — "I think it dips to $X": the deposit stays in the quote and sits
 *          in rungs BELOW the current price. As price falls through a rung it
 *          buys that slice. Close = keep the asset (the point of the ladder),
 *          or cash out.
 *
 * Every rung is a normal position NFT in the user's own wallet; nothing here
 * is custodial. Fees: the 0.6% entry fee as on Pools, plus 8% of the trading
 * fees the ladder earned, taken when fees are collected or the ladder closes.
 */
import { encodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { Percent, Ether } from "@uniswap/sdk-core";
import { Position, V4PositionManager } from "@uniswap/v4-sdk";
import { CHAINS, type ChainId } from "./chain";
import { NATIVE_ETH, quoteUsdMarket, type Market } from "./markets";
import { getPoolState, tickToPrice, type PoolState } from "./onchain";
import { getUncollectedFees, type OwnedPosition } from "./positions";
import { approvalsFor, buildSwapCall, contractsOf, quoteBaseToQuote, quoteQuoteToBase, type Call } from "./uniswap";
import { buildPool, feeCalls } from "./zap";
import { MIN_DEPOSIT_USD } from "./limits";

export type Direction = "up" | "down";
export const PERFORMANCE_FEE_BPS = 800n;
export const MIN_RUNGS = 2;
export const MAX_RUNGS = 8;
export const DEFAULT_RUNGS = 4;

export type RungSpec = {
  idx: number;
  tickLower: number;
  tickUpper: number;
  /** dollar price band of the base asset (low → high) */
  priceLow: number;
  priceHigh: number;
  /** dollars this rung holds today */
  amountUsd: number;
  /** what the rung turns into when price has fully crossed it, in dollars */
  ifCrossedUsd: number;
};

export type LadderPlan = {
  chainId: ChainId;
  direction: Direction;
  calls: Call[];
  feeAmount: bigint;
  rungs: RungSpec[];
  startTick: number;
  targetTick: number;
  /** dollar price now and at the target */
  priceNow: number;
  targetPrice: number;
  /** total dollars in the rungs after the fee */
  investedUsd: number;
  /** sum of ifCrossedUsd: the ladder's payout if the target prints, before fees earned */
  ifHitUsd: number;
  /** base units the ladder holds at start (up) — the "you hold today" line */
  baseHeld: number;
};

const bpsMul = (x: bigint, bps: bigint) => (x * bps) / 10_000n;
const sqrtP = (tick: number) => Math.pow(1.0001, tick / 2);

/** Ticks where the base asset is worth MORE than at `tick` lie in this direction. */
const upIsHigherTick = (m: Market) => m.baseIsCurrency0;

/** Dollar price of the base at `tick` (quote price × quote's dollar price). */
export function tickToUsd(market: Market, tick: number, quoteUsd: number) {
  return tickToPrice(market, tick) * quoteUsd;
}

/** Inverse of tickToPrice by bisection: the tick whose price is closest to `priceQuote`. */
export function priceToTick(market: Market, priceQuote: number): number {
  let lo = -887_000;
  let hi = 887_000;
  const inc = upIsHigherTick(market); // price rises with tick?
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const p = tickToPrice(market, mid);
    if (inc ? p < priceQuote : p > priceQuote) lo = mid;
    else hi = mid;
  }
  return Math.abs(tickToPrice(market, lo) - priceQuote) <= Math.abs(tickToPrice(market, hi) - priceQuote) ? lo : hi;
}

/**
 * Equal-width, spacing-aligned rungs between the current tick (exclusive)
 * and the target tick (inclusive), nearest the current price first.
 */
export function ladderTicks(market: Market, currentTick: number, targetTick: number, direction: Direction, rungs: number): Array<[number, number]> {
  const s = market.pool.tickSpacing;
  // the rungs sit on the side where they are single-sided: above price for
  // an up-ladder holding the asset, below for a down-ladder holding quote
  const above = direction === "up" ? upIsHigherTick(market) : !upIsHigherTick(market);
  if (above) {
    const first = Math.ceil((currentTick + 1) / s) * s;
    const last = Math.floor(targetTick / s) * s;
    const span = last - first;
    if (span < rungs * s) throw new Error(`That target is too close for ${rungs} rungs — pick a farther price or fewer rungs.`);
    const w = Math.floor(span / (rungs * s)) * s;
    return Array.from({ length: rungs }, (_, i) => [first + i * w, i === rungs - 1 ? last : first + (i + 1) * w] as [number, number]);
  }
  const first = Math.floor((currentTick - 1) / s) * s;
  const last = Math.ceil(targetTick / s) * s;
  const span = first - last;
  if (span < rungs * s) throw new Error(`That target is too close for ${rungs} rungs — pick a farther price or fewer rungs.`);
  const w = Math.floor(span / (rungs * s)) * s;
  return Array.from({ length: rungs }, (_, i) => [i === rungs - 1 ? last : first - (i + 1) * w, first - i * w] as [number, number]);
}

/** Raw token amounts a position of `liquidity` holds when price sits at `tick`. */
export function amountsAt(liquidity: bigint, tickLower: number, tickUpper: number, tick: number): { amount0: number; amount1: number } {
  const L = Number(liquidity);
  const sl = sqrtP(tickLower);
  const su = sqrtP(tickUpper);
  if (tick < tickLower) return { amount0: L * (1 / sl - 1 / su), amount1: 0 };
  if (tick >= tickUpper) return { amount0: 0, amount1: L * (su - sl) };
  const sp = sqrtP(tick);
  return { amount0: L * (1 / sp - 1 / su), amount1: L * (sp - sl) };
}

export type RungState = "waiting" | "live" | "done";

/** Where a rung stands given the pool's current tick. */
export function rungState(market: Market, direction: Direction, tickLower: number, tickUpper: number, tick: number): RungState {
  if (tick >= tickLower && tick < tickUpper) return "live";
  const above = direction === "up" ? upIsHigherTick(market) : !upIsHigherTick(market);
  // "done" = price has gone through the rung in the ladder's direction
  const crossed = above ? tick >= tickUpper : tick < tickLower;
  return crossed ? "done" : "waiting";
}

export async function buildLadderPlan(params: {
  market: Market;
  owner: `0x${string}`;
  usdcAmount: bigint;
  direction: Direction;
  /** dollar price the user believes in */
  targetPriceUsd: number;
  rungs: number;
  slippageBps: number;
  poolState: PoolState;
  referrer?: `0x${string}` | null;
}): Promise<LadderPlan> {
  const { market, owner, usdcAmount, direction, targetPriceUsd, slippageBps, poolState, referrer } = params;
  const rungs = Math.min(MAX_RUNGS, Math.max(MIN_RUNGS, Math.round(params.rungs)));
  const stableToken = CHAINS[market.chainId].quote;
  const stable = stableToken.address;
  if (usdcAmount < BigInt(MIN_DEPOSIT_USD) * 10n ** BigInt(stableToken.decimals)) throw new Error(`Minimum is $${MIN_DEPOSIT_USD}`);
  const { posm, router } = contractsOf(market);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "60");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const keep = BigInt(10_000 - slippageBps);

  // quote's dollar price (1 for the stablecoin)
  const qm = quoteUsdMarket(market);
  let quoteUsd = 1;
  if (qm) quoteUsd = tickToPrice(qm, (await getPoolState(qm)).tick);
  const priceNow = tickToUsd(market, poolState.tick, quoteUsd);
  if (direction === "up" && targetPriceUsd <= priceNow) throw new Error("For a sell ladder the target has to be above today's price.");
  if (direction === "down" && targetPriceUsd >= priceNow) throw new Error("For a buy ladder the target has to be below today's price.");
  const targetTick = priceToTick(market, targetPriceUsd / quoteUsd);
  const bands = ladderTicks(market, poolState.tick, targetTick, direction, rungs);

  const feeAmount = bpsMul(usdcAmount, feeBps);
  const net = usdcAmount - feeAmount;
  const calls: Call[] = [];

  // stablecoin → quote when the quote isn't the stablecoin
  let quoteBudget = net;
  if (qm) {
    const { amountOut } = await quoteQuoteToBase(qm, net);
    quoteBudget = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(stable, router, deadline));
    calls.push(buildSwapCall({ market: qm, direction: "quoteToBase", amountIn: net, minAmountOut: quoteBudget, deadline }));
  }

  // up: all of it becomes the asset; down: all of it stays quote
  let baseBudget = 0n;
  if (direction === "up") {
    const { amountOut } = await quoteQuoteToBase(market, quoteBudget);
    baseBudget = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.quote.address, router, deadline));
    calls.push(buildSwapCall({ market, direction: "quoteToBase", amountIn: quoteBudget, minAmountOut: baseBudget, deadline }));
    calls.push(...approvalsFor(market.base.address, posm, deadline));
  } else {
    calls.push(...approvalsFor(market.quote.address, posm, deadline));
  }

  const nativeLeg: "base" | "quote" | null = market.base.address === NATIVE_ETH ? "base" : market.quote.address === NATIVE_ETH ? "quote" : null;
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const total = direction === "up" ? baseBudget : quoteBudget;
  const perRung = total / BigInt(rungs);
  const specs: RungSpec[] = [];
  let ifHitUsd = 0;
  let investedUsd = 0;
  bands.forEach(([tickLower, tickUpper], i) => {
    const raw = i === rungs - 1 ? total - perRung * BigInt(rungs - 1) : perRung;
    // native ETH: mint 1% under the guaranteed amount so a small adverse move still fits
    const isNative = (direction === "up" && nativeLeg === "base") || (direction === "down" && nativeLeg === "quote");
    const forMint = isNative ? (raw * 99n) / 100n : raw;
    const holdsC0 = direction === "up" ? market.baseIsCurrency0 : !market.baseIsCurrency0;
    const position = holdsC0
      ? Position.fromAmount0({ pool, tickLower, tickUpper, amount0: forMint.toString(), useFullPrecision: true })
      : Position.fromAmount1({ pool, tickLower, tickUpper, amount1: forMint.toString() });
    const { calldata, value } = V4PositionManager.addCallParameters(position, {
      slippageTolerance: new Percent(slippageBps, 10_000),
      deadline: deadline.toString(),
      recipient: owner,
      useNative: nativeLeg ? Ether.onChain(market.chainId) : undefined,
    });
    const mintValue = isNative ? (BigInt(value) > raw ? raw : BigInt(value)) : 0n;
    calls.push({ to: posm, value: mintValue, data: calldata as `0x${string}` });

    // dollars now and when crossed
    const L = BigInt(position.liquidity.toString());
    const farTick = direction === "up" ? (upIsHigherTick(market) ? tickUpper : tickLower - 1) : upIsHigherTick(market) ? tickLower - 1 : tickUpper;
    const after = amountsAt(L, tickLower, tickUpper, farTick);
    const holdsUsd = direction === "up" ? (Number(raw) / 10 ** market.base.decimals) * priceNow : (Number(raw) / 10 ** market.quote.decimals) * quoteUsd;
    const crossedUsd =
      direction === "up"
        ? ((market.baseIsCurrency0 ? after.amount1 : after.amount0) / 10 ** market.quote.decimals) * quoteUsd
        : ((market.baseIsCurrency0 ? after.amount0 : after.amount1) / 10 ** market.base.decimals) * targetPriceUsd;
    const pLo = tickToUsd(market, tickLower, quoteUsd);
    const pHi = tickToUsd(market, tickUpper, quoteUsd);
    specs.push({ idx: i, tickLower, tickUpper, priceLow: Math.min(pLo, pHi), priceHigh: Math.max(pLo, pHi), amountUsd: holdsUsd, ifCrossedUsd: crossedUsd });
    ifHitUsd += crossedUsd;
    investedUsd += holdsUsd;
  });

  calls.push(...feeCalls(stable, feeAmount, feeRecipient, referrer, owner));

  return {
    chainId: market.chainId as ChainId,
    direction,
    calls,
    feeAmount,
    rungs: specs,
    startTick: poolState.tick,
    targetTick,
    priceNow,
    targetPrice: targetPriceUsd,
    investedUsd,
    ifHitUsd,
    baseHeld: direction === "up" ? Number(baseBudget) / 10 ** market.base.decimals : 0,
  };
}

export type ClosePlan = {
  chainId: ChainId;
  calls: Call[];
  /** guaranteed stablecoin the user ends with, after fees (cash mode) */
  stableOutMin: bigint;
  /** base units kept in the wallet (keep mode) */
  baseKept: bigint;
  /** the trading fees the ladder earned, in stablecoin units, and the 8% of them we take */
  feesEarnedStable: bigint;
  performanceFee: bigint;
  /** the 0.6% on converted principal (cash mode only) */
  withdrawFee: bigint;
};

/**
 * Fees earned by the rungs, converted to stablecoin units at today's price.
 * Used to size the performance fee; the actual conversion happens in the
 * swaps the plan already makes.
 */
async function feesEarnedInStable(positions: OwnedPosition[], quoteUsd: number, priceNow: number): Promise<{ stable: bigint; base: bigint; quote: bigint }> {
  const market = positions[0].market;
  let base = 0n;
  let quote = 0n;
  for (const p of positions) {
    const f = await getUncollectedFees(p).catch(() => ({ owed0: 0n, owed1: 0n }));
    base += market.baseIsCurrency0 ? f.owed0 : f.owed1;
    quote += market.baseIsCurrency0 ? f.owed1 : f.owed0;
  }
  const stableDecimals = CHAINS[market.chainId].quote.decimals;
  const usd = (Number(base) / 10 ** market.base.decimals) * priceNow + (Number(quote) / 10 ** market.quote.decimals) * quoteUsd;
  return { stable: BigInt(Math.floor(usd * 10 ** stableDecimals)), base, quote };
}

/**
 * Close a ladder: burn every rung in one batch. `cash` converts everything
 * to the stablecoin (the sell-ladder ending); `keep` leaves the asset in the
 * wallet and only converts the fee portion so the performance fee can be
 * taken in stablecoin (the buy-ladder ending).
 */
export async function buildLadderClosePlan(params: {
  positions: OwnedPosition[];
  owner: `0x${string}`;
  mode: "cash" | "keep";
  slippageBps: number;
  referrer?: `0x${string}` | null;
}): Promise<ClosePlan> {
  const { positions, owner, mode, slippageBps, referrer } = params;
  if (!positions.length) throw new Error("Nothing to close");
  const market = positions[0].market;
  const chainId = market.chainId as ChainId;
  const stable = CHAINS[chainId].quote.address;
  const { router, posm } = contractsOf(market);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "60");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const slippage = new Percent(slippageBps, 10_000);
  const keep = BigInt(10_000 - slippageBps);

  const poolState = await getPoolState(market);
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const qm = quoteUsdMarket(market);
  const quoteUsd = qm ? tickToPrice(qm, (await getPoolState(qm)).tick) : 1;
  const priceNow = tickToUsd(market, poolState.tick, quoteUsd);
  const fees = await feesEarnedInStable(positions, quoteUsd, priceNow);

  const calls: Call[] = [];
  let baseOut = 0n;
  let quoteOut = 0n;
  for (const p of positions) {
    const sdkPosition = new Position({ pool, tickLower: p.tickLower, tickUpper: p.tickUpper, liquidity: p.liquidity.toString() });
    const { calldata, value } = V4PositionManager.removeCallParameters(sdkPosition, {
      tokenId: p.tokenId.toString(),
      liquidityPercentage: new Percent(100, 100),
      slippageTolerance: slippage,
      deadline: deadline.toString(),
      burnToken: true,
    });
    calls.push({ to: posm, value: BigInt(value), data: calldata as `0x${string}` });
    const { amount0, amount1 } = sdkPosition.burnAmountsWithSlippage(slippage);
    baseOut += BigInt((market.baseIsCurrency0 ? amount0 : amount1).toString());
    quoteOut += BigInt((market.baseIsCurrency0 ? amount1 : amount0).toString());
  }
  // burns also pay out the uncollected fees
  baseOut += fees.base;
  quoteOut += fees.quote;

  let stableOutMin = 0n;
  let baseKept = 0n;
  let withdrawFee = 0n;
  if (mode === "cash") {
    let quoteTotal = quoteOut;
    if (baseOut > 0n) {
      const { amountOut } = await quoteBaseToQuote(market, baseOut);
      const minOut = bpsMul(amountOut, keep);
      calls.push(...approvalsFor(market.base.address, router, deadline));
      calls.push(buildSwapCall({ market, direction: "baseToQuote", amountIn: baseOut, minAmountOut: minOut, deadline }));
      quoteTotal += minOut;
    }
    stableOutMin = quoteTotal;
    if (qm && quoteTotal > 0n) {
      const { amountOut } = await quoteBaseToQuote(qm, quoteTotal);
      stableOutMin = bpsMul(amountOut, keep);
      calls.push(...approvalsFor(market.quote.address, router, deadline));
      calls.push(buildSwapCall({ market: qm, direction: "baseToQuote", amountIn: quoteTotal, minAmountOut: stableOutMin, deadline }));
    }
    const principal = stableOutMin > fees.stable ? stableOutMin - fees.stable : 0n;
    withdrawFee = bpsMul(principal, feeBps);
  } else {
    // keep the asset; convert only the fee portion so the performance fee is stablecoin
    baseKept = baseOut - fees.base;
    let feeQuote = fees.quote;
    if (fees.base > 0n) {
      const { amountOut } = await quoteBaseToQuote(market, fees.base);
      const minOut = bpsMul(amountOut, keep);
      calls.push(...approvalsFor(market.base.address, router, deadline));
      calls.push(buildSwapCall({ market, direction: "baseToQuote", amountIn: fees.base, minAmountOut: minOut, deadline }));
      feeQuote += minOut;
    }
    if (qm && feeQuote > 0n) {
      const { amountOut } = await quoteBaseToQuote(qm, feeQuote);
      const minOut = bpsMul(amountOut, keep);
      calls.push(...approvalsFor(market.quote.address, router, deadline));
      calls.push(buildSwapCall({ market: qm, direction: "baseToQuote", amountIn: feeQuote, minAmountOut: minOut, deadline }));
    }
    // unfilled rungs pay out quote; on a stable-quote market that is already dollars in the wallet
  }
  const performanceFee = bpsMul(fees.stable, PERFORMANCE_FEE_BPS);
  const totalFee = performanceFee + withdrawFee;
  calls.push(...feeCalls(stable, totalFee, feeRecipient, referrer, owner));
  return { chainId, calls, stableOutMin: stableOutMin > totalFee ? stableOutMin - totalFee : 0n, baseKept, feesEarnedStable: fees.stable, performanceFee, withdrawFee };
}

/**
 * Collect the fees every rung has earned, convert them to the stablecoin,
 * take the performance fee, leave the rest in the wallet. Principal untouched.
 */
export async function buildLadderCollectPlan(params: { positions: OwnedPosition[]; owner: `0x${string}`; slippageBps: number; referrer?: `0x${string}` | null }): Promise<ClosePlan> {
  const { positions, owner, slippageBps, referrer } = params;
  if (!positions.length) throw new Error("Nothing to collect");
  const market = positions[0].market;
  const chainId = market.chainId as ChainId;
  const stable = CHAINS[chainId].quote.address;
  const { router, posm } = contractsOf(market);
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const keep = BigInt(10_000 - slippageBps);
  const poolState = await getPoolState(market);
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const qm = quoteUsdMarket(market);
  const quoteUsd = qm ? tickToPrice(qm, (await getPoolState(qm)).tick) : 1;
  const priceNow = tickToUsd(market, poolState.tick, quoteUsd);
  const fees = await feesEarnedInStable(positions, quoteUsd, priceNow);
  if (fees.stable === 0n) throw new Error("No fees to collect yet");

  const calls: Call[] = [];
  for (const p of positions) {
    const sdkPosition = new Position({ pool, tickLower: p.tickLower, tickUpper: p.tickUpper, liquidity: p.liquidity.toString() });
    const { calldata, value } = V4PositionManager.collectCallParameters(sdkPosition, {
      tokenId: p.tokenId.toString(),
      slippageTolerance: new Percent(slippageBps, 10_000),
      deadline: deadline.toString(),
      recipient: owner,
    });
    calls.push({ to: posm, value: BigInt(value), data: calldata as `0x${string}` });
  }
  let feeQuote = fees.quote;
  if (fees.base > 0n) {
    const { amountOut } = await quoteBaseToQuote(market, fees.base);
    const minOut = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.base.address, router, deadline));
    calls.push(buildSwapCall({ market, direction: "baseToQuote", amountIn: fees.base, minAmountOut: minOut, deadline }));
    feeQuote += minOut;
  }
  let stableOutMin = feeQuote;
  if (qm && feeQuote > 0n) {
    const { amountOut } = await quoteBaseToQuote(qm, feeQuote);
    stableOutMin = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.quote.address, router, deadline));
    calls.push(buildSwapCall({ market: qm, direction: "baseToQuote", amountIn: feeQuote, minAmountOut: stableOutMin, deadline }));
  }
  const performanceFee = bpsMul(fees.stable, PERFORMANCE_FEE_BPS);
  calls.push(...feeCalls(stable, performanceFee, feeRecipient, referrer, owner));
  return { chainId, calls, stableOutMin: stableOutMin > performanceFee ? stableOutMin - performanceFee : 0n, baseKept: 0n, feesEarnedStable: fees.stable, performanceFee, withdrawFee: 0n };
}

/** A plain ERC-20 transfer, for the odd sweep. */
export function transferCall(token: `0x${string}`, to: `0x${string}`, amount: bigint): Call {
  return { to: token, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }) };
}
export { zeroAddress };
