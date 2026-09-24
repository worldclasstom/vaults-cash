/**
 * The vaults.cash zap engine.
 *
 * Turns N of the chain's stablecoin into a Uniswap v4 LP position in one
 * atomic batch of calls (executed as a single ERC-4337 userOp from the
 * user's smart wallet):
 *
 *   1. [quote ≠ stablecoin] swap ALL of it into the quote token through the
 *      quote's own stablecoin pool (e.g. USDC → ETH for a cbBTC/ETH market)
 *   2. swap the computed share of the quote budget into the base token
 *      through the market's pool
 *   3. approve both legs → Permit2 → PositionManager
 *   4. PositionManager.modifyLiquidities: mint the position NFT
 *   5. skim the platform fee (plain stablecoin transfer, last)
 *
 * All calls are built up-front from quotes; every swap's amountOutMinimum
 * and the mint's amountMax bounds make the whole batch revert atomically if
 * a pool moves beyond the slippage tolerance. Any dust stays in the user's
 * own wallet — there is no vaults.cash contract holding funds.
 */
import { encodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { Ether, Percent, Token, type Currency } from "@uniswap/sdk-core";
import { Pool, Position, V4PositionManager } from "@uniswap/v4-sdk";
import { CHAINS } from "./chain";
import { REFERRER_SHARE } from "./referral-share";
import { MIN_DEPOSIT_USD } from "./limits";
import { NATIVE_ETH, quoteUsdMarket, type Market, type TokenInfo } from "./markets";
import type { PoolState } from "./onchain";
import { getPoolState, tickToPrice } from "./onchain";
import { approvalsFor, buildSwapCall, contractsOf, quoteQuoteToBase, type Call } from "./uniswap";

export type { Call } from "./uniswap";

export type RangePreset = "full" | "balanced" | "aggressive";
/** half-width of the range as a fraction of price; full = entire curve */
export const PRESET_WIDTH: Record<Exclude<RangePreset, "full">, number> = {
  balanced: 0.3,
  aggressive: 0.15,
};

const MIN_TICK = -887272;
const MAX_TICK = 887272;

function currencyOf(chainId: number, t: TokenInfo): Currency {
  return t.address === NATIVE_ETH ? Ether.onChain(chainId) : new Token(chainId, t.address, t.decimals, t.symbol);
}

export function buildPool(market: Market, sqrtPriceX96: bigint, tick: number, liquidity: bigint): Pool {
  return new Pool(
    currencyOf(market.chainId, market.base),
    currencyOf(market.chainId, market.quote),
    market.pool.fee,
    market.pool.tickSpacing,
    zeroAddress,
    sqrtPriceX96.toString(),
    liquidity.toString(),
    tick,
  );
}

/** Snap a preset to valid, spacing-aligned ticks around the current price. */
export function presetTicks(
  market: Market,
  currentTick: number,
  preset: RangePreset,
  customWidth?: number,
): { tickLower: number; tickUpper: number } {
  const spacing = market.pool.tickSpacing;
  if (preset === "full" && customWidth === undefined) {
    return {
      tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
      tickUpper: Math.floor(MAX_TICK / spacing) * spacing,
    };
  }
  const width = customWidth ?? PRESET_WIDTH[preset as Exclude<RangePreset, "full">];
  const dDown = Math.log(1 - width) / Math.log(1.0001);
  const dUp = Math.log(1 + width) / Math.log(1.0001);
  let tickLower = Math.floor((currentTick + dDown) / spacing) * spacing;
  let tickUpper = Math.ceil((currentTick + dUp) / spacing) * spacing;
  // guarantee at least one spacing on each side of the current tick so the
  // position is two-sided even on coarse-spacing pools (e.g. 5% tier = 1000)
  if (tickLower > currentTick - 1) tickLower -= spacing;
  if (tickUpper < currentTick + 1) tickUpper += spacing;
  return {
    tickLower: Math.max(tickLower, Math.ceil(MIN_TICK / spacing) * spacing),
    tickUpper: Math.min(tickUpper, Math.floor(MAX_TICK / spacing) * spacing),
  };
}

/**
 * Which share of the quote budget must be swapped into the base token so the
 * two sides match the range's required ratio at the current price. Float
 * math is fine here: the result only seeds the quote, and the batch is
 * guarded by amountOutMinimum/amountMax.
 */
export function swapShare(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  baseIsCurrency0: boolean,
): number {
  // out of range: position is single-sided in one currency
  if (currentTick <= tickLower) return baseIsCurrency0 ? 1 : 0; // all c0
  if (currentTick >= tickUpper) return baseIsCurrency0 ? 0 : 1; // all c1
  const sp = Math.pow(1.0001, currentTick / 2);
  const sl = Math.pow(1.0001, tickLower / 2);
  const su = Math.pow(1.0001, tickUpper / 2);
  const amount0PerL = 1 / sp - 1 / su;
  const amount1PerL = sp - sl;
  const price = sp * sp; // c1 per c0, raw
  const value0 = amount0PerL * price; // both sides valued in c1 units
  const share0 = value0 / (value0 + amount1PerL);
  return baseIsCurrency0 ? share0 : 1 - share0;
}

export type ZapPlan = {
  chainId: number;
  calls: Call[];
  /** platform fee, stablecoin units */
  feeAmount: bigint;
  /** stablecoin → quote leg (only when quote ≠ stablecoin): input and min out */
  quoteLeg?: { stableIn: bigint; quoteOutMin: bigint };
  /** quote units sent into the market pool for base */
  swapIn: bigint;
  /** guaranteed base out of that swap */
  swapOutMin: bigint;
  /** quote units kept for the position */
  quoteToPosition: bigint;
  /** dollar price of one quote unit (1 for the stablecoin) at plan time */
  quoteUsd: number;
  /** base price in quote units at plan time */
  price: number;
  tickLower: number;
  tickUpper: number;
  /** set when the plan adds to an existing position instead of minting */
  addToTokenId?: bigint;
};

const bpsMul = (x: bigint, bps: bigint) => (x * bps) / 10_000n;

/** Fee transfer(s): the whole fee to the fee wallet, or split with the
 *  referrer (REFERRER_SHARE to them, the rest to us). Self-referrals and a
 *  zero recipient collapse to the plain transfer. */
export function feeCalls(
  stable: `0x${string}`,
  feeAmount: bigint,
  feeRecipient: `0x${string}` | undefined,
  referrer: `0x${string}` | null | undefined,
  payer: `0x${string}`,
): Call[] {
  if (feeAmount <= 0n || !feeRecipient || feeRecipient === zeroAddress) return [];
  const transfer = (to: `0x${string}`, amount: bigint): Call => ({
    to: stable,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] }),
  });
  const validReferrer =
    referrer && referrer !== zeroAddress && referrer.toLowerCase() !== payer.toLowerCase() && referrer.toLowerCase() !== feeRecipient.toLowerCase();
  if (!validReferrer) return [transfer(feeRecipient, feeAmount)];
  const referrerAmount = (feeAmount * BigInt(Math.round(REFERRER_SHARE * 10_000))) / 10_000n;
  const ours = feeAmount - referrerAmount;
  const out: Call[] = [];
  if (referrerAmount > 0n) out.push(transfer(referrer, referrerAmount));
  if (ours > 0n) out.push(transfer(feeRecipient, ours));
  return out;
}

export async function buildZapPlan(params: {
  market: Market;
  owner: `0x${string}`;
  /** stablecoin amount to deposit, raw units */
  usdcAmount: bigint;
  preset: RangePreset;
  customWidth?: number;
  slippageBps: number;
  poolState: PoolState;
  /** add to this position (its range) instead of minting a new one */
  addTo?: { tokenId: bigint; tickLower: number; tickUpper: number };
  /** wallet of whoever referred `owner`: gets REFERRER_SHARE of the fee
   *  on-chain in this same batch */
  referrer?: `0x${string}` | null;
}): Promise<ZapPlan> {
  const { market, owner, usdcAmount, preset, customWidth, slippageBps, poolState, addTo, referrer } = params;
  const quoteToken = CHAINS[market.chainId].quote;
  const stable = quoteToken.address;
  if (usdcAmount < BigInt(MIN_DEPOSIT_USD) * 10n ** BigInt(quoteToken.decimals)) {
    throw new Error(`Minimum deposit is $${MIN_DEPOSIT_USD}`);
  }
  const { posm, router } = contractsOf(market);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "30");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const keep = BigInt(10_000 - slippageBps);

  const feeAmount = bpsMul(usdcAmount, feeBps);
  const net = usdcAmount - feeAmount;
  const calls: Call[] = [];

  // 1. stablecoin → quote token when the quote isn't the stablecoin
  let budget = net; // quote units available for the position
  let quoteLeg: ZapPlan["quoteLeg"];
  let quoteUsd = 1;
  const qm = quoteUsdMarket(market);
  if (qm) {
    const qState = await getPoolState(qm);
    quoteUsd = tickToPrice(qm, qState.tick);
    const { amountOut } = await quoteQuoteToBase(qm, net); // qm.base === market.quote
    const quoteOutMin = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(stable, router, deadline));
    calls.push(buildSwapCall({ market: qm, direction: "quoteToBase", amountIn: net, minAmountOut: quoteOutMin, deadline }));
    budget = quoteOutMin;
    quoteLeg = { stableIn: net, quoteOutMin };
  }

  // 2. quote → base for the range's required ratio
  const { tickLower, tickUpper } = addTo ?? presetTicks(market, poolState.tick, preset, customWidth);
  const share = swapShare(poolState.tick, tickLower, tickUpper, market.baseIsCurrency0);
  const swapIn = (budget * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;
  const quoteToPosition = budget - swapIn;

  let swapOutMin = 0n;
  if (swapIn > 0n) {
    const { amountOut } = await quoteQuoteToBase(market, swapIn);
    swapOutMin = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.quote.address, router, deadline));
    calls.push(buildSwapCall({ market, direction: "quoteToBase", amountIn: swapIn, minAmountOut: swapOutMin, deadline }));
  }

  // 3. approvals for the PositionManager, both legs
  if (swapOutMin > 0n) calls.push(...approvalsFor(market.base.address, posm, deadline));
  if (quoteToPosition > 0n) calls.push(...approvalsFor(market.quote.address, posm, deadline));

  // 4. mint — sized from guaranteed amounts. Native ETH: the only ETH the
  // wallet holds at this point is a swap output, but the SDK's `value` is
  // amountMax — the slippage-widened bound, several % above the minimum for
  // a concentrated range — and sending it reverts. So send exactly the
  // guaranteed amount and size the mint 1% under it, so a small adverse move
  // between quote and inclusion still fits; the sliver left over stays in
  // the wallet as ETH (a gas reserve on chains without a paymaster).
  const nativeLeg: "base" | "quote" | null =
    market.base.address === NATIVE_ETH ? "base" : market.quote.address === NATIVE_ETH ? "quote" : null;
  const baseForMint = nativeLeg === "base" ? (swapOutMin * 99n) / 100n : swapOutMin;
  const quoteForMint = nativeLeg === "quote" && qm ? (quoteToPosition * 99n) / 100n : quoteToPosition;
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: (market.baseIsCurrency0 ? baseForMint : quoteForMint).toString(),
    amount1: (market.baseIsCurrency0 ? quoteForMint : baseForMint).toString(),
    useFullPrecision: true,
  });
  const common = {
    slippageTolerance: new Percent(slippageBps, 10_000),
    deadline: deadline.toString(),
    useNative: nativeLeg ? Ether.onChain(market.chainId) : undefined,
  };
  // with a tokenId the SDK encodes INCREASE_LIQUIDITY on that position
  // instead of minting a new NFT
  const { calldata, value } = V4PositionManager.addCallParameters(
    position,
    addTo ? { ...common, tokenId: addTo.tokenId.toString() } : { ...common, recipient: owner },
  );
  const guaranteedNative = nativeLeg === "base" ? swapOutMin : nativeLeg === "quote" ? quoteToPosition : 0n;
  const mintValue = BigInt(value) > guaranteedNative ? guaranteedNative : BigInt(value);
  calls.push({ to: posm, value: mintValue, data: calldata as `0x${string}` });

  // 5. platform fee LAST: in the atomic path order is irrelevant, and in a
  // sequential fallback the fee is only charged once the position exists
  // (an abandoned attempt costs the user nothing). A referrer is paid their
  // share here, on-chain — no payout process, nothing held on their behalf.
  calls.push(...feeCalls(stable, feeAmount, feeRecipient, referrer, owner));

  return {
    chainId: market.chainId,
    calls,
    feeAmount,
    quoteLeg,
    swapIn,
    swapOutMin,
    quoteToPosition,
    quoteUsd,
    price: tickToPrice(market, poolState.tick),
    tickLower,
    tickUpper,
    addToTokenId: addTo?.tokenId,
  };
}

/** Dollar breakdown of the planned position (for the confirm sheet). */
export function planSummary(plan: ZapPlan, market: Market) {
  const baseUnits = Number(plan.swapOutMin) / 10 ** market.base.decimals;
  const quoteUnits = Number(plan.quoteToPosition) / 10 ** market.quote.decimals;
  const stableDecimals = CHAINS[market.chainId].quote.decimals;
  return {
    baseAmount: baseUnits,
    baseUsd: baseUnits * plan.price * plan.quoteUsd,
    quoteAmount: quoteUnits,
    quoteUsd: quoteUnits * plan.quoteUsd,
    feeUsd: Number(plan.feeAmount) / 10 ** stableDecimals,
    // aliases for the older confirm sheet
    assetUsd: baseUnits * plan.price * plan.quoteUsd,
    usdcUsd: quoteUnits * plan.quoteUsd,
  };
}
