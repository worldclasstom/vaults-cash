"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AppShell } from "@/components/AppShell";
import { InviteCard } from "@/components/InviteCard";
import { LogoMark } from "@/components/Logo";
import { MarketList } from "@/components/MarketList";
import {
  useActiveAddress,
  useAssetBalances,
  useTokenBalance,
  useUsdgBalance,
} from "@/hooks/useChainData";
import { GAS_SPONSORED } from "@/lib/config";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { NATIVE_ETH } from "@/lib/markets";

function Landing() {
  const { login } = usePrivy();
  return (
    <div className="flex grow flex-col items-center justify-center gap-6 py-24 text-center animate-rise">
      <LogoMark size={72} />
      <h1 className="text-4xl font-bold tracking-tight">
        Put your cash
        <br />
        to work<span className="text-accent">.</span>
      </h1>
      <p className="max-w-sm text-balance text-muted">
        Provide liquidity to tokenized stocks and blue-chip crypto on Robinhood
        Chain, and earn a share of every trade. No seed phrases. No gas.
      </p>
      <button
        onClick={login}
        className="rounded-full bg-accent px-8 py-3 font-semibold text-black transition-colors hover:bg-accent-strong"
      >
        Get started
      </button>
      <p className="text-xs text-muted">
        Liquidity positions carry market &amp; impermanent-loss risk. Not
        available in all regions.
      </p>
    </div>
  );
}

function Dashboard() {
  const address = useActiveAddress();
  const { data: balance, isLoading } = useUsdgBalance();
  const { data: ethBalance } = useTokenBalance(NATIVE_ETH, 18);
  const { data: assetBalances } = useAssetBalances();
  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="animate-rise">
      <section className="py-8">
        <p className="text-sm text-muted">Cash available (USDG)</p>
        <p className="py-1 text-5xl font-bold tracking-tight">
          {isLoading || !balance ? "—" : fmtUsd(balance.formatted)}
        </p>
        {ethBalance && ethBalance.raw > 0n && (
          <p className="text-sm text-muted">
            + {fmtAmount(ethBalance.formatted, 5)} ETH for network fees
          </p>
        )}
        {assetBalances && assetBalances.length > 0 && (
          <p className="text-sm text-muted">
            +{" "}
            {assetBalances
              .map((b) => `${fmtAmount(b.formatted, 5)} ${b.symbol}`)
              .join(" · ")}{" "}
            <span className="text-muted/60">(from withdrawals)</span>
          </p>
        )}
        {/* Card onramp removed until providers can deliver to Robinhood Chain
            (tested 2026-07-03: Privy funding modal has no route to 4663). */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setShowReceive(!showReceive)}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Add funds
          </button>
        </div>
        {showReceive && address && (
          <div className="mt-3 rounded-2xl bg-surface p-4 text-sm">
            <p className="pb-2 text-muted">
              Send <span className="text-foreground">USDG</span>
              {!GAS_SPONSORED && (
                <>
                  {" "}
                  (and a little <span className="text-foreground">ETH</span> for
                  network fees)
                </>
              )}{" "}
              on <span className="text-foreground">Robinhood Chain</span> to:
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="w-full break-all rounded-xl bg-surface-raised p-3 text-left font-mono text-xs transition-colors hover:bg-borderline"
            >
              {address}
              <span className="mt-1 block text-accent">
                {copied ? "Copied ✓" : "Tap to copy"}
              </span>
            </button>
            <p className="pt-2 text-xs text-muted">
              Easiest path: buy USDG in the Robinhood app and send it here.
              Only send assets on Robinhood Chain — other networks won&apos;t
              arrive. Card purchases can&apos;t deliver to Robinhood Chain yet.
            </p>
          </div>
        )}
      </section>
      <section>
        <h2 className="pb-3 text-lg font-semibold">Markets</h2>
        <MarketList />
      </section>
      <InviteCard />
    </div>
  );
}

export default function Home() {
  const { ready, authenticated } = usePrivy();
  return (
    <AppShell>
      {!ready ? null : authenticated ? <Dashboard /> : <Landing />}
    </AppShell>
  );
}
