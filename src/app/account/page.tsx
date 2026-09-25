"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { usePrivy } from "@privy-io/react-auth";
import { Sheet } from "@/components/Sheet";
import { AgentAccess } from "@/components/AgentAccess";
import { AppShell } from "@/components/AppShell";
import { InviteCard } from "@/components/InviteCard";
import { useActiveAddress, useTokenBalance, useUsdcBalance } from "@/hooks/useChainData";
import { CHAINS, CHAIN_IDS, explorerUrl } from "@/lib/chain";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { NATIVE_ETH } from "@/lib/markets";

function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open onClose={onCancel} title="Log out?">
        <p className="pt-2 text-sm text-muted">
          Your funds stay safe in your wallet — nothing moves. Log back in with
          the same email anytime to pick up where you left off.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="grow rounded-full bg-surface-raised py-2.5 font-semibold transition-colors hover:bg-borderline"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="grow rounded-full bg-negative/15 py-2.5 font-semibold text-negative transition-colors hover:bg-negative/25"
          >
            Log out
          </button>
        </div>
    </Sheet>
  );
}

export default function AccountPage() {
  const { ready, authenticated, login, logout } = useAuth();
  const { user, exportWallet } = usePrivy();
  const address = useActiveAddress();
  const { data: usdc } = useUsdcBalance();
  const { data: eth } = useTokenBalance(NATIVE_ETH, 18);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  const loginId =
    user?.email?.address ?? user?.phone?.number ?? user?.google?.email ?? "—";

  return (
    <AppShell>
      {!ready ? null : !authenticated ? (
        <div className="flex grow flex-col items-center justify-center gap-4 py-24">
          <p className="text-muted">Log in to manage your account.</p>
          <button
            onClick={login}
            className="rounded-full bg-accent px-8 py-3 font-semibold text-black hover:bg-accent-strong"
          >
            Log in
          </button>
        </div>
      ) : (
        <div className="animate-rise space-y-4 py-4">
          <h1 className="text-2xl font-bold">Account</h1>

          <section className="rounded-3xl bg-surface shadow-card p-5">
            <p className="text-sm text-muted">Signed in as</p>
            <p className="pt-0.5 font-semibold break-all">{loginId}</p>
          </section>

          <section className="rounded-3xl bg-surface shadow-card p-5">
            <p className="pb-1 text-sm text-muted">
              Your wallet — same address on Base and Robinhood Chain
            </p>
            {address && (
              <>
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
                <div className="flex items-center justify-between pt-3 text-sm">
                  <span className="text-muted">Balance</span>
                  <span>
                    {usdc ? fmtUsd(usdc.formatted) : "—"} USDC
                    {eth && eth.raw > 0n && (
                      <span className="text-muted"> · {fmtAmount(eth.formatted, 5)} ETH</span>
                    )}
                  </span>
                </div>
                <span className="mt-2 flex gap-4 text-sm">
                  {CHAIN_IDS.map((id) => (
                    <a
                      key={id}
                      href={explorerUrl(id, "address", address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {CHAINS[id].label} explorer →
                    </a>
                  ))}
                </span>
              </>
            )}
            <p className="pt-3 text-xs text-muted">
              Self-custodial: this wallet and its positions belong to you.
              vaults.cash can never move your funds.
            </p>
            <button
              onClick={() => exportWallet()}
              className="mt-3 rounded-full bg-surface-raised px-4 py-2 text-xs text-muted transition-colors hover:bg-borderline hover:text-foreground"
            >
              Export wallet key
            </button>
            <p className="pt-2 text-[11px] text-muted/70">
              Shows the private key of the signer behind this wallet, in Privy&apos;s own screen. vaults.cash never sees it.
              Keep it secret — anyone with it controls the wallet.
            </p>
          </section>

          <InviteCard />

          <AgentAccess />

          <section className="rounded-3xl bg-surface shadow-card p-5">
            <Link
              href="/how-it-works"
              className="block py-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              How it works →
            </Link>
            <Link
              href="/disclosures"
              className="block py-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              Disclosures &amp; fees →
            </Link>
            <Link
              href="/trust"
              className="block py-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              What vaults.cash can and can&apos;t do →
            </Link>
          </section>

          <button
            onClick={() => setConfirming(true)}
            className="w-full rounded-full bg-surface py-3 font-semibold text-negative transition-colors hover:bg-surface-raised"
          >
            Log out
          </button>

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
