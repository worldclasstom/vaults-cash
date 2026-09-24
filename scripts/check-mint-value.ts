// Dry-run: for the native-ETH market, the ETH sent to PositionManager must
// never exceed the swap's guaranteed output. Run: npx tsx --env-file=.env.local scripts/check-mint-value.ts
import { MARKETS } from "../src/lib/markets";
import { getPoolState } from "../src/lib/onchain";
import { buildZapPlan } from "../src/lib/zap";

async function main() {
  const m = MARKETS.find((x) => x.symbol === "ETH")!;
  const ps = await getPoolState(m);
  for (const preset of ["full", "balanced", "aggressive"] as const) {
    const plan = await buildZapPlan({ market: m, owner: "0x789224Be05F24A743D2aE1C1204Ff9701160Ff82", usdcAmount: 6_000_000n, preset, slippageBps: 100, poolState: ps });
    const mint = plan.calls.find((c) => c.value > 0n)!;
    console.log(`${preset.padEnd(10)} swapOutMin ${plan.swapOutMin} | mint value ${mint.value} | ok: ${mint.value <= plan.swapOutMin}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
