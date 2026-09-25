/**
 * End-to-end test of the agent REST API with a plain private-key wallet —
 * the "agent brings its own wallet" path, executed the way an EOA has to:
 * one transaction per call, in order, stopping on the first revert.
 *
 *   AGENT_PK=0x… npx tsx scripts/agent-e2e.ts [--api https://vaults.cash] [--market base/eth-usdc] [--amount 6] [--ref CODE] [--dry-run] [--withdraw]
 *
 * Needs the key's address funded on the plan's chain with the stablecoin
 * (≥ $5 + a little) and ETH for gas (~$0.50 is plenty on Base). --dry-run
 * only builds plans. Without --withdraw it stops after the deposit and
 * prints the position; run again with --withdraw to unwind it.
 */
import { createPublicClient, createWalletClient, http, formatUnits, decodeEventLog, parseAbiItem, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, isChainId, type ChainId } from "../src/lib/chain";

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const API = (arg("api", "https://vaults.cash") as string).replace(/\/$/, "");
const MARKET = arg("market", "base/eth-usdc") as string;
const AMOUNT = Number(arg("amount", "6"));
const REF = arg("ref");
const DRY = flag("dry-run");
const WITHDRAW = flag("withdraw");
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

type Call = { to: `0x${string}`; value: string; data: `0x${string}` };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const j = (await res.json()) as T & { error?: string };
  if (!res.ok || j.error) throw new Error(`${path} → ${res.status} ${j.error ?? ""}`);
  return j;
}

async function main() {
  const pk = process.env.AGENT_PK as `0x${string}` | undefined;
  if (!pk) throw new Error("AGENT_PK not set");
  const account = privateKeyToAccount(pk);
  console.log(`agent wallet ${account.address}  api ${API}  market ${MARKET}  $${AMOUNT}${REF ? `  ref ${REF}` : ""}${DRY ? "  (dry run)" : ""}`);

  const positions = await api<{ positions: Array<{ tokenId: string; market: string; chainId: number }> }>(`/api/agent/positions?owner=${account.address}`);
  console.log(`live positions: ${positions.positions.length ? positions.positions.map((p) => `#${p.tokenId} ${p.market}`).join(", ") : "none"}`);

  let plan: { chainId: number; calls: Call[]; summary: Record<string, unknown>; referrer?: string | null; market: string };
  if (WITHDRAW) {
    const p = positions.positions.find((x) => x.market === MARKET);
    if (!p) throw new Error(`no position in ${MARKET} to withdraw`);
    plan = await api(`/api/agent/withdraw-plan`, { owner: account.address, tokenId: p.tokenId, ref: REF });
    console.log(`withdraw plan for #${p.tokenId}: ${plan.calls.length} calls`, plan.summary, `referrer=${plan.referrer}`);
  } else {
    plan = await api(`/api/agent/zap-plan`, { market: MARKET, amountUsd: AMOUNT, owner: account.address, preset: "balanced", ref: REF });
    console.log(`deposit plan: ${plan.calls.length} calls`, plan.summary, `referrer=${plan.referrer}`);
  }
  if (!isChainId(plan.chainId)) throw new Error(`unsupported chainId ${plan.chainId}`);
  const chainId = plan.chainId as ChainId;
  const cfg = CHAINS[chainId];
  const rpc = chainId === 8453 ? "https://mainnet.base.org" : "https://rpc.mainnet.chain.robinhood.com";
  const pub = createPublicClient({ chain: cfg.chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: cfg.chain, transport: http(rpc) });

  const [eth, stable] = await Promise.all([
    pub.getBalance({ address: account.address }),
    pub.readContract({ address: cfg.quote.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
  ]);
  console.log(`balances on ${cfg.label}: ${formatUnits(eth, 18)} ETH, ${formatUnits(stable, cfg.quote.decimals)} ${cfg.quote.symbol}`);
  if (DRY) return console.log("dry run — not sending");
  if (eth === 0n) throw new Error("no ETH for gas");

  const posm = cfg.uniswap.v4.positionManager.toLowerCase();
  for (let i = 0; i < plan.calls.length; i++) {
    const c = plan.calls[i];
    process.stdout.write(`  ${i + 1}/${plan.calls.length} → ${c.to.slice(0, 10)}… `);
    const hash = await wallet.sendTransaction({ to: c.to, value: BigInt(c.value), data: c.data });
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(`${r.status} ${hash}`);
    if (r.status !== "success") throw new Error(`call ${i + 1} reverted — stopping (wallet may hold intermediate tokens)`);
    for (const l of r.logs) {
      if (l.address.toLowerCase() !== posm) continue;
      try {
        const d = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics });
        if (d.eventName === "Transfer") console.log(`     position NFT #${d.args.tokenId} ${d.args.from === "0x0000000000000000000000000000000000000000" ? "minted to" : "moved from"} ${d.args.to}`);
      } catch {}
    }
  }
  const after = await api<{ positions: Array<{ tokenId: string; market: string; inRange: boolean; valueUsd?: number }> }>(`/api/agent/positions?owner=${account.address}`);
  console.log("positions now:", after.positions);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
