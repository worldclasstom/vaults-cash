import { NextResponse, type NextRequest } from "next/server";
import { ReferralError, bindReferrer, verifyPrivyToken } from "@/lib/referral";

/** POST { wallet, code } — apply an invite code by hand (first touch only, no self-referral). */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const body = (await req.json().catch(() => ({}))) as { wallet?: string; code?: string };
    if (!body.wallet || typeof body.code !== "string") return NextResponse.json({ error: "wallet and code required" }, { status: 400 });
    const bound = await bindReferrer(did, body.wallet, body.code);
    if (!bound) return NextResponse.json({ error: "That code didn't apply: it's unknown, it's your own, or an invite is already linked to this account." }, { status: 409 });
    return NextResponse.json({ bound: true });
  } catch (e) {
    const status = e instanceof ReferralError ? e.status : 500;
    if (status === 500) console.error("referral/apply", e);
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
