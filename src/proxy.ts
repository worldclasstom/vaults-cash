import { NextResponse, type NextRequest } from "next/server";
import { MARKETS } from "@/lib/markets";

/**
 * Jurisdiction gate for stock-token markets. RHJ stock tokens may not be
 * offered to US persons (also restricted: CA, GB, CH, AE, sanctioned
 * jurisdictions — see the RHJ prospectus). Crypto markets stay open.
 * Country comes from the platform geo header (Vercel sets it at the edge);
 * requests with no geo header (local dev) pass through.
 */
const BLOCKED_COUNTRIES = new Set(["US", "CA", "GB", "CH", "AE"]);

const RESTRICTED_MARKET_PATHS = MARKETS.filter((m) => m.restricted).map(
  (m) => `/market/${m.symbol.toLowerCase()}`,
);

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
  return NextResponse.next();
}

export const config = {
  matcher: "/market/:path*",
};
