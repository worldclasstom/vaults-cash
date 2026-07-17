/**
 * Shared Uniswap v4 plumbing used by both the deposit zap and the withdraw
 * flow: contract handles, ABIs, approval-call builders, the router swap-call
 * builder, and quoting. Single source of truth for swap direction logic.
 */
import {
  encodeFunctionData,
  erc20Abi,
  maxUint160,
  maxUint256,
  parseAbi,
  zeroAddress,
} from "viem";
import { Actions, V4Planner } from "@uniswap/v4-sdk";
import { UNISWAP } from "./chain";
import type { Market } from "./markets";
import { publicClient } from "./onchain";

export type Call = { to: `0x${string}`; value: bigint; data: `0x${string}` };

export const PERMIT2 = UNISWAP.permit2 as `0x${string}`;
export const ROUTER = UNISWAP.v4.universalRouter as `0x${string}`;
export const POSM = UNISWAP.v4.positionManager as `0x${string}`;
export const QUOTER = UNISWAP.v4.quoter as `0x${string}`;

const UR_V4_SWAP_COMMAND = "0x10";

export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
export const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

export function poolKeyOf(market: Market) {
  return {
    currency0: market.pool.currency0,
    currency1: market.pool.currency1,
    fee: market.pool.fee,
    tickSpacing: market.pool.tickSpacing,
    hooks: zeroAddress,
  } as const;
}

/** Which pool currency is the asset vs USDC, per this pool's sort order. */
export function currenciesOf(market: Market) {
  return market.assetIsCurrency0
    ? { asset: market.pool.currency0, usdc: market.pool.currency1 }
    : { asset: market.pool.currency1, usdc: market.pool.currency0 };
}

export function erc20Approve(
  token: `0x${string}`,
  spender: `0x${string}`,
): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
    }),
  };
}

export function permit2Approve(
  token: `0x${string}`,
  spender: `0x${string}`,
  deadline: bigint,
): Call {
  return {
    to: PERMIT2,
    value: 0n,
    data: encodeFunctionData({
      abi: permit2Abi,
      functionName: "approve",
      args: [token, spender, maxUint160, Number(deadline)],
    }),
  };
}

/**
 * One exact-in swap through the Universal Router within the market's pool.
 * `direction` fixes zeroForOne and settle/take currencies for either sort
 * order. For native-ETH input, pass the input amount as `value`.
 */
export function buildSwapCall(params: {
  market: Market;
  direction: "usdcToAsset" | "assetToUsdc";
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
}): Call {
  const { market, direction, amountIn, minAmountOut, deadline } = params;
  const { asset, usdc } = currenciesOf(market);
  const toAsset = direction === "usdcToAsset";
  const zeroForOne = toAsset ? !market.assetIsCurrency0 : market.assetIsCurrency0;
  const [settleCurrency, takeCurrency] = toAsset ? [usdc, asset] : [asset, usdc];

  const planner = new V4Planner();
  planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
    {
      poolKey: poolKeyOf(market),
      zeroForOne,
      amountIn: amountIn.toString(),
      amountOutMinimum: minAmountOut.toString(),
      hookData: "0x",
    },
  ]);
  planner.addAction(Actions.SETTLE_ALL, [settleCurrency, amountIn.toString()]);
  planner.addAction(Actions.TAKE_ALL, [takeCurrency, minAmountOut.toString()]);

  const nativeIn = !toAsset && market.token === zeroAddress ? amountIn : 0n;
  return {
    to: ROUTER,
    value: nativeIn,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "execute",
      args: [UR_V4_SWAP_COMMAND, [planner.finalize() as `0x${string}`], deadline],
    }),
  };
}

async function quoteExactIn(market: Market, amountIn: bigint, zeroForOne: boolean) {
  const { result } = await publicClient.simulateContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      { poolKey: poolKeyOf(market), zeroForOne, exactAmount: amountIn, hookData: "0x" },
    ],
  });
  return { amountOut: result[0], gasEstimate: result[1] };
}

export const quoteUsdcToAsset = (market: Market, amountIn: bigint) =>
  quoteExactIn(market, amountIn, !market.assetIsCurrency0);

export const quoteAssetToUsdc = (market: Market, amountIn: bigint) =>
  quoteExactIn(market, amountIn, market.assetIsCurrency0);
