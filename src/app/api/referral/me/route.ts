import { NextResponse, type NextRequest } from "next/server";
import { bindReferrer, referralStats, verifyPrivyToken } from "@/lib/referral";
import { REF_COOKIE } from "@/proxy";

/**
 * GET ?wallet=0x… with a Privy access token — your code + earnings.
 *
 * Also the server-side referral bind point: the edge proxy captured any
 * ?ref=CODE into an httpOnly first-party cookie at entry; the dashboard
 * calls this route on every signed-in render, so the first authenticated
 * request after signup binds the referral with no client-side coordination.
 * (pendingRef is a localStorage fallback for cookie-blocking browsers.)
 * bindReferrer is first-touch-immutable and rejects self-referrals.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });
    const did = await verifyPrivyToken(token);
    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

    const pending =
      req.cookies.get(REF_COOKIE)?.value ??
      req.nextUrl.searchParams.get("pendingRef");
    if (pending) {
      try {
        await bindReferrer(did, wallet, pending);
      } catch {
        /* stats must not fail because a bind attempt did */
      }
    }

    return NextResponse.json(await referralStats(did, wallet));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
