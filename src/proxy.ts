import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy: referral attribution capture.
 *
 * ?ref=CODE on ANY page entry is stored in a first-party, httpOnly, 90-day
 * cookie — set server-side so it cannot be lost to client-render timing,
 * works without JS, and survives the login redirect. First-touch: an existing
 * cookie is never overwritten. Binding happens server-side on the first
 * authenticated referral API call (see /api/referral/me).
 *
 * The jurisdiction gate that used to live here is gone: it existed only for
 * Robinhood stock tokens (not offerable to US persons). vaults.cash on Base is
 * crypto-only — no tokenized securities — so every market is open to everyone.
 */
export const REF_COOKIE = "vref";
/** matches codes from our no-lookalike alphabet, with headroom */
const REF_CODE_RE = /^[A-Z0-9]{4,16}$/i;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && REF_CODE_RE.test(ref) && !request.cookies.get(REF_COOKIE)) {
    response.cookies.set(REF_COOKIE, ref.toUpperCase(), {
      maxAge: 60 * 60 * 24 * 90, // 90 days, industry-typical attribution window
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/",
    "/pools",
    "/market/:path*",
    "/portfolio",
    "/account",
    "/how-it-works",
    "/disclosures",
  ],
};
