import { createHash, randomBytes } from "node:crypto";
import { ensureSchema, sql } from "./db";

/**
 * Account-linked agent access (server side).
 *
 * A user lets an agent act on THEIR vaults.cash wallet in two steps: they
 * grant our server a Privy session signer on their embedded wallet (client
 * side, revocable), and they mint an account key here. An agent presents the
 * key as `Authorization: Bearer vc_…` to the MCP/REST API; the executor then
 * signs through Privy with the session signer and sends from the user's own
 * smart wallet — same sponsored gas and atomic batches the web app gets.
 */

export type LinkedUser = { privyDid: string; wallet: `0x${string}` };

export type PrivyWallets = {
  /** the embedded EOA that owns the smart wallet — what session signers sign with */
  embedded: { id: string; address: `0x${string}`; delegated: boolean } | null;
  /** the Kernel smart wallet the app spends from */
  smartWallet: `0x${string}` | null;
};

const PRIVY_API = "https://auth.privy.io/api/v1";

/** Privy's view of a user's wallets (needs PRIVY_APP_SECRET). */
export async function privyWallets(privyDid: string): Promise<PrivyWallets> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new Error("PRIVY_APP_SECRET not configured");
  const res = await fetch(`${PRIVY_API}/users/${encodeURIComponent(privyDid)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`, "privy-app-id": appId },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Privy user lookup failed (${res.status})`);
  const user = (await res.json()) as {
    linked_accounts?: Array<{
      type: string;
      address?: string;
      id?: string;
      chain_type?: string;
      wallet_client_type?: string;
      connector_type?: string;
      delegated?: boolean;
    }>;
  };
  const accounts = user.linked_accounts ?? [];
  const emb = accounts.find(
    (a) => a.type === "wallet" && (a.chain_type ?? "ethereum") === "ethereum" && (a.wallet_client_type === "privy" || a.connector_type === "embedded") && a.id && a.address,
  );
  const sw = accounts.find((a) => a.type === "smart_wallet" && a.address);
  return {
    embedded: emb ? { id: emb.id!, address: emb.address as `0x${string}`, delegated: !!emb.delegated } : null,
    smartWallet: sw ? (sw.address as `0x${string}`) : null,
  };
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** Mint a key for the user; the plaintext is returned once and never stored. */
export async function createAgentKey(privyDid: string, wallet: string, label?: string) {
  await ensureSchema();
  const key = `vc_${randomBytes(20).toString("hex")}`;
  const rows = await sql()`
    INSERT INTO agent_keys (privy_did, wallet, key_hash, label)
    VALUES (${privyDid}, ${wallet.toLowerCase()}, ${hash(key)}, ${label ?? null})
    RETURNING id, created_at`;
  return { id: rows[0].id as number, key, label: label ?? null, createdAt: rows[0].created_at as string };
}

export async function listAgentKeys(privyDid: string) {
  await ensureSchema();
  const rows = await sql()`
    SELECT id, label, created_at, last_used_at
    FROM agent_keys WHERE privy_did = ${privyDid} AND revoked_at IS NULL
    ORDER BY created_at DESC`;
  return rows.map((r) => ({ id: r.id as number, label: r.label as string | null, createdAt: r.created_at as string, lastUsedAt: r.last_used_at as string | null }));
}

/** Revoke one key, or every key when `id` is omitted. */
export async function revokeAgentKeys(privyDid: string, id?: number) {
  await ensureSchema();
  const rows =
    id === undefined
      ? await sql()`UPDATE agent_keys SET revoked_at = now() WHERE privy_did = ${privyDid} AND revoked_at IS NULL RETURNING id`
      : await sql()`UPDATE agent_keys SET revoked_at = now() WHERE privy_did = ${privyDid} AND id = ${id} AND revoked_at IS NULL RETURNING id`;
  return rows.length;
}

/** Bearer → user, or null. Touches last_used_at. */
export async function resolveAgentKey(bearer: string | undefined): Promise<LinkedUser | null> {
  if (!bearer || !/^vc_[0-9a-f]{40}$/.test(bearer)) return null;
  try {
    await ensureSchema();
    const rows = await sql()`
      UPDATE agent_keys SET last_used_at = now()
      WHERE key_hash = ${hash(bearer)} AND revoked_at IS NULL
      RETURNING privy_did, wallet`;
    if (!rows.length) return null;
    return { privyDid: rows[0].privy_did as string, wallet: rows[0].wallet as `0x${string}` };
  } catch (e) {
    console.warn(`agent key lookup failed: ${(e as Error).message}`);
    return null;
  }
}

/** The wallet that referred this user, for the on-chain fee split. */
export async function referrerWalletForUser(privyDid: string): Promise<`0x${string}` | null> {
  try {
    await ensureSchema();
    const rows = await sql()`
      SELECT r.wallet FROM users u JOIN users r ON r.ref_code = u.referred_by WHERE u.privy_did = ${privyDid}`;
    return rows.length ? ((rows[0].wallet as string).toLowerCase() as `0x${string}`) : null;
  } catch {
    return null;
  }
}
