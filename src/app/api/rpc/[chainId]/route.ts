import { NextResponse, type NextRequest } from "next/server";
import { isChainId } from "@/lib/chain";
import { serverRpcUrl } from "@/lib/rpc";
import { isSameOriginRequest } from "@/lib/sameOrigin";

/**
 * JSON-RPC proxy the browser uses for both chains.
 *
 * Why not call the nodes directly from the browser: Robinhood Chain's public
 * RPC sends a malformed CORS header (`Access-Control-Allow-Origin: *,*`), so
 * browsers refuse it outright; and the private Base/Alchemy endpoints are
 * origin-allowlisted, which breaks any host that isn't vaults.cash (previews,
 * local dev on a different port). Server-side we send the allowlisted Origin
 * and keep the keys out of the bundle.
 *
 * Guardrails (the source is public, so assume people read this): same-site
 * browsers only, read-only methods only, bounded batch size. Nothing in the
 * app sends transactions here — those go through the bundler.
 */
const READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
  "eth_getBalance",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "net_version",
]);
const MAX_BATCH = 50;

export async function POST(req: NextRequest, ctx: { params: Promise<{ chainId: string }> }) {
  const chainId = Number((await ctx.params).chainId);
  if (!isChainId(chainId)) return NextResponse.json({ error: "unsupported chain" }, { status: 400 });
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0 || items.length > MAX_BATCH) return NextResponse.json({ error: "bad batch size" }, { status: 400 });
  for (const it of items) {
    const method = typeof it === "object" && it !== null ? (it as { method?: unknown }).method : undefined;
    if (typeof method !== "string" || !READ_METHODS.has(method)) {
      return NextResponse.json({ error: `method not allowed: ${String(method)}` }, { status: 403 });
    }
  }

  try {
    const upstream = await fetch(serverRpcUrl(chainId), {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "https://vaults.cash" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
