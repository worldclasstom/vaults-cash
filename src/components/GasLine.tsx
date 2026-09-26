"use client";

import { CHAINS, gasMode, type ChainId } from "@/lib/chain";
import { fmtUsd } from "@/lib/format";
import { useGasQuote } from "@/hooks/useGasQuote";
import { useWalletDeployed } from "@/hooks/useWalletDeployed";
import type { Call } from "@/lib/zap";

/**
 * The value cell of a review sheet's "Gas (network fee)" row. One of three
 * honest states per chain: covered by us, a few cents in the chain's own
 * dollar (quoted live when the batch is known), or ETH from the wallet.
 */
export function GasLine({ chainId, calls }: { chainId: ChainId; calls?: Call[] | null }) {
  const mode = gasMode(chainId);
  const { data: quote } = useGasQuote(chainId, mode === "token" ? calls : null);
  const deployed = useWalletDeployed(chainId);
  if (mode === "sponsored") return <>Covered by vaults.cash</>;
  if (mode === "token") {
    const sym = CHAINS[chainId].quote.symbol;
    const first = deployed === false ? " (first-time wallet setup included)" : "";
    return quote ? <>about {fmtUsd(quote.usd)} in {sym}{first}</> : <>a few cents, in {sym}{first}</>;
  }
  return <>Under a cent, in ETH</>;
}

/** Sentence form for explanatory copy. */
export function gasSentence(chainId: ChainId): string {
  const mode = gasMode(chainId);
  const sym = CHAINS[chainId].quote.symbol;
  if (mode === "sponsored") return "Gas (network fees) covered by vaults.cash.";
  if (mode === "token") return `Gas is a few cents, paid in ${sym} from your balance — no ETH needed.`;
  return "Gas well under a cent, paid in ETH from your wallet.";
}
