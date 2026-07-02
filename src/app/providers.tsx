"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { robinhoodChain } from "@/lib/chain";

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
        loginMethods: ["email", "sms", "google", "apple", "passkey", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#7cd44a",
          landingHeader: "Log in to vaults.cash",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: robinhoodChain,
        supportedChains: [robinhoodChain],
      }}
    >
      <SmartWalletsProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}
