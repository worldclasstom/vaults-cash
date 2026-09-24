/**
 * Shared helpers for the agent-facing REST API (/api/agent/*).
 * Everything returns JSON-safe values (bigints as decimal strings) and the
 * exact call batches the human UI would send — an agent signs them with its
 * own wallet instead.
 */
import { isAddress } from "viem";
import { CHAINS, CHAIN_IDS } from "./chain";
import { MARKETS, marketBySymbol, type Market } from "./markets";
import { getPoolState, tickToUsdcPrice } from "./onchain";
import type { Call } from "./zap";

export function serializeCalls(calls: Call[]) {
  return calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data }));
}

export function requireMarket(symbol: string | null): Market {
  const market = symbol ? marketBySymbol(symbol) : undefined;
  if (!market) {
    throw new AgentError(
      404,
      `Unknown market "${symbol}". Available: ${MARKETS.map((m) => m.slug).join(", ")}`,
    );
  }
  return market;
}

export function requireOwner(owner: unknown): `0x${string}` {
  if (typeof owner !== "string" || !isAddress(owner)) {
    throw new AgentError(400, "\"owner\" must be a checksummed 0x address (the wallet that will execute the calls and own the position).");
  }
  return owner as `0x${string}`;
}

export class AgentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function marketSnapshot(market: Market) {
  const state = await getPoolState(market);
  return {
    market: market.slug,
    symbol: market.symbol,
    name: market.name,
    chainId: market.chainId,
    kind: market.kind,
    token: market.token,
    tokenDecimals: market.tokenDecimals,
    /** the stablecoin deposits are made in on this chain (USDC / USDG) */
    quote: market.quote,
    usdc: market.quote.address,
    uiMultiplier: market.uiMultiplier,
    pool: {
      poolId: market.pool.poolId,
      feeBps: market.pool.fee / 100,
      tickSpacing: market.pool.tickSpacing,
      currency0: market.pool.currency0,
      currency1: market.pool.currency1,
    },
    priceUsdc: tickToUsdcPrice(market, state.tick),
    tick: state.tick,
    liquidity: state.liquidity.toString(),
  };
}

export const AGENT_DOCS = {
  execution:
    "Calls MUST be executed in order from the `owner` address. Smart accounts (ERC-4337/EIP-7702) should batch them atomically; EOAs must send them as sequential transactions and stop on any revert.",
  fees: `vaults.cash takes ${Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}% of the deposit (and of the asset->USDC conversion on withdraw), included in the returned calls.`,
  markets:
    `Every market is paired against its chain's dollar stablecoin: ${CHAIN_IDS.map((id) => `${CHAINS[id].label} (chain ${id}) uses ${CHAINS[id].quote.symbol}`).join("; ")}. Identify a market by its slug ("base/eth", "robinhood/tsla"; a bare symbol means Base); every plan reports the chainId its calls must run on. kind=stable are stablecoin-correlated pairs with minimal impermanent loss; kind=stock are Robinhood-issued tokens on Robinhood Chain tracking US equities/ETFs (availability depends on the party's jurisdiction; uiMultiplier converts raw units to displayed shares). Markets are listed automatically from every live pool in the registry; check liquidity before sizing a deposit.`,
  slippage:
    "Plans embed amountOutMinimum and amountMax bounds; if the pool moves beyond slippageBps the batch reverts. Quotes expire — rebuild plans older than ~60s.",
};
