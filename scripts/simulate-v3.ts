/**
 * Dry-run a v3-style (Uniswap v3 / Aerodrome) deposit AND the withdraw of
 * the position it mints, without a wallet, through eth_simulateV1:
 *
 *   1. build the deposit plan, simulate it from `owner`, decode the minted
 *      tokenId + liquidity from the mint call's return data;
 *   2. build the withdraw plan for that position and simulate deposit +
 *      withdraw back to back in one block.
 *
 *   BASE_RPC_URL=… npx tsx scripts/simulate-v3.ts base/eth-usdc-v3 0xOWNER 25
 *
 * `owner` only needs a stablecoin balance (validation is off, so any rich
 * address works as a stand-in for a smart wallet).
 */
import { decodeFunctionResult, parseAbi, parseUnits, toHex } from "viem";
import { CHAINS, type ChainId } from "../src/lib/chain";
import { marketBySlug } from "../src/lib/markets";
import { getPoolState } from "../src/lib/onchain";
import { buildZapPlan, type RangePreset } from "../src/lib/zap";
import { buildWithdrawPlan } from "../src/lib/withdraw";
import { v3Contracts } from "../src/lib/v3core";
import { serverRpcUrl } from "../src/lib/rpc";

const mintAbi = parseAbi(["function mint(bytes) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"]);

type SimCall = { status: string; gasUsed: string; returnData?: `0x${string}`; error?: { message?: string } };
async function simulate(url: string, owner: string, calls: Array<{ to: string; value: bigint; data: string }>): Promise<SimCall[]> {
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
  const sim = (await res.json()) as { error?: unknown; result?: Array<{ calls: SimCall[] }> };
  if (sim.error || !sim.result) throw new Error(`simulateV1: ${JSON.stringify(sim.error).slice(0, 300)}`);
  return sim.result[0].calls;
}
function report(label: string, calls: Array<{ to: string }>, results: SimCall[]): boolean {
  let ok = true;
  results.forEach((r, i) => {
    const good = r.status === "0x1";
    if (!good) ok = false;
    console.log(`  ${good ? "ok " : "REV"} #${i + 1} → ${calls[i].to.slice(0, 10)}… gas ${parseInt(r.gasUsed, 16)}${good ? "" : ` ${r.error?.message ?? ""}`}`);
  });
  console.log(`${label}: ${ok ? "ALL OK" : "FAILED"}`);
  return ok;
}

async function main() {
  const [slug, owner, usd = "25", preset = "balanced"] = process.argv.slice(2);
  if (!slug || !owner) throw new Error("usage: simulate-v3.ts <chain/base-quote-v3|aero> <owner> [usd] [preset]");
  const market = marketBySlug(slug);
  if (!market) throw new Error(`unknown market ${slug}`);
  const chainId = market.chainId as ChainId;
  const cfg = CHAINS[chainId];
  const url = serverRpcUrl(chainId);
  const poolState = await getPoolState(market);
  console.log(`${slug} on ${market.venue}: tick ${poolState.tick}, liquidity ${poolState.liquidity}`);

  const plan = await buildZapPlan({ market, owner: owner as `0x${string}`, usdcAmount: parseUnits(usd, cfg.quote.decimals), preset: preset as RangePreset, slippageBps: 100, poolState });
  console.log(`deposit: ${plan.calls.length} calls, swapIn ${plan.swapIn}, quoteToPosition ${plan.quoteToPosition}, ticks ${plan.tickLower}..${plan.tickUpper}`);
  const dep = await simulate(url, owner, plan.calls);
  if (!report("deposit", plan.calls, dep)) process.exit(1);

  // the mint is the call to the position manager
  const npm = v3Contracts(chainId, market.venue).positionManager.toLowerCase();
  const mintIdx = plan.calls.findIndex((c) => c.to.toLowerCase() === npm);
  const ret = dep[mintIdx].returnData!;
  const [tokenId, liquidity, amount0, amount1] = decodeFunctionResult({ abi: mintAbi, functionName: "mint", data: ret });
  console.log(`minted tokenId ${tokenId}, liquidity ${liquidity}, amounts ${amount0} / ${amount1}`);

  const position = { tokenId, market, tickLower: plan.tickLower, tickUpper: plan.tickUpper, liquidity };
  const wd = await buildWithdrawPlan({ position, slippageBps: 100, owner: owner as `0x${string}` });
  console.log(`withdraw: ${wd.calls.length} calls, stableOutMin ${wd.stableOutMin} (fee ${wd.feeAmount})`);
  const both = await simulate(url, owner, [...plan.calls, ...wd.calls]);
  const ok = report("deposit+withdraw", [...plan.calls, ...wd.calls], both);
  const inUnits = Number(parseUnits(usd, cfg.quote.decimals));
  console.log(`round trip: put in ${usd} ${cfg.quote.symbol}, guaranteed back ≥ ${(Number(wd.stableOutMin) / 10 ** cfg.quote.decimals).toFixed(4)} (${((Number(wd.stableOutMin) / inUnits) * 100).toFixed(2)}%) before fees on the way out`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
