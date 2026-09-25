import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { isSameOriginRequest } from "@/lib/sameOrigin";
import { quoteBridge } from "@/lib/bridge";

/** POST { from, to, amount (raw units), user } → Relay route as calls for the user's wallet. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const body = (await req.json()) as { from?: number; to?: number; amount?: string; user?: string };
    if (!body.user || !isAddress(body.user)) return NextResponse.json({ error: "user must be an address" }, { status: 400 });
    let amount: bigint;
    try {
      amount = BigInt(body.amount ?? "0");
    } catch {
      return NextResponse.json({ error: "amount must be raw units" }, { status: 400 });
    }
    if (amount <= 0n) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
    const q = await quoteBridge({ from: Number(body.from), to: Number(body.to), amount, user: body.user as `0x${string}` });
    return NextResponse.json(q, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
