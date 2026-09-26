import { NextResponse, type NextRequest } from "next/server";
import { isHex } from "viem";
import { verifyPrivyToken } from "@/lib/referral";
import { addFeesPaid, ladderById, ladderView, setLadderStatus } from "@/lib/ladders";

export const maxDuration = 60;

async function owned(req: NextRequest, id: number) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("unauthorized");
  const did = await verifyPrivyToken(token);
  const full = await ladderById(id);
  if (!full || full.ladder.privy_did !== did) throw new Error("not found");
  return full;
}

const status = (msg: string) => (msg === "unauthorized" ? 401 : msg === "not found" ? 404 : 500);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const full = await owned(req, Number(id));
    return NextResponse.json({ ladder: await ladderView(full.ladder, full.rungs) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: status(msg) });
  }
}

/** POST { action: "closed" | "collected" | "cancel", txHash?, feesUsd? } after the user's own transaction confirmed. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const full = await owned(req, Number(id));
    const b = (await req.json()) as { action?: string; txHash?: string; feesUsd?: number };
    if (b.action === "closed") {
      if (!b.txHash || !isHex(b.txHash)) return NextResponse.json({ error: "txHash required" }, { status: 400 });
      await setLadderStatus(full.ladder.id, "closed", { closeTx: b.txHash, feesPaidUsd: Number(b.feesUsd ?? 0) });
    } else if (b.action === "collected") {
      await addFeesPaid(full.ladder.id, Number(b.feesUsd ?? 0));
    } else if (b.action === "cancel") {
      await setLadderStatus(full.ladder.id, "cancelled");
    } else {
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: status(msg) });
  }
}
