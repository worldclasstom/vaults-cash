/**
 * Dependency-free market-style charts: smooth Catmull-Rom→bezier curves,
 * gradient area fills, grid lines, "+$" fee badges. Data is constant
 * (hydration-safe). Fixed viewBox aspect — no preserveAspectRatio
 * stretching, so text and badges never distort.
 */
"use client";

import { useId } from "react";

type Series = {
  ys: number[];
  color: string;
  width?: number;
  fill?: boolean;
  dashed?: boolean;
  /** indices that get a "+$" fee badge above the line */
  ticks?: number[];
};

const W = 320;
const H = 132;
const PAD = 12;

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
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
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
  className = "w-full h-auto",
  domain,
}: {
  series: Series[];
  className?: string;
  /** fixed y-range — stops near-flat data being auto-stretched into noise */
  domain?: [number, number];
}) {
  const all = series.flatMap((s) => s.ys);
  const min = domain?.[0] ?? Math.min(...all);
  const max = domain?.[1] ?? Math.max(...all);
  const uid = useId();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      <defs>
        {series.map(
          (s, i) =>
            s.fill && (
              <linearGradient key={i} id={`${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.25" />
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
          strokeWidth="0.75"
        />
      ))}
      {series.map((s, i) => {
        const pts = toPoints(s.ys, min, max);
        const d = smoothPath(pts);
        const last = pts[pts.length - 1];
        return (
          <g key={i}>
            {s.fill && (
              <path d={`${d} L ${W},${H} L 0,${H} Z`} fill={`url(#${uid}-${i})`} stroke="none" />
            )}
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width ?? 2.25}
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "3 4" : undefined}
            />
            {/* live endpoint */}
            {!s.dashed && (
              <>
                <circle cx={last[0]} cy={last[1]} r="5" fill="var(--foreground)" />
                <circle cx={last[0]} cy={last[1]} r="3" fill={s.color} />
              </>
            )}
            {/* "+$" fee badges */}
            {s.ticks?.map((idx, j) => {
              const [x, y] = pts[idx];
              return (
                <g
                  key={idx}
                  className="tick-pop"
                  style={{ animationDelay: `${0.6 + j * 0.3}s` }}
                >
                  {/* a sticker: filled pill, white edge, a little crooked */}
                  <g transform={`rotate(${j % 2 ? 6 : -6} ${x} ${y - 14})`}>
                    <rect x={x - 12} y={y - 22} width="24" height="16" rx="8" fill={s.color} stroke="var(--foreground)" strokeWidth="1.75" />
                    <text
                      x={x}
                      y={y - 10.5}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="800"
                      fontFamily="var(--font-bricolage), var(--font-geist-sans), sans-serif"
                      fill="#000"
                    >
                      +$
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- data
   Constant seeded-random-walk series (no Math.random → SSR-safe). */

export const TRADER_YS = [
  100, 100.4, 101.4, 101.1, 100.7, 99.8, 101.7, 100.3, 98.2, 96.6, 95.0, 93.8,
  92.3, 90.0, 88.7, 87.4, 87.3, 85.4, 83.0, 81.1, 80.9, 79.9, 80.6, 81.7, 80.8,
  78.5, 79.2, 80.0, 79.1, 79.4, 78.0, 79.6, 80.8, 81.8, 83.5, 81.8, 81.6, 82.3,
  83.3, 82.4, 80.2, 80.4, 78.1, 78.7, 75.9, 75.2, 74.7, 72.5, 72.0, 71.5, 70.5,
  72.0, 73.3, 74.8, 73.1, 70.4,
];

export const HOLDER_YS = [
  100, 99.6, 99.7, 99.5, 99.7, 99.9, 99.3, 98.6, 99.1, 98.8, 98.4, 99.2, 99.1,
  99.7, 99.6, 99.9, 99.4, 99.6, 100.2, 100.2, 100.6, 100.9, 100.2, 100.6,
  100.8, 100.5, 99.8, 100.4, 100.4, 100.7, 101.3, 101.7, 102.3, 102.2, 102.6,
  102.6, 103.3, 103.8, 103.3, 102.7, 102.3, 103.0, 103.0, 103.2, 102.9, 102.9,
  102.8, 102.6, 102.7, 102.9, 103.5, 103.8, 104.5, 105.0, 105.8, 106.0,
];

/** same market as HOLDER, plus steadily-compounding collected fees */
export const EARNER_YS = HOLDER_YS.map((v, i) => +(v + i * 0.34).toFixed(1));

/** hero: longer, gently-up market with fee compounding on top */
export const HERO_HOLD_YS = [
  100, 100.1, 100.6, 102.5, 102.6, 103.0, 103.6, 102.7, 103.0, 103.8, 105.1,
  103.9, 103.4, 102.1, 103.6, 104.6, 103.1, 105.3, 107.3, 108.2, 108.9, 107.9,
  106.3, 106.7, 105.3, 104.4, 103.7, 102.2, 102.3, 102.4, 104.0, 104.3, 105.1,
  105.4, 106.3, 106.4, 105.9, 108.0, 110.2, 111.8, 112.9, 112.4, 111.7, 111.2,
  109.8, 111.1, 111.0, 112.6, 112.4, 114.5, 116.1, 114.4, 113.6, 115.5, 115.6,
  117.7, 117.6, 116.3, 117.1, 118.4, 117.8, 116.5, 116.2, 118.2,
];

export const HERO_EARN_YS = HERO_HOLD_YS.map((v, i) => +(v + i * 0.3).toFixed(1));

export const HERO_TICKS = [10, 21, 32, 43, 54, 62];
