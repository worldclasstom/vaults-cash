"use client";

import { CDPReactProvider } from "@coinbase/cdp-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/components/AuthProvider";

/**
 * Coinbase CDP embedded wallets (replaced Privy + Alchemy 2026-07-12).
 *
 * createOnLogin: "smart" gives every user an ERC-4337 smart account, which is
 * what makes the one-tap deposit possible: useSendUserOperation submits the
 * whole zap (fee + approvals + swap + mint) as ONE atomic batch, and CDP's
 * Paymaster sponsors gas on Base natively (useCdpPaymaster) — no bundler
 * shims, no EIP-7702 authorization dance, no gas-policy ids.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
      }),
  );

  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID;
  if (!projectId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-muted">
        Set NEXT_PUBLIC_CDP_PROJECT_ID in .env.local (see .env.example) to run vaults.cash.
      </div>
    );
  }

  return (
    <CDPReactProvider
      config={{
        projectId,
        ethereum: { createOnLogin: "smart" },
        appName: "vaults.cash",
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </CDPReactProvider>
  );
}
