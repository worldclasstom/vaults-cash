"use client";

import { fmtPrice, fmtUsd } from "@/lib/format";
import type { LadderView, RungView } from "@/lib/ladders";
import { Chip } from "./TokenIcon";

/** The status sticker a ladder wears. */
export function ladderSticker(v: LadderView): { label: string; tone: "accent" | "muted" | "negative" | "outline" } {
  if (v.status === "closed") return { label: "Closed", tone: "muted" };
  if (v.status === "cancelled") return { label: "Cancelled", tone: "muted" };
  if (v.status === "expired") return { label: "Expired", tone: "outline" };
  if (v.status === "hit" || (v.total > 0 && v.done === v.total)) return { label: "Target hit", tone: "accent" };
  const live = v.rungs.some((r) => r.state === "live");
  if (v.direction === "up") return live || v.done > 0 ? { label: "Climbing", tone: "accent" } : { label: "Waiting", tone: "outline" };
  return live || v.done > 0 ? { label: "Filling", tone: "accent" } : { label: "Waiting", tone: "outline" };
}

export function ladderTitle(v: LadderView) {
  return `${v.base} ${v.direction === "up" ? "→" : "↓"} $${fmtPrice(v.targetPrice)}`;
}

function rungLine(v: LadderView, r: RungView): string {
  if (!r.live) return "closed";
  if (v.direction === "up") {
    if (r.state === "done") return `sold → ${fmtUsd(r.usd)} ${v.quote}`;
    if (r.state === "live") return `selling now · ${r.baseUnits.toFixed(4)} ${v.base}`;
    return `${r.baseUnits.toFixed(4)} ${v.base} waiting`;
  }
  if (r.state === "done") return `bought → ${r.baseUnits.toFixed(4)} ${v.base}`;
  if (r.state === "live") return `buying now · ${fmtUsd(r.usd)}`;
  return `${fmtUsd(r.usd)} ${v.quote} waiting`;
}

/**
 * The ladder, drawn vertically with the highest price at the top and a
 * white "now" line where price sits. Sold/bought rungs are solid green,
 * the live rung glows, waiting rungs stay dark.
 */
export function Ladder({ v, compact = false }: { v: LadderView; compact?: boolean }) {
  const rows = [...v.rungs].sort((a, b) => b.priceHigh - a.priceHigh);
  const nowAbove = (r: RungView) => v.priceNow >= r.priceHigh;
  let nowPlaced = false;
  const items: React.ReactNode[] = [];
  const nowRow = (
    <li key="now" className="flex items-center gap-3 py-1">
      <span className="h-0.5 grow bg-foreground" />
      <span className="font-mono text-xs text-foreground">now ${fmtPrice(v.priceNow)}</span>
      <span className="h-0.5 grow bg-foreground" />
    </li>
  );
  const targetAtTop = v.direction === "up";
  if (targetAtTop) {
    items.push(
      <li key="target" className="pb-1 text-right font-mono text-xs text-muted">
        target ${fmtPrice(v.targetPrice)}
      </li>,
    );
  }
  for (const r of rows) {
    if (!nowPlaced && nowAbove(r)) {
      items.push(nowRow);
      nowPlaced = true;
    }
    const tone = !r.live ? "bg-surface text-muted/60" : r.state === "done" ? "bg-accent text-black" : r.state === "live" ? "bg-surface-raised ring-2 ring-accent" : "bg-surface";
    items.push(
      <li key={r.tokenId} className={`flex items-center justify-between gap-3 rounded-xl px-3 ${compact ? "py-1.5 text-xs" : "py-2.5 text-sm"} ${tone}`}>
        <span className="font-mono">
          ${fmtPrice(r.priceLow)} – ${fmtPrice(r.priceHigh)}
        </span>
        <span className="truncate">{rungLine(v, r)}</span>
        {!compact && r.live && r.feesUsd > 0 && <span className="shrink-0 font-semibold">{r.state === "done" ? "" : "+"}{fmtUsd(r.feesUsd)}</span>}
      </li>,
    );
  }
  if (!nowPlaced) items.push(nowRow);
  if (!targetAtTop) {
    items.push(
      <li key="target" className="pt-1 text-right font-mono text-xs text-muted">
        target ${fmtPrice(v.targetPrice)}
      </li>,
    );
  }
  return <ul className={compact ? "space-y-1" : "space-y-1.5"}>{items}</ul>;
}

export function LadderStickers({ v }: { v: LadderView }) {
  const s = ladderSticker(v);
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Chip tone={v.chainId === 8453 ? "base" : "robinhood"}>{v.chain}</Chip>
      <Chip tone={s.tone}>{s.label}</Chip>
    </span>
  );
}
