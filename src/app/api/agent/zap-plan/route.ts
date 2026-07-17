import { NextResponse, type NextRequest } from "next/server";
import { parseUnits } from "viem";
import { AGENT_DOCS, AgentError, requireMarket, requireOwner, serializeCalls } from "@/lib/agent";
import { USDC } from "@/lib/markets";
import { getPoolState } from "@/lib/onchain";
import { buildZapPlan, type RangePreset } from "@/lib/zap";

/**
 * POST /api/agent/zap-plan
 * body: { market, amountUsd, owner, preset?, widthPct?, slippageBps? }
 * Returns the executable call batch that converts `amountUsd` USDC (held by
 * `owner`) into a Uniswap v4 LP position owned by `owner`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => {
      throw new AgentError(400, "Body must be JSON");
    });
    const market = requireMarket(body.market ?? null);
    const owner = requireOwner(body.owner);
    const amountUsd = Number(body.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0)
      throw new AgentError(400, "amountUsd must be a positive number");
    const preset = (body.preset ?? "full") as RangePreset;
    if (!["full", "balanced", "aggressive"].includes(preset))
      throw new AgentError(400, "preset must be full | balanced | aggressive");
    const slippageBps = Number(body.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 1000)
      throw new AgentError(400, "slippageBps must be an integer between 10 and 1000");

    const poolState = await getPoolState(market);
    const plan = await buildZapPlan({
      market,
      owner,
      usdcAmount: parseUnits(amountUsd.toFixed(USDC.decimals), USDC.decimals),
      preset,
      customWidth: body.widthPct !== undefined ? Number(body.widthPct) / 100 : undefined,
      slippageBps,
      poolState,
    });

    return NextResponse.json({
      chainId: 8453,
      market: market.symbol,
      calls: serializeCalls(plan.calls),
      summary: {
        feeUsdc: plan.feeAmount.toString(),
        swapInUsdc: plan.swapIn.toString(),
        minAssetOut: plan.swapOutMin.toString(),
        usdcToPosition: plan.usdcToPosition.toString(),
        tickLower: plan.tickLower,
        tickUpper: plan.tickUpper,
      },
      docs: AGENT_DOCS,
    });
  } catch (e) {
    if (e instanceof AgentError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
