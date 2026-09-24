/**
 * Dry-run of the zap engine against live mainnet state, across all listed
 * markets and presets. Builds full call batches; sends nothing.
 * Run: npx tsx scripts/test-zap.ts
 */
import { formatUnits } from "viem";
import { MARKETS } from "../src/lib/markets";
import { getMarketPricing } from "../src/lib/onchain";
import { buildZapPlan, planSummary } from "../src/lib/zap";
import { buildWithdrawPlan } from "../src/lib/withdraw";

let failures = 0;

async function main() {
  for (const market of MARKETS) {
    const { state: poolState, priceUsd: price } = await getMarketPricing(market);
    console.log(
      `\n=== ${market.slug} (${market.pool.fee / 10_000}% pool, base=${market.baseIsCurrency0 ? "c0" : "c1"}) — $${price.toFixed(2)} ===`,
    );
    for (const preset of ["full", "balanced"] as const) {
      try {
        const plan = await buildZapPlan({
          market,
          owner: "0x1111111111111111111111111111111111111111",
          usdcAmount: 20_000_000n, // $20
          preset,
          slippageBps: 100,
          poolState,
        });
        const s = planSummary(plan, market);
        console.log(
          `  ${preset.padEnd(9)} ticks [${plan.tickLower}, ${plan.tickUpper}] ` +
            `${plan.quoteLeg ? `stable->${market.quote.symbol} ≥${formatUnits(plan.quoteLeg.quoteOutMin, market.quote.decimals)} | ` : ""}swap ${formatUnits(plan.swapIn, market.quote.decimals)} ${market.quote.symbol} -> ≥${Number(formatUnits(plan.swapOutMin, market.base.decimals)).toFixed(6)} ${market.base.symbol} ` +
            `| ~$${s.baseUsd.toFixed(2)} + $${s.quoteUsd.toFixed(2)} | ${plan.calls.length} calls`,
        );
      } catch (e) {
        failures++;
        console.log(`  ${preset.padEnd(9)} FAILED: ${(e as Error).message.split("\n")[0].slice(0, 90)}`);
      }
    }
    // withdraw dry-run with a synthetic in-range position
    try {
      const spacing = market.pool.tickSpacing;
      const plan = await buildWithdrawPlan({
        position: {
          tokenId: 1n,
          market,
          tickLower: Math.floor((poolState.tick - 3 * spacing) / spacing) * spacing,
          tickUpper: Math.ceil((poolState.tick + 3 * spacing) / spacing) * spacing,
          liquidity: poolState.liquidity / 100n > 0n ? poolState.liquidity / 100n : 1_000_000_000n,
        },
        slippageBps: 100,
      });
      console.log(
        `  withdraw  ${plan.calls.length} calls, baseOutMin ${Number(formatUnits(plan.baseOutMin, market.base.decimals)).toFixed(6)} ${market.base.symbol}, ` +
          `stableOutMin ${formatUnits(plan.stableOutMin, 6)}, fee ${formatUnits(plan.feeAmount, 6)}`,
      );
    } catch (e) {
      failures++;
      console.log(`  withdraw  FAILED: ${(e as Error).message.split("\n")[0].slice(0, 90)}`);
    }
  }
  console.log(failures === 0 ? "\nALL MARKETS PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
