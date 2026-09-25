"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { CHAINS, type ChainId } from "@/lib/chain";
import { fmtUsd } from "@/lib/format";
import { useCashBalances } from "@/hooks/useChainData";
import { useBridgeQuote, useBridgeStatus, useSendBridge } from "@/hooks/useBridge";
import { Sheet } from "./Sheet";
import { Chip } from "./TokenIcon";

/**
 * "Your dollars are on the other chain": offered wherever a deposit needs
 * the stablecoin of chain A while the wallet holds the stablecoin of chain
 * B. One tap moves it (Relay), same address on both sides.
 */
export function BridgePanel({ toChainId, suggestedUsd }: { toChainId: ChainId; suggestedUsd?: number }) {
  const { data: cash } = useCashBalances();
  const to = CHAINS[toChainId];
  const source = cash?.perChain.find((c) => c.chainId !== toChainId && c.formatted >= 1);
  const from = source ? CHAINS[source.chainId as ChainId] : null;
  const [amount, setAmount] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const quote = useBridgeQuote();
  const send = useSendBridge();
  const status = useBridgeStatus(requestId);

  if (!source || !from) return null;
  const max = source.formatted;
  const initial = Math.min(max, Math.max(suggestedUsd ?? max, 5));
  const amountNum = Number(amount || initial.toFixed(2));
  const tooMuch = amountNum > max;

  const start = async () => {
    setOpen(true);
    quote.mutate({ from: source.chainId as ChainId, to: toChainId, amount: parseUnits(amountNum.toFixed(from.quote.decimals), from.quote.decimals) });
  };
  const close = () => {
    if (send.isPending) return;
    setOpen(false);
    quote.reset();
  };
  const q = quote.data;
  const st = status.data?.status;

  if (requestId) {
    const done = st === "success";
    const failed = st === "failure" || st === "refund";
    return (
      <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
        <p className={`font-display text-lg font-extrabold ${done ? "text-accent" : failed ? "text-negative" : ""}`}>
          {done ? `${to.quote.symbol} landed on ${to.label}` : failed ? "The move didn't complete" : `Moving to ${to.label}…`}
        </p>
        <p className="pt-1 text-muted">
          {done
            ? "Your balance here is updated. Go ahead and deposit."
            : failed
              ? "Relay refunded or rejected the route. Your funds are still in your wallet on the source chain; try again in a minute."
              : "Usually under a minute. You can stay on this page."}
        </p>
        {!done && !failed && <div className="mt-3 h-1.5 w-32 animate-pulse rounded-full bg-accent/40" />}
        {(done || failed) && (
          <button onClick={() => setRequestId(null)} className="mt-3 rounded-full bg-surface px-4 py-2 text-xs font-semibold transition-colors hover:bg-borderline">
            {done ? "Done" : "Try again"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-surface-raised p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="outline">{from.label}</Chip>
        <span className="font-display text-lg font-extrabold">
          {fmtUsd(max)} {from.quote.symbol} is sitting on {from.label}
        </span>
      </div>
      <p className="pt-1 text-muted">
        This pool takes {to.quote.symbol} on {to.label}. Move some over and it arrives at this same wallet, usually in under a
        minute. {from.gasSponsored ? "Network fees covered by vaults.cash." : "Network fee under a cent, in ETH."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-muted">$</span>
        <input
          inputMode="decimal"
          value={amount === "" ? initial.toFixed(2) : amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="w-28 rounded-xl bg-background p-2 font-mono outline-none"
          aria-label={`Amount of ${from.quote.symbol} to move`}
        />
        <button onClick={() => setAmount(max.toFixed(2))} className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground">
          Max
        </button>
        <button
          onClick={start}
          disabled={amountNum < 1 || tooMuch}
          className="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          Move to {to.label}
        </button>
      </div>
      {tooMuch && <p className="pt-1 text-xs text-negative">That&apos;s more than you have on {from.label}.</p>}

      {open && (
        <Sheet open onClose={close} title={`Move to ${to.label}`} busy={send.isPending}>
          {q ? (
            <>
              <p className="pt-3 font-display text-4xl font-extrabold tracking-tighter">
                ≈ {fmtUsd(Number(formatUnits(BigInt(q.amountOut), to.quote.decimals)))}{" "}
                <span className="text-xl text-muted">{q.toSymbol}</span>
              </p>
              <p className="pt-1 text-xs text-muted">arrives on {to.label}, usually in under a minute</p>
              <dl className="space-y-2 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">You send</dt>
                  <dd className="font-medium">
                    {fmtUsd(Number(formatUnits(BigInt(q.amountIn), from.quote.decimals)))} {q.fromSymbol} on {from.label}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-semibold text-foreground">Total cost</dt>
                  <dd className="font-display font-extrabold">{fmtUsd(q.totalCostUsd)}</dd>
                </div>
                <div className="flex justify-between pl-4">
                  <dt className="text-muted">Relay&apos;s route fee</dt>
                  <dd className="text-muted">{fmtUsd(q.feesUsd)}</dd>
                </div>
                <div className="flex justify-between pl-4">
                  <dt className="text-muted">{q.fromSymbol} → {q.toSymbol} conversion rate</dt>
                  <dd className="text-muted">{fmtUsd(q.conversionUsd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Network fee</dt>
                  <dd className="font-medium">{from.gasSponsored ? "Covered by vaults.cash" : "Under a cent, in ETH"}</dd>
                </div>
              </dl>
              <p className="pb-2 text-xs text-muted">
                Expect about {fmtUsd(Number(formatUnits(BigInt(q.amountOut), to.quote.decimals)))} to arrive. Relay also guarantees a floor of{" "}
                {fmtUsd(Number(formatUnits(BigInt(q.minAmountOut), to.quote.decimals)))} in case the rate moves during the few seconds it&apos;s in
                flight. That floor is a safety limit, not the expected amount.
              </p>
              <p className="pb-4 text-xs text-muted">
                Moved through Relay, a bridge many wallets use, to this same address on {to.label}. vaults.cash charges nothing for this.
              </p>
              <div className="flex gap-2">
                <button onClick={close} disabled={send.isPending} className="rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline disabled:opacity-40">
                  Back
                </button>
                <button
                  onClick={() =>
                    send.mutate(q, {
                      onSuccess: (id) => {
                        setRequestId(id);
                        setOpen(false);
                      },
                    })
                  }
                  disabled={send.isPending}
                  className="grow rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
                >
                  {send.isPending ? "Moving…" : `Move ${fmtUsd(amountNum)}`}
                </button>
              </div>
              {send.isError && <p className="mt-2 text-xs text-negative">{(send.error as Error).message}</p>}
            </>
          ) : quote.isError ? (
            <>
              <p className="pt-3 text-sm text-negative">Couldn&apos;t get a route: {(quote.error as Error).message}</p>
              <button onClick={close} className="mt-4 rounded-full bg-surface px-5 py-3 font-semibold transition-colors hover:bg-borderline">
                Close
              </button>
            </>
          ) : (
            <div className="space-y-3 py-4" aria-busy>
              <div className="h-9 w-40 animate-pulse rounded-lg bg-surface" />
              <div className="h-24 animate-pulse rounded-xl bg-surface" />
              <p className="text-xs text-muted">Finding the best route…</p>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
