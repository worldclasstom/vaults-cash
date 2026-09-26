import { parseAbiItem } from "viem";
import { CHAINS, type ChainId } from "./chain";
import { ensureSchema, sql } from "./db";
import { marketBySlug, quoteUsdMarket } from "./markets";
import { getPoolState, publicClientFor, tickToPrice } from "./onchain";
import { getUncollectedFees, readPosition, type OwnedPosition } from "./positions";
import { amountsAt, rungState, tickToUsd, type Direction, type RungState } from "./targets";

/**
 * Ladder records: which rungs (position NFTs) belong to which target. The
 * chain is the source of truth for what each rung holds; this is the map
 * from "TSLA → $420" to its NFTs, plus the user's choices (auto-close,
 * expiry) and the outcome.
 */

export type LadderStatus = "open" | "hit" | "expired" | "closed" | "cancelled";

export type LadderRow = {
  id: number;
  privy_did: string;
  wallet: string;
  chain_id: number;
  market_slug: string;
  direction: Direction;
  target_price: string;
  target_tick: number;
  start_tick: number;
  start_price: string;
  rungs: number;
  amount_usd: string;
  auto_close: boolean;
  expires_at: string | null;
  status: LadderStatus;
  open_tx: string;
  close_tx: string | null;
  fees_paid_usd: string;
  created_at: string;
  hit_at: string | null;
  closed_at: string | null;
};

export type RungRow = { ladder_id: number; idx: number; chain_id: number; token_id: string; tick_lower: number; tick_upper: number };

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/** Position NFTs minted to `owner` in `txHash`, in mint order. */
export async function mintedTokenIds(chainId: ChainId, txHash: `0x${string}`, owner: `0x${string}`): Promise<bigint[]> {
  const client = publicClientFor(chainId);
  const rc = await client.getTransactionReceipt({ hash: txHash });
  const posm = CHAINS[chainId].uniswap.v4.positionManager.toLowerCase();
  const out: bigint[] = [];
  for (const log of rc.logs) {
    if (log.address.toLowerCase() !== posm || log.topics[0] !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") continue;
    if (log.topics.length < 4) continue;
    const from = `0x${log.topics[1]!.slice(26)}`;
    const to = `0x${log.topics[2]!.slice(26)}`;
    if (from !== "0x0000000000000000000000000000000000000000" || to.toLowerCase() !== owner.toLowerCase()) continue;
    out.push(BigInt(log.topics[3]!));
  }
  void TRANSFER;
  return out;
}

export async function createLadder(input: {
  did: string;
  wallet: `0x${string}`;
  chainId: ChainId;
  marketSlug: string;
  direction: Direction;
  targetPrice: number;
  targetTick: number;
  startTick: number;
  startPrice: number;
  amountUsd: number;
  autoClose: boolean;
  expiresAt: string | null;
  openTx: `0x${string}`;
  rungs: Array<{ idx: number; tokenId: bigint; tickLower: number; tickUpper: number }>;
}): Promise<number> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`INSERT INTO ladders (privy_did, wallet, chain_id, market_slug, direction, target_price, target_tick, start_tick, start_price, rungs, amount_usd, auto_close, expires_at, open_tx)
    VALUES (${input.did}, ${input.wallet.toLowerCase()}, ${input.chainId}, ${input.marketSlug}, ${input.direction}, ${input.targetPrice}, ${input.targetTick}, ${input.startTick}, ${input.startPrice}, ${input.rungs.length}, ${input.amountUsd}, ${input.autoClose}, ${input.expiresAt}, ${input.openTx})
    RETURNING id`) as Array<{ id: number }>;
  const id = rows[0].id;
  for (const r of input.rungs) {
    await q`INSERT INTO ladder_rungs (ladder_id, idx, chain_id, token_id, tick_lower, tick_upper) VALUES (${id}, ${r.idx}, ${input.chainId}, ${r.tokenId.toString()}, ${r.tickLower}, ${r.tickUpper}) ON CONFLICT DO NOTHING`;
  }
  return id;
}

export async function laddersFor(did: string): Promise<LadderRow[]> {
  await ensureSchema();
  return (await sql()`SELECT * FROM ladders WHERE privy_did = ${did} ORDER BY created_at DESC`) as LadderRow[];
}

export async function ladderById(id: number): Promise<{ ladder: LadderRow; rungs: RungRow[] } | null> {
  await ensureSchema();
  const q = sql();
  const rows = (await q`SELECT * FROM ladders WHERE id = ${id}`) as LadderRow[];
  if (!rows[0]) return null;
  const rungs = (await q`SELECT * FROM ladder_rungs WHERE ladder_id = ${id} ORDER BY idx`) as RungRow[];
  return { ladder: rows[0], rungs };
}

export async function openLadders(): Promise<LadderRow[]> {
  await ensureSchema();
  return (await sql()`SELECT * FROM ladders WHERE status IN ('open', 'hit', 'expired') ORDER BY id`) as LadderRow[];
}

export async function setLadderStatus(id: number, status: LadderStatus, extra: { closeTx?: string; feesPaidUsd?: number } = {}): Promise<void> {
  await ensureSchema();
  const q = sql();
  if (status === "hit") await q`UPDATE ladders SET status = 'hit', hit_at = COALESCE(hit_at, now()) WHERE id = ${id} AND status = 'open'`;
  else if (status === "expired") await q`UPDATE ladders SET status = 'expired' WHERE id = ${id} AND status = 'open'`;
  else if (status === "closed")
    await q`UPDATE ladders SET status = 'closed', closed_at = now(), close_tx = ${extra.closeTx ?? null}, fees_paid_usd = fees_paid_usd + ${extra.feesPaidUsd ?? 0} WHERE id = ${id}`;
  else await q`UPDATE ladders SET status = ${status} WHERE id = ${id}`;
}

export async function addFeesPaid(id: number, usd: number): Promise<void> {
  await ensureSchema();
  await sql()`UPDATE ladders SET fees_paid_usd = fees_paid_usd + ${usd} WHERE id = ${id}`;
}

/** Token ids that belong to any ladder of this user — Portfolio hides them, MCP refuses them. */
export async function ladderTokenIds(did: string): Promise<Array<{ chainId: number; tokenId: string }>> {
  await ensureSchema();
  const rows = (await sql()`SELECT r.chain_id, r.token_id FROM ladder_rungs r JOIN ladders l ON l.id = r.ladder_id WHERE l.privy_did = ${did} AND l.status <> 'closed'`) as Array<{ chain_id: number; token_id: string }>;
  return rows.map((r) => ({ chainId: r.chain_id, tokenId: r.token_id }));
}

export async function isLadderRung(chainId: number, tokenId: bigint): Promise<boolean> {
  await ensureSchema();
  const rows = (await sql()`SELECT 1 FROM ladder_rungs WHERE chain_id = ${chainId} AND token_id = ${tokenId.toString()} LIMIT 1`) as unknown[];
  return rows.length > 0;
}

export type RungView = {
  idx: number;
  tokenId: string;
  tickLower: number;
  tickUpper: number;
  priceLow: number;
  priceHigh: number;
  state: RungState;
  /** what the rung holds now, in units and dollars */
  baseUnits: number;
  quoteUnits: number;
  usd: number;
  /** fees earned and not yet collected, dollars */
  feesUsd: number;
  /** still exists on chain (a burned rung reads as gone) */
  live: boolean;
};

export type LadderView = {
  id: number;
  chainId: ChainId;
  chain: string;
  marketSlug: string;
  base: string;
  quote: string;
  direction: Direction;
  status: LadderStatus;
  targetPrice: number;
  startPrice: number;
  priceNow: number;
  rungs: RungView[];
  done: number;
  total: number;
  /** progress toward the target from the start price, 0..1 */
  progress: number;
  holdingsUsd: number;
  feesUsd: number;
  feesPaidUsd: number;
  autoClose: boolean;
  expiresAt: string | null;
  createdAt: string;
  hitAt: string | null;
  closedAt: string | null;
  openTx: string;
  closeTx: string | null;
};

/** The ladder as the page shows it, straight from the chain. */
export async function ladderView(row: LadderRow, rungRows: RungRow[]): Promise<LadderView> {
  const market = marketBySlug(row.market_slug);
  const chainId = row.chain_id as ChainId;
  if (!market) throw new Error(`market ${row.market_slug} is no longer listed`);
  const [poolState, qm] = await Promise.all([getPoolState(market), Promise.resolve(quoteUsdMarket(market))]);
  const quoteUsd = qm ? tickToPrice(qm, (await getPoolState(qm)).tick) : 1;
  const priceNow = tickToUsd(market, poolState.tick, quoteUsd);
  const positions = await Promise.all(rungRows.map((r) => readPosition(chainId, BigInt(r.token_id))));
  const rungs: RungView[] = [];
  let holdingsUsd = 0;
  let feesUsd = 0;
  let done = 0;
  for (let i = 0; i < rungRows.length; i++) {
    const r = rungRows[i];
    const p = positions[i];
    const state = rungState(market, row.direction, r.tick_lower, r.tick_upper, poolState.tick);
    if (state === "done") done++;
    let baseUnits = 0;
    let quoteUnits = 0;
    let usd = 0;
    let rungFees = 0;
    if (p) {
      const a = amountsAt(p.liquidity, p.tickLower, p.tickUpper, poolState.tick);
      baseUnits = (market.baseIsCurrency0 ? a.amount0 : a.amount1) / 10 ** market.base.decimals;
      quoteUnits = (market.baseIsCurrency0 ? a.amount1 : a.amount0) / 10 ** market.quote.decimals;
      usd = baseUnits * priceNow + quoteUnits * quoteUsd;
      const f = await getUncollectedFees(p as OwnedPosition).catch(() => ({ owed0: 0n, owed1: 0n }));
      const fb = Number(market.baseIsCurrency0 ? f.owed0 : f.owed1) / 10 ** market.base.decimals;
      const fq = Number(market.baseIsCurrency0 ? f.owed1 : f.owed0) / 10 ** market.quote.decimals;
      rungFees = fb * priceNow + fq * quoteUsd;
    }
    holdingsUsd += usd;
    feesUsd += rungFees;
    const pLo = tickToUsd(market, r.tick_lower, quoteUsd);
    const pHi = tickToUsd(market, r.tick_upper, quoteUsd);
    rungs.push({ idx: r.idx, tokenId: r.token_id, tickLower: r.tick_lower, tickUpper: r.tick_upper, priceLow: Math.min(pLo, pHi), priceHigh: Math.max(pLo, pHi), state, baseUnits, quoteUnits, usd, feesUsd: rungFees, live: !!p });
  }
  const start = Number(row.start_price);
  const target = Number(row.target_price);
  const progress = target === start ? 0 : Math.max(0, Math.min(1, (priceNow - start) / (target - start)));
  return {
    id: row.id,
    chainId,
    chain: CHAINS[chainId].label,
    marketSlug: row.market_slug,
    base: market.base.symbol,
    quote: market.quote.symbol,
    direction: row.direction,
    status: row.status,
    targetPrice: target,
    startPrice: start,
    priceNow,
    rungs,
    done,
    total: rungRows.length,
    progress,
    holdingsUsd,
    feesUsd,
    feesPaidUsd: Number(row.fees_paid_usd),
    autoClose: row.auto_close,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    hitAt: row.hit_at,
    closedAt: row.closed_at,
    openTx: row.open_tx,
    closeTx: row.close_tx,
  };
}

/** True once price has gone through the whole ladder. */
export function ladderHit(view: LadderView): boolean {
  return view.total > 0 && view.done === view.total;
}
