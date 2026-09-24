import { createRemoteJWKSet, jwtVerify } from "jose";
import { customAlphabet } from "nanoid";
import { parseAbiItem } from "viem";
import { ensureSchema, sql } from "./db";
import { CHAINS, CHAIN_IDS, type ChainId } from "./chain";
import { publicClientFor } from "./onchain";

/** Share of the platform fee earmarked for the referrer (50% of 60bps). */
export const REFERRER_SHARE = 0.5;

// no-lookalike alphabet for codes users will read aloud
const makeCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 8);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Verify a Privy access token via the app's public JWKS; returns the DID. */
export async function verifyPrivyToken(token: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
  jwks ??= createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`),
  );
  const { payload } = await jwtVerify(token, jwks, {
    issuer: "privy.io",
    audience: appId,
  });
  if (!payload.sub) throw new Error("token has no subject");
  return payload.sub;
}

export async function getOrCreateUser(privyDid: string, wallet: string) {
  await ensureSchema();
  const q = sql();
  const lower = wallet.toLowerCase();
  const rows = await q`
    INSERT INTO users (privy_did, wallet, ref_code)
    VALUES (${privyDid}, ${lower}, ${makeCode()})
    ON CONFLICT (privy_did) DO UPDATE SET privy_did = EXCLUDED.privy_did
    RETURNING id, privy_did, wallet, ref_code, referred_by`;
  return rows[0] as {
    id: number;
    privy_did: string;
    wallet: string;
    ref_code: string;
    referred_by: string | null;
  };
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
      AND EXISTS (SELECT 1 FROM users r WHERE r.ref_code = ${code})
    RETURNING referred_by`;
  return rows.length > 0;
}

export async function referralStats(privyDid: string, wallet: string) {
  const user = await getOrCreateUser(privyDid, wallet);
  const q = sql();
  const [{ count }] = await q`
    SELECT count(*)::int AS count FROM users WHERE referred_by = ${user.ref_code}`;
  const [{ earned }] = await q`
    SELECT COALESCE(sum(amount_usdc), 0)::float8 AS earned
    FROM fee_events WHERE referrer_wallet = ${user.wallet}`;
  return {
    refCode: user.ref_code,
    referredBy: user.referred_by,
    referredCount: count as number,
    // ledger stores raw 6-decimal units; referrer earns half the fee
    earnedUsd: ((earned as number) / 1e6) * REFERRER_SHARE,
  };
}

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);
/** Chain block before the first fee ever paid on that chain — Robinhood
 *  Chain went live for us 2026-09-23 around block 70.9M. */
const SCAN_START: Record<ChainId, bigint> = { 8453: 1_500_000n, 4663: 70_900_000n };
const MAX_CHUNK = 50_000n;
const MAX_CHUNKS_PER_RUN = 12;

/** sync_state key per chain; Base keeps the original key so its cursor
 *  carries over. */
const scanKey = (chainId: ChainId) => (chainId === 8453 ? "fee_scan_block" : `fee_scan_block_${chainId}`);

/**
 * Scan stablecoin transfers into the fee wallet on every chain and ledger
 * them, attributing each to the payer's referrer (frozen at event time).
 * Idempotent; resumes from the last scanned block per chain.
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
        const referrerRows = await q`
          SELECT r.wallet FROM users u JOIN users r ON u.referred_by = r.ref_code
          WHERE u.wallet = ${payer}`;
        const referrer = referrerRows.length ? (referrerRows[0].wallet as string) : null;
        const res = await q`
          INSERT INTO fee_events (tx_hash, log_index, payer, amount_usdc, block_number, referrer_wallet, chain_id)
          VALUES (${log.transactionHash}, ${log.logIndex}, ${payer}, ${(log.args.value as bigint).toString()}, ${log.blockNumber.toString()}, ${referrer}, ${chainId})
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
    SELECT count(*)::int AS events, COALESCE(sum(amount_usdc), 0)::float8 AS fees
    FROM fee_events`;
  return {
    scanned: chunks,
    inserted,
    upToBlock,
    ledger: { events: totals.events as number, feesUsd: (totals.fees as number) / 1e6 },
  };
}
