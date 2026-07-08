/**
 * Dependency-free market-style charts: smooth Catmull-Rom→bezier curves,
 * gradient area fills, grid lines. Data is constant (hydration-safe).
 */
"use client";

import { useId } from "react";

type Series = {
  ys: number[];
  color: string;
  width?: number;
  fill?: boolean;
  dashed?: boolean;
  /** indices that get a small "fee tick" dot */
  ticks?: number[];
};

const W = 320;
const H = 132;
const PAD = 10;

function toPoints(ys: number[], min: number, max: number): [number, number][] {
  const span = max - min || 1;
  return ys.map((v, i) => [
    (i / (ys.length - 1)) * W,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ]);
}

/** Catmull-Rom spline → cubic bezier path (the standard smoothing trick). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function MarketChart({
  series,
  className,
  height = H,
  domain,
}: {
  series: Series[];
  className?: string;
  height?: number;
  /** fixed y-range — stops near-flat data being auto-stretched into noise */
  domain?: [number, number];
}) {
  const all = series.flatMap((s) => s.ys);
  const min = domain?.[0] ?? Math.min(...all);
  const max = domain?.[1] ?? Math.max(...all);
  const uid = useId();

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ height, width: "100%" }}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {series.map(
          (s, i) =>
            s.fill && (
              <linearGradient key={i} id={`${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ),
        )}
      </defs>
      {/* grid */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1="0"
          x2={W}
          y1={PAD + f * (H - PAD * 2)}
          y2={PAD + f * (H - PAD * 2)}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="2 6"
        />
      ))}
      {series.map((s, i) => {
        const pts = toPoints(s.ys, min, max);
        const d = smoothPath(pts);
        return (
          <g key={i}>
            {s.fill && (
              <path
                d={`${d} L ${W},${H} L 0,${H} Z`}
                fill={`url(#${uid}-${i})`}
                stroke="none"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2.25}
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "1 7" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {s.ticks?.map((idx, j) => (
              <g
                key={idx}
                className="tick-pop"
                style={{ animationDelay: `${0.7 + j * 0.3}s` }}
              >
                <circle cx={pts[idx][0]} cy={pts[idx][1]} r="4.5" fill="var(--background)" stroke={s.color} strokeWidth="2" />
                <circle cx={pts[idx][0]} cy={pts[idx][1]} r="1.8" fill={s.color} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- data
   Constant, realistic-feeling series (no Math.random → SSR-safe). */

export const TRADER_YS = [
  100, 103, 98, 104, 109, 102, 95, 99, 91, 96, 88, 92, 83, 87, 90, 81, 76, 82,
  77, 71, 75, 68, 73, 65, 69, 62, 66, 59, 63, 57, 60, 55,
];

export const HOLDER_YS = [
  100, 100.8, 99.6, 100.4, 101.2, 100.2, 99.2, 100, 100.9, 99.8, 99, 99.9,
  100.7, 99.7, 98.9, 99.8, 100.6, 101.3, 100.3, 99.4, 100.1, 101, 100, 99.1,
  99.9, 100.8, 100, 99.2, 100, 100.9, 100.1, 100.5,
];

/** same market as HOLDER, plus steadily-compounding collected fees */
export const EARNER_YS = HOLDER_YS.map((v, i) => v + i * 0.62);

/** hero: longer, gently-up market with visible fee compounding on top */
export const HERO_HOLD_YS = [
  100, 101.5, 99.8, 102.2, 104, 102.5, 100.9, 103.1, 105.4, 103.8, 102.4, 104.6,
  106.8, 105.1, 103.6, 105.7, 107.9, 109.6, 107.8, 106.1, 107.9, 110.2, 108.4,
  106.7, 108.3, 110.6, 109, 107.4, 109.1, 111.4, 110, 111.8, 113.5, 111.9,
  110.4, 112.3, 114.5, 112.9, 111.5, 113.4,
];

export const HERO_EARN_YS = HERO_HOLD_YS.map((v, i) => v + i * 0.42);

export const HERO_TICKS = [6, 13, 20, 27, 34, 39];
