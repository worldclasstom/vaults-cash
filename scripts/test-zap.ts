/**
 * Dry-run of the zap engine against live mainnet state, across all listed
 * markets and presets. Builds full call batches; sends nothing.
 * Run: npx tsx scripts/test-zap.ts
 */
import { formatUnits } from "viem";
import { MARKETS, USDC } from "../src/lib/markets";
import { getPoolState, tickToUsdcPrice } from "../src/lib/onchain";
import { buildZapPlan, planSummary } from "../src/lib/zap";
import { buildWithdrawPlan } from "../src/lib/withdraw";

let failures = 0;

async function main() {
  for (const market of MARKETS) {
    const poolState = await getPoolState(market);
    const price = tickToUsdcPrice(market, poolState.tick);
    console.log(
      `\n=== ${market.symbol} (${market.pool.fee / 10_000}% pool, asset=${market.assetIsCurrency0 ? "c0" : "c1"}) — $${price.toFixed(2)} ===`,
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
        const s = planSummary(plan, price, market.tokenDecimals);
        console.log(
          `  ${preset.padEnd(9)} ticks [${plan.tickLower}, ${plan.tickUpper}] ` +
            `swap ${formatUnits(plan.swapIn, USDC.decimals)} USDC -> ≥${Number(formatUnits(plan.swapOutMin, market.tokenDecimals)).toFixed(6)} ${market.symbol} ` +
            `| ~$${s.assetUsd.toFixed(2)} + $${s.usdcUsd.toFixed(2)} | ${plan.calls.length} calls`,
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
        `  withdraw  ${plan.calls.length} calls, assetOutMin ${Number(formatUnits(plan.assetOutMin, market.tokenDecimals)).toFixed(6)} ${market.symbol}, ` +
          `usdcOutMin ${formatUnits(plan.usdcOutMin, 6)}, fee ${formatUnits(plan.feeAmount, 6)}`,
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
