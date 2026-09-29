/**
 * Deposit / withdraw plans for the v3-style venues (Uniswap v3, Aerodrome).
 * Same shape and same fee rules as the v4 zap in zap.ts / withdraw.ts, with
 * the venue's router and position manager in place of the Universal Router
 * and v4 PositionManager, WETH in place of native ETH, and plain ERC-20
 * approvals in place of Permit2.
 */
import { zeroAddress } from "viem";
import { Position as SdkPosition } from "@uniswap/v3-sdk";
import { CHAINS } from "./chain";
import { minDepositUsd } from "./limits";
import { quoteUsdMarket, type Market } from "./markets";
import { getPoolState, tickToPrice, type PoolState } from "./onchain";
import type { OwnedPosition } from "./positions";
import { quoteBaseToQuote, quoteQuoteToBase, type Call } from "./uniswap";
import { approvalIfNeeded, buildPoolV3, buildSwapCallV3, burnCallV3, increaseCallV3, mintCallV3, percent, positionForAmounts, v3Contracts } from "./v3core";
import { feeCalls, presetTicks, swapShare, type RangePreset, type ZapPlan } from "./zap";
import type { WithdrawPlan } from "./withdraw";

const bpsMul = (x: bigint, bps: bigint) => (x * bps) / 10_000n;

export async function buildZapPlanV3(params: {
  market: Market;
  owner: `0x${string}`;
  usdcAmount: bigint;
  preset: RangePreset;
  customWidth?: number;
  slippageBps: number;
  poolState: PoolState;
  addTo?: { tokenId: bigint; tickLower: number; tickUpper: number };
  referrer?: `0x${string}` | null;
}): Promise<ZapPlan> {
  const { market, owner, usdcAmount, preset, customWidth, slippageBps, poolState, addTo, referrer } = params;
  const quoteToken = CHAINS[market.chainId].quote;
  const stable = quoteToken.address;
  const minDep = minDepositUsd(market.chainId);
  if (usdcAmount < BigInt(minDep) * 10n ** BigInt(quoteToken.decimals)) {
    throw new Error(`Minimum deposit is $${minDep} on ${CHAINS[market.chainId].label}`);
  }
  const { positionManager, swapRouter } = v3Contracts(market.chainId, market.venue);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "60");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const keep = BigInt(10_000 - slippageBps);

  const feeAmount = bpsMul(usdcAmount, feeBps);
  const net = usdcAmount - feeAmount;
  const calls: Call[] = [];

  // 1. stablecoin → quote token through the same venue's dollar pool
  let budget = net;
  let quoteLeg: ZapPlan["quoteLeg"];
  let quoteUsd = 1;
  const qm = quoteUsdMarket(market);
  if (qm) {
    if (qm.venue !== market.venue) throw new Error("quote leg must be on the same venue");
    const qState = await getPoolState(qm);
    quoteUsd = tickToPrice(qm, qState.tick);
    const { amountOut } = await quoteQuoteToBase(qm, net);
    const quoteOutMin = bpsMul(amountOut, keep);
    calls.push(...(await approvalIfNeeded(market.chainId, stable, owner, v3Contracts(qm.chainId, qm.venue).swapRouter, net)));
    calls.push(buildSwapCallV3({ market: qm, direction: "quoteToBase", amountIn: net, minAmountOut: quoteOutMin, deadline, recipient: owner }));
    budget = quoteOutMin;
    quoteLeg = { stableIn: net, quoteOutMin };
  }

  // 2. quote → base for the range's ratio
  const { tickLower, tickUpper } = addTo ?? presetTicks(market, poolState.tick, preset, customWidth);
  const share = swapShare(poolState.tick, tickLower, tickUpper, market.baseIsCurrency0);
  const swapIn = (budget * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;
  const quoteToPosition = budget - swapIn;
  let swapOutMin = 0n;
  if (swapIn > 0n) {
    const { amountOut } = await quoteQuoteToBase(market, swapIn);
    swapOutMin = bpsMul(amountOut, keep);
    calls.push(...(await approvalIfNeeded(market.chainId, market.quote.address, owner, swapRouter, swapIn)));
    calls.push(buildSwapCallV3({ market, direction: "quoteToBase", amountIn: swapIn, minAmountOut: swapOutMin, deadline, recipient: owner }));
  }

  // 3. approvals for the position manager
  if (swapOutMin > 0n) calls.push(...(await approvalIfNeeded(market.chainId, market.base.address, owner, positionManager, swapOutMin)));
  if (quoteToPosition > 0n) calls.push(...(await approvalIfNeeded(market.chainId, market.quote.address, owner, positionManager, quoteToPosition)));

  // 4. mint (or add to an existing position) sized from the guaranteed amounts
  const c0 = market.baseIsCurrency0;
  const amount0 = c0 ? swapOutMin : quoteToPosition;
  const amount1 = c0 ? quoteToPosition : swapOutMin;
  const position = positionForAmounts(market, poolState, tickLower, tickUpper, amount0, amount1);
  const desired = position.mintAmounts;
  const mins = position.mintAmountsWithSlippage(percent(slippageBps));
  const mintArgs = {
    amount0: BigInt(desired.amount0.toString()),
    amount1: BigInt(desired.amount1.toString()),
    min0: BigInt(mins.amount0.toString()),
    min1: BigInt(mins.amount1.toString()),
    deadline,
  };
  calls.push(addTo ? increaseCallV3(market, { tokenId: addTo.tokenId, ...mintArgs }) : mintCallV3(market, { tickLower, tickUpper, recipient: owner, ...mintArgs }));

  // 5. platform fee last
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

export async function buildWithdrawPlanV3(params: {
  position: OwnedPosition;
  slippageBps: number;
  owner?: `0x${string}`;
  referrer?: `0x${string}` | null;
}): Promise<WithdrawPlan> {
  const { position, slippageBps, owner, referrer } = params;
  const market = position.market;
  const recipient = owner ?? zeroAddress;
  if (recipient === zeroAddress) throw new Error("withdraw needs the owner");
  const stable = CHAINS[market.chainId].quote.address;
  const { swapRouter } = v3Contracts(market.chainId, market.venue);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "60");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const keep = BigInt(10_000 - slippageBps);

  const poolState = await getPoolState(market);
  const sdkPosition = new SdkPosition({ pool: buildPoolV3(market, poolState), tickLower: position.tickLower, tickUpper: position.tickUpper, liquidity: position.liquidity.toString() });
  const { amount0: min0, amount1: min1 } = sdkPosition.burnAmountsWithSlippage(percent(slippageBps));
  const calls: Call[] = [];

  // 1. remove all liquidity and collect principal + fees to the wallet. The empty
  //    NFT is left alone: on some pools the manager refuses to burn it over a
  //    wei of rounding dust ("Not cleared"), and an empty position is invisible
  //    here anyway (enumeration drops liquidity-0 tokens).
  calls.push(burnCallV3(market, { tokenId: position.tokenId, liquidity: position.liquidity, min0: BigInt(min0.toString()), min1: BigInt(min1.toString()), recipient, deadline, burn: false }));
  const baseOutMin = BigInt((market.baseIsCurrency0 ? min0 : min1).toString());
  let quoteOutMin = BigInt((market.baseIsCurrency0 ? min1 : min0).toString());

  // 2. base → quote
  if (baseOutMin > 0n) {
    const { amountOut } = await quoteBaseToQuote(market, baseOutMin);
    const minOut = bpsMul(amountOut, keep);
    calls.push(...(await approvalIfNeeded(market.chainId, market.base.address, recipient, swapRouter, baseOutMin)));
    calls.push(buildSwapCallV3({ market, direction: "baseToQuote", amountIn: baseOutMin, minAmountOut: minOut, deadline, recipient }));
    quoteOutMin += minOut;
  }

  // 3. quote → stablecoin through the same venue's dollar pool
  let stableOutMin = quoteOutMin;
  const qm = quoteUsdMarket(market);
  if (qm && quoteOutMin > 0n) {
    const { amountOut } = await quoteBaseToQuote(qm, quoteOutMin);
    stableOutMin = bpsMul(amountOut, keep);
    calls.push(...(await approvalIfNeeded(market.chainId, market.quote.address, recipient, v3Contracts(qm.chainId, qm.venue).swapRouter, quoteOutMin)));
    calls.push(buildSwapCallV3({ market: qm, direction: "baseToQuote", amountIn: quoteOutMin, minAmountOut: stableOutMin, deadline, recipient }));
  }

  // 4. platform fee on the converted output only
  let feeAmount = 0n;
  const converted = qm ? stableOutMin : stableOutMin - (market.baseIsCurrency0 ? BigInt(min1.toString()) : BigInt(min0.toString()));
  if (converted > 0n) {
    feeAmount = bpsMul(converted, feeBps);
    calls.push(...feeCalls(stable, feeAmount, feeRecipient, referrer, recipient));
  }

  return { chainId: market.chainId, calls, baseOutMin, quoteOutMin, stableOutMin, feeAmount, assetOutMin: baseOutMin, usdcOutMin: stableOutMin };
}
