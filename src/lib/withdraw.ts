/**
 * Withdraw: burn the v4 position, swap the asset side back to USDC (with the
 * platform fee skimmed from the swap output), leaving the user all-USDC.
 * Built as one atomic batch like the deposit zap.
 */
import { encodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { Percent } from "@uniswap/sdk-core";
import { Position, V4PositionManager } from "@uniswap/v4-sdk";
import { NATIVE_ETH, USDC } from "./markets";
import { getPoolState } from "./onchain";
import { buildPool } from "./zap";
import {
  buildSwapCall,
  erc20Approve,
  permit2Approve,
  quoteAssetToUsdc,
  PERMIT2,
  POSM,
  ROUTER,
  type Call,
} from "./uniswap";
import type { OwnedPosition } from "./positions";

export type WithdrawPlan = {
  calls: Call[];
  assetOutMin: bigint;
  usdcOutMin: bigint;
  feeAmount: bigint;
};

export async function buildWithdrawPlan(params: {
  position: OwnedPosition;
  slippageBps: number;
}): Promise<WithdrawPlan> {
  const { position, slippageBps } = params;
  const market = position.market;
  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "30");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const slippage = new Percent(slippageBps, 10_000);

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
  calls.push({ to: POSM, value: BigInt(value), data: calldata as `0x${string}` });

  // guaranteed minimums out of the burn; the asset side depends on sort order
  const { amount0: min0, amount1: min1 } = sdkPosition.burnAmountsWithSlippage(slippage);
  const assetOutMin = BigInt(
    (market.assetIsCurrency0 ? min0 : min1).toString(),
  );

  // 2. swap the asset side back to USDC (skip if out-of-range all-USDC)
  let usdcOutMin = 0n;
  let feeAmount = 0n;
  if (assetOutMin > 0n) {
    const { amountOut } = await quoteAssetToUsdc(market, assetOutMin);
    usdcOutMin = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

    if (market.token !== NATIVE_ETH) {
      calls.push(erc20Approve(market.token, PERMIT2));
      calls.push(permit2Approve(market.token, ROUTER, deadline));
    }
    calls.push(
      buildSwapCall({
        market,
        direction: "assetToUsdc",
        amountIn: assetOutMin,
        minAmountOut: usdcOutMin,
        deadline,
      }),
    );

    // 3. platform fee on the swapped output
    feeAmount = (usdcOutMin * feeBps) / 10_000n;
    if (feeAmount > 0n && feeRecipient && feeRecipient !== zeroAddress) {
      calls.push({
        to: USDC.address,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [feeRecipient, feeAmount],
        }),
      });
    }
  }

  return { calls, assetOutMin, usdcOutMin, feeAmount };
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
  return [{ to: POSM, value: BigInt(value), data: calldata as `0x${string}` }];
}
