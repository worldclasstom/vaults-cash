/**
 * Shared helpers for the agent-facing REST API (/api/agent/*).
 * Everything returns JSON-safe values (bigints as decimal strings) and the
 * exact call batches the human UI would send — an agent signs them with its
 * own wallet instead.
 */
import { MIN_DEPOSIT_BY_CHAIN } from "./limits";
import { isAddress } from "viem";
import { CHAINS, CHAIN_IDS } from "./chain";
import { MARKETS, marketBySlug, type Market } from "./markets";
import { getMarketPricing } from "./onchain";
import type { Call } from "./zap";

export function serializeCalls(calls: Call[]) {
  return calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data }));
}

export function requireMarket(symbol: string | null): Market {
  const market = symbol ? marketBySlug(symbol) : undefined;
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

const tokenJson = (t: Market["base"]) => ({
  address: t.address,
  symbol: t.symbol,
  name: t.name,
  decimals: t.decimals,
  kind: t.kind,
  uiMultiplier: t.uiMultiplier,
});

export async function marketSnapshot(market: Market) {
  const { state, price, quoteUsd, priceUsd } = await getMarketPricing(market);
  return {
    market: market.slug,
    pair: market.name,
    chainId: market.chainId,
    kind: market.kind,
    lowIl: market.lowIl,
    base: tokenJson(market.base),
    quote: tokenJson(market.quote),
    /** deposits/withdrawals are always in this stablecoin */
    stablecoin: CHAINS[market.chainId].quote.symbol,
    quoteIsStablecoin: market.quoteIsStable,
    pool: {
      poolId: market.pool.poolId,
      feeBps: market.pool.fee / 100,
      tickSpacing: market.pool.tickSpacing,
      currency0: market.pool.currency0,
      currency1: market.pool.currency1,
    },
    /** base in quote units */
    price,
    /** quote in dollars */
    quoteUsd,
    priceUsd,
    tick: state.tick,
    liquidity: state.liquidity.toString(),
  };
}

export const AGENT_DOCS = {
  execution:
    "Calls MUST be executed in order from the `owner` address. Smart accounts (ERC-4337/EIP-7702) should batch them atomically; EOAs must send them as sequential transactions and stop on any revert.",
  fees: `vaults.cash takes ${Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 60) / 100}% of the deposit (and of the converted output on withdraw), included in the returned calls. Minimum deposit or add: $${MIN_DEPOSIT_BY_CHAIN[8453]} on Base, $${MIN_DEPOSIT_BY_CHAIN[4663]} on Robinhood Chain (plan requests below it are rejected).`,
  markets:
    `Markets are Uniswap v4 pools identified by pair slug: "<chain>/<base>-<quote>", e.g. "base/eth-usdc", "base/cbbtc-eth", "robinhood/tsla-eth". Deposits and withdrawals are always in the chain's stablecoin (${CHAIN_IDS.map((id) => `${CHAINS[id].label} chain ${id}: ${CHAINS[id].quote.symbol}`).join("; ")}); when a market's quote isn't the stablecoin the plan converts through the quote's own stablecoin pool. A bare token ("eth") means that token's stablecoin pair on Base. Every plan reports the chainId its calls must run on. kind=stable pairs and lowIl=true pairs track the same thing on both legs (minimal impermanent loss); kind=stock legs are Robinhood-issued tokens on Robinhood Chain tracking US equities/ETFs (availability depends on the party's jurisdiction; uiMultiplier converts raw units to displayed shares). Markets are listed automatically from every live pool in the registry; check liquidity before sizing a deposit.`,
  referral:
    "Pass `ref` (a vaults.cash referral code) on build calls and half of the fee is paid on-chain, in the same batch, to that code's wallet — the same 50% split the web app pays referrers. Integrators: use your own code.",
  slippage:
    "Plans embed amountOutMinimum and amountMax bounds; if a pool moves beyond slippageBps the batch reverts. Quotes expire — rebuild plans older than ~60s.",
};
