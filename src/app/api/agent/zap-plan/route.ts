import { NextResponse, type NextRequest } from "next/server";
import { parseUnits } from "viem";
import { AGENT_DOCS, AgentError, requireMarket, requireOwner, serializeCalls } from "@/lib/agent";
import { CHAINS } from "@/lib/chain";
import { getPoolState } from "@/lib/onchain";
import { buildZapPlan, type RangePreset } from "@/lib/zap";
import { fetchPositions } from "@/lib/positions";
import { referrerWalletForCode } from "@/lib/referral";

/**
 * POST /api/agent/zap-plan
 * body: { market, amountUsd, owner, preset?, widthPct?, slippageBps?, ref?, tokenId? }
 * Returns the executable call batch that converts `amountUsd` of the chain's
 * stablecoin (held by `owner`) into a Uniswap v4 LP position owned by
 * `owner`. With `tokenId`, adds to that existing position (its range) instead
 * of minting. `ref` = referral code whose wallet gets half the fee on-chain.
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

    const stable = CHAINS[market.chainId].quote;
    let addTo: { tokenId: bigint; tickLower: number; tickUpper: number } | undefined;
    if (body.tokenId !== undefined) {
      const tokenId = BigInt(body.tokenId);
      const position = (await fetchPositions(owner)).find((p) => p.tokenId === tokenId && p.market.slug === market.slug);
      if (!position) throw new AgentError(404, `No live position ${tokenId} owned by ${owner} in ${market.slug}`);
      addTo = { tokenId, tickLower: position.tickLower, tickUpper: position.tickUpper };
    }
    const [poolState, referrer] = await Promise.all([getPoolState(market), referrerWalletForCode(body.ref, owner)]);
    const plan = await buildZapPlan({
      market,
      owner,
      usdcAmount: parseUnits(amountUsd.toFixed(stable.decimals), stable.decimals),
      preset,
      customWidth: body.widthPct !== undefined ? Number(body.widthPct) / 100 : undefined,
      slippageBps,
      poolState,
      addTo,
      referrer,
    });

    return NextResponse.json({
      chainId: plan.chainId,
      market: market.slug,
      stablecoin: stable.symbol,
      addTo: addTo ? addTo.tokenId.toString() : null,
      referrer,
      calls: serializeCalls(plan.calls),
      summary: {
        fee: plan.feeAmount.toString(),
        quoteLeg: plan.quoteLeg ? { stableIn: plan.quoteLeg.stableIn.toString(), quoteOutMin: plan.quoteLeg.quoteOutMin.toString() } : null,
        swapInQuote: plan.swapIn.toString(),
        minBaseOut: plan.swapOutMin.toString(),
        quoteToPosition: plan.quoteToPosition.toString(),
        priceUsd: plan.price * plan.quoteUsd,
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
