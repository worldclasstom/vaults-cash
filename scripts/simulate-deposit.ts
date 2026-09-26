/**
 * Dry-run a deposit exactly as the app would send it, without a wallet:
 * builds the zap plan for a market, prepends the gas-token approval when the
 * chain charges gas in its stablecoin, and runs every call in order from the
 * owner's smart wallet through eth_simulateV1. Prints per-call status so a
 * reverting step is obvious before anyone signs.
 *
 *   npx tsx scripts/simulate-deposit.ts robinhood/tsla-usdg 0xOWNER 10.25 [preset]
 *
 * Needs ALCHEMY_API_KEY (and NEXT_PUBLIC_FEE_RECIPIENT etc.) in the env.
 */
import { parseUnits, toHex } from "viem";
import { CHAINS, type ChainId } from "../src/lib/chain";
import { marketBySlug } from "../src/lib/markets";
import { getPoolState } from "../src/lib/onchain";
import { buildZapPlan, type RangePreset } from "../src/lib/zap";
import { withGasTokenApproval } from "../src/lib/gasToken";

async function main() {
const [slug, owner, usd = "10", preset = "aggressive"] = process.argv.slice(2);
if (!slug || !owner) {
  console.error("usage: simulate-deposit.ts <chain/base-quote> <owner> [usd] [preset]");
  process.exit(2);
}
const market = marketBySlug(slug);
if (!market) throw new Error(`unknown market ${slug}`);
const chainId = market.chainId as ChainId;
const cfg = CHAINS[chainId];
const key = process.env.ALCHEMY_API_KEY;
if (!key) throw new Error("ALCHEMY_API_KEY required");
const url = `https://${cfg.alchemy}.g.alchemy.com/v2/${key}`;

const poolState = await getPoolState(market);
const plan = await buildZapPlan({
  market,
  owner: owner as `0x${string}`,
  usdcAmount: parseUnits(usd, cfg.quote.decimals),
  preset: preset as RangePreset,
  slippageBps: 100,
  poolState,
});
const calls = withGasTokenApproval(chainId, plan.calls);
const res = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", Origin: "https://vaults.cash" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_simulateV1",
    params: [{ blockStateCalls: [{ calls: calls.map((c) => ({ from: owner, to: c.to, value: toHex(c.value), data: c.data })) }], validation: false }, "latest"],
  }),
});
const sim = (await res.json()) as { error?: unknown; result?: Array<{ calls: Array<{ status: string; gasUsed: string; error?: unknown }> }> };
console.log(`${slug}: ${calls.length} calls from ${owner}`);
if (sim.error || !sim.result) {
  console.log("simulateV1 error:", JSON.stringify(sim.error).slice(0, 400));
  process.exit(1);
}
let ok = true;
sim.result[0].calls.forEach((r, i) => {
  if (r.status !== "0x1") ok = false;
  console.log(`  ${i}: ${calls[i].to.slice(0, 10)} ${calls[i].data.slice(0, 10)} status=${r.status} gas=${parseInt(r.gasUsed, 16)} ${r.error ? JSON.stringify(r.error).slice(0, 200) : ""}`);
});
console.log(ok ? "ALL CALLS PASS" : "A CALL REVERTED");
process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
