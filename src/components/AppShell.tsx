"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { captureRefFromUrl } from "./InviteCard";
import { Wordmark } from "./Logo";

function MarketsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l5-6 4 4 6-8"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 7h3v3" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PortfolioIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3a9 9 0 1 0 9 9h-9V3Z"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinejoin="round"
      />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinejoin="round" />
    </svg>
  );
}

function AccountIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <path
        d="M4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Markets", Icon: MarketsIcon },
  { href: "/portfolio", label: "Portfolio", Icon: PortfolioIcon },
  { href: "/account", label: "Account", Icon: AccountIcon },
] as const;

/** iOS-style bottom tab bar (mobile, signed-in only). The future iOS app
 *  uses the same three tabs — keep them in lockstep. */
function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borderline bg-background/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex grow flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { authenticated } = usePrivy();
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
    <div className="mx-auto flex w-full max-w-xl grow flex-col px-4 pb-24 md:pb-12">
      <header className="flex items-center justify-between py-5">
        <Link href="/" aria-label="vaults.cash home">
          <Wordmark />
        </Link>
        {authenticated && (
          <nav className="hidden items-center gap-1 md:flex">
            {tab("/", "Markets")}
            {tab("/portfolio", "Portfolio")}
            {tab("/account", "Account")}
          </nav>
        )}
      </header>
      <main className="flex grow flex-col">{children}</main>
      <footer className="mt-12 space-y-3 border-t border-borderline pt-6 pb-4 text-xs text-muted/80">
        <p>
          <span className="text-muted">Self-custodial:</span> your funds stay in
          your own wallet and in positions you own — vaults.cash never takes
          custody. Positions sit in official Uniswap v4 pools on Robinhood
          Chain.
        </p>
        <p>
          LP positions carry market &amp; impermanent-loss risk and are not
          insured. Flat {Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 30) / 100}%
          conversion fee — no other charges.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          <Link href="/how-it-works" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
            How it works
          </Link>
          <Link href="/disclosures" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
            Disclosures &amp; fees
          </Link>
          <a
            href="https://robinhoodchain.blockscout.com"
            target="_blank"
            rel="noreferrer"
            className="text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Explorer
          </a>
          <span className="text-muted/60">© 2026 vaults.cash</span>
        </p>
      </footer>
      {authenticated && <BottomNav pathname={pathname} />}
    </div>
  );
}
