import { NextResponse, type NextRequest } from "next/server";
import { ReferralError, bindReferrer, verifyPrivyToken } from "@/lib/referral";

/** POST { wallet, refCode } with a Privy access token — first-touch bind. */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const { wallet, refCode } = await req.json();
    if (typeof wallet !== "string" || typeof refCode !== "string")
      return NextResponse.json({ error: "wallet and refCode required" }, { status: 400 });
    const bound = await bindReferrer(did, wallet, refCode);
    return NextResponse.json({ bound });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ReferralError ? e.status : 500 });
  }
}
