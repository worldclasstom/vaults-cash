"use client";

import { useQuery } from "@tanstack/react-query";
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
