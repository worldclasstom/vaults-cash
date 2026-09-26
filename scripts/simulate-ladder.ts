/**
 * Dry-run a Targets ladder exactly as the app would send it:
 *   npx tsx scripts/simulate-ladder.ts robinhood/tsla-usdg 0xOWNER 10 up 420 4
 * Builds the plan, prepends the gas-token approval, and simulates every call
 * from the owner's wallet via eth_simulateV1. Prints the rung table too.
 */
import { parseUnits, toHex } from "viem";
import { CHAINS, type ChainId } from "../src/lib/chain";
import { marketBySlug, sharePrice } from "../src/lib/markets";
import { getPoolState } from "../src/lib/onchain";
import { buildLadderPlan, type Direction } from "../src/lib/targets";
import { withGasTokenApproval } from "../src/lib/gasToken";

async function main() {
  const [slug, owner, usd = "10", direction = "up", target, rungs = "4"] = process.argv.slice(2);
  const market = marketBySlug(slug!);
  if (!market || !owner) throw new Error("usage: simulate-ladder.ts <slug> <owner> <usd> <up|down> <targetUsd> [rungs]");
  const chainId = market.chainId as ChainId;
  const cfg = CHAINS[chainId];
  const url = `https://${cfg.alchemy}.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const poolState = await getPoolState(market);
  const plan = await buildLadderPlan({
    market,
    owner: owner as `0x${string}`,
    usdcAmount: parseUnits(usd, cfg.quote.decimals),
    direction: direction as Direction,
    targetPriceUsd: Number(target) / (market.base.uiMultiplier || 1),
    rungs: Number(rungs),
    slippageBps: 100,
    poolState,
  });
  const mult = market.base.uiMultiplier || 1;
  console.log(`${slug} ${direction} → $${target}: now $${sharePrice(market, plan.priceNow).toFixed(2)}, invested $${plan.investedUsd.toFixed(2)}, if hit $${plan.ifHitUsd.toFixed(2)}, holds ${plan.baseHeld.toFixed(5)} ${market.base.symbol}`);
  for (const r of plan.rungs) console.log(`  rung ${r.idx}: $${(r.priceLow * mult).toFixed(2)}–$${(r.priceHigh * mult).toFixed(2)} ticks ${r.tickLower}..${r.tickUpper} holds $${r.amountUsd.toFixed(2)} → $${r.ifCrossedUsd.toFixed(2)}`);
  const calls = withGasTokenApproval(chainId, plan.calls);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://vaults.cash" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_simulateV1", params: [{ blockStateCalls: [{ calls: calls.map((c) => ({ from: owner, to: c.to, value: toHex(c.value), data: c.data })) }], validation: false }, "latest"] }),
  });
  const sim = (await res.json()) as { error?: unknown; result?: Array<{ calls: Array<{ status: string; gasUsed: string; error?: unknown }> }> };
  if (sim.error || !sim.result) throw new Error("simulateV1: " + JSON.stringify(sim.error).slice(0, 300));
  let ok = true;
  sim.result[0].calls.forEach((r, i) => {
    if (r.status !== "0x1") ok = false;
    console.log(`  ${i}: ${calls[i].to.slice(0, 10)} ${calls[i].data.slice(0, 10)} status=${r.status} gas=${parseInt(r.gasUsed, 16)} ${r.error ? JSON.stringify(r.error).slice(0, 160) : ""}`);
  });
  console.log(ok ? "ALL CALLS PASS" : "A CALL REVERTED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
