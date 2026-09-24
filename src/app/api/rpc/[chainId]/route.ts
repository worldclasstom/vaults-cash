import { NextResponse, type NextRequest } from "next/server";
import { isChainId } from "@/lib/chain";
import { serverRpcUrl } from "@/lib/rpc";

/**
 * JSON-RPC proxy the browser uses for both chains.
 *
 * Why not call the nodes directly from the browser: Robinhood Chain's public
 * RPC sends a malformed CORS header (`Access-Control-Allow-Origin: *,*`), so
 * browsers refuse it outright; and the private Base/Alchemy endpoints are
 * origin-allowlisted, which breaks any host that isn't vaults.cash (previews,
 * local dev on a different port). Server-side we send the allowlisted Origin
 * and keep the keys out of the bundle.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ chainId: string }> }) {
  const chainId = Number((await ctx.params).chainId);
  if (!isChainId(chainId)) return NextResponse.json({ error: "unsupported chain" }, { status: 400 });
  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
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
