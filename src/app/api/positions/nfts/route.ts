import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "viem";
import { isChainId } from "@/lib/chain";
import { positionTokenIds } from "@/lib/nfts";

/** GET /api/positions/nfts?chainId=8453&owner=0x… — candidate Uniswap v4
 *  position token ids for a wallet. The browser reads live ownership and
 *  liquidity itself; this only does the indexer lookups that need a server
 *  (origin-allowlisted keys, Cloudflare-fronted explorers). */
export async function GET(req: NextRequest) {
  const chainId = Number(req.nextUrl.searchParams.get("chainId"));
  const owner = req.nextUrl.searchParams.get("owner") ?? "";
  if (!isChainId(chainId)) return NextResponse.json({ error: "unsupported chainId" }, { status: 400 });
  if (!isAddress(owner)) return NextResponse.json({ error: "owner must be a 0x address" }, { status: 400 });
  try {
    const ids = await positionTokenIds(chainId, owner);
    return NextResponse.json(
      { chainId, owner, tokenIds: ids.map(String) },
      { headers: { "cache-control": "private, max-age=5" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
