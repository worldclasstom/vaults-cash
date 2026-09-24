"use client";

import { useState } from "react";
import { useSendCalls } from "@/hooks/useSendCalls";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, erc20Abi, formatUnits, isAddress, parseUnits } from "viem";
import { CHAINS, CHAIN_IDS, explorerUrl, type ChainId } from "@/lib/chain";
import { fmtAmount } from "@/lib/format";
import { NATIVE_ETH } from "@/lib/markets";
import { useQuoteBalance, useTokenBalance } from "@/hooks/useChainData";

type Asset = "quote" | "ETH";

export function SendPanel({ onClose }: { onClose: () => void }) {
  const sendCalls = useSendCalls();
  const queryClient = useQueryClient();

  const [chainId, setChainId] = useState<ChainId>(8453);
  const chain = CHAINS[chainId];
  const { data: quoteBalance } = useQuoteBalance(chainId);
  const { data: ethBalance } = useTokenBalance(NATIVE_ETH, 18, chainId);

  const [asset, setAsset] = useState<Asset>("quote");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const assetLabel = asset === "quote" ? chain.quote.symbol : "ETH";
  const decimals = asset === "quote" ? chain.quote.decimals : 18;
  const balance = asset === "quote" ? quoteBalance : ethBalance;

  let amountRaw = 0n;
  try {
    amountRaw = parseUnits(amount || "0", decimals);
  } catch {
    /* keep 0 — treated as invalid below */
  }
  const toValid = isAddress(to.trim());
  const insufficient = balance !== undefined && amountRaw > balance.raw;
  const canReview = amountRaw > 0n && toValid && !insufficient;

  const setMax = () => {
    if (!balance) return;
    // on a sponsored chain no gas reserve is needed; on an unsponsored one
    // the user op's own fee comes out of the ETH balance, so leave a sliver
    const reserve = asset === "ETH" && !chain.gasSponsored ? parseUnits("0.00002", 18) : 0n;
    setAmount(formatUnits(balance.raw > reserve ? balance.raw - reserve : 0n, decimals));
  };

  const send = useMutation({
    mutationFn: async () => {
      const recipient = to.trim() as `0x${string}`;
      const call =
        asset === "ETH"
          ? { to: recipient, value: amountRaw, data: "0x" as `0x${string}` }
          : {
              to: chain.quote.address,
              value: 0n,
              data: encodeFunctionData({
                abi: erc20Abi,
                functionName: "transfer",
                args: [recipient, amountRaw],
              }),
            };
      // one user operation — waits for inclusion, returns the tx hash
      const { hash } = await sendCalls([call], { description: `Send ${assetLabel}`, chainId });
      return hash;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usdc-balance"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
      queryClient.invalidateQueries({ queryKey: ["token-balance"] });
    },
  });

  if (send.isSuccess) {
    return (
      <div className="mt-3 rounded-2xl bg-surface p-4 text-sm">
        <p className="font-semibold text-accent">Sent ✓</p>
        <p className="pt-1 text-muted">
          {fmtAmount(Number(amount), 6)} {assetLabel} is on its way on {chain.chain.name}.
        </p>
        <a
          href={explorerUrl(chainId, "tx", send.data)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all font-mono text-xs text-accent hover:underline"
        >
          View on explorer →
        </a>
        <button
          onClick={onClose}
          className="mt-3 rounded-full bg-surface-raised px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
        >
          Done
        </button>
      </div>
    );
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-accent text-black" : "bg-surface-raised text-muted hover:bg-borderline"
    }`;

  return (
    <div className="mt-3 rounded-2xl bg-surface p-4 text-sm">
      {!reviewing ? (
        <>
          <div className="flex gap-2 pb-2">
            {CHAIN_IDS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setChainId(id);
                  setAmount("");
                }}
                className={pill(chainId === id)}
              >
                {CHAINS[id].label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pb-3">
            {(["quote", "ETH"] as const).map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAsset(a);
                  setAmount("");
                }}
                className={pill(asset === a)}
              >
                {a === "quote" ? chain.quote.symbol : "ETH"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full rounded-xl bg-surface-raised p-3 font-mono outline-none placeholder:text-muted/50"
            />
            <button
              onClick={setMax}
              className="rounded-full bg-surface-raised px-4 py-2 text-xs font-semibold text-muted transition-colors hover:bg-borderline hover:text-foreground"
            >
              Max
            </button>
          </div>
          <p className="pt-1 text-xs text-muted">
            Available: {balance ? fmtAmount(balance.formatted, 6) : "—"} {assetLabel}
            {insufficient && <span className="text-negative"> — not enough</span>}
          </p>
          <input
            placeholder="Recipient address (0x…)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-3 w-full rounded-xl bg-surface-raised p-3 font-mono text-xs outline-none placeholder:text-muted/50"
          />
          {to.trim() !== "" && !toValid && (
            <p className="pt-1 text-xs text-negative">That doesn&apos;t look like a valid address.</p>
          )}
          <p className="pt-2 text-xs text-muted">
            Sends on <span className="text-foreground">{chain.chain.name}</span> only.
            To move funds to an exchange, use the deposit address it shows for{" "}
            {asset === "ETH" ? "Ethereum" : chain.quote.symbol} on{" "}
            <span className="text-foreground">{chain.chain.name}</span> — addresses
            for other networks won&apos;t receive it.
          </p>
          <button
            onClick={() => setReviewing(true)}
            disabled={!canReview}
            className="mt-3 w-full rounded-full bg-accent py-2.5 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
          >
            Review send
          </button>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold">
            Send {fmtAmount(Number(amount), 6)} {assetLabel}
          </p>
          <p className="pt-2 text-xs text-muted">To ({chain.chain.name}):</p>
          <p className="break-all font-mono text-xs">{to.trim()}</p>
          <p className="pt-2 text-xs text-muted">
            No vaults.cash fee
            {chain.gasSponsored
              ? ", and network fees are covered by vaults.cash."
              : "; the network fee (well under a cent) comes from your ETH on this chain."}{" "}
            Transfers can&apos;t be reversed — double-check the address.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setReviewing(false)}
              disabled={send.isPending}
              className="rounded-full bg-surface-raised px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-borderline disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => send.mutate()}
              disabled={send.isPending}
              className="grow rounded-full bg-accent py-2.5 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
          {send.isError && (
            <p className="pt-2 text-xs text-negative">{(send.error as Error).message}</p>
          )}
        </>
      )}
    </div>
  );
}
