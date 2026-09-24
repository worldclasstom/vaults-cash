import type { NextRequest } from "next/server";

/**
 * True when a browser on THIS site made the request. Used to keep the
 * key-backed proxies (RPC, NFT indexer) from becoming a free API for other
 * sites now that the source is public. Not a security boundary against a
 * scripted caller (headers can be forged from curl) — it stops the cheap
 * case, other dapps pointing their frontends at our endpoints, which is the
 * one that would actually burn the RPC quota.
 *
 * POST requests always carry Origin; same-origin GETs carry Referer and
 * (in every current browser) Sec-Fetch-Site: same-origin.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;
  const hostOf = (v: string | null) => {
    if (!v) return null;
    try {
      return new URL(v).host;
    } catch {
      return null;
    }
  };
  if (hostOf(req.headers.get("origin")) === host) return true;
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  return hostOf(req.headers.get("referer")) === host;
}
