"use client";

import { gasMode, type ChainId } from "@/lib/chain";
import { CHAINS } from "@/lib/chain";
import { useWalletDeployed } from "@/hooks/useWalletDeployed";
import { gasSentence } from "./GasLine";

/**
 * The gas sentence for a review sheet, plus the one-time note on a chain
 * where this is the wallet's first transaction: that one also deploys the
 * wallet, so it costs more than every transaction after it.
 */
export function GasNote({ chainId }: { chainId: ChainId }) {
  const deployed = useWalletDeployed(chainId);
  const mode = gasMode(chainId);
  const first = deployed === false && mode !== "sponsored";
  return (
    <>
      {gasSentence(chainId)}{" "}
      {first && (
        <span className="text-foreground">
          Your first transaction on {CHAINS[chainId].label} also sets up your wallet on this network, so it costs more
          this once, about a quarter. After that, a few cents.
        </span>
      )}{" "}
    </>
  );
}
