import { NextResponse, type NextRequest } from "next/server";
import { referralStats, verifyPrivyToken } from "@/lib/referral";

/** GET ?wallet=0x… with a Privy access token — your code + earnings. */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });
    return NextResponse.json(await referralStats(did, wallet));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
