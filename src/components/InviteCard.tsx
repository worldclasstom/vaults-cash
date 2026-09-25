"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useReferral } from "@/hooks/useReferral";
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

  if (!authenticated) return null;
  const link = data ? `https://vaults.cash?ref=${data.refCode}` : null;

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
