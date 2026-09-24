import { createRemoteJWKSet, jwtVerify } from "jose";
import { customAlphabet } from "nanoid";
import { parseAbiItem } from "viem";
import { ensureSchema, sql } from "./db";
import { CHAINS, CHAIN_IDS, type ChainId } from "./chain";
import { publicClientFor } from "./onchain";

export { REFERRER_SHARE } from "./referral-share";

// no-lookalike alphabet for codes users will read aloud
const makeCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 8);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verify a Privy access token via the app's public JWKS; returns the DID. */
export async function verifyPrivyToken(token: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: appId });
  if (!payload.sub) throw new Error("token has no subject");
  return payload.sub;
}

export class ReferralError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The wallet a client claims must actually belong to the authenticated Privy
 * user — otherwise anyone could register a victim's address and collect that
 * address's referral attribution. Verified against Privy's server API when
 * PRIVY_APP_SECRET is set (App settings → Basics in the Privy dashboard);
 * without it we can only enforce that the wallet isn't already someone
 * else's, which is logged so it isn't forgotten.
 */
async function verifyWalletOwnership(privyDid: string, wallet: string): Promise<void> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!secret) {
    console.warn("PRIVY_APP_SECRET not set — wallet ownership not verified against Privy");
    return;
  }
  const res = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(privyDid)}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`,
      "privy-app-id": appId,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new ReferralError(502, `Privy user lookup failed (${res.status})`);
  const user = (await res.json()) as { linked_accounts?: Array<{ type: string; address?: string }> };
  const owned = new Set((user.linked_accounts ?? []).map((a) => a.address?.toLowerCase()).filter(Boolean));
  if (!owned.has(wallet.toLowerCase())) throw new ReferralError(403, "wallet does not belong to this user");
}

export async function getOrCreateUser(privyDid: string, wallet: string) {
  await ensureSchema();
  await verifyWalletOwnership(privyDid, wallet);
  const q = sql();
  const lower = wallet.toLowerCase();
  // the wallet another DID already registered can't be claimed
  const owner = await q`SELECT privy_did FROM user_wallets WHERE wallet = ${lower}`;
  if (owner.length && owner[0].privy_did !== privyDid) throw new ReferralError(409, "wallet already registered to another account");
  // users.wallet tracks the CURRENT address (it moved from the embedded EOA
  // to the smart wallet); user_wallets keeps every address ever seen
  const rows = await q`
    INSERT INTO users (privy_did, wallet, ref_code)
    VALUES (${privyDid}, ${lower}, ${makeCode()})
    ON CONFLICT (privy_did) DO UPDATE SET wallet = EXCLUDED.wallet
    RETURNING id, privy_did, wallet, ref_code, referred_by`;
  await q`INSERT INTO user_wallets (wallet, privy_did) VALUES (${lower}, ${privyDid}) ON CONFLICT DO NOTHING`;
  return rows[0] as { id: number; privy_did: string; wallet: string; ref_code: string; referred_by: string | null };
}

/** First-touch, immutable, no self-referral. Returns whether it bound. */
export async function bindReferrer(privyDid: string, wallet: string, refCode: string) {
  const user = await getOrCreateUser(privyDid, wallet);
  const code = refCode.trim().toUpperCase();
  if (user.referred_by || code === user.ref_code) return false;
  const q = sql();
  const rows = await q`
    UPDATE users SET referred_by = ${code}
    WHERE privy_did = ${privyDid}
      AND referred_by IS NULL
      AND EXISTS (SELECT 1 FROM users r WHERE r.ref_code = ${code} AND r.privy_did <> ${privyDid})
    RETURNING referred_by`;
  return rows.length > 0;
}

export type ReferralView = {
  refCode: string;
  referredBy: string | null;
  /** current wallet of whoever referred this user — the zap sends the
   *  referrer's fee share straight there */
  referrerWallet: `0x${string}` | null;
  referredCount: number;
  earnedUsd: number;
};

export async function referralStats(privyDid: string, wallet: string): Promise<ReferralView> {
  const user = await getOrCreateUser(privyDid, wallet);
  const q = sql();
  const [{ count }] = await q`SELECT count(*)::int AS count FROM users WHERE referred_by = ${user.ref_code}`;
  const [{ earned }] = await q`
    SELECT COALESCE(sum(referrer_amount), 0)::float8 AS earned
    FROM fee_events WHERE referrer_did = ${privyDid}`;
  const ref = user.referred_by
    ? await q`SELECT wallet FROM users WHERE ref_code = ${user.referred_by}`
    : [];
  return {
    refCode: user.ref_code,
    referredBy: user.referred_by,
    referrerWallet: ref.length ? (ref[0].wallet as `0x${string}`) : null,
    referredCount: count as number,
    earnedUsd: (earned as number) / 1e6, // raw 6-decimal stablecoin units
  };
}

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
/** Chain block before the first fee ever paid on that chain — Robinhood
 *  Chain went live for us 2026-09-23 around block 70.9M. */
const SCAN_START: Record<ChainId, bigint> = { 8453: 1_500_000n, 4663: 70_900_000n };
/** From these blocks on, a referred deposit pays the referrer on-chain in the
 *  same batch (the fee wallet receives only its own half). Earlier events
 *  never had a referrer share paid. */
const SPLIT_FROM: Record<ChainId, bigint> = { 8453: 51_720_000n, 4663: 71_050_000n };
const MAX_CHUNK = 50_000n;
const MAX_CHUNKS_PER_RUN = 12;

/** sync_state key per chain; Base keeps the original key so its cursor
 *  carries over. */
const scanKey = (chainId: ChainId) => (chainId === 8453 ? "fee_scan_block" : `fee_scan_block_${chainId}`);

/**
 * Ledger stablecoin transfers into the fee wallet on every chain, attributing
 * each to the payer's referrer (looked up across every wallet the payer has
 * used; frozen at event time). Idempotent; resumes from the last scanned
 * block per chain.
 */
export async function syncFeeEvents() {
  await ensureSchema();
  const feeWallet = process.env.NEXT_PUBLIC_FEE_RECIPIENT as `0x${string}` | undefined;
  if (!feeWallet) return { scanned: 0, inserted: 0, note: "no fee wallet set" };
  const q = sql();

  let inserted = 0;
  let chunks = 0;
  const upToBlock: Record<number, string> = {};
  for (const chainId of CHAIN_IDS) {
    const client = publicClientFor(chainId);
    const key = scanKey(chainId);
    const stateRows = await q`SELECT v FROM sync_state WHERE k = ${key}`;
    let from = stateRows.length ? BigInt(stateRows[0].v as string) + 1n : SCAN_START[chainId];
    const head = await client.getBlockNumber().catch(() => null);
    if (head === null) continue; // one chain's RPC being down must not stall the other

    let chainChunks = 0;
    while (from <= head && chainChunks < MAX_CHUNKS_PER_RUN) {
      const to = from + MAX_CHUNK - 1n > head ? head : from + MAX_CHUNK - 1n;
      const logs = await client.getLogs({
        address: CHAINS[chainId].quote.address,
        event: TRANSFER,
        args: { to: feeWallet },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const payer = (log.args.from as string).toLowerCase();
        const amount = log.args.value as bigint;
        const referrerRows = await q`
          SELECT r.privy_did, r.wallet
          FROM user_wallets w
          JOIN users u ON u.privy_did = w.privy_did
          JOIN users r ON r.ref_code = u.referred_by
          WHERE w.wallet = ${payer}`;
        const referrer = referrerRows.length ? referrerRows[0] : null;
        const paidOnChain = referrer !== null && log.blockNumber >= SPLIT_FROM[chainId];
        const res = await q`
          INSERT INTO fee_events (tx_hash, log_index, payer, amount, block_number, referrer_wallet, referrer_did, referrer_amount, chain_id)
          VALUES (${log.transactionHash}, ${log.logIndex}, ${payer}, ${amount.toString()}, ${log.blockNumber.toString()},
                  ${referrer ? (referrer.wallet as string) : null}, ${referrer ? (referrer.privy_did as string) : null},
                  ${paidOnChain ? amount.toString() : "0"}, ${chainId})
          ON CONFLICT (tx_hash, log_index) DO NOTHING
          RETURNING id`;
        inserted += res.length;
      }
      await q`
        INSERT INTO sync_state (k, v) VALUES (${key}, ${to.toString()})
        ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`;
      from = to + 1n;
      chainChunks++;
    }
    chunks += chainChunks;
    upToBlock[chainId] = (from - 1n).toString();
  }
  const [totals] = await q`
    SELECT count(*)::int AS events, COALESCE(sum(amount), 0)::float8 AS fees
    FROM fee_events`;
  return {
    scanned: chunks,
    inserted,
    upToBlock,
    ledger: { events: totals.events as number, feesUsd: (totals.fees as number) / 1e6 },
  };
}
