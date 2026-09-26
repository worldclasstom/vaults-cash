"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useApplyInviteCode, useClaimInviteCode, useReferral } from "@/hooks/useReferral";
import { fmtUsd } from "@/lib/format";
import { Chip } from "./TokenIcon";

const REF_KEY = "vaults.ref";

/**
 * localStorage fallback capture for cookie-blocking browsers. The PRIMARY
 * attribution path is server-side: the edge proxy sets an httpOnly cookie
 * on any ?ref= entry, and /api/referral/me binds it on the first
 * authenticated call — no client coordination involved.
 */
export function captureRefFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, ref);
  } catch {
    /* storage blocked — the cookie path still works */
  }
}

export function InviteCard({ className = "" }: { className?: string }) {
  const { authenticated } = useAuth();
  const { data, isError, refetch } = useReferral();
  const [copied, setCopied] = useState(false);
  const [wanted, setWanted] = useState("");
  const [entered, setEntered] = useState("");
  const claim = useClaimInviteCode();
  const apply = useApplyInviteCode();

  if (!authenticated) return null;
  const code = data ? (data.customCode ?? data.refCode) : null;
  const link = code ? `https://vaults.cash?ref=${code}` : null;

  return (
    <section className={`tilt relative overflow-hidden rounded-3xl bg-surface p-5 shadow-card ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-5xl font-extrabold leading-none tracking-tighter text-accent">50%</p>
          <h2 className="pt-2 font-display text-xl font-extrabold">of our fee, to you</h2>
        </div>
        <Chip tone="accent">Invite friends</Chip>
      </div>
      <p className="pt-2 text-sm text-muted">
        Every deposit someone you invited makes pays half of the vaults.cash fee straight to your wallet, on-chain, in
        the same transaction. No waiting, no minimum.
      </p>

      {/* a failed lookup used to hide the card, which read as "no referral program" */}
      {!data ? (
        isError ? (
          <button onClick={() => refetch()} className="mt-4 text-sm text-accent underline-offset-2 hover:underline">
            Couldn&apos;t load your invite link — tap to retry
          </button>
        ) : (
          <div className="mt-4 h-12 animate-pulse rounded-xl bg-surface-raised" />
        )
      ) : (
        <>
          <button
            onClick={() => {
              navigator.clipboard.writeText(link!);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="mt-4 w-full rounded-xl bg-surface-raised p-3 text-left font-mono text-sm transition-colors hover:bg-borderline"
          >
            <span className="break-all">{link}</span>
            <span className="mt-1 block text-xs text-accent">{copied ? "Copied" : "Tap to copy your link"}</span>
          </button>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip>Invited {data.referredCount}</Chip>
            <Chip tone={data.earnedUsd > 0 ? "accent" : "muted"}>Earned {fmtUsd(data.earnedUsd)}</Chip>
          </div>
          {!data.customCode && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (wanted.trim()) claim.mutate(wanted);
              }}
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <label className="text-xs text-muted" htmlFor="invite-wanted">
                Make it yours:
              </label>
              <input
                id="invite-wanted"
                value={wanted}
                onChange={(e) => setWanted(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16))}
                placeholder="YOURNAME"
                className="w-36 rounded-full bg-surface-raised px-3 py-1.5 font-mono text-sm uppercase outline-none placeholder:text-muted/40 focus:ring-2 focus:ring-accent"
              />
              <button type="submit" disabled={claim.isPending || wanted.length < 4} className="rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-borderline disabled:opacity-40">
                {claim.isPending ? "Claiming…" : "Claim"}
              </button>
              <span className="text-xs text-muted">4–16 letters or digits, picked once. Your old link keeps working.</span>
              {claim.isError && <span className="w-full text-xs text-negative">{(claim.error as Error).message}</span>}
            </form>
          )}
          {!data.referredBy && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (entered.trim()) apply.mutate(entered);
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <label className="text-xs text-muted" htmlFor="invite-entered">
                Have a friend&apos;s code?
              </label>
              <input
                id="invite-entered"
                value={entered}
                onChange={(e) => setEntered(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 16))}
                placeholder="CODE"
                className="w-32 rounded-full bg-surface-raised px-3 py-1.5 font-mono text-sm uppercase outline-none placeholder:text-muted/40 focus:ring-2 focus:ring-accent"
              />
              <button type="submit" disabled={apply.isPending || entered.length < 4} className="rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-borderline disabled:opacity-40">
                {apply.isPending ? "Applying…" : "Apply"}
              </button>
              {apply.isSuccess && <span className="text-xs text-accent">Linked. Half our fee on your deposits goes to them.</span>}
              {apply.isError && <span className="w-full text-xs text-negative">{(apply.error as Error).message}</span>}
            </form>
          )}
          {data.earnedUsd > 0 && (
            <div aria-hidden className="pointer-events-none absolute bottom-3 right-6 flex gap-6">
              {[0, 0.6].map((delay, i) => (
                <span key={i} className="animate-cash-up font-display text-lg font-extrabold text-accent" style={{ animationDelay: `${delay}s` }}>
                  +$
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
