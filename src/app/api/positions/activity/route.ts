import { NextResponse, type NextRequest } from "next/server";
import { isChainId } from "@/lib/chain";
import { isSameOriginRequest } from "@/lib/sameOrigin";
import { readPosition } from "@/lib/positions";
import { positionActivity } from "@/lib/activity";

/** GET /api/positions/activity?chainId=8453&tokenId=123 — what traders paid this position today, and the trades. */
export async function GET(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chainId = Number(req.nextUrl.searchParams.get("chainId"));
  const raw = req.nextUrl.searchParams.get("tokenId") ?? "";
  if (!isChainId(chainId) || !/^\d+$/.test(raw)) return NextResponse.json({ error: "chainId and tokenId required" }, { status: 400 });
  try {
    const position = await readPosition(chainId, BigInt(raw));
    if (!position) return NextResponse.json({ error: "position not found" }, { status: 404 });
    return NextResponse.json(await positionActivity(position), { headers: { "cache-control": "private, max-age=20" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
