/**
 * Withdraw: burn the v4 position, swap the asset side back to USDG (with the
 * platform fee skimmed from the swap output), leaving the user all-USDG.
 * Built as one atomic batch like the deposit zap.
 */
import { encodeFunctionData, erc20Abi, maxUint256, maxUint160, parseAbi, zeroAddress } from "viem";
import { Ether, Percent } from "@uniswap/sdk-core";
import { Actions, Position, V4Planner, V4PositionManager } from "@uniswap/v4-sdk";
import { UNISWAP } from "./chain";
import { NATIVE_ETH, USDG, type Market } from "./markets";
import { getPoolState } from "./onchain";
import { buildPool, quoteAssetToUsdg, type Call } from "./zap";
import type { OwnedPosition } from "./positions";

const ROUTER = UNISWAP.v4.universalRouter as `0x${string}`;
const POSM = UNISWAP.v4.positionManager as `0x${string}`;
const PERMIT2 = UNISWAP.permit2 as `0x${string}`;

const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

export type WithdrawPlan = {
  calls: Call[];
  assetOutMin: bigint;
  usdgOutMin: bigint;
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

  // guaranteed minimums out of the burn
  const { amount0: min0 } = sdkPosition.burnAmountsWithSlippage(slippage);
  const assetOutMin = BigInt(min0.toString());

  // 2. swap the asset side back to USDG (skip if out-of-range all-USDG)
  let usdgOutMin = 0n;
  let feeAmount = 0n;
  if (assetOutMin > 0n) {
    const { amountOut } = await quoteAssetToUsdg(market, assetOutMin);
    usdgOutMin = (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

    if (market.token !== NATIVE_ETH) {
      calls.push({
        to: market.token,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PERMIT2, maxUint256] }),
      });
      calls.push({
        to: PERMIT2,
        value: 0n,
        data: encodeFunctionData({
          abi: permit2Abi,
          functionName: "approve",
          args: [market.token, ROUTER, maxUint160, Number(deadline)],
        }),
      });
    }

    const planner = new V4Planner();
    planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey: {
          currency0: market.pool.currency0,
          currency1: market.pool.currency1,
          fee: market.pool.fee,
          tickSpacing: market.pool.tickSpacing,
          hooks: zeroAddress,
        },
        zeroForOne: true, // asset (currency0) -> USDG (currency1)
        amountIn: assetOutMin.toString(),
        amountOutMinimum: usdgOutMin.toString(),
        hookData: "0x",
      },
    ]);
    planner.addAction(Actions.SETTLE_ALL, [market.pool.currency0, assetOutMin.toString()]);
    planner.addAction(Actions.TAKE_ALL, [market.pool.currency1, usdgOutMin.toString()]);
    calls.push({
      to: ROUTER,
      // native ETH input is paid as msg.value on the router call
      value: market.token === NATIVE_ETH ? assetOutMin : 0n,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: "execute",
        args: ["0x10", [planner.finalize() as `0x${string}`], deadline],
      }),
    });

    // 3. platform fee on the swapped output
    feeAmount = (usdgOutMin * feeBps) / 10_000n;
    if (feeAmount > 0n && feeRecipient && feeRecipient !== zeroAddress) {
      calls.push({
        to: USDG.address,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [feeRecipient, feeAmount],
        }),
      });
    }
  }

  return { calls, assetOutMin, usdgOutMin, feeAmount };
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
