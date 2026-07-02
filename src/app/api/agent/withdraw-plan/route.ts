import { NextResponse, type NextRequest } from "next/server";
import { AGENT_DOCS, AgentError, requireOwner, serializeCalls } from "@/lib/agent";
import { fetchPositions } from "@/lib/positions";
import { buildWithdrawPlan } from "@/lib/withdraw";

/**
 * POST /api/agent/withdraw-plan
 * body: { owner, tokenId, slippageBps? }
 * Returns calls that burn the position and convert everything back to USDG.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => {
      throw new AgentError(400, "Body must be JSON");
    });
    const owner = requireOwner(body.owner);
    const tokenId = BigInt(body.tokenId ?? 0);
    if (tokenId <= 0n) throw new AgentError(400, "tokenId required");
    const slippageBps = Number(body.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 1000)
      throw new AgentError(400, "slippageBps must be an integer between 10 and 1000");

    const positions = await fetchPositions(owner);
    const position = positions.find((p) => p.tokenId === tokenId);
    if (!position)
      throw new AgentError(404, `No live position ${tokenId} owned by ${owner} in listed markets`);

    const plan = await buildWithdrawPlan({ position, slippageBps });
    return NextResponse.json({
      chainId: 4663,
      market: position.market.symbol,
      calls: serializeCalls(plan.calls),
      summary: {
        minAssetOut: plan.assetOutMin.toString(),
        minUsdgFromSwap: plan.usdgOutMin.toString(),
        feeUsdg: plan.feeAmount.toString(),
      },
      docs: AGENT_DOCS,
    });
  } catch (e) {
    if (e instanceof AgentError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
