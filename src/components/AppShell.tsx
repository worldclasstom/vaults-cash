"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { captureRefFromUrl } from "./InviteCard";
import { FooterContent } from "./Footer";
import { Wordmark } from "./Logo";
import { HeaderMenu } from "./HeaderMenu";

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

function TargetIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Pools", Icon: MarketsIcon },
  { href: "/targets", label: "Targets", Icon: TargetIcon },
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
          const active = href === "/" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex grow flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                active ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <span className={active ? "nav-sticker flex h-7 w-11 items-center justify-center rounded-full bg-accent text-black" : "flex h-7 w-11 items-center justify-center"}>
                <Icon active={active} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAuth();
  const pathname = usePathname();
  // referral links work on ANY page (vaults.cash/market/eth?ref=… included)
  useEffect(() => captureRefFromUrl(), []);

  // desktop tabs: the active one is a sticker slapped on the bar, the rest
  // are plain labels that bounce on hover
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={
        (href === "/" ? pathname === href : pathname.startsWith(href))
          ? "nav-sticker rounded-full bg-accent px-4 py-1.5 font-display text-sm font-extrabold text-black"
          : "nav-plain rounded-full px-3.5 py-1.5 font-display text-sm font-bold text-muted hover:text-foreground"
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl grow flex-col px-4 pb-24 md:pb-12">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between bg-background/85 px-4 py-4 backdrop-blur-md md:py-5">
        <Link href="/" aria-label="vaults.cash home">
          <Wordmark />
        </Link>
        {authenticated && (
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-1.5 md:flex">
              {tab("/", "Pools")}
              {tab("/targets", "Targets")}
              {tab("/portfolio", "Portfolio")}
            </nav>
            <HeaderMenu />
          </div>
        )}
      </header>
      <main className="flex grow flex-col">{children}</main>
      <footer className="mt-12 border-t border-borderline pt-6 pb-4">
        <FooterContent />
      </footer>
      {authenticated && <BottomNav pathname={pathname} />}
    </div>
  );
}
