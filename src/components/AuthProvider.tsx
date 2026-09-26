"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

/**
 * Thin auth shim. The rest of the app depends on this `{ ready,
 * authenticated, login, logout }` shape rather than on any provider's hooks,
 * so swapping wallet providers (Privy → CDP → Privy, as it happened) is a
 * one-file change. Privy's own login modal handles email/SMS/Google/passkey.
 */
export function useAuth() {
  const { ready, authenticated, login, logout } = usePrivy();
  const router = useRouter();
  return {
    ready,
    authenticated,
    login: () => login(),
    logout: async () => {
      await logout();
      router.push("/");
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
