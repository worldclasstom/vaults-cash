/**
 * Dry-run of the zap engine against live mainnet state. Builds the full call
 * batch for a hypothetical deposit and simulates it via eth_call from a
 * throwaway address funded with state overrides. Sends nothing.
 * Run: npx tsx scripts/test-zap.ts
 */
import { formatUnits } from "viem";
import { MARKETS, USDG } from "../src/lib/markets";
import { getPoolState, tickToUsdgPrice } from "../src/lib/onchain";
import { buildZapPlan, planSummary } from "../src/lib/zap";

async function main() {
  for (const market of MARKETS) {
    console.log(`\n=== ${market.symbol} (${market.pool.fee / 10_000}% pool) ===`);
    const poolState = await getPoolState(market);
    const price = tickToUsdgPrice(market, poolState.tick);
    console.log(`price ${price.toFixed(2)} USDG, tick ${poolState.tick}, liq ${poolState.liquidity}`);

    for (const preset of ["full", "balanced", "aggressive"] as const) {
      const usdgAmount = 100_000_000n; // $100
      const plan = await buildZapPlan({
        market,
        owner: "0x1111111111111111111111111111111111111111",
        usdgAmount,
        preset,
        slippageBps: 100,
        poolState,
      });
      const s = planSummary(plan, price, market.tokenDecimals);
      console.log(
        `  ${preset.padEnd(10)} ticks [${plan.tickLower}, ${plan.tickUpper}] ` +
          `swap ${formatUnits(plan.swapIn, USDG.decimals)} USDG -> ≥${formatUnits(plan.swapOutMin, market.tokenDecimals)} ${market.symbol} ` +
          `| position ~$${s.assetUsd.toFixed(2)} + $${s.usdgUsd.toFixed(2)}, fee $${s.feeUsd.toFixed(2)} | ${plan.calls.length} calls`,
      );
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});

// withdraw-path dry run with a synthetic position (validates encode + reverse quote)
import { buildWithdrawPlan } from "../src/lib/withdraw";
async function testWithdraw() {
  const market = MARKETS.find((m) => m.symbol === "ETH")!;
  const state = await getPoolState(market);
  const plan = await buildWithdrawPlan({
    position: {
      tokenId: 1n,
      market,
      tickLower: Math.floor((state.tick - 3000) / 10) * 10,
      tickUpper: Math.ceil((state.tick + 3000) / 10) * 10,
      liquidity: 10_000_000_000_000n,
    },
    slippageBps: 100,
  });
  console.log(
    `\nwithdraw dry-run: ${plan.calls.length} calls, assetOutMin ${formatUnits(plan.assetOutMin, 18)} ETH, ` +
      `usdgOutMin ${formatUnits(plan.usdgOutMin, 6)} USDG, fee ${formatUnits(plan.feeAmount, 6)} USDG`,
  );
}
testWithdraw().catch((e) => {
  console.error("WITHDRAW FAILED:", e);
  process.exit(1);
});
