/**
 * Withdraw: burn the v4 position, swap the base leg back to the quote through
 * the market's pool, then (when the quote isn't the stablecoin) swap the
 * whole quote leg to the stablecoin through the quote's own pool, with the
 * platform fee skimmed from the final stablecoin output. Built as one atomic
 * batch like the deposit zap; the user ends up all-stablecoin.
 */
import { zeroAddress } from "viem";
import { Percent } from "@uniswap/sdk-core";
import { Position, V4PositionManager } from "@uniswap/v4-sdk";
import { CHAINS } from "./chain";
import { quoteUsdMarket } from "./markets";
import { getPoolState } from "./onchain";
import { buildPool, feeCalls } from "./zap";
import { approvalsFor, buildSwapCall, contractsOf, quoteBaseToQuote, type Call } from "./uniswap";
import type { OwnedPosition } from "./positions";

export type WithdrawPlan = {
  chainId: number;
  calls: Call[];
  /** guaranteed base out of the burn */
  baseOutMin: bigint;
  /** guaranteed quote units after the burn + base→quote swap */
  quoteOutMin: bigint;
  /** guaranteed stablecoin the user ends with (before fee) */
  stableOutMin: bigint;
  feeAmount: bigint;
  // aliases
  assetOutMin: bigint;
  usdcOutMin: bigint;
};

const bpsMul = (x: bigint, bps: bigint) => (x * bps) / 10_000n;

export async function buildWithdrawPlan(params: {
  position: OwnedPosition;
  slippageBps: number;
  /** the position owner (fee payer) and their referrer, for the on-chain split */
  owner?: `0x${string}`;
  referrer?: `0x${string}` | null;
}): Promise<WithdrawPlan> {
  const { position, slippageBps, owner, referrer } = params;
  const market = position.market;
  const stable = CHAINS[market.chainId].quote.address;
  const { router, posm } = contractsOf(market);
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "60");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const slippage = new Percent(slippageBps, 10_000);
  const keep = BigInt(10_000 - slippageBps);

  const poolState = await getPoolState(market);
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const sdkPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: position.liquidity.toString(),
  });

  const calls: Call[] = [];

  // 1. burn the position; PositionManager pays out both currencies
  const { calldata, value } = V4PositionManager.removeCallParameters(sdkPosition, {
    tokenId: position.tokenId.toString(),
    liquidityPercentage: new Percent(100, 100),
    slippageTolerance: slippage,
    deadline: deadline.toString(),
    burnToken: true,
  });
  calls.push({ to: posm, value: BigInt(value), data: calldata as `0x${string}` });

  // guaranteed minimums out of the burn, per sort order
  const { amount0: min0, amount1: min1 } = sdkPosition.burnAmountsWithSlippage(slippage);
  const baseOutMin = BigInt((market.baseIsCurrency0 ? min0 : min1).toString());
  let quoteOutMin = BigInt((market.baseIsCurrency0 ? min1 : min0).toString());

  // 2. base → quote through the market pool (skip if out-of-range all-quote)
  if (baseOutMin > 0n) {
    const { amountOut } = await quoteBaseToQuote(market, baseOutMin);
    const minOut = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.base.address, router, deadline));
    calls.push(buildSwapCall({ market, direction: "baseToQuote", amountIn: baseOutMin, minAmountOut: minOut, deadline }));
    quoteOutMin += minOut;
  }

  // 3. quote → stablecoin when the quote isn't the stablecoin
  let stableOutMin = quoteOutMin;
  const qm = quoteUsdMarket(market);
  if (qm && quoteOutMin > 0n) {
    const { amountOut } = await quoteBaseToQuote(qm, quoteOutMin); // qm.base === market.quote
    stableOutMin = bpsMul(amountOut, keep);
    calls.push(...approvalsFor(market.quote.address, router, deadline));
    calls.push(buildSwapCall({ market: qm, direction: "baseToQuote", amountIn: quoteOutMin, minAmountOut: stableOutMin, deadline }));
  }

  // 4. platform fee on the converted output only
  let feeAmount = 0n;
  const converted = qm ? stableOutMin : stableOutMin - (market.baseIsCurrency0 ? BigInt(min1.toString()) : BigInt(min0.toString()));
  if (converted > 0n) {
    feeAmount = bpsMul(converted, feeBps);
    calls.push(...feeCalls(stable, feeAmount, feeRecipient, referrer, owner ?? zeroAddress));
  }

  return {
    chainId: market.chainId,
    calls,
    baseOutMin,
    quoteOutMin,
    stableOutMin,
    feeAmount,
    assetOutMin: baseOutMin,
    usdcOutMin: stableOutMin,
  };
}

/** Collect accrued fees without touching principal. */
export async function buildCollectPlan(position: OwnedPosition, owner: `0x${string}`): Promise<Call[]> {
  const market = position.market;
  const poolState = await getPoolState(market);
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const sdkPosition = new Position({
    pool,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    liquidity: position.liquidity.toString(),
  });
  const { calldata, value } = V4PositionManager.collectCallParameters(sdkPosition, {
    tokenId: position.tokenId.toString(),
    recipient: owner,
    slippageTolerance: new Percent(100, 10_000),
    deadline: (Math.floor(Date.now() / 1000) + 20 * 60).toString(),
  });
  return [{ to: contractsOf(market).posm, value: BigInt(value), data: calldata as `0x${string}` }];
}
