"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "./AuthProvider";
import { useActiveAddress, useCashBalances } from "@/hooks/useChainData";
import { fmtUsd } from "@/lib/format";
import { LogoutConfirm } from "./LogoutConfirm";
import { LogoMark } from "./Logo";

/**
 * The account sticker in the header: who you are, your cash, and the two
 * things every app puts one tap away — Account and Log out. Opens a small
 * menu; the logout still goes through the confirm sheet.
 */
export function HeaderMenu() {
  const { logout } = useAuth();
  const { user } = usePrivy();
  const address = useActiveAddress();
  const { data: cash } = useCashBalances();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const loginId = user?.email?.address ?? user?.phone?.number ?? user?.google?.email ?? "";
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // hover opens (desktop), tap toggles (touch); a short grace period keeps
  // the menu open while the pointer travels from the button into it
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };
  return (
    <div ref={root} className="relative" onMouseEnter={hoverOpen} onMouseLeave={hoverClose}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 items-center gap-3 rounded-full bg-surface pl-3 pr-1 text-sm transition-colors hover:bg-surface-raised"
      >
        <span className="text-left leading-tight">
          <span className="block font-display font-extrabold tracking-tight">{cash ? fmtUsd(cash.totalUsd) : "—"}</span>
          <span className="block font-mono text-[10px] text-muted">{short || loginId}</span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised">
          <LogoMark size={22} />
        </span>
      </button>
      {open && (
        <div role="menu" className="animate-pop absolute right-0 z-40 mt-2 w-64 origin-top-right rounded-2xl bg-surface p-2 shadow-elevated">
          <div className="px-3 pt-2 pb-3">
            {loginId && <p className="truncate text-sm font-semibold">{loginId}</p>}
            {cash && <p className="pt-0.5 font-display text-2xl font-extrabold tracking-tight">{fmtUsd(cash.totalUsd)}</p>}
            {address && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="pt-0.5 font-mono text-xs text-muted hover:text-foreground"
              >
                {copied ? "Copied" : short}
              </button>
            )}
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-raised"
          >
            Account
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirming(true);
            }}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-negative transition-colors hover:bg-surface-raised"
          >
            Log out
          </button>
        </div>
      )}
      {confirming && (
        <LogoutConfirm
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            logout();
          }}
        />
      )}
    </div>
  );
}
