"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAddFunds } from "@privy-io/react-auth";
import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { InviteCard } from "@/components/InviteCard";
import { Landing } from "@/components/Landing";
import { PoolList } from "@/components/PoolList";
import { SendPanel } from "@/components/SendPanel";
import {
  useActiveAddress,
  useAssetBalances,
  useCashBalances,
  useTokenBalance,
  useUsdcBalance,
} from "@/hooks/useChainData";
import { CHAINS, CHAIN_IDS, type ChainId } from "@/lib/chain";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { NATIVE_ETH } from "@/lib/markets";

function AddFundsPanel({
  address,
  copied,
  onCopy,
}: {
  address: `0x${string}`;
  copied: boolean;
  onCopy: () => void;
}) {
  const [chainId, setChainId] = useState<ChainId>(8453);
  const chain = CHAINS[chainId];
  const { addFunds } = useAddFunds();
  const [cardError, setCardError] = useState<string | null>(null);

  const steps = [
    <>
      Buy <span className="text-foreground">{chain.quote.symbol}</span> in the Robinhood app (or on any exchange that
      supports it).
    </>,
    <>
      Send it on <span className="text-foreground">{chain.chain.name}</span> to the address below — scan the code or
      paste it.
    </>,
    <>
      It lands in your account here within seconds
      {chain.gasSponsored ? "" : " — plus a little ETH on the same network for fees (about $1 covers many transactions)"}.
    </>,
  ];

  const buyWithCard = async () => {
    setCardError(null);
    try {
      // Privy's unified funding flow: card (MoonPay / Coinbase Onramp, as
      // enabled in the dashboard), exchange transfer, or crypto from any
      // chain bridged in — delivering this chain's stablecoin to this wallet
      await addFunds({
        destination: { address, chain: `eip155:${chainId}`, asset: chain.quote.address },
        fiat: { defaultAmount: "20" },
        crypto: {},
      });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/exit|closed|cancel/i.test(msg)) setCardError(msg || "Funding didn't complete.");
    }
  };

  return (
    <div className="mt-3 rounded-2xl bg-surface p-5 text-sm">
      <div className="flex gap-2 pb-4">
        {CHAIN_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setChainId(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              chainId === id ? "bg-accent text-black" : "bg-surface-raised text-muted hover:bg-borderline"
            }`}
          >
            {CHAINS[id].chain.name}
          </button>
        ))}
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-black">
              {i + 1}
            </span>
            <span className="text-muted">{s}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl bg-surface-raised p-4">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={address} size={148} bgColor="#ffffff" fgColor="#0d0f0d" level="M" />
        </div>
        <button
          onClick={onCopy}
          className="w-full break-all rounded-xl bg-surface p-3 text-center font-mono text-xs transition-colors hover:bg-borderline"
        >
          {address}
          <span className="mt-1 block font-sans text-accent">{copied ? "Copied ✓" : "Tap to copy address"}</span>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={buyWithCard}
          className="rounded-full bg-surface-raised px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
        >
          Fund {chain.chain.name} with card or crypto
        </button>
        <span className="text-xs text-muted">Card, Apple Pay, bank, exchange, or crypto from another chain.</span>
      </div>
      {cardError && <p className="pt-2 text-xs text-negative">{cardError}</p>}

      <p className="pt-3 text-xs text-muted">
        <span className="text-foreground">Direct and free of middlemen:</span> {chain.quote.symbol} sent on{" "}
        {chain.chain.name} to this address lands in your wallet as-is — no conversion, no routing fee. Same address on
        both networks, but funds sent on any other network won&apos;t arrive here; for those, use Add funds above and let
        Relay route them.
      </p>
    </div>
  );
}

function Dashboard() {
  const address = useActiveAddress();
  const { data: balance, isLoading } = useUsdcBalance();
  const { data: cash } = useCashBalances();
  const { data: ethBalance } = useTokenBalance(NATIVE_ETH, 18);
  const { data: assetBalances } = useAssetBalances();
  const otherCash = (cash?.perChain ?? []).filter((c) => c.chainId !== 8453 && c.formatted > 0);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [copied, setCopied] = useState(false);
  const { addFunds } = useAddFunds();
  const [fundError, setFundError] = useState<string | null>(null);

  // Privy's unified funding flow (card / Apple Pay / bank / crypto from any
  // chain bridged by Relay), delivering USDC on Base to this wallet — the
  // primary path; the raw address is the fallback for manual sends
  const openFunding = async () => {
    if (!address) return;
    setFundError(null);
    setShowSend(false);
    try {
      await addFunds({
        destination: { address, chain: "eip155:8453", asset: CHAINS[8453].quote.address },
        fiat: { defaultAmount: "20" },
        crypto: {},
      });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/exit|closed|cancel/i.test(msg)) setFundError(msg || "Funding didn't complete.");
    }
  };

  return (
    <div className="animate-rise">
      <section className="py-8">
        <p className="text-sm text-muted">Cash available (USDC on Base)</p>
        <p className="py-1 text-5xl font-bold tracking-tight">
          {isLoading || !balance ? "—" : fmtUsd(balance.formatted)}
        </p>
        {otherCash.length > 0 && (
          <p className="text-sm text-muted">
            + {otherCash.map((c) => `${fmtUsd(c.formatted)} ${c.symbol} on Robinhood Chain`).join(" · ")}
          </p>
        )}
        {ethBalance && ethBalance.raw > 0n && (
          <p className="text-sm text-muted">
            + {fmtAmount(ethBalance.formatted, 5)} ETH on Base for network fees
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
        {/* Card onramp removed until providers can deliver to Base
            (tested 2026-07-03: Privy funding modal has no route to 8453). */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={openFunding}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-strong"
          >
            Add funds
          </button>
          <button
            onClick={() => {
              setShowSend(!showSend);
              setShowReceive(false);
            }}
            className="rounded-full bg-surface-raised px-5 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
          >
            Send
          </button>
        </div>
        {fundError && <p className="pt-2 text-xs text-negative">{fundError}</p>}
        <button
          onClick={() => {
            setShowReceive(!showReceive);
            setShowSend(false);
          }}
          className="mt-3 block text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          {showReceive ? "Hide my wallet address" : "Already have USDC on Base? Send it straight to your address →"}
        </button>
        {showSend && <SendPanel onClose={() => setShowSend(false)} />}
        {showReceive && address && (
          <AddFundsPanel
            address={address}
            copied={copied}
            onCopy={() => {
              navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        )}
      </section>
      <section>
        <h2 className="pb-1 text-lg font-semibold">Pools</h2>
        <p className="pb-3 text-sm text-muted">
          Pick a pair, choose a price range, and earn a share of every trade. Deposits are in dollars; we handle the rest.
        </p>
        <PoolList />
      </section>
      <InviteCard />
    </div>
  );
}

export default function Home() {
  const { ready, authenticated } = useAuth();
  if (!ready) return null;
  if (!authenticated) return <Landing />;
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
