"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { GasLine } from "@/components/GasLine";
import { Ladder, LadderStickers, ladderTitle } from "@/components/Ladder";
import { Sheet } from "@/components/Sheet";
import { Chip } from "@/components/TokenIcon";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { useReferral } from "@/hooks/useReferral";
import { useLadder, usePlanLadderClose, usePlanLadderCollect, useSendLadderAction } from "@/hooks/useTargets";
import { CHAINS, explorerUrl, type ChainId } from "@/lib/chain";
import { fmtPrice, fmtUsd } from "@/lib/format";
import type { LadderView } from "@/lib/ladders";
import type { ClosePlan } from "@/lib/targets";

type Pending = { kind: "cash" | "keep" | "collect"; plan: ClosePlan };

function ActionSheet({ v, pending, onClose }: { v: LadderView; pending: Pending; onClose: () => void }) {
  const send = useSendLadderAction();
  const dec = CHAINS[v.chainId].quote.decimals;
  const stable = CHAINS[v.chainId].quote.symbol;
  const { plan, kind } = pending;
  const title = kind === "collect" ? "Collect fees" : kind === "keep" ? `Keep the ${v.base}` : `Cash out to ${stable}`;
  return (
    <Sheet open onClose={() => !send.isPending && onClose()} title={title} busy={send.isPending}>
      {kind === "cash" && (
        <>
          <p className="pt-1 font-display text-3xl font-extrabold tracking-tight">
            ≥ {fmtUsd(Number(plan.stableOutMin) / 10 ** dec)} <span className="text-lg text-muted">{stable}</span>
          </p>
          <p className="text-xs text-muted">Guaranteed minimum after fees; you usually receive a little more.</p>
        </>
      )}
      {kind === "keep" && (
        <>
          <p className="pt-1 font-display text-3xl font-extrabold tracking-tight">
            {(Number(plan.baseKept) / 10 ** 18).toFixed(4)} <span className="text-lg text-muted">{v.base}</span>
          </p>
          <p className="text-xs text-muted">Lands in your wallet as {v.base}. Any unfilled rung comes back as {stable}.</p>
        </>
      )}
      {kind === "collect" && (
        <>
          <p className="pt-1 font-display text-3xl font-extrabold tracking-tight">
            ≥ {fmtUsd(Number(plan.stableOutMin) / 10 ** dec)} <span className="text-lg text-muted">{stable}</span>
          </p>
          <p className="text-xs text-muted">Trading fees earned so far, converted to {stable}. The ladder keeps running.</p>
        </>
      )}
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Trading fees earned</dt>
          <dd className="font-medium">{fmtUsd(Number(plan.feesEarnedStable) / 10 ** dec)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">vaults.cash performance fee (8% of fees earned)</dt>
          <dd className="font-medium">{fmtUsd(Number(plan.performanceFee) / 10 ** dec)}</dd>
        </div>
        {plan.withdrawFee > 0n && (
          <div className="flex justify-between">
            <dt className="text-muted">vaults.cash fee (0.6% of the rest)</dt>
            <dd className="font-medium">{fmtUsd(Number(plan.withdrawFee) / 10 ** dec)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">Gas (network fee)</dt>
          <dd className="font-medium">
            <GasLine chainId={v.chainId as ChainId} calls={plan.calls} />
          </dd>
        </div>
      </dl>
      <button
        disabled={send.isPending}
        onClick={() => send.mutate({ view: v, plan, action: kind === "collect" ? "collected" : "closed" }, { onSuccess: onClose })}
        className="mt-5 w-full rounded-full bg-accent py-3.5 font-display text-base font-extrabold text-black hover:bg-accent-strong disabled:opacity-50"
      >
        {send.isPending ? "Sending…" : title}
      </button>
      {send.isError && <p className="pt-2 text-xs text-negative">{(send.error as Error).message}</p>}
    </Sheet>
  );
}

export default function TargetPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { ready, authenticated, login } = useAuth();
  const { data: v, isLoading, isError } = useLadder(Number.isFinite(id) ? id : null);
  const planClose = usePlanLadderClose();
  const planCollect = usePlanLadderCollect();
  const [pending, setPending] = useState<Pending | null>(null);
  const [sharing, setSharing] = useState(false);
  const { data: ref } = useReferral();
  const busy = planClose.isPending || planCollect.isPending;
  const err = (planClose.error ?? planCollect.error) as Error | null;

  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to see this target.</p>
          <button onClick={login} className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong">
            Log in
          </button>
        </div>
      ) : isLoading ? (
        <div className="my-6 h-64 animate-pulse rounded-3xl bg-surface shadow-card" />
      ) : isError || !v ? (
        <p className="my-6 rounded-3xl bg-surface shadow-card p-5 text-sm text-muted">Couldn&apos;t load this target.</p>
      ) : (
        <div className="animate-rise py-4">
          <Link href="/targets" className="text-sm text-muted hover:text-foreground">
            ← Targets
          </Link>
          <div className="flex items-start justify-between gap-3 pt-2">
            <div>
              <LadderStickers v={v} />
              <h1 className="pt-2 font-display text-3xl font-extrabold tracking-tight">{ladderTitle(v)}</h1>
              <p className="text-sm text-muted">
                now ${fmtPrice(v.priceNow)} · {v.done} of {v.total} rungs {v.direction === "up" ? "sold" : "filled"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">paid so far</p>
              <p className="font-display text-3xl font-extrabold tracking-tight text-accent">+{fmtUsd(v.feesUsd + v.feesPaidUsd)}</p>
            </div>
          </div>

          {(v.status === "hit" || (v.status === "open" && v.done === v.total && v.total > 0)) && (
            <div className="mt-4 rounded-2xl bg-accent/15 p-4 text-sm">
              <p className="font-display text-lg font-extrabold">Target hit.</p>
              <p className="pt-1 text-muted">
                {v.direction === "up"
                  ? `Every rung sold into ${v.quote}. Close now to lock it in — if price comes back down, open rungs start buying ${v.base} again.`
                  : `Every rung bought ${v.base}. Close now to keep it — if price bounces back up, open rungs start selling it again.`}
              </p>
            </div>
          )}
          {v.status === "expired" && (
            <div className="mt-4 rounded-2xl bg-surface-raised p-4 text-sm">
              <p className="font-semibold">This target expired.</p>
              <p className="pt-1 text-muted">It kept earning while it waited. Close it whenever you like, or leave it running.</p>
            </div>
          )}

          <section className="mt-5 rounded-3xl bg-surface p-5 shadow-card">
            <Ladder v={v} />
          </section>

          <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-xs text-muted">On the ladder</p>
              <p className="font-display text-xl font-extrabold">{fmtUsd(v.holdingsUsd)}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-xs text-muted">Fees to collect</p>
              <p className="font-display text-xl font-extrabold text-accent">{fmtUsd(v.feesUsd)}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-xs text-muted">Auto-close</p>
              <p className="font-display text-xl font-extrabold">{v.autoClose ? "On" : "Off"}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="text-xs text-muted">Gives up</p>
              <p className="font-display text-xl font-extrabold">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "Never"}</p>
            </div>
          </section>

          {v.status !== "closed" && v.status !== "cancelled" && v.rungs.some((r) => r.live) && (
            <div className="mt-5 flex flex-wrap gap-2">
              {v.direction === "down" && (
                <button
                  disabled={busy}
                  onClick={() => planClose.mutate({ view: v, mode: "keep" }, { onSuccess: (plan) => setPending({ kind: "keep", plan }) })}
                  className="grow rounded-full bg-accent px-5 py-3 font-display font-extrabold text-black hover:bg-accent-strong disabled:opacity-50"
                >
                  Keep the {v.base}
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => planClose.mutate({ view: v, mode: "cash" }, { onSuccess: (plan) => setPending({ kind: "cash", plan }) })}
                className={`grow rounded-full px-5 py-3 font-display font-extrabold disabled:opacity-50 ${v.direction === "up" ? "bg-accent text-black hover:bg-accent-strong" : "bg-surface hover:bg-borderline"}`}
              >
                Cash out to {v.quote}
              </button>
              <button
                disabled={busy || v.feesUsd < 0.05}
                onClick={() => planCollect.mutate(v, { onSuccess: (plan) => setPending({ kind: "collect", plan }) })}
                className="grow rounded-full bg-surface px-5 py-3 font-display font-extrabold hover:bg-borderline disabled:opacity-50"
              >
                Collect fees
              </button>
            </div>
          )}
          <div className="pt-2">
            <button onClick={() => setSharing(true)} className="rounded-full bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-borderline">
              Share this target
            </button>
          </div>
          {sharing && (
            <ShareCardSheet
              title="Share this target"
              img={`/api/share/target/${v.id}`}
              url={`https://vaults.cash/t/${v.id}${ref?.refCode ? `?ref=${ref.refCode}` : ""}`}
              alt={`${ladderTitle(v)} target card`}
              fileBase={`vaults-cash-target-${v.base}-${v.id}`}
              shareText={v.status === "hit" || v.status === "closed" ? `${v.base} hit my target. Traders paid me on the way up.` : `I set a target on ${v.base}. Every step there pays me.`}
              note={
                <>
                  A live card: the belief, the rungs, and what traders paid on the way. &ldquo;Share image&rdquo; hands a tall version to Instagram or TikTok stories. The link opens a public page with the same numbers
                  {ref?.refCode ? " and carries your invite code, so anyone who joins from it pays you half our fee" : ""}.
                </>
              }
              onClose={() => setSharing(false)}
            />
          )}
          {err && <p className="pt-2 text-xs text-negative">{err.message}</p>}

          <p className="pt-4 text-xs text-muted">
            <Chip>{v.total} positions</Chip> in your wallet ·{" "}
            <a href={explorerUrl(v.chainId as ChainId, "tx", v.openTx)} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
              Opened ↗
            </a>
            {v.closeTx && (
              <>
                {" "}
                ·{" "}
                <a href={explorerUrl(v.chainId as ChainId, "tx", v.closeTx)} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  Closed ↗
                </a>
              </>
            )}
          </p>
          {pending && <ActionSheet v={v} pending={pending} onClose={() => setPending(null)} />}
        </div>
      )}
    </AppShell>
  );
}
