import { NextResponse, type NextRequest } from "next/server";
import { ReferralError, claimCustomCode, verifyPrivyToken } from "@/lib/referral";

/** POST { wallet, code } — claim a vanity invite code for this account (once). */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const body = (await req.json().catch(() => ({}))) as { wallet?: string; code?: string };
    if (!body.wallet || typeof body.code !== "string") return NextResponse.json({ error: "wallet and code required" }, { status: 400 });
    const code = await claimCustomCode(did, body.wallet, body.code);
    return NextResponse.json({ code });
  } catch (e) {
    const status = e instanceof ReferralError ? e.status : 500;
    if (status === 500) console.error("referral/code", e);
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
