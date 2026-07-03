import { NextResponse, type NextRequest } from "next/server";
import { parseUnits } from "viem";
import { AgentError, requireMarket } from "@/lib/agent";
import { USDG } from "@/lib/markets";
import { getPoolState, tickToUsdgPrice } from "@/lib/onchain";
import { presetTicks, quoteUsdgToAsset, swapShare, type RangePreset } from "@/lib/zap";

/**
 * GET /api/agent/quote?market=ETH&amountUsd=100&preset=balanced[&widthPct=10]
 * Read-only: how a deposit would split, without building calls.
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

    const state = await getPoolState(market);
    const { tickLower, tickUpper } = presetTicks(
      market,
      state.tick,
      preset,
      widthPct !== undefined ? widthPct / 100 : undefined,
    );
    const amount = parseUnits(amountUsd.toFixed(USDG.decimals), USDG.decimals);
    const feeBps = BigInt(process.env.NEXT_PUBLIC_FEE_BPS ?? "30");
    const net = amount - (amount * feeBps) / 10_000n;
    const share = swapShare(state.tick, tickLower, tickUpper, market.assetIsCurrency0);
    const swapIn = (net * BigInt(Math.round(share * 1_000_000))) / 1_000_000n;
    const { amountOut } =
      swapIn > 0n ? await quoteUsdgToAsset(market, swapIn) : { amountOut: 0n };

    return NextResponse.json({
      market: market.symbol,
      priceUsdg: tickToUsdgPrice(market, state.tick),
      tick: state.tick,
      tickLower,
      tickUpper,
      feeUsdg: ((amount * feeBps) / 10_000n).toString(),
      swapInUsdg: swapIn.toString(),
      estAssetOut: amountOut.toString(),
      usdgKept: (net - swapIn).toString(),
      note: "Amounts are raw integer units (USDG 6 decimals). POST /api/agent/zap-plan to get executable calls.",
    });
  } catch (e) {
    if (e instanceof AgentError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
