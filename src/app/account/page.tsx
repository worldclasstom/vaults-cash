"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { usePrivy } from "@privy-io/react-auth";
import { Sheet } from "@/components/Sheet";
import { AgentAccess } from "@/components/AgentAccess";
import { AppShell } from "@/components/AppShell";
import { InviteCard } from "@/components/InviteCard";
import { ChainChip, Chip } from "@/components/TokenIcon";
import { useActiveAddress, useCashBalances, useTokenBalance } from "@/hooks/useChainData";
import { CHAINS, CHAIN_IDS, explorerUrl, type ChainId } from "@/lib/chain";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { NATIVE_ETH } from "@/lib/markets";

function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open onClose={onCancel} title="Log out?">
      <p className="pt-2 text-sm text-muted">
        Your funds stay safe in your wallet — nothing moves. Log back in the same way anytime to pick up where you left
        off.
      </p>
      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="grow rounded-full bg-surface py-3 font-semibold transition-colors hover:bg-borderline">
          Stay
        </button>
        <button onClick={onConfirm} className="grow rounded-full bg-negative/15 py-3 font-semibold text-negative transition-colors hover:bg-negative/25">
          Log out
        </button>
      </div>
    </Sheet>
  );
}

/** One chain's line in the wallet card: stablecoin big, ETH sliver small, explorer link. */
function ChainRow({ chainId, stable, address }: { chainId: ChainId; stable: number | undefined; address: string }) {
  const chain = CHAINS[chainId];
  const { data: eth } = useTokenBalance(NATIVE_ETH, 18, chainId);
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-surface-raised px-4 py-3">
      <span className="flex items-center gap-3">
        <ChainChip chainId={chainId} />
        <span className="text-xs text-muted">
          {eth && eth.raw > 0n
            ? `${fmtAmount(eth.formatted, 5)} ETH for gas`
            : chain.gasSponsored
              ? "gas (network fees) covered by vaults.cash"
              : "no ETH for gas yet"}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="font-display text-xl font-extrabold tracking-tight">
          {stable !== undefined ? fmtUsd(stable) : "—"} <span className="text-sm font-bold text-muted">{chain.quote.symbol}</span>
        </span>
        <a href={explorerUrl(chainId, "address", address)} target="_blank" rel="noreferrer" className="text-xs text-accent underline-offset-2 hover:underline">
          Explorer ↗
        </a>
      </span>
    </li>
  );
}

export default function AccountPage() {
  const { ready, authenticated, login, logout } = useAuth();
  const { user, exportWallet } = usePrivy();
  const address = useActiveAddress();
  const { data: cash } = useCashBalances();
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const loginId = user?.email?.address ?? user?.phone?.number ?? user?.google?.email ?? "—";
  const balanceOn = (id: ChainId) => cash?.perChain.find((c) => c.chainId === id)?.formatted;

  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to manage your account.</p>
          <button onClick={login} className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong">
            Log in
          </button>
        </div>
      ) : (
        <div className="animate-rise py-4">
          <header className="flex flex-wrap items-end justify-between gap-3 pb-5">
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight">Account</h1>
              <div className="flex flex-wrap gap-2 pt-2">
                <Chip tone="accent">Self-custodial</Chip>
                <ChainChip chainId={8453} />
                <ChainChip chainId={4663} />
              </div>
            </div>
            <p className="text-sm text-muted">
              Signed in as <span className="font-semibold text-foreground">{loginId}</span>
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* wallet: full width */}
            <section className="rounded-3xl bg-surface p-5 shadow-card sm:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted">Cash in your wallet</p>
                  <p className="font-display text-5xl font-extrabold tracking-tighter">{cash ? fmtUsd(cash.totalUsd) : "—"}</p>
                  <p className="pt-1 text-xs text-muted">One address, both chains. Deposits use the chain&apos;s own dollar.</p>
                </div>
                {address && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(address);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="max-w-full rounded-xl bg-surface-raised p-3 text-left font-mono text-xs transition-colors hover:bg-borderline"
                  >
                    <span className="break-all">{address}</span>
                    <span className="mt-1 block text-accent">{copied ? "Copied" : "Tap to copy"}</span>
                  </button>
                )}
              </div>
              {address && (
                <ul className="mt-4 space-y-2">
                  {CHAIN_IDS.map((id) => (
                    <ChainRow key={id} chainId={id} stable={balanceOn(id)} address={address} />
                  ))}
                </ul>
              )}
            </section>

            <InviteCard />

            {/* keys + the honest lines */}
            <section className="tilt rounded-3xl bg-surface p-5 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-extrabold">Your keys, your money</h2>
                <Chip>No custody</Chip>
              </div>
              <p className="pt-2 text-sm text-muted">
                This wallet and its positions belong to you. vaults.cash has no key to it and no way to move your funds.
                The signer behind it lives with Privy; you can take its private key with you any time.
              </p>
              <button
                onClick={() => exportWallet()}
                className="mt-4 rounded-full bg-surface-raised px-4 py-2 text-sm font-semibold transition-colors hover:bg-borderline"
              >
                Export wallet key
              </button>
              <p className="pt-2 text-[11px] text-muted/70">
                Opens Privy&apos;s own screen; vaults.cash never sees it. Anyone with the key controls the wallet.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/trust" className="rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground">
                  What we can and can&apos;t do
                </Link>
                <Link href="/how-it-works" className="rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground">
                  How it works
                </Link>
                <Link href="/disclosures" className="rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground">
                  Disclosures &amp; fees
                </Link>
              </div>
            </section>

            <div className="sm:col-span-2">
              <AgentAccess />
            </div>
          </div>

          <div className="flex justify-end pt-6">
            <button
              onClick={() => setConfirming(true)}
              className="rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-negative transition-colors hover:bg-surface-raised"
            >
              Log out
            </button>
          </div>

          {confirming && (
            <LogoutConfirm
              onCancel={() => setConfirming(false)}
              onConfirm={() => {
                setConfirming(false);
                logout();
              }}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}
