"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { clearPersistedQueries, likelyAuthenticated, rememberAuth } from "@/lib/queryPersist";

/**
 * Thin auth shim. The rest of the app depends on this `{ ready,
 * authenticated, login, logout }` shape rather than on any provider's hooks,
 * so swapping wallet providers (Privy → CDP → Privy, as it happened) is a
 * one-file change. Privy's own login modal handles email/SMS/Google/passkey.
 */
export function useAuth() {
  const { ready, authenticated, login, logout } = usePrivy();
  const router = useRouter();
  const qc = useQueryClient();
  return {
    ready,
    authenticated,
    login: () => login(),
    logout: async () => {
      await logout();
      // nothing of this account survives in the browser: memory cache or the persisted copy
      qc.clear();
      clearPersistedQueries();
      rememberAuth(false);
      router.push("/");
    },
  };
}

const subscribeNoop = () => () => {};
/** Was this browser logged in last time? Lets the first paint choose the app
 *  shell or the landing page before Privy has restored the session. */
export function useLikelyAuthenticated(): boolean {
  return useSyncExternalStore(subscribeNoop, likelyAuthenticated, () => false);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  useEffect(() => {
    if (ready) rememberAuth(authenticated);
  }, [ready, authenticated]);
  return <>{children}</>;
}
