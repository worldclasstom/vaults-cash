"use client";

import Link from "next/link";
import { Wordmark, LogoMark } from "@/components/Logo";

/** TEMPORARY: three header account-control options side by side. Deleted before commit. */
function Bar({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-card">
      <p className="pb-3 font-display text-sm font-extrabold text-muted">{label}</p>
      <header className="flex items-center justify-between rounded-2xl bg-background px-4 py-4">
        <Link href="/" aria-label="vaults.cash home">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1.5">
            <span className="nav-sticker rounded-full bg-accent px-4 py-1.5 font-display text-sm font-extrabold text-black">Pools</span>
            <span className="nav-plain rounded-full px-3.5 py-1.5 font-display text-sm font-bold text-muted">Targets</span>
            <span className="nav-plain rounded-full px-3.5 py-1.5 font-display text-sm font-bold text-muted">Portfolio</span>
          </nav>
          {children}
        </div>
      </header>
    </div>
  );
}

export default function DevHeader() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <Bar label="A · Cash pill — your balance is the account button (hover opens the menu)">
        <button className="flex h-9 items-center gap-2 rounded-full bg-surface pl-1 pr-3 text-sm font-semibold hover:bg-surface-raised">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised font-display text-xs font-extrabold">T</span>
          <span className="font-display font-extrabold tracking-tight">$10.33</span>
        </button>
      </Bar>
      <Bar label="B · Wallet chip — green dot means signed in, address as the identity">
        <button className="flex h-9 items-center gap-2 rounded-full bg-surface px-3 font-mono text-xs hover:bg-surface-raised">
          <span className="h-2 w-2 rounded-full bg-accent" />
          0x3f59…819C
        </button>
      </Bar>
      <Bar label="C · Brand coin — the logo mark as the account button, nothing else">
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-surface hover:bg-surface-raised">
          <LogoMark size={26} />
        </button>
      </Bar>
      <Bar label="D · Cash pill + wallet, one control (what fomo.family does)">
        <button className="flex h-9 items-center gap-3 rounded-full bg-surface pl-3 pr-1 text-sm hover:bg-surface-raised">
          <span className="text-left leading-tight">
            <span className="block font-display font-extrabold tracking-tight">$10.33</span>
            <span className="block font-mono text-[10px] text-muted">0x3f59…819C</span>
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised">
            <LogoMark size={20} />
          </span>
        </button>
      </Bar>
    </div>
  );
}
