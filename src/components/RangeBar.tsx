"use client";

import { fmtPrice } from "@/lib/format";

/** Full-range positions have ticks at the curve's ends; anything this far
 *  from the current price is "any price" for display purposes. */
const FULL_RANGE_RATIO = 1e6;

/**
 * The one picture every LP app has: where the price is, and the band you
 * earn in. Log scale, current price marked, band highlighted; out of range
 * turns the band red. Prices are in whatever unit the caller passes (USD in
 * the app).
 */
export function RangeBar({
  price,
  lower,
  upper,
  inRange = price >= lower && price < upper,
  compact = false,
  unit = "$",
}: {
  price: number;
  lower: number;
  upper: number;
  inRange?: boolean;
  compact?: boolean;
  /** prefix for labels */
  unit?: string;
}) {
  const full = lower <= price / FULL_RANGE_RATIO && upper >= price * FULL_RANGE_RATIO;
  // domain: a bit wider than the band, always including the current price
  const lo = full ? price / 3 : Math.min(lower, price) / 1.35;
  const hi = full ? price * 3 : Math.max(upper, price) * 1.35;
  const x = (v: number) => ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100;
  const bandL = full ? 0 : Math.max(0, x(lower));
  const bandR = full ? 100 : Math.min(100, x(upper));
  const cur = Math.min(99, Math.max(1, x(price)));
  const h = compact ? 6 : 10;
  const tone = inRange ? "bg-accent" : "bg-negative";

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="relative w-full rounded-full bg-surface-raised" style={{ height: h }}>
        <div className={`absolute top-0 h-full rounded-full ${tone}/35`} style={{ left: `${bandL}%`, width: `${bandR - bandL}%` }} />
        {!full && (
          <>
            <div className={`absolute top-0 h-full w-0.5 ${tone}`} style={{ left: `${bandL}%` }} />
            <div className={`absolute top-0 h-full w-0.5 ${tone}`} style={{ left: `${bandR}%` }} />
          </>
        )}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
          style={{ left: `${cur}%`, height: compact ? 12 : 16, width: compact ? 12 : 16 }}
          title={`Now ${unit}${fmtPrice(price)}`}
        />
      </div>
      <div className={`flex justify-between font-mono text-muted ${compact ? "text-[10px]" : "text-xs"}`}>
        <span>{full ? "Any price" : `${unit}${fmtPrice(lower)}`}</span>
        <span className="text-foreground">
          now {unit}
          {fmtPrice(price)}
        </span>
        <span>{full ? "" : `${unit}${fmtPrice(upper)}`}</span>
      </div>
    </div>
  );
}
