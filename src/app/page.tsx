"use client";

import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import { AppShell } from "@/components/AppShell";
import { LogoMark } from "@/components/Logo";
import { MarketList } from "@/components/MarketList";
import { useActiveAddress, useUsdgBalance } from "@/hooks/useChainData";
import { fmtUsd } from "@/lib/format";

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
  const { fundWallet } = useFundWallet();
  const { data: balance, isLoading } = useUsdgBalance();

  return (
    <div className="animate-rise">
      <section className="py-8">
        <p className="text-sm text-muted">Cash available (USDG)</p>
        <p className="py-1 text-5xl font-bold tracking-tight">
          {isLoading || !balance ? "—" : fmtUsd(balance.formatted)}
        </p>
        <button
          onClick={() => address && fundWallet({ address })}
          className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
        >
          Add funds
        </button>
      </section>
      <section>
        <h2 className="pb-3 text-lg font-semibold">Markets</h2>
        <MarketList />
      </section>
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
