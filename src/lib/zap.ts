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
import { encodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { Ether, Percent, Token, type Currency } from "@uniswap/sdk-core";
import { Pool, Position, V4PositionManager } from "@uniswap/v4-sdk";
import { NATIVE_ETH, USDG, type Market } from "./markets";
import {
  buildSwapCall,
  erc20Approve,
  permit2Approve,
  quoteUsdgToAsset,
  PERMIT2,
  POSM,
  ROUTER,
  type Call,
} from "./uniswap";

export type { Call } from "./uniswap";
export { quoteUsdgToAsset, quoteAssetToUsdg } from "./uniswap";

export type RangePreset = "full" | "balanced" | "aggressive";
/** half-width of the range as a fraction of price; full = entire curve */
export const PRESET_WIDTH: Record<Exclude<RangePreset, "full">, number> = {
  balanced: 0.3,
  aggressive: 0.15,
};

const CHAIN_ID = 4663;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

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
 * two sides match the range's required ratio at the current price. Float
 * math is fine here: the result only seeds the quote, and the batch is
 * guarded by amountOutMinimum/amountMax.
 */
export function swapShare(
  currentTick: number,
  tickLower: number,
  tickUpper: number,
  assetIsCurrency0: boolean,
): number {
  // out of range: position is single-sided in one currency
  if (currentTick <= tickLower) return assetIsCurrency0 ? 1 : 0; // all c0
  if (currentTick >= tickUpper) return assetIsCurrency0 ? 0 : 1; // all c1
  const sp = Math.pow(1.0001, currentTick / 2);
  const sl = Math.pow(1.0001, tickLower / 2);
  const su = Math.pow(1.0001, tickUpper / 2);
  const amount0PerL = 1 / sp - 1 / su;
  const amount1PerL = sp - sl;
  const price = sp * sp; // c1 per c0, raw
  const value0 = amount0PerL * price; // both sides valued in c1 units
  const share0 = value0 / (value0 + amount1PerL);
  return assetIsCurrency0 ? share0 : 1 - share0;
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
  /** add to this position (its range) instead of minting a new one */
  addTo?: { tokenId: bigint; tickLower: number; tickUpper: number };
}): Promise<ZapPlan> {
  const { market, owner, usdgAmount, preset, customWidth, slippageBps, poolState, addTo } =
    params;

  const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "30");
  const feeRecipient = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const feeAmount = (usdgAmount * feeBps) / 10_000n;
  const net = usdgAmount - feeAmount;

  const { tickLower, tickUpper } =
    addTo ?? presetTicks(market, poolState.tick, preset, customWidth);
  const share = swapShare(poolState.tick, tickLower, tickUpper, market.assetIsCurrency0);
  const swapIn = (net * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;
  const usdgToPosition = net - swapIn;

  const calls: Call[] = [];

  let swapOutMin = 0n;
  const slippage = BigInt(10_000 - slippageBps);

  if (swapIn > 0n) {
    const { amountOut } = await quoteUsdgToAsset(market, swapIn);
    swapOutMin = (amountOut * slippage) / 10_000n;

    // 2. USDG -> Permit2 -> UniversalRouter, then the swap itself
    calls.push(erc20Approve(USDG.address, PERMIT2));
    calls.push(permit2Approve(USDG.address, ROUTER, deadline));
    calls.push(
      buildSwapCall({
        market,
        direction: "usdgToAsset",
        amountIn: swapIn,
        minAmountOut: swapOutMin,
        deadline,
      }),
    );
  }

  // 4. approvals for PositionManager
  if (usdgToPosition > 0n) calls.push(permit2Approve(USDG.address, POSM, deadline));
  if (market.token !== NATIVE_ETH && swapOutMin > 0n) {
    calls.push(erc20Approve(market.token, PERMIT2));
    calls.push(permit2Approve(market.token, POSM, deadline));
  }

  // 5. mint — sized from guaranteed amounts (swapOutMin + kept USDG)
  const pool = buildPool(market, poolState.sqrtPriceX96, poolState.tick, poolState.liquidity);
  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: (market.assetIsCurrency0 ? swapOutMin : usdgToPosition).toString(),
    amount1: (market.assetIsCurrency0 ? usdgToPosition : swapOutMin).toString(),
    useFullPrecision: true,
  });
  const common = {
    slippageTolerance: new Percent(slippageBps, 10_000),
    deadline: deadline.toString(),
    useNative: market.token === NATIVE_ETH ? Ether.onChain(CHAIN_ID) : undefined,
  };
  // with a tokenId the SDK encodes INCREASE_LIQUIDITY on that position
  // instead of minting a new NFT
  const { calldata, value } = V4PositionManager.addCallParameters(
    position,
    addTo ? { ...common, tokenId: addTo.tokenId.toString() } : { ...common, recipient: owner },
  );
  calls.push({ to: POSM, value: BigInt(value), data: calldata as `0x${string}` });

  // platform fee LAST: in the atomic path order is irrelevant, and in the
  // sequential fallback the fee is only charged once the position exists
  // (an abandoned attempt costs the user nothing).
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

  return { calls, feeAmount, swapIn, swapOutMin, usdgToPosition, tickLower, tickUpper };
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
