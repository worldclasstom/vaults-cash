"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHAINS, type ChainId } from "@/lib/chain";
import type { Market } from "@/lib/markets";
import { ChainChip, PairIcons } from "./TokenIcon";

type Filter = "all" | "stock" | "crypto" | 8453 | 4663;

/**
 * Pick a market by typing or filtering, not by scrolling a 40-row menu.
 * A button shows the current pick; the panel has a search box that gets
 * focus, filter chips (Stocks, Crypto, per chain) and a short scrolling
 * list. Escape or a click outside closes it.
 */
export function AssetPicker({ markets, value, onChange }: { markets: Market[]; value: Market; onChange: (m: Market) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return markets.filter((m) => {
      if (filter === "stock" && m.kind !== "stock") return false;
      if (filter === "crypto" && m.kind === "stock") return false;
      if (typeof filter === "number" && m.chainId !== filter) return false;
      if (!needle) return true;
      return `${m.base.symbol} ${m.base.name} ${m.quote.symbol} ${CHAINS[m.chainId].label}`.toLowerCase().includes(needle);
    });
  }, [markets, q, filter]);

  const chip = (f: Filter, label: string) => (
    <button
      key={String(f)}
      onClick={() => setFilter(f)}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${filter === f ? "bg-accent text-black" : "bg-surface text-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-raised px-4 py-3 text-left transition-colors hover:bg-borderline"
      >
        <span className="flex items-center gap-3">
          <PairIcons market={value} size={28} />
          <span>
            <span className="block font-display text-lg font-extrabold leading-tight">
              {value.base.symbol} <span className="text-muted">/</span> {value.quote.symbol}
            </span>
            <span className="block text-xs text-muted">
              {value.base.name} · {CHAINS[value.chainId].label}
            </span>
          </span>
        </span>
        <span className="text-muted">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="animate-pop absolute left-0 right-0 z-40 mt-2 rounded-2xl bg-surface p-3 shadow-elevated">
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search TSLA, ETH, NVDA…"
            className="w-full rounded-xl bg-surface-raised px-3 py-2.5 text-sm outline-none placeholder:text-muted/50 focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-wrap gap-1.5 pt-2">
            {chip("all", "All")}
            {chip("stock", "Stocks")}
            {chip("crypto", "Crypto")}
            {chip(8453, "Base")}
            {chip(4663, "Robinhood")}
          </div>
          <ul role="listbox" className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
            {list.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">Nothing matches.</li>}
            {list.map((m) => (
              <li key={m.slug}>
                <button
                  role="option"
                  aria-selected={m.slug === value.slug}
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                    setQ("");
                  }}
                  className={`nudge flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${m.slug === value.slug ? "bg-surface-raised" : "hover:bg-surface-raised"}`}
                >
                  <span className="flex items-center gap-3">
                    <PairIcons market={m} size={24} />
                    <span>
                      <span className="block text-sm font-semibold">
                        {m.base.symbol} <span className="text-muted">/</span> {m.quote.symbol}
                      </span>
                      <span className="block text-xs text-muted">{m.base.name}</span>
                    </span>
                  </span>
                  <ChainChip chainId={m.chainId as ChainId} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
