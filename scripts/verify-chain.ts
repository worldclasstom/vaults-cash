/**
 * Phase 0 ground-truth verification for vaults.cash on Base.
 *
 * Verifies against Base mainnet RPC:
 *  1. chain id 8453
 *  2. Uniswap v4 + Permit2 contracts have bytecode at the documented addresses
 *     (Uniswap warns addresses differ per chain — never assume)
 *  3. USDC + candidate crypto tokens (symbol/decimals/supply read on-chain)
 *  4. discovers live pools via GeckoTerminal + confirms v4 pools on-chain (StateView)
 *
 * Writes src/lib/registry.json — the only source of addresses the app may use.
 * Run: npx tsx scripts/verify-chain.ts
 */
import {
  createPublicClient,
  http,
  erc20Abi,
  keccak256,
  encodeAbiParameters,
  getAddress,
  zeroAddress,
  parseAbi,
} from "viem";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { baseChain, UNISWAP } from "../src/lib/chain";

// mainnet.base.org rate-limits hard on a scan this size — use the CDP RPC
// (BASE_RPC_URL in .env.local), falling back to a public node.
// NOTE: once the CDP key has a domain allowlist, origin-less requests are
// REJECTED (same trap Alchemy sprang on us), so send an explicit Origin.
const RPC = process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com";
const client = createPublicClient({
  chain: baseChain,
  transport: http(RPC, {
    batch: true,
    retryCount: 5,
    retryDelay: 700,
    timeout: 30_000,
    fetchOptions: { headers: { Origin: "https://vaults.cash" } },
  }),
});

/** Candidate Base tokens. Addresses are VERIFIED below by reading symbol/
 *  decimals on-chain — a wrong address surfaces as a symbol mismatch, never a
 *  silent bad market. Crypto only: no tokenized equities on this product. */
const CANDIDATES = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
  wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452",
  rETH: "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c",
  weETH: "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
  LINK: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
  AAVE: "0x63706e401c06ac8513145b7687A14804d17f814b",
  VIRTUAL: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  DEGEN: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
} as const;

/** Expected symbol per candidate — guards against a wrong address quietly
 *  resolving to some other token. */
const EXPECTED_SYMBOL: Record<string, string> = {
  USDC: "USDC",
  WETH: "WETH",
  cbBTC: "cbBTC",
  cbETH: "cbETH",
  wstETH: "wstETH",
  rETH: "rETH",
  weETH: "weETH",
  DAI: "DAI",
  USDT: "USDT",
  EURC: "EURC",
  AERO: "AERO",
  LINK: "LINK",
  AAVE: "AAVE",
  VIRTUAL: "VIRTUAL",
  DEGEN: "DEGEN",
};

const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

const TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

function v4PoolId(tokenA: string, tokenB: string, fee: number): `0x${string}` {
  const [c0, c1] =
    tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [getAddress(c0), getAddress(c1), fee, TICK_SPACING[fee], zeroAddress],
    ),
  );
}

let failures = 0;
function ok(label: string, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail = "") {
  failures++;
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function checkToken(label: string, address: string) {
  const addr = getAddress(address);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: addr, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "totalSupply" }),
  ]);
  const expected = EXPECTED_SYMBOL[label];
  if (expected && symbol.toLowerCase() !== expected.toLowerCase()) {
    fail(label, `SYMBOL MISMATCH: expected ${expected}, chain says ${symbol} @ ${addr}`);
    return null;
  }
  ok(label, `${name} (${symbol}), ${decimals} dec`);
  return { address: addr, name, symbol, decimals, totalSupply: totalSupply.toString() };
}

async function main() {
  console.log("\n— 1. Chain —");
  const chainId = await client.getChainId();
  chainId === 8453 ? ok("chain id 8453 (Base)") : fail(`chain id mismatch: ${chainId}`);
  ok("RPC live", `block ${await client.getBlockNumber()}`);

  console.log("\n— 2. Uniswap v4 contracts on Base —");
  const contracts: Record<string, string> = {
    "v4 PoolManager": UNISWAP.v4.poolManager,
    "v4 PositionManager": UNISWAP.v4.positionManager,
    UniversalRouter: UNISWAP.v4.universalRouter,
    V4Quoter: UNISWAP.v4.quoter,
    StateView: UNISWAP.v4.stateView,
    Permit2: UNISWAP.permit2,
  };
  for (const [label, addr] of Object.entries(contracts)) {
    const code = await client.getCode({ address: getAddress(addr) });
    code && code.length > 2 ? ok(label, addr) : fail(`${label} has NO code`, addr);
  }

  console.log("\n— 3. Tokens —");
  const tokens: Record<string, NonNullable<Awaited<ReturnType<typeof checkToken>>>> = {};
  for (const [label, addr] of Object.entries(CANDIDATES)) {
    try {
      const t = await checkToken(label, addr);
      if (t) tokens[label] = t;
    } catch (e) {
      fail(label, `read failed at ${addr}: ${(e as Error).message.slice(0, 100)}`);
    }
  }

  console.log("\n— 4. Pool discovery (GeckoTerminal, network=base) —");
  const discovered: Array<{
    geckoAddress: string;
    name: string;
    dex: string;
    reserveUsd: number;
    volume24hUsd: number;
  }> = [];
  for (const page of [1, 2]) {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/pools?page=${page}&include=dex`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      fail(`GeckoTerminal page ${page}`, `HTTP ${res.status}`);
      continue;
    }
    const body = await res.json();
    for (const p of body.data ?? []) {
      discovered.push({
        geckoAddress: p.attributes.address,
        name: p.attributes.name,
        dex: p.relationships?.dex?.data?.id ?? "?",
        reserveUsd: Number(p.attributes.reserve_in_usd ?? 0),
        volume24hUsd: Number(p.attributes.volume_usd?.h24 ?? 0),
      });
    }
  }
  ok(`fetched ${discovered.length} pools`);
  for (const p of discovered.slice(0, 12)) {
    console.log(
      `     ${p.name.padEnd(26)} ${p.dex.padEnd(18)} $${Math.round(p.reserveUsd).toLocaleString()} tvl, $${Math.round(p.volume24hUsd).toLocaleString()} 24h`,
    );
  }

  console.log("\n— 5. On-chain v4 pool confirmation (StateView) —");
  const confirmedPools: Array<{
    poolId: string;
    pair: string;
    fee: number;
    tickSpacing: number;
    tick: number;
    liquidity: string;
  }> = [];
  // probe every asset vs USDC, plus native ETH vs USDC
  const pairsToProbe: Array<[string, string, string]> = [];
  if (tokens.USDC) pairsToProbe.push(["ETH/USDC", zeroAddress, tokens.USDC.address]);
  for (const [sym, t] of Object.entries(tokens)) {
    if (sym === "USDC") continue;
    if (tokens.USDC) pairsToProbe.push([`${sym}/USDC`, t.address, tokens.USDC.address]);
  }
  for (const [pair, a, b] of pairsToProbe) {
    for (const fee of Object.keys(TICK_SPACING).map(Number)) {
      const poolId = v4PoolId(a, b, fee);
      try {
        const [slot0, liquidity] = await Promise.all([
          client.readContract({ address: getAddress(UNISWAP.v4.stateView), abi: stateViewAbi, functionName: "getSlot0", args: [poolId] }),
          client.readContract({ address: getAddress(UNISWAP.v4.stateView), abi: stateViewAbi, functionName: "getLiquidity", args: [poolId] }),
        ]);
        const [sqrtPriceX96, tick] = slot0;
        if (sqrtPriceX96 > 0n) {
          ok(`${pair} @ ${fee / 10000}%`, `tick ${tick}, liquidity ${liquidity}`);
          confirmedPools.push({ poolId, pair, fee, tickSpacing: TICK_SPACING[fee], tick: Number(tick), liquidity: liquidity.toString() });
        }
      } catch {
        /* pool not initialized at this tier */
      }
    }
  }
  if (confirmedPools.length === 0) fail("no v4 pools confirmed on-chain");

  console.log("\n— Registry —");
  const registry = {
    generatedAt: new Date().toISOString(),
    chainId: 8453,
    verified: failures === 0,
    uniswap: UNISWAP,
    tokens,
    v4Pools: confirmedPools,
    geckoTopPools: discovered.slice(0, 25),
  };
  const out = join(import.meta.dirname, "../src/lib/registry.json");
  writeFileSync(out, JSON.stringify(registry, null, 2));
  console.log(`  wrote ${out}`);
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED — registry marked unverified`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
