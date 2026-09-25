"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const RM = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReducedMotion = () => window.matchMedia(RM).matches;
import { Chip } from "./TokenIcon";

const FEE_PCT = Number(process.env.NEXT_PUBLIC_FEE_BPS ?? 60) / 100;

/** A crooked little label in the Sticker Ledger voice. */
function Tag({ children, tone = "muted", className = "" }: { children: React.ReactNode; tone?: "muted" | "accent" | "negative" | "outline"; className?: string }) {
  return (
    <span className={className}>
      <Chip tone={tone}>{children}</Chip>
    </span>
  );
}

function Bill({ label, amount, tone = "usdc", className = "" }: { label: string; amount: string; tone?: "usdc" | "eth" | "stable"; className?: string }) {
  const bg = tone === "eth" ? "bg-[#2b2f3a] text-[#cdd3ff]" : tone === "stable" ? "bg-[#2775ca] text-white" : "bg-accent text-black";
  return (
    <div className={`rise inline-flex min-w-[7.5rem] flex-col items-center rounded-2xl px-4 py-3 shadow-elevated ${bg} ${className}`}>
      <span className="font-display text-2xl font-extrabold tracking-tight">{amount}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</span>
    </div>
  );
}

function Arrow({ vertical = false }: { vertical?: boolean }) {
  return (
    <svg width={vertical ? 24 : 40} height={vertical ? 40 : 24} viewBox={vertical ? "0 0 24 40" : "0 0 40 24"} fill="none" aria-hidden className="shrink-0 text-muted">
      {vertical ? (
        <path d="M12 2v32m0 0l-7-7m7 7l7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M2 12h32m0 0l-7-7m7 7l-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** $100 in → two halves → a position ticket in your wallet, fee last, one bracket around it all. */
export function DepositFlow() {
  return (
    <div className="relative rounded-3xl bg-background p-5 sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <Bill label="USDC you deposit" amount="$100" />
        <span className="sm:hidden"><Arrow vertical /></span>
        <span className="hidden sm:block"><Arrow /></span>
        <div className="flex gap-2">
          <Bill label="ETH" amount="$49.70" tone="eth" className="[animation-delay:.15s]" />
          <Bill label="USDC" amount="$49.70" tone="stable" className="[animation-delay:.25s]" />
        </div>
        <span className="sm:hidden"><Arrow vertical /></span>
        <span className="hidden sm:block"><Arrow /></span>
        <div className="rise relative rounded-2xl border-2 border-dashed border-accent/60 bg-surface px-4 py-3 text-center [animation-delay:.4s]">
          <p className="font-display text-lg font-extrabold leading-tight">Position #3084756</p>
          <p className="text-xs text-muted">ETH / USDC · Uniswap v4</p>
          <Tag tone="accent" className="absolute -right-3 -top-3">In your wallet</Tag>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
        <Tag>{FEE_PCT}% fee, last call</Tag>
        <span>60¢ to vaults.cash, only if everything above succeeded</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="h-px grow bg-accent/40" />
        <Tag tone="accent">One transaction — all or nothing</Tag>
        <span className="h-px grow bg-accent/40" />
      </div>
    </div>
  );
}

/** A price that wanders. While it's inside your band, trades pay you; leave the band and it stops. */
export function RangeDemo() {
  const [t, setT] = useState(0);
  const [pops, setPops] = useState<Array<{ id: number; x: number }>>([]);
  const raf = useRef<number | null>(null);
  const lastPop = useRef(0);
  // read on the client only; the server snapshot (false) matches the first client render
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const loop = (now: number) => {
      const s = (now - start) / 1000;
      setT(s);
      const x = 50 + 38 * Math.sin(s * 0.55) + 8 * Math.sin(s * 1.9);
      const inRange = x >= 30 && x <= 70;
      if (inRange && now - lastPop.current > 650) {
        lastPop.current = now;
        setPops((p) => [...p.slice(-6), { id: now, x }]);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [reduced]);

  const x = reduced ? 52 : 50 + 38 * Math.sin(t * 0.55) + 8 * Math.sin(t * 1.9);
  const inRange = x >= 30 && x <= 70;
  const price = 2400 + (x - 50) * 12;

  return (
    <div className="rounded-3xl bg-background p-5 sm:p-6">
      <div className="flex items-center justify-between pb-6">
        <p className="font-display text-lg font-extrabold">ETH / USDC · your range $2,160 – $2,640</p>
        <Chip tone={inRange ? "accent" : "negative"}>{inRange ? "Earning" : "Paused"}</Chip>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-10 h-10" aria-hidden>
          {pops.map((p) => (
            <span key={p.id} className="animate-cash-up absolute font-display text-base font-extrabold text-accent" style={{ left: `${p.x}%`, transform: "translateX(-50%)" }}>
              +$
            </span>
          ))}
        </div>
        <div className="relative h-4 rounded-full bg-surface-raised">
          <div className={`absolute inset-y-0 rounded-full transition-colors ${inRange ? "bg-accent/40" : "bg-negative/30"}`} style={{ left: "30%", width: "40%" }} />
          <div className={`absolute inset-y-0 w-1 ${inRange ? "bg-accent" : "bg-negative"}`} style={{ left: "30%" }} />
          <div className={`absolute inset-y-0 w-1 ${inRange ? "bg-accent" : "bg-negative"}`} style={{ left: "70%" }} />
          <div className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background bg-foreground shadow-elevated" style={{ left: `${x}%` }} />
        </div>
        <div className="flex justify-between pt-2 font-mono text-xs text-muted">
          <span>$2,160</span>
          <span className="font-display text-sm font-bold text-foreground">now ${price.toFixed(0)}</span>
          <span>$2,640</span>
        </div>
      </div>
      <p className="pt-5 text-sm leading-relaxed text-muted">
        The white dot is the market price. Every trade that happens while it sits inside your band pays you a slice of the
        pool fee. When price wanders out, your position holds one asset and waits; it starts earning again the moment price
        comes back. &ldquo;Set &amp; forget&rdquo; is a band so wide it never pauses, at a lower rate.
      </p>
    </div>
  );
}

/** Ticket → two halves → stablecoin in your wallet, fee on the converted half only. */
export function WithdrawFlow() {
  return (
    <div className="rounded-3xl bg-background p-5 sm:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="rise relative rounded-2xl border-2 border-dashed border-muted/60 bg-surface px-4 py-3 text-center">
          <p className="font-display text-lg font-extrabold leading-tight line-through decoration-negative/70">Position #3084756</p>
          <p className="text-xs text-muted">closed, fees collected</p>
        </div>
        <span className="sm:hidden"><Arrow vertical /></span>
        <span className="hidden sm:block"><Arrow /></span>
        <div className="flex gap-2">
          <Bill label="ETH → USDC" amount="$51.20" tone="eth" className="[animation-delay:.15s]" />
          <Bill label="USDC" amount="$51.20" tone="stable" className="[animation-delay:.25s]" />
        </div>
        <span className="sm:hidden"><Arrow vertical /></span>
        <span className="hidden sm:block"><Arrow /></span>
        <Bill label="back in your wallet" amount="$102.09" className="[animation-delay:.4s]" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-muted">
        <Tag>{FEE_PCT}% on the converted half</Tag>
        <span>31¢ here, not on the USDC that was already USDC</span>
      </div>
    </div>
  );
}
