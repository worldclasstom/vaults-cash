/**
 * The vaults.cash zap engine.
 *
 * Turns N USDG into a Uniswap v4 LP position in one atomic batch of calls
 * (executed as a single ERC-4337 userOp from the user's smart wallet):
 *
 *   1. skim platform fee (plain USDG transfer)
 *   2. approve USDG -> Permit2 -> UniversalRouter
 *   3. UniversalRouter V4_SWAP: swap the computed share of USDG into the asset
 *   4. approve both currencies -> Permit2 -> PositionManager
 *   5. PositionManager.modifyLiquidities: mint the position NFT
 *
 * All calls are built up-front from a quote; the swap's amountOutMinimum and
 * the mint's amountMax bounds make the whole batch revert atomically if the
 * pool moves beyond the slippage tolerance. Any dust stays in the user's own
 * wallet — there is no vaults.cash contract holding funds.
 */
import {
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  maxUint160,
  parseAbi,
  zeroAddress,
} from "viem";
import { CurrencyAmount, Ether, Percent, Token, type Currency } from "@uniswap/sdk-core";
import { Actions, Pool, Position, V4Planner, V4PositionManager } from "@uniswap/v4-sdk";
import { UNISWAP } from "./chain";
import { NATIVE_ETH, USDG, type Market } from "./markets";
import { publicClient } from "./onchain";

export type Call = { to: `0x${string}`; value: bigint; data: `0x${string}` };

export type RangePreset = "full" | "balanced" | "aggressive";
/** half-width of the range as a fraction of price; full = entire curve */
export const PRESET_WIDTH: Record<Exclude<RangePreset, "full">, number> = {
  balanced: 0.15,
  aggressive: 0.05,
};

const CHAIN_ID = 4663;
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const PERMIT2 = UNISWAP.permit2 as `0x${string}`;
const ROUTER = UNISWAP.v4.universalRouter as `0x${string}`;
const POSM = UNISWAP.v4.positionManager as `0x${string}`;
const QUOTER = UNISWAP.v4.quoter as `0x${string}`;
const UR_V4_SWAP_COMMAND = "0x10";

const permit2Abi = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);
const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

export function marketCurrency(market: Market): Currency {
  return market.token === NATIVE_ETH
    ? Ether.onChain(CHAIN_ID)
    : new Token(CHAIN_ID, market.token, market.tokenDecimals, market.symbol);
}
const usdgToken = new Token(CHAIN_ID, USDG.address, USDG.decimals, "USDG");

export function buildPool(
  market: Market,
  sqrtPriceX96: bigint,
  tick: number,
  liquidity: bigint,
): Pool {
  return new Pool(
    marketCurrency(market),
    usdgToken,
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
 * Which share of the (post-fee) USDG must be swapped into the asset so the
 * two sides match the range's required ratio at the current price.
 * USDG is currency1 in every launch pool (asserted in markets.ts ordering),
 * so the asset is currency0. Float math is fine here: the result only seeds
 * the quote, and the batch is guarded by amountOutMinimum/amountMax.
 */
export function swapShare(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
): number {
  if (currentTick <= tickLower) return 1; // price below range: all asset
  if (currentTick >= tickUpper) return 0; // price above range: all USDG
  const sp = Math.pow(1.0001, currentTick / 2);
  const sl = Math.pow(1.0001, tickLower / 2);
  const su = Math.pow(1.0001, tickUpper / 2);
  const amount0PerL = 1 / sp - 1 / su;
  const amount1PerL = sp - sl;
  const price = sp * sp; // c1 per c0, raw
  const value0 = amount0PerL * price;
  return value0 / (value0 + amount1PerL);
}

export async function quoteUsdgToAsset(market: Market, amountIn: bigint) {
  const { result } = await publicClient.simulateContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: {
          currency0: market.pool.currency0,
          currency1: market.pool.currency1,
          fee: market.pool.fee,
          tickSpacing: market.pool.tickSpacing,
          hooks: zeroAddress,
        },
        zeroForOne: false, // USDG (currency1) -> asset (currency0)
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });
  return { amountOut: result[0], gasEstimate: result[1] };
}

export async function quoteAssetToUsdg(market: Market, amountIn: bigint) {
  const { result } = await publicClient.simulateContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: {
          currency0: market.pool.currency0,
          currency1: market.pool.currency1,
          fee: market.pool.fee,
          tickSpacing: market.pool.tickSpacing,
          hooks: zeroAddress,
        },
        zeroForOne: true, // asset (currency0) -> USDG (currency1)
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });
  return { amountOut: result[0], gasEstimate: result[1] };
}

export type ZapPlan = {
  calls: Call[];
  feeAmount: bigint;
  swapIn: bigint;
  swapOutMin: bigint;
  usdgToPosition: bigint;
  tickLower: number;
  tickUpper: number;
};

export async function buildZapPlan(params: {
  market: Market;
  owner: `0x${string}`;
  usdgAmount: bigint;
  preset: RangePreset;
  customWidth?: number;
  slippageBps: number;
  poolState: { sqrtPriceX96: bigint; tick: number; liquidity: bigint };
}): Promise<ZapPlan> {
  const { market, owner, usdgAmount, preset, customWidth, slippageBps, poolState } = params;

  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "30");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const feeAmount = (usdgAmount * feeBps) / 10_000n;
  const net = usdgAmount - feeAmount;

  const { tickLower, tickUpper } = presetTicks(market, poolState.tick, preset, customWidth);
  const share = swapShare(poolState.tick, tickLower, tickUpper);
  const swapIn = (net * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;
  const usdgToPosition = net - swapIn;

  const calls: Call[] = [];

  // 1. platform fee
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

  let swapOutMin = 0n;
  const slippage = BigInt(10_000 - slippageBps);

  if (swapIn > 0n) {
    const { amountOut } = await quoteUsdgToAsset(market, swapIn);
    swapOutMin = (amountOut * slippage) / 10_000n;

    // 2. USDG -> Permit2 -> UniversalRouter
    calls.push(erc20Approve(USDG.address, PERMIT2, maxUint256));
    calls.push(permit2Approve(USDG.address, ROUTER, deadline));

    // 3. the swap
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
        zeroForOne: false,
        amountIn: swapIn.toString(),
        amountOutMinimum: swapOutMin.toString(),
        hookData: "0x",
      },
    ]);
    planner.addAction(Actions.SETTLE_ALL, [market.pool.currency1, swapIn.toString()]);
    planner.addAction(Actions.TAKE_ALL, [market.pool.currency0, swapOutMin.toString()]);
    calls.push({
      to: ROUTER,
      value: 0n,
      data: encodeFunctionData({
        abi: routerAbi,
        functionName: "execute",
        args: [UR_V4_SWAP_COMMAND, [planner.finalize() as `0x${string}`], deadline],
      }),
    });
  }

  // 4. approvals for PositionManager
  if (usdgToPosition > 0n) calls.push(permit2Approve(USDG.address, POSM, deadline));
  if (market.token !== NATIVE_ETH && swapOutMin > 0n) {
    calls.push(erc20Approve(market.token, PERMIT2, maxUint256));
    calls.push(permit2Approve(market.token, POSM, deadline));
  }

  // 5. mint — sized from guaranteed amounts (swapOutMin + kept USDG)
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: swapOutMin.toString(),
    amount1: usdgToPosition.toString(),
    useFullPrecision: true,
  });
  const { calldata, value } = V4PositionManager.addCallParameters(position, {
    recipient: owner,
    slippageTolerance: new Percent(slippageBps, 10_000),
    deadline: deadline.toString(),
    useNative: market.token === NATIVE_ETH ? Ether.onChain(CHAIN_ID) : undefined,
  });
  calls.push({ to: POSM, value: BigInt(value), data: calldata as `0x${string}` });

  return { calls, feeAmount, swapIn, swapOutMin, usdgToPosition, tickLower, tickUpper };
}

function erc20Approve(token: `0x${string}`, spender: `0x${string}`, amount: bigint): Call {
  return {
    to: token,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
  };
}

function permit2Approve(token: `0x${string}`, spender: `0x${string}`, deadline: bigint): Call {
  return {
    to: PERMIT2,
    value: 0n,
    data: encodeFunctionData({
      abi: permit2Abi,
      functionName: "approve",
      // uint48 expiration; deadline fits comfortably
      args: [token, spender, maxUint160, Number(deadline)],
    }),
  };
}

/** Estimated USDG value of the planned position (for the confirm sheet). */
export function planSummary(plan: ZapPlan, assetPrice: number, assetDecimals: number) {
  const assetUsd = (Number(plan.swapOutMin) / 10 ** assetDecimals) * assetPrice;
  const usdgUsd = Number(plan.usdgToPosition) / 1e6;
  return {
    assetUsd,
    usdgUsd,
    feeUsd: Number(plan.feeAmount) / 1e6,
  };
}
