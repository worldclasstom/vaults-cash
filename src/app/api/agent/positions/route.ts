import { NextResponse, type NextRequest } from "next/server";
import { AgentError, requireOwner } from "@/lib/agent";
import { getPoolState, tickToUsdcPrice } from "@/lib/onchain";
import { fetchPositions } from "@/lib/positions";

/** GET /api/agent/positions?owner=0x… — live LP positions for a wallet. */
export async function GET(req: NextRequest) {
  try {
    const owner = requireOwner(req.nextUrl.searchParams.get("owner"));
    const positions = await fetchPositions(owner);
    const views = await Promise.all(
      positions.map(async (p) => {
        const state = await getPoolState(p.market);
        return {
          tokenId: p.tokenId.toString(),
          market: p.market.symbol,
          tickLower: p.tickLower,
          tickUpper: p.tickUpper,
          liquidity: p.liquidity.toString(),
          inRange: state.tick >= p.tickLower && state.tick < p.tickUpper,
          currentTick: state.tick,
          priceUsdc: tickToUsdcPrice(p.market, state.tick),
        };
      }),
    );
    return NextResponse.json({ owner, positions: views });
  } catch (e) {
    if (e instanceof AgentError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
