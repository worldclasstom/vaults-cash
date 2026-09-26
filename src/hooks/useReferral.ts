"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "@/components/AuthProvider";
import type { ReferralView } from "@/lib/referral";
import { useActiveAddress } from "./useChainData";

const REF_KEY = "vaults.ref";

/** The signed-in user's referral state: their own code/earnings and, if
 *  they were referred, the referrer's wallet (which the deposit zap pays the
 *  referral share to on-chain). One query shared by the invite card and the
 *  deposit/withdraw flows. */
export function useReferral() {
  const { authenticated } = useAuth();
  const { getAccessToken } = usePrivy();
  const address = useActiveAddress();
  return useQuery({
    queryKey: ["referral-me", address],
    enabled: authenticated && !!address,
    staleTime: 60_000,
    retry: 2,
    queryFn: async (): Promise<ReferralView> => {
      const token = await getAccessToken();
      // the httpOnly cookie rides along automatically (same-origin); the
      // localStorage code goes as an explicit fallback param
      let pending: string | null = null;
      try {
        pending = localStorage.getItem(REF_KEY);
      } catch {
        /* storage blocked */
      }
      const url = `/api/referral/me?wallet=${address}${pending ? `&pendingRef=${encodeURIComponent(pending)}` : ""}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`referral fetch failed (${res.status})`);
      return res.json();
    },
  });
}

function useReferralPost(path: string) {
  const { getAccessToken } = usePrivy();
  const address = useActiveAddress();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const token = await getAccessToken();
      const res = await fetch(path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ wallet: address, code }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) throw new Error(j.error ?? `request failed (${res.status})`);
      return j;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral-me"] }),
  });
}

/** Pick a vanity invite code (once). */
export const useClaimInviteCode = () => useReferralPost("/api/referral/code");
/** Apply someone's invite code by hand. */
export const useApplyInviteCode = () => useReferralPost("/api/referral/apply");
