"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FooterContent } from "./Footer";
import { captureRefFromUrl } from "./InviteCard";
import { Wordmark } from "./Logo";

/** Shared shell for the public/marketing pages (landing, how-it-works,
 *  disclosures): sticky wide nav + wide footer. Auth-aware — signed-in
 *  visitors get an "Open app" button instead of login CTAs. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login } = useAuth();
  // referral links land on the marketing pages — capture ?ref= here too
  useEffect(() => captureRefFromUrl(), []);

  return (
    <div className="w-full">
      <header className="sticky top-0 z-40 border-b border-borderline/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="vaults.cash home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/how-it-works"
              className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:block"
            >
              How it works
            </Link>
            {!ready ? null : authenticated ? (
              <Link
                href="/"
                className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
              >
                Open app
              </Link>
            ) : (
              <>
                <button
                  onClick={login}
                  className="rounded-full border border-borderline px-5 py-2 text-sm font-semibold transition-colors hover:border-muted"
                >
                  Log in
                </button>
                <button
                  onClick={login}
                  className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
                >
                  Get started
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-borderline/60">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <FooterContent />
        </div>
      </footer>
    </div>
  );
}
