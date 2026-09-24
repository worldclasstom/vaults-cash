// Dry-run: with a referrer the fee is paid as two stablecoin transfers in the
// same batch (referrer share + ours); without, one. Run:
//   npx tsx --env-file=.env.local scripts/check-referral-split.ts
import { decodeFunctionData, erc20Abi } from "viem";
import { MARKETS } from "../src/lib/markets";
import { getPoolState } from "../src/lib/onchain";
import { buildZapPlan } from "../src/lib/zap";

async function main() {
  const m = MARKETS.find((x) => x.slug === "base/eth-usdc")!;
  const ps = await getPoolState(m);
  const owner = "0x789224Be05F24A743D2aE1C1204Ff9701160Ff82" as const;
  for (const referrer of [null, "0x970481e1000000000000000000000000000000aa" as const, owner]) {
    const plan = await buildZapPlan({ market: m, owner, usdcAmount: 100_000_000n, preset: "balanced", slippageBps: 100, poolState: ps, referrer });
    const transfers = plan.calls
      .filter((c) => c.to.toLowerCase() === m.quote.address.toLowerCase() && c.data.startsWith("0xa9059cbb"))
      .map((c) => { const d = decodeFunctionData({ abi: erc20Abi, data: c.data }); return `${(d.args![0] as string).slice(0, 10)}←${d.args![1]}`; });
    console.log(`referrer=${referrer ? referrer.slice(0, 10) : "none"}: fee ${plan.feeAmount} → ${transfers.join(" + ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
