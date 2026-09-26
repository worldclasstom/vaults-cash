"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Chip } from "./TokenIcon";

const RM = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReducedMotion = () => window.matchMedia(RM).matches;

const START = 372;
const TARGET = 420;
const RUNGS = [
  [372, 384],
  [384, 396],
  [396, 408],
  [408, 420],
] as const;

/**
 * The ladder, animated: price climbs from today's number to the target,
 * lighting each rung as it sells through it and popping a "+$" on every
 * step; at the top the whole thing turns to dollars and a Target hit
 * sticker lands. Then it resets and climbs again. Reduced motion shows a
 * frozen frame two rungs in.
 */
export function LadderDemo() {
  const [t, setT] = useState(0);
  const [pops, setPops] = useState<Array<{ id: number; y: number }>>([]);
  const raf = useRef<number | null>(null);
  const lastPop = useRef(0);
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const loop = (now: number) => {
      const s = ((now - start) / 1000) % 11; // 11s loop: 7s climb, 3s hit, 1s reset
      setT(s);
      const p = priceAt(s);
      const inBand = p > START && p < TARGET;
      if (inBand && now - lastPop.current > 700) {
        lastPop.current = now;
        setPops((q) => [...q.slice(-5), { id: now, y: yOf(p) }]);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [reduced]);

  const price = reduced ? 397 : priceAt(t);
  const hit = price >= TARGET;
  const sold = RUNGS.filter(([, hi]) => price >= hi).length;
  const soldUsd = 50 * sold + 0.9 * sold; // $50 per rung, plus a little from rung-to-rung drift
  const paid = sold * 0.62 + (hit ? 0.62 : 0);

  return (
    <div className="rounded-3xl bg-background p-5 sm:p-6">
      <div className="flex items-center justify-between pb-4">
        <p className="font-display text-lg font-extrabold">TSLA → $420 · 4 rungs · $200</p>
        <Chip tone={hit ? "accent" : "outline"}>{hit ? "Target hit" : sold > 0 ? "Climbing" : "Waiting"}</Chip>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <div className="relative h-56">
          {/* rungs, highest at the top */}
          {[...RUNGS].reverse().map(([lo, hi]) => {
            const state = price >= hi ? "sold" : price >= lo ? "live" : "wait";
            const top = 100 - yOf(hi);
            const height = yOf(hi) - yOf(lo);
            return (
              <div
                key={lo}
                className={`absolute inset-x-0 flex items-center justify-between rounded-xl px-3 font-mono text-xs transition-colors ${
                  state === "sold" ? "bg-accent text-black" : state === "live" ? "bg-surface-raised ring-2 ring-accent" : "bg-surface"
                }`}
                style={{ top: `${top}%`, height: `calc(${height}% - 4px)` }}
              >
                <span>
                  ${lo}–${hi}
                </span>
                <span className="truncate">{state === "sold" ? "sold → $50.9" : state === "live" ? "selling now" : "0.13 TSLA waiting"}</span>
              </div>
            );
          })}
          {/* price line */}
          <div className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${100 - yOf(price)}%` }}>
            <span className="h-0.5 grow bg-foreground" />
            <span className="rounded-full bg-foreground px-2 py-0.5 font-mono text-[11px] font-bold text-background">now ${price.toFixed(0)}</span>
          </div>
          {/* pops */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {pops.map((p) => (
              <span key={p.id} className="animate-cash-up absolute right-2 font-display text-base font-extrabold text-accent" style={{ top: `${100 - p.y}%` }}>
                +$
              </span>
            ))}
          </div>
        </div>
        <div className="flex w-32 flex-col justify-between">
          <div>
            <p className="text-xs text-muted">Paid so far</p>
            <p className="font-display text-2xl font-extrabold text-accent">+${paid.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Locked in</p>
            <p className="font-display text-xl font-extrabold">${soldUsd.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">{hit ? "Done" : "Rungs sold"}</p>
            <p className="font-display text-xl font-extrabold">
              {sold}/{RUNGS.length}
            </p>
          </div>
        </div>
      </div>
      <p className="pt-4 text-sm leading-relaxed text-muted">
        Each rung is a narrow Uniswap position holding a slice of TSLA. As price climbs through a rung it sells that slice
        into dollars and pays you the pool fee on every trade that crosses it. When the top rung sells, the target has hit
        and vaults.cash closes the ladder for you.
      </p>
    </div>
  );
}

function priceAt(s: number) {
  if (s < 7) return START + (TARGET - START) * easeInOut(s / 7);
  if (s < 10) return TARGET;
  return START;
}
function easeInOut(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
/** 0..100, bottom to top, for a price between START and TARGET (with a little headroom). */
function yOf(price: number) {
  const lo = START - 6;
  const hi = TARGET + 6;
  return Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100));
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-extrabold text-black">{n}</span>
      <span>
        <span className="block font-display text-base font-extrabold">{title}</span>
        <span className="block pt-1 text-sm text-muted">{children}</span>
      </span>
    </li>
  );
}

/** The Targets explainer shown before someone has a ladder. */
export function TargetsHowItWorks({ cta = true, example }: { cta?: boolean; example?: { symbol: string; target: number } }) {
  const ex = example ?? { symbol: "TSLA", target: 420 };
  return (
    <section className="rounded-3xl bg-surface p-5 shadow-card sm:p-6">
      <p className="font-display text-2xl font-extrabold tracking-tight">Pick a price you believe in.</p>
      <p className="pt-1 text-sm text-muted">Targets turn a price opinion into a ladder that pays you on every step. No leverage, no liquidation.</p>
      <div className="mt-4">
        <LadderDemo />
      </div>
      <ol className="mt-5 space-y-4">
        <Step n={1} title="Say where you think it goes">
          &ldquo;{ex.symbol} to ${ex.target.toLocaleString("en-US")}&rdquo; or &ldquo;ETH dips 10%&rdquo;. Pick the asset, the direction, and how much. We build the rungs between here and there.
        </Step>
        <Step n={2} title="Every rung earns">
          A sell ladder holds the asset and sells a slice as price climbs through each rung. A buy ladder holds dollars and buys a slice as it falls. Either way, every trade that crosses a rung pays you the pool fee.
        </Step>
        <Step n={3} title="Target hit, ladder closed">
          When price clears the last rung, vaults.cash closes the ladder from your own wallet so a retrace can&apos;t undo it. If it never gets there, you simply hold what you bought, like buying it outright.
        </Step>
      </ol>
      <p className="pt-4 text-xs text-muted">
        Fees: 0.6% in and out, like Pools, plus an 8% performance fee, our share of the trading fees the ladder earns for you, never of what you put in.
      </p>
      {cta && (
        <Link href="/targets/new" className="attract mt-5 inline-block rounded-full bg-accent px-7 py-3 font-display text-base font-extrabold text-black hover:bg-accent-strong">
          Set a target
        </Link>
      )}
    </section>
  );
}
