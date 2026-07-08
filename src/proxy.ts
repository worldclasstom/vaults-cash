import { NextResponse, type NextRequest } from "next/server";
import { MARKETS } from "@/lib/markets";

/**
 * Edge proxy, two jobs:
 *
 * 1. Jurisdiction gate for stock-token markets. RHJ stock tokens may not be
 *    offered to US persons (also restricted: CA, GB, CH, AE, sanctioned
 *    jurisdictions — see the RHJ prospectus). Crypto markets stay open.
 *    Country comes from the platform geo header (Vercel sets it at the
 *    edge); requests with no geo header (local dev) pass through.
 *
 * 2. Referral attribution capture. ?ref=CODE on ANY page entry is stored in
 *    a first-party, httpOnly, 90-day cookie — set server-side so it cannot
 *    be lost to client-render timing, works without JS, and survives the
 *    login redirect. First-touch: an existing cookie is never overwritten.
 *    Binding happens server-side on the first authenticated referral API
 *    call (see /api/referral/me).
 */
const BLOCKED_COUNTRIES = new Set(["US", "CA", "GB", "CH", "AE"]);

const RESTRICTED_MARKET_PATHS = MARKETS.filter((m) => m.restricted).map(
  (m) => `/market/${m.symbol.toLowerCase()}`,
);

export const REF_COOKIE = "vref";
/** matches codes from our no-lookalike alphabet, with headroom */
const REF_CODE_RE = /^[A-Z0-9]{4,16}$/i;

export function proxy(request: NextRequest) {
  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry");
  const path = request.nextUrl.pathname.toLowerCase();
  if (
    country &&
    BLOCKED_COUNTRIES.has(country.toUpperCase()) &&
    RESTRICTED_MARKET_PATHS.some((p) => path.startsWith(p))
  ) {
    return NextResponse.redirect(new URL("/restricted", request.url));
  }

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
    "/market/:path*",
    "/portfolio",
    "/account",
    "/how-it-works",
    "/disclosures",
  ],
};
