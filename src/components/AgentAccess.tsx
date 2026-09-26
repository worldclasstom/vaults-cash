"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy, useSigners, useWallets } from "@privy-io/react-auth";

const SIGNER_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
const POLICY_ID = process.env.NEXT_PUBLIC_PRIVY_SIGNER_POLICY_ID;
const MCP_URL = "https://vaults.cash/api/mcp/mcp";

type Status = {
  delegated: boolean;
  embedded: string | null;
  smartWallet: string | null;
  keys: Array<{ id: number; label: string | null; createdAt: string; lastUsedAt: string | null }>;
};

/**
 * "Agent access": let an AI agent act on THIS wallet through vaults.cash.
 * Two steps the user can undo: grant our server a Privy session signer on
 * the embedded wallet (scoped by policy), then mint an account key the agent
 * presents to the MCP. Hidden until the signer is configured in env.
 */
export function AgentAccess() {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { addSigners, removeSigners } = useSigners();
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const embedded = wallets.find((w) => w.walletClientType === "privy");

  const authed = async (init?: RequestInit) => {
    const token = await getAccessToken();
    const res = await fetch("/api/agent-access", { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `request failed (${res.status})`);
    return res.json();
  };
  const status = useQuery<Status>({ queryKey: ["agent-access"], queryFn: () => authed(), enabled: !!SIGNER_ID, staleTime: 30_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["agent-access"] });
    qc.invalidateQueries({ queryKey: ["agent-access-on"] });
  };

  const grant = useMutation({
    mutationFn: async () => {
      if (!embedded) throw new Error("No embedded wallet found on this account.");
      await addSigners({ address: embedded.address, signers: [{ signerId: SIGNER_ID!, policyIds: POLICY_ID ? [POLICY_ID] : [] }] });
    },
    onSuccess: refresh,
  });
  const mint = useMutation({
    mutationFn: async () => (await authed({ method: "POST", body: JSON.stringify({ label: "MCP" }) })) as { key: string },
    onSuccess: (r) => {
      setNewKey(r.key);
      refresh();
    },
  });
  const revokeKey = useMutation({ mutationFn: (id: number) => authed({ method: "DELETE", body: JSON.stringify({ id }) }), onSuccess: refresh });
  // a zero-value call from the smart wallet to itself on Base (gas covered): proves the server can act
  const test = useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/agent-access/test", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const j = (await res.json().catch(() => ({}))) as { txHash?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? `request failed (${res.status})`);
      return j.txHash!;
    },
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      await authed({ method: "DELETE", body: "{}" });
      if (embedded) await removeSigners({ address: embedded.address });
      setNewKey(null);
    },
    onSuccess: refresh,
  });

  if (!SIGNER_ID) return null;
  const s = status.data;
  const err = (grant.error ?? mint.error ?? revokeKey.error ?? turnOff.error ?? status.error) as Error | null;
  const snippet = JSON.stringify({ mcpServers: { "vaults-cash": { url: MCP_URL, headers: { Authorization: `Bearer ${newKey ?? "vc_…"}` } } } }, null, 2);

  return (
    <section id="agent-access" className="scroll-mt-24 rounded-3xl bg-surface p-5 shadow-card">
      <h2 className="font-display text-xl font-extrabold">Agent access</h2>
      <p className="pt-1 text-sm text-muted">
        One permission, two uses. It lets vaults.cash close a Targets ladder from your wallet the moment the target prints
        (the auto-close option when you set a target), and it lets an AI agent you connect (Claude, ChatGPT, Cursor…) manage
        this wallet through vaults.cash: deposit, add, withdraw, collect. Either way the server can only act through
        vaults.cash, you can turn it off any time, and your key never leaves Privy.
      </p>

      {status.isLoading ? (
        <div className="mt-4 h-10 animate-pulse rounded-xl bg-surface-raised" />
      ) : !s?.delegated ? (
        <button
          onClick={() => grant.mutate()}
          disabled={grant.isPending || !embedded}
          className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          {grant.isPending ? "Waiting for Privy…" : "Turn on agent access"}
        </button>
      ) : (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-accent">Agent access is on for this wallet.</p>
          <div className="rounded-2xl bg-surface-raised p-4">
            <p className="font-semibold">Targets auto-close: ready</p>
            <p className="pt-1 text-xs text-muted">
              Nothing more to do. When you set a target, leave &ldquo;Close it for me&rdquo; checked and vaults.cash closes the ladder from your wallet the moment the target prints.{" "}
              <button onClick={() => test.mutate()} disabled={test.isPending} className="text-accent underline-offset-2 hover:underline disabled:opacity-50">
                {test.isPending ? "Checking…" : "Run a check"}
              </button>
              {test.isSuccess && (
                <>
                  {" "}
                  <a href={`https://base.blockscout.com/tx/${test.data}`} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                    Works ↗
                  </a>
                </>
              )}
              {test.isError && <span className="text-negative"> {(test.error as Error).message}</span>}
            </p>
          </div>

          <p className="pt-2 font-semibold">AI agents (optional)</p>
          <p className="text-xs text-muted">
            Only if you want Claude, ChatGPT or Cursor to manage this wallet: create an account key and paste it into the agent&apos;s MCP config. Targets never need one.
          </p>
          {newKey ? (
            <div className="rounded-2xl bg-surface-raised p-4">
              <p className="font-semibold">Your new account key</p>
              <p className="pt-1 text-xs text-muted">Shown once. Paste it into your agent&apos;s MCP config; anyone with it can move this wallet&apos;s funds through vaults.cash.</p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(snippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="mt-2 w-full rounded-xl bg-background p-3 text-left font-mono text-xs transition-colors hover:bg-borderline"
              >
                <pre className="whitespace-pre-wrap break-all">{snippet}</pre>
                <span className="mt-1 block text-accent">{copied ? "Copied ✓" : "Tap to copy the MCP config"}</span>
              </button>
              <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-muted underline-offset-2 hover:underline">
                I&apos;ve saved it
              </button>
            </div>
          ) : (
            <button
              onClick={() => mint.mutate()}
              disabled={mint.isPending}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {mint.isPending ? "Creating…" : s.keys.length ? "Create another key" : "Create an account key"}
            </button>
          )}

          {s.keys.length > 0 && (
            <ul className="divide-y divide-borderline rounded-2xl bg-surface-raised">
              {s.keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    <span className="font-medium">{k.label ?? "Key"} #{k.id}</span>
                    <span className="block text-xs text-muted">
                      created {new Date(k.createdAt).toLocaleDateString()}
                      {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : " · never used"}
                    </span>
                  </span>
                  <button onClick={() => revokeKey.mutate(k.id)} disabled={revokeKey.isPending} className="text-xs text-negative underline-offset-2 hover:underline disabled:opacity-40">
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={() => turnOff.mutate()}
            disabled={turnOff.isPending}
            className="rounded-full bg-negative/15 px-4 py-2 text-xs font-semibold text-negative transition-colors hover:bg-negative/25 disabled:opacity-40"
          >
            {turnOff.isPending ? "Turning off…" : "Turn off agent access"}
          </button>
        </div>
      )}
      {err && <p className="pt-2 text-xs text-negative">{err.message}</p>}
    </section>
  );
}
