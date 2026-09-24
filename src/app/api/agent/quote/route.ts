import { NextResponse, type NextRequest } from "next/server";
import { parseUnits } from "viem";
import { AgentError, requireMarket } from "@/lib/agent";
import { CHAINS } from "@/lib/chain";
import { getPoolState } from "@/lib/onchain";
import { buildZapPlan, type RangePreset } from "@/lib/zap";

/**
 * GET /api/agent/quote?market=base/eth-usdc&amountUsd=100&preset=balanced[&widthPct=10]
 * Read-only: how a deposit would split, without executing anything. Builds
 * the same plan the UI would (quotes included) and reports its numbers.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const market = requireMarket(q.get("market"));
    const amountUsd = Number(q.get("amountUsd"));
    if (!Number.isFinite(amountUsd) || amountUsd <= 0)
      throw new AgentError(400, "amountUsd must be a positive number");
    const preset = (q.get("preset") ?? "full") as RangePreset;
    if (!["full", "balanced", "aggressive"].includes(preset))
      throw new AgentError(400, "preset must be full | balanced | aggressive");
    const widthPct = q.get("widthPct") ? Number(q.get("widthPct")) : undefined;

    const stable = CHAINS[market.chainId].quote;
    const poolState = await getPoolState(market);
    const plan = await buildZapPlan({
      market,
      owner: "0x1111111111111111111111111111111111111111",
      usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
      preset,
      customWidth: widthPct !== undefined ? widthPct / 100 : undefined,
      slippageBps: 100,
      poolState,
    });

    return NextResponse.json({
      market: market.slug,
      chainId: market.chainId,
      stablecoin: stable.symbol,
      price: plan.price,
      quoteUsd: plan.quoteUsd,
      priceUsd: plan.price * plan.quoteUsd,
      tick: poolState.tick,
      tickLower: plan.tickLower,
      tickUpper: plan.tickUpper,
      fee: plan.feeAmount.toString(),
      quoteLeg: plan.quoteLeg ? { stableIn: plan.quoteLeg.stableIn.toString(), quoteOutMin: plan.quoteLeg.quoteOutMin.toString() } : null,
      swapInQuote: plan.swapIn.toString(),
      minBaseOut: plan.swapOutMin.toString(),
      quoteToPosition: plan.quoteToPosition.toString(),
      note: `Raw integer units (${stable.symbol} ${stable.decimals} decimals; base ${market.base.decimals}; quote ${market.quote.decimals}). POST /api/agent/zap-plan to get executable calls.`,
    });
  } catch (e) {
    if (e instanceof AgentError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
