import { CHAINS, isChainId, type ChainId } from "./chain";

/**
 * Cross-chain moves of the user's stablecoin between our two chains, via
 * Relay (https://relay.link). Relay quotes a route from the user's OWN
 * address and hands back plain transactions (approve + deposit) that we
 * batch into one user operation from the smart wallet — sponsored on Base.
 * The same address receives the other chain's stablecoin (USDC ⇄ USDG).
 * Privy's own transfer API can't do this: it doesn't list Robinhood Chain
 * and acts on the embedded wallet rather than the smart wallet.
 */

const RELAY = "https://api.relay.link";

export type BridgeQuote = {
  requestId: string;
  /** chain the calls execute on (the source) */
  chainId: ChainId;
  toChainId: ChainId;
  calls: Array<{ to: `0x${string}`; value: string; data: `0x${string}` }>;
  /** raw stablecoin units */
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  fromSymbol: string;
  toSymbol: string;
  /** dollars */
  feesUsd: number;
  timeEstimateSec: number;
};

type RelayQuote = {
  requestId: string;
  steps: Array<{ id: string; items: Array<{ data: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number } }> }>;
  fees: { relayer?: { amountUsd?: string }; gas?: { amountUsd?: string }; app?: { amountUsd?: string } };
  details: { currencyIn: { amount: string }; currencyOut: { amount: string; minimumAmount: string }; timeEstimate?: number };
  message?: string;
};

export async function quoteBridge(params: { from: number; to: number; amount: bigint; user: `0x${string}` }): Promise<BridgeQuote> {
  const { from, to, amount, user } = params;
  if (!isChainId(from) || !isChainId(to) || from === to) throw new Error("unsupported route");
  const res = await fetch(`${RELAY}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user,
      recipient: user,
      originChainId: from,
      destinationChainId: to,
      originCurrency: CHAINS[from].quote.address,
      destinationCurrency: CHAINS[to].quote.address,
      amount: amount.toString(),
      tradeType: "EXACT_INPUT",
      // no `referrer`: Relay demands an API key once one is set
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const q = (await res.json()) as RelayQuote;
  if (!res.ok || !q.steps) throw new Error(q.message ?? `Relay quote failed (${res.status})`);
  const calls = q.steps.flatMap((s) => s.items.map((i) => i.data));
  if (!calls.length || calls.some((c) => c.chainId !== from)) throw new Error("Relay returned a route we can't execute in one batch");
  const usd = (v?: string) => Number(v ?? 0);
  return {
    requestId: q.requestId,
    chainId: from,
    toChainId: to,
    calls: calls.map((c) => ({ to: c.to, value: c.value ?? "0", data: c.data })),
    amountIn: q.details.currencyIn.amount,
    amountOut: q.details.currencyOut.amount,
    minAmountOut: q.details.currencyOut.minimumAmount,
    fromSymbol: CHAINS[from].quote.symbol,
    toSymbol: CHAINS[to].quote.symbol,
    feesUsd: usd(q.fees.relayer?.amountUsd) + usd(q.fees.gas?.amountUsd) + usd(q.fees.app?.amountUsd),
    timeEstimateSec: q.details.timeEstimate ?? 60,
  };
}

export type BridgeStatus = "waiting" | "pending" | "success" | "failure" | "refund" | "delayed" | "unknown";

export async function bridgeStatus(requestId: string): Promise<{ status: BridgeStatus; txHashes: string[] }> {
  const res = await fetch(`${RELAY}/intents/status/v2?requestId=${encodeURIComponent(requestId)}`, { signal: AbortSignal.timeout(10_000) });
  const j = (await res.json()) as { status?: string; txHashes?: string[] };
  return { status: (j.status as BridgeStatus) ?? "unknown", txHashes: j.txHashes ?? [] };
}
