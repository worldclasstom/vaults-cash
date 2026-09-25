"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { Activity } from "@/lib/activity";
import type { OwnedPosition } from "@/lib/positions";

const fetchActivity = async (p: OwnedPosition): Promise<Activity> => {
  const res = await fetch(`/api/positions/activity?chainId=${p.market.chainId}&tokenId=${p.tokenId}`);
  if (!res.ok) throw new Error(`activity ${res.status}`);
  return res.json();
};
const key = (p: OwnedPosition) => ["activity", p.market.chainId, p.tokenId.toString()];

/** What traders paid one position today, plus its recent trades. */
export function useActivity(p: OwnedPosition) {
  return useQuery({ queryKey: key(p), queryFn: () => fetchActivity(p), staleTime: 30_000, refetchInterval: 45_000 });
}

/** The same for every position, sharing the per-position cache. */
export function useActivities(positions: OwnedPosition[] | undefined) {
  return useQueries({
    queries: (positions ?? []).map((p) => ({ queryKey: key(p), queryFn: () => fetchActivity(p), staleTime: 30_000, refetchInterval: 45_000 })),
  });
}
