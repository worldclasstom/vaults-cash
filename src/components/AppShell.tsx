"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { captureRefFromUrl } from "./InviteCard";
import { Wordmark } from "./Logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { authenticated, logout } = usePrivy();
  const pathname = usePathname();
  // referral links work on ANY page (vaults.cash/market/eth?ref=… included)
  useEffect(() => captureRefFromUrl(), []);

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
        pathname === href
          ? "bg-surface-raised text-foreground"
          : "text-muted hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-xl grow flex-col px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link href="/" aria-label="vaults.cash home">
          <Wordmark />
        </Link>
        {authenticated && (
          <nav className="flex items-center gap-1">
            {tab("/", "Markets")}
            {tab("/portfolio", "Portfolio")}
            <button
              onClick={logout}
              className="ml-2 text-sm text-muted transition-colors hover:text-foreground"
            >
              Log out
            </button>
          </nav>
        )}
      </header>
      <main className="flex grow flex-col">{children}</main>
      <footer className="pt-10 text-center text-xs text-muted/70">
        LP positions carry market &amp; impermanent-loss risk ·{" "}
        <Link href="/disclosures" className="underline-offset-2 hover:underline">
          Disclosures &amp; fees
        </Link>
      </footer>
    </div>
  );
}
