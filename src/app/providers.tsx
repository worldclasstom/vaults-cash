"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { baseChain, robinhoodChain } from "@/lib/chain";

/**
 * Privy embedded wallets + Privy smart wallets (back from CDP, 2026-09-23).
 *
 * Why Privy: it is the only provider that covers BOTH Base and Robinhood
 * Chain with smart accounts (CDP's smart accounts/paymaster support 8 chains
 * and 4663 is not one of them), it has native iOS + Expo SDKs for the
 * companion app, and it revives the existing users + referral auth.
 *
 * Smart wallets give us atomic batching (the whole zap in one user op) and
 * gas sponsorship — configured per chain in the Privy dashboard (smart
 * account type + bundler + paymaster URL; Alchemy gas policy for
 * sponsorship). Custom chains like Robinhood Chain are added there with
 * their own bundler/paymaster/RPC URLs. Nothing chain-specific lives here.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } },
      }),
  );

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-muted">
        Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local (see .env.example) to run vaults.cash.
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "sms", "google", "passkey", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#7cd44a",
          landingHeader: "Log in to vaults.cash",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          // Every user gets a Solana key too, so a Solana venue can be added
          // later without a migration. "all-users": "users-without-wallets"
          // would skip anyone who already holds the EVM wallet above.
          solana: { createOnLogin: "all-users" },
          // Our Confirm sheet is the single human-readable prompt.
          showWalletUIs: false,
        },
        defaultChain: baseChain,
        // both must also be configured under Smart wallets in the dashboard
        // (Base: CDP bundler + paymaster; Robinhood: Alchemy bundler, no
        // paymaster) or getClientForChain() has nothing to hand back
        supportedChains: [baseChain, robinhoodChain],
      }}
    >
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
