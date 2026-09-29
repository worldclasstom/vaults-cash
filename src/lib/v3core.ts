/**
 * Uniswap v3 and Aerodrome Slipstream: the v3-style venues. One contract per
 * pool, positions as ERC-721s on a NonfungiblePositionManager, WETH instead
 * of native ETH, plain ERC-20 approvals. Aerodrome is a v3 fork that keys
 * pools by tick spacing instead of fee (the fee is a pool property) and
 * pays trading fees to positions that are NOT staked in a gauge, which is
 * the only kind vaults.cash makes.
 *
 * Everything here is read or encoded for the user's own wallet; nothing is
 * custodial. The v4 code paths dispatch here on `market.venue`.
 */
import { encodeFunctionData, erc20Abi, maxUint128, maxUint256, parseAbi } from "viem";
import { Percent, Token } from "@uniswap/sdk-core";
import { Pool as V3Pool, Position as SdkPosition } from "@uniswap/v3-sdk";
import { CHAINS, chainConfig, type ChainId, type V3Contracts, type Venue } from "./chain";
import { MARKETS, quoteUsdMarket, type Market } from "./markets";
import { publicClientFor, tickToPrice, type PoolState } from "./onchain";

export type V3Venue = Exclude<Venue, "uniswap-v4">;
export type Call = { to: `0x${string}`; value: bigint; data: `0x${string}` };

export const isV3Style = (m: Pick<Market, "venue">): boolean => m.venue !== "uniswap-v4";

export function v3Contracts(chainId: number, venue: Venue): V3Contracts {
  const c = chainConfig(chainId);
  const v = venue === "uniswap-v3" ? c.uniswap.v3 : venue === "aerodrome" ? c.aerodrome : undefined;
  if (!v) throw new Error(`${venue} is not deployed on ${c.label}`);
  return v;
}

// ---------------------------------------------------------------- ABIs

const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
]);
const aeroPoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
]);
export const v3FactoryAbi = parseAbi(["function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"]);
export const aeroFactoryAbi = parseAbi(["function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)"]);

const npmCommonAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity((uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline) params) payable returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) payable returns (uint256 amount0, uint256 amount1)",
  "function burn(uint256 tokenId) payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);
const v3NpmAbi = parseAbi([
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);
const aeroNpmAbi = parseAbi([
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function mint((address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline, uint160 sqrtPriceX96) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);
const v3QuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const aeroQuoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const v3RouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
const aeroRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);

// --------------------------------------------------------------- reads

export async function getPoolStateV3(market: Market): Promise<PoolState> {
  const client = publicClientFor(market.chainId);
  const pool = market.pool.poolId;
  if (market.venue === "aerodrome") {
    const [slot0, liquidity] = await Promise.all([
      client.readContract({ address: pool, abi: aeroPoolAbi, functionName: "slot0" }),
      client.readContract({ address: pool, abi: aeroPoolAbi, functionName: "liquidity" }),
    ]);
    return { sqrtPriceX96: slot0[0], tick: Number(slot0[1]), liquidity };
  }
  const [slot0, liquidity] = await Promise.all([
    client.readContract({ address: pool, abi: v3PoolAbi, functionName: "slot0" }),
    client.readContract({ address: pool, abi: v3PoolAbi, functionName: "liquidity" }),
  ]);
  return { sqrtPriceX96: slot0[0], tick: Number(slot0[1]), liquidity };
}

/** The v3 SDK needs a fee tier it knows to derive a tick spacing; Aerodrome
 *  spacings are keyed the other way round. Pick the SDK tier whose spacing
 *  divides the pool's, so range ticks validate; amounts don't depend on it. */
function sdkFee(market: Market): number {
  if (market.venue === "uniswap-v3") return market.pool.fee;
  const ts = market.pool.tickSpacing;
  for (const [fee, spacing] of [
    [10000, 200],
    [3000, 60],
    [500, 10],
    [100, 1],
  ] as const) {
    if (ts % spacing === 0) return fee;
  }
  return 100;
}

export function buildPoolV3(market: Market, state: PoolState): V3Pool {
  const t0 = new Token(market.chainId, market.pool.currency0, market.baseIsCurrency0 ? market.base.decimals : market.quote.decimals);
  const t1 = new Token(market.chainId, market.pool.currency1, market.baseIsCurrency0 ? market.quote.decimals : market.base.decimals);
  return new V3Pool(t0, t1, sdkFee(market), state.sqrtPriceX96.toString(), state.liquidity.toString(), state.tick);
}

export type V3Owned = { tokenId: bigint; market: Market; tickLower: number; tickUpper: number; liquidity: bigint };

function marketFor(chainId: ChainId, venue: V3Venue, token0: string, token1: string, feeOrSpacing: number): Market | undefined {
  return MARKETS.find(
    (m) =>
      m.chainId === chainId &&
      m.venue === venue &&
      m.pool.currency0.toLowerCase() === token0.toLowerCase() &&
      m.pool.currency1.toLowerCase() === token1.toLowerCase() &&
      (venue === "uniswap-v3" ? m.pool.fee === feeOrSpacing : m.pool.tickSpacing === feeOrSpacing),
  );
}

/** One position by id, in a pool we list; null otherwise. */
export async function readPositionV3(chainId: ChainId, venue: V3Venue, tokenId: bigint): Promise<(V3Owned & { owner: `0x${string}` }) | null> {
  const client = publicClientFor(chainId);
  const npm = v3Contracts(chainId, venue).positionManager;
  try {
    const [pos, owner] = await Promise.all([
      venue === "aerodrome"
        ? client.readContract({ address: npm, abi: aeroNpmAbi, functionName: "positions", args: [tokenId] })
        : client.readContract({ address: npm, abi: v3NpmAbi, functionName: "positions", args: [tokenId] }),
      client.readContract({ address: npm, abi: npmCommonAbi, functionName: "ownerOf", args: [tokenId] }),
    ]);
    const [, , token0, token1, feeOrSpacing, tickLower, tickUpper, liquidity] = pos;
    if (liquidity === 0n) return null;
    const market = marketFor(chainId, venue, token0, token1, Number(feeOrSpacing));
    if (!market) return null;
    return { tokenId, market, tickLower: Number(tickLower), tickUpper: Number(tickUpper), liquidity, owner };
  } catch {
    return null;
  }
}

/** Every live position the wallet holds at one venue on one chain. The
 *  position managers are ERC-721 Enumerable, so no indexer is needed. */
export async function fetchPositionsV3(owner: `0x${string}`, chainId: ChainId, venue: V3Venue): Promise<V3Owned[]> {
  const c = chainConfig(chainId);
  if ((venue === "uniswap-v3" && !c.uniswap.v3) || (venue === "aerodrome" && !c.aerodrome)) return [];
  const client = publicClientFor(chainId);
  const npm = v3Contracts(chainId, venue).positionManager;
  const n = await client.readContract({ address: npm, abi: npmCommonAbi, functionName: "balanceOf", args: [owner] });
  const count = Number(n > 200n ? 200n : n);
  const ids = await Promise.all(
    Array.from({ length: count }, (_, i) => client.readContract({ address: npm, abi: npmCommonAbi, functionName: "tokenOfOwnerByIndex", args: [owner, BigInt(i)] })),
  );
  const positions = await Promise.all(ids.map((id) => readPositionV3(chainId, venue, id)));
  return positions
    .filter((p): p is V3Owned & { owner: `0x${string}` } => p !== null)
    .map(({ tokenId, market, tickLower, tickUpper, liquidity }) => ({ tokenId, market, tickLower, tickUpper, liquidity }));
}

/** Uncollected fees, exactly as `collect` would pay them: a simulated collect
 *  from the owner (includes fees already checkpointed as tokensOwed). */
export async function getUncollectedFeesV3(position: V3Owned, owner?: `0x${string}`): Promise<{ owed0: bigint; owed1: bigint }> {
  const { market, tokenId } = position;
  const npm = v3Contracts(market.chainId, market.venue).positionManager;
  const client = publicClientFor(market.chainId);
  const account = owner ?? (await client.readContract({ address: npm, abi: npmCommonAbi, functionName: "ownerOf", args: [tokenId] }));
  const { result } = await client.simulateContract({
    account,
    address: npm,
    abi: npmCommonAbi,
    functionName: "collect",
    args: [{ tokenId, recipient: account, amount0Max: maxUint128, amount1Max: maxUint128 }],
  });
  return { owed0: result[0], owed1: result[1] };
}

/** Token amounts a position holds now (both legs), in raw units. */
export function positionAmountsV3(position: V3Owned, state: PoolState): { amount0: bigint; amount1: bigint } {
  const p = new SdkPosition({ pool: buildPoolV3(position.market, state), tickLower: position.tickLower, tickUpper: position.tickUpper, liquidity: position.liquidity.toString() });
  return { amount0: BigInt(p.amount0.quotient.toString()), amount1: BigInt(p.amount1.quotient.toString()) };
}

// -------------------------------------------------------------- quotes + swaps

export async function quoteExactInV3(market: Market, amountIn: bigint, direction: "quoteToBase" | "baseToQuote"): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
  const tokenIn = direction === "quoteToBase" ? market.quote.address : market.base.address;
  const tokenOut = direction === "quoteToBase" ? market.base.address : market.quote.address;
  const { quoter } = v3Contracts(market.chainId, market.venue);
  const client = publicClientFor(market.chainId);
  if (market.venue === "aerodrome") {
    const { result } = await client.simulateContract({
      address: quoter,
      abi: aeroQuoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, tickSpacing: market.pool.tickSpacing, sqrtPriceLimitX96: 0n }],
    });
    return { amountOut: result[0], gasEstimate: result[3] };
  }
  const { result } = await client.simulateContract({
    address: quoter,
    abi: v3QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: market.pool.fee, sqrtPriceLimitX96: 0n }],
  });
  return { amountOut: result[0], gasEstimate: result[3] };
}

/** One exact-in swap through the venue's router, output to `recipient`. The
 *  router pulls the input with transferFrom, so the batch approves it first. */
export function buildSwapCallV3(params: {
  market: Market;
  direction: "quoteToBase" | "baseToQuote";
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  recipient: `0x${string}`;
}): Call {
  const { market, direction, amountIn, minAmountOut, deadline, recipient } = params;
  const tokenIn = direction === "quoteToBase" ? market.quote.address : market.base.address;
  const tokenOut = direction === "quoteToBase" ? market.base.address : market.quote.address;
  const { swapRouter } = v3Contracts(market.chainId, market.venue);
  const data =
    market.venue === "aerodrome"
      ? encodeFunctionData({
          abi: aeroRouterAbi,
          functionName: "exactInputSingle",
          args: [{ tokenIn, tokenOut, tickSpacing: market.pool.tickSpacing, recipient, deadline, amountIn, amountOutMinimum: minAmountOut, sqrtPriceLimitX96: 0n }],
        })
      : encodeFunctionData({
          abi: v3RouterAbi,
          functionName: "exactInputSingle",
          args: [{ tokenIn, tokenOut, fee: market.pool.fee, recipient, amountIn, amountOutMinimum: minAmountOut, sqrtPriceLimitX96: 0n }],
        });
  return { to: swapRouter, value: 0n, data };
}

/** ERC-20 approve(max) unless the allowance already covers it. */
export async function approvalIfNeeded(chainId: ChainId, token: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`, amount: bigint): Promise<Call[]> {
  const allowance = await publicClientFor(chainId)
    .readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] })
    .catch(() => 0n);
  if (allowance >= amount) return [];
  return [{ to: token, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] }) }];
}

// --------------------------------------------------------------- position calls

export function mintCallV3(market: Market, args: { tickLower: number; tickUpper: number; amount0: bigint; amount1: bigint; min0: bigint; min1: bigint; recipient: `0x${string}`; deadline: bigint }): Call {
  const npm = v3Contracts(market.chainId, market.venue).positionManager;
  const base = { token0: market.pool.currency0, token1: market.pool.currency1, tickLower: args.tickLower, tickUpper: args.tickUpper, amount0Desired: args.amount0, amount1Desired: args.amount1, amount0Min: args.min0, amount1Min: args.min1, recipient: args.recipient, deadline: args.deadline };
  const data =
    market.venue === "aerodrome"
      ? encodeFunctionData({ abi: aeroNpmAbi, functionName: "mint", args: [{ ...base, tickSpacing: market.pool.tickSpacing, sqrtPriceX96: 0n }] })
      : encodeFunctionData({ abi: v3NpmAbi, functionName: "mint", args: [{ ...base, fee: market.pool.fee }] });
  return { to: npm, value: 0n, data };
}

export function increaseCallV3(market: Market, args: { tokenId: bigint; amount0: bigint; amount1: bigint; min0: bigint; min1: bigint; deadline: bigint }): Call {
  const npm = v3Contracts(market.chainId, market.venue).positionManager;
  return {
    to: npm,
    value: 0n,
    data: encodeFunctionData({ abi: npmCommonAbi, functionName: "increaseLiquidity", args: [{ tokenId: args.tokenId, amount0Desired: args.amount0, amount1Desired: args.amount1, amount0Min: args.min0, amount1Min: args.min1, deadline: args.deadline }] }),
  };
}

/** decrease all liquidity + collect everything (principal + fees) to the owner (+ optionally burn), in one multicall. */
export function burnCallV3(market: Market, args: { tokenId: bigint; liquidity: bigint; min0: bigint; min1: bigint; recipient: `0x${string}`; deadline: bigint; burn?: boolean }): Call {
  const npm = v3Contracts(market.chainId, market.venue).positionManager;
  const inner = [
    encodeFunctionData({ abi: npmCommonAbi, functionName: "decreaseLiquidity", args: [{ tokenId: args.tokenId, liquidity: args.liquidity, amount0Min: args.min0, amount1Min: args.min1, deadline: args.deadline }] }),
    encodeFunctionData({ abi: npmCommonAbi, functionName: "collect", args: [{ tokenId: args.tokenId, recipient: args.recipient, amount0Max: maxUint128, amount1Max: maxUint128 }] }),
    ...(args.burn === false ? [] : [encodeFunctionData({ abi: npmCommonAbi, functionName: "burn", args: [args.tokenId] })]),
  ];
  return { to: npm, value: 0n, data: encodeFunctionData({ abi: npmCommonAbi, functionName: "multicall", args: [inner] }) };
}

export function collectCallV3(market: Market, tokenId: bigint, recipient: `0x${string}`): Call {
  const npm = v3Contracts(market.chainId, market.venue).positionManager;
  return { to: npm, value: 0n, data: encodeFunctionData({ abi: npmCommonAbi, functionName: "collect", args: [{ tokenId, recipient, amount0Max: maxUint128, amount1Max: maxUint128 }] }) };
}

/** Both sides' minimums/amounts for a range at today's price, via the v3 SDK. */
export function positionForAmounts(market: Market, state: PoolState, tickLower: number, tickUpper: number, amount0: bigint, amount1: bigint) {
  return SdkPosition.fromAmounts({ pool: buildPoolV3(market, state), tickLower, tickUpper, amount0: amount0.toString(), amount1: amount1.toString(), useFullPrecision: true });
}

export const percent = (bps: number) => new Percent(bps, 10_000);
export { tickToPrice, quoteUsdMarket, CHAINS };
