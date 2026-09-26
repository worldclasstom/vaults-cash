import { NextResponse, type NextRequest } from "next/server";
import { isAddress, isHex } from "viem";
import { verifyPrivyToken } from "@/lib/referral";
import { createLadder, ladderById, laddersFor, ladderTokenIds, ladderView, mintedTokenIds } from "@/lib/ladders";
import { marketBySlug } from "@/lib/markets";
import type { ChainId } from "@/lib/chain";
import { MAX_RUNGS, MIN_RUNGS } from "@/lib/targets";

export const maxDuration = 60;

async function user(req: NextRequest): Promise<string> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("unauthorized");
  return verifyPrivyToken(token);
}

/** GET → the user's ladders with live progress; ?ids=1 → just the rung token ids (Portfolio hides them). */
export async function GET(req: NextRequest) {
  try {
    const did = await user(req);
    if (req.nextUrl.searchParams.get("ids")) {
      return NextResponse.json({ rungs: await ladderTokenIds(did) }, { headers: { "cache-control": "no-store" } });
    }
    const rows = await laddersFor(did);
    const views = await Promise.all(
      rows.map(async (row) => {
        const full = await ladderById(row.id);
        if (!full) return null;
        try {
          return await ladderView(full.ladder, full.rungs);
        } catch {
          return null;
        }
      }),
    );
    return NextResponse.json({ ladders: views.filter(Boolean) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "unauthorized" ? 401 : 500 });
  }
}

/** POST → record a ladder the user just minted. The tx receipt is the proof: the rungs are the NFTs it minted to the wallet. */
export async function POST(req: NextRequest) {
  try {
    const did = await user(req);
    const b = (await req.json()) as {
      wallet?: string;
      chainId?: number;
      marketSlug?: string;
      direction?: "up" | "down";
      targetPrice?: number;
      targetTick?: number;
      startTick?: number;
      startPrice?: number;
      amountUsd?: number;
      autoClose?: boolean;
      expiresAt?: string | null;
      txHash?: string;
      rungs?: Array<{ idx: number; tickLower: number; tickUpper: number }>;
    };
    const market = b.marketSlug ? marketBySlug(b.marketSlug) : undefined;
    if (!market || !b.wallet || !isAddress(b.wallet) || !b.txHash || !isHex(b.txHash) || (b.direction !== "up" && b.direction !== "down")) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    if (!b.rungs || b.rungs.length < MIN_RUNGS || b.rungs.length > MAX_RUNGS) return NextResponse.json({ error: "bad rungs" }, { status: 400 });
    const chainId = market.chainId as ChainId;
    const minted = await mintedTokenIds(chainId, b.txHash as `0x${string}`, b.wallet as `0x${string}`);
    if (minted.length !== b.rungs.length) {
      return NextResponse.json({ error: `expected ${b.rungs.length} rungs in that transaction, found ${minted.length}` }, { status: 409 });
    }
    const id = await createLadder({
      did,
      wallet: b.wallet as `0x${string}`,
      chainId,
      marketSlug: market.slug,
      direction: b.direction,
      targetPrice: Number(b.targetPrice),
      targetTick: Number(b.targetTick),
      startTick: Number(b.startTick),
      startPrice: Number(b.startPrice),
      amountUsd: Number(b.amountUsd),
      autoClose: !!b.autoClose,
      expiresAt: b.expiresAt ?? null,
      openTx: b.txHash as `0x${string}`,
      rungs: b.rungs.map((r, i) => ({ idx: r.idx ?? i, tokenId: minted[i], tickLower: r.tickLower, tickUpper: r.tickUpper })),
    });
    return NextResponse.json({ id });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "unauthorized" ? 401 : 500 });
  }
}
