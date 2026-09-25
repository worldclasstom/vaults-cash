"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useReferral } from "@/hooks/useReferral";
import { fmtUsd } from "@/lib/format";

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

export function InviteCard() {
  const { authenticated } = useAuth();
  const { data, isError, refetch } = useReferral();
  const [copied, setCopied] = useState(false);

  if (!authenticated) return null;
  // a failed lookup used to hide the card entirely, which read as "there is
  // no referral program" — show the card with a retry instead
  if (!data) {
    return (
      <section className="mt-6 rounded-3xl bg-surface shadow-card p-5">
        <h2 className="font-semibold">Invite friends, earn together</h2>
        <p className="pt-1 text-sm text-muted">
          You earn <span className="text-accent">50% of vaults.cash fees</span> from every deposit your invites make.
        </p>
        {isError ? (
          <button onClick={() => refetch()} className="mt-3 text-sm text-accent underline-offset-2 hover:underline">
            Couldn&apos;t load your invite link — tap to retry
          </button>
        ) : (
          <div className="mt-3 h-12 animate-pulse rounded-xl bg-surface-raised" />
        )}
      </section>
    );
  }
  const link = `https://vaults.cash?ref=${data.refCode}`;

  return (
    <section className="mt-6 rounded-3xl bg-surface shadow-card p-5">
      <h2 className="font-semibold">Invite friends, earn together</h2>
      <p className="pt-1 text-sm text-muted">
        You earn <span className="text-accent">50% of vaults.cash fees</span> from every deposit your invites make —
        paid to your wallet on-chain, in the same transaction as their deposit.
      </p>
      <button
        onClick={() => {
          navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="mt-3 w-full rounded-xl bg-surface-raised p-3 text-left font-mono text-sm transition-colors hover:bg-borderline"
      >
        {link}
        <span className="mt-1 block text-xs text-accent">{copied ? "Copied ✓" : "Tap to copy your link"}</span>
      </button>
      <div className="mt-3 flex gap-6 text-sm">
        <span>
          <span className="text-muted">Invited: </span>
          <span className="font-semibold">{data.referredCount}</span>
        </span>
        <span>
          <span className="text-muted">Earned: </span>
          <span className="font-semibold text-accent">{fmtUsd(data.earnedUsd)}</span>
        </span>
      </div>
    </section>
  );
}
