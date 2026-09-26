/**
 * Shared Uniswap v4 plumbing used by both the deposit zap and the withdraw
 * flow: contract handles, ABIs, approval-call builders, the router swap-call
 * builder, and quoting. Single source of truth for swap direction logic.
 * Every contract address is resolved from the market's chain.
 */
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  maxUint160,
  maxUint256,
  parseAbi,
  zeroAddress,
} from "viem";
import { Actions, V4Planner } from "@uniswap/v4-sdk";
import { chainConfig } from "./chain";
import type { Market } from "./markets";
import { publicClientFor } from "./onchain";

export type Call = { to: `0x${string}`; value: bigint; data: `0x${string}` };

/** Permit2 is the one canonical CREATE2 deployment, identical on every chain. */
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** Router / PositionManager / Quoter for the market's chain. */
export function contractsOf(market: Pick<Market, "chainId">) {
  const { v4 } = chainConfig(market.chainId).uniswap;
  return { router: v4.universalRouter, posm: v4.positionManager, quoter: v4.quoter };
}

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

export function erc20Approve(token: `0x${string}`, spender: `0x${string}`): Call {
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

export function permit2Approve(token: `0x${string}`, spender: `0x${string}`, deadline: bigint): Call {
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

/** Approvals needed before `token` can be pulled by `spender` through
 *  Permit2 (no-ops for native ETH). Idempotent — max allowances. */
export function approvalsFor(token: `0x${string}`, spender: `0x${string}`, deadline: bigint): Call[] {
  if (token === zeroAddress) return [];
  return [erc20Approve(token, PERMIT2), permit2Approve(token, spender, deadline)];
}

export type SwapDirection = "quoteToBase" | "baseToQuote";

/**
 * One exact-in swap through the Universal Router within the market's pool.
 * `direction` fixes zeroForOne and settle/take currencies for either sort
 * order. A native-ETH input is passed as `value`.
 */
export function buildSwapCall(params: {
  market: Market;
  direction: SwapDirection;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
}): Call {
  const { market, direction, amountIn, minAmountOut, deadline } = params;
  const toBase = direction === "quoteToBase";
  const input = toBase ? market.quote.address : market.base.address;
  const output = toBase ? market.base.address : market.quote.address;
  const zeroForOne = input.toLowerCase() === market.pool.currency0.toLowerCase();

  let v4Input: `0x${string}`;
  if (chainConfig(market.chainId).legacySwapParams) {
    // Same actions (SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL) as the planner
    // below, but the swap struct carries sqrtPriceLimitX96 (0 = no limit),
    // matching the router deployed on this chain.
    const swap = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            {
              name: "poolKey",
              type: "tuple",
              components: [
                { name: "currency0", type: "address" },
                { name: "currency1", type: "address" },
                { name: "fee", type: "uint24" },
                { name: "tickSpacing", type: "int24" },
                { name: "hooks", type: "address" },
              ],
            },
            { name: "zeroForOne", type: "bool" },
            { name: "amountIn", type: "uint128" },
            { name: "amountOutMinimum", type: "uint128" },
            { name: "sqrtPriceLimitX96", type: "uint160" },
            { name: "hookData", type: "bytes" },
          ],
        },
      ],
      [{ poolKey: poolKeyOf(market), zeroForOne, amountIn, amountOutMinimum: minAmountOut, sqrtPriceLimitX96: 0n, hookData: "0x" }],
    );
    const pair = (currency: `0x${string}`, amount: bigint) =>
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currency, amount]);
    v4Input = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes[]" }],
      ["0x060c0f", [swap, pair(input, amountIn), pair(output, minAmountOut)]],
    );
  } else {
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
    planner.addAction(Actions.SETTLE_ALL, [input, amountIn.toString()]);
    planner.addAction(Actions.TAKE_ALL, [output, minAmountOut.toString()]);
    v4Input = planner.finalize() as `0x${string}`;
  }

  return {
    to: contractsOf(market).router,
    value: input === zeroAddress ? amountIn : 0n,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "execute",
      args: [UR_V4_SWAP_COMMAND, [v4Input], deadline],
    }),
  };
}

async function quoteExactIn(market: Market, amountIn: bigint, direction: SwapDirection) {
  const input = direction === "quoteToBase" ? market.quote.address : market.base.address;
  const zeroForOne = input.toLowerCase() === market.pool.currency0.toLowerCase();
  const { result } = await publicClientFor(market.chainId).simulateContract({
    address: contractsOf(market).quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: poolKeyOf(market), zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  });
  return { amountOut: result[0], gasEstimate: result[1] };
}

export const quoteQuoteToBase = (market: Market, amountIn: bigint) => quoteExactIn(market, amountIn, "quoteToBase");
export const quoteBaseToQuote = (market: Market, amountIn: bigint) => quoteExactIn(market, amountIn, "baseToQuote");
