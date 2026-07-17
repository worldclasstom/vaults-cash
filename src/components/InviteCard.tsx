"use client";

import { useState } from "react";
import { getAccessToken, usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useActiveAddress } from "@/hooks/useChainData";
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
  const ref = new URLSearchParams(window.location.search).get("ref");
  if (ref && !localStorage.getItem(REF_KEY)) localStorage.setItem(REF_KEY, ref);
}

export function InviteCard() {
  const { authenticated } = usePrivy();
  const address = useActiveAddress();
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["referral-me", address],
    enabled: authenticated && !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const token = await getAccessToken();
      // cookie rides along automatically (same-origin); localStorage code
      // goes as an explicit fallback param
      const pending = localStorage.getItem(REF_KEY);
      const url = `/api/referral/me?wallet=${address}${
        pending ? `&pendingRef=${encodeURIComponent(pending)}` : ""
      }`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("referral fetch failed");
      return res.json() as Promise<{
        refCode: string;
        referredCount: number;
        earnedUsd: number;
      }>;
    },
  });

  if (!authenticated || !data) return null;
  const link = `https://vaults.cash?ref=${data.refCode}`;

  return (
    <section className="mt-6 rounded-3xl bg-surface p-5">
      <h2 className="font-semibold">Invite friends, earn together</h2>
      <p className="pt-1 text-sm text-muted">
        You earn <span className="text-accent">50% of vaults.cash fees</span>{" "}
        from every deposit your invites make. Paid in USDC.
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
        <span className="mt-1 block text-xs text-accent">
          {copied ? "Copied ✓" : "Tap to copy your link"}
        </span>
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
