/**
 * Phase 0 ground-truth verification for vaults.cash.
 *
 * Verifies against Robinhood Chain mainnet RPC:
 *  1. chain id
 *  2. Uniswap v4/v3/Permit2 contracts have bytecode
 *  3. USDG + candidate asset tokens (symbol/decimals/supply, ERC-8056 uiMultiplier)
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
import { robinhoodChain, UNISWAP } from "../src/lib/chain";

const client = createPublicClient({ chain: robinhoodChain, transport: http() });

// Candidates from research (2026-07-02). Script confirms or rejects them.
const CANDIDATES = {
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  TSLA: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
} as const;

const uiMultiplierAbi = parseAbi([
  "function uiMultiplier() view returns (uint256)",
]);
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

const TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
  50000: 1000, // observed 5% tier on the TSLA/WETH pool
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
  let uiMultiplier: string | null = null;
  try {
    uiMultiplier = (
      await client.readContract({ address: addr, abi: uiMultiplierAbi, functionName: "uiMultiplier" })
    ).toString();
  } catch {
    /* not an ERC-8056 token */
  }
  ok(label, `${name} (${symbol}), ${decimals} dec, supply ${totalSupply}${uiMultiplier ? `, uiMultiplier ${uiMultiplier}` : ""}`);
  return { address: addr, name, symbol, decimals, totalSupply: totalSupply.toString(), uiMultiplier };
}

async function main() {
  console.log("\n— 1. Chain —");
  const chainId = await client.getChainId();
  chainId === 4663 ? ok("chain id 4663") : fail(`chain id mismatch: ${chainId}`);
  const block = await client.getBlockNumber();
  ok("RPC live", `block ${block}`);

  console.log("\n— 2. Uniswap contracts —");
  const contracts: Record<string, string> = {
    "v4 PoolManager": UNISWAP.v4.poolManager,
    "v4 PositionManager": UNISWAP.v4.positionManager,
    "UniversalRouter": UNISWAP.v4.universalRouter,
    "V4Quoter": UNISWAP.v4.quoter,
    "StateView": UNISWAP.v4.stateView,
    "v3 Factory": UNISWAP.v3.factory,
    "v3 PositionManager": UNISWAP.v3.positionManager,
    "Permit2": UNISWAP.permit2,
  };
  for (const [label, addr] of Object.entries(contracts)) {
    const code = await client.getCode({ address: getAddress(addr) });
    code && code.length > 2 ? ok(label, addr) : fail(`${label} has NO code`, addr);
  }

  console.log("\n— 3. Tokens —");
  const tokens: Record<string, Awaited<ReturnType<typeof checkToken>>> = {};
  for (const [label, addr] of Object.entries(CANDIDATES)) {
    try {
      tokens[label] = await checkToken(label, addr);
    } catch (e) {
      fail(label, `read failed at ${addr}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  console.log("\n— 4. Pool discovery (GeckoTerminal, network=robinhood) —");
  const discovered: Array<{
    geckoAddress: string;
    name: string;
    dex: string;
    reserveUsd: number;
    volume24hUsd: number;
    baseToken: string;
    quoteToken: string;
  }> = [];
  for (const page of [1, 2]) {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=${page}&include=base_token,quote_token,dex`,
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
        baseToken: (p.relationships?.base_token?.data?.id ?? "").replace("robinhood_", ""),
        quoteToken: (p.relationships?.quote_token?.data?.id ?? "").replace("robinhood_", ""),
      });
    }
  }
  ok(`fetched ${discovered.length} pools`);
  for (const p of discovered.slice(0, 15)) {
    console.log(
      `     ${p.name.padEnd(24)} ${p.dex.padEnd(16)} $${Math.round(p.reserveUsd).toLocaleString()} tvl, $${Math.round(p.volume24hUsd).toLocaleString()} 24h`,
    );
  }

  // Try to identify WETH from discovered pools (token paired in "WETH / x" names)
  const wethPool = discovered.find((p) => /WETH/i.test(p.name));
  let wethAddr: string | null = null;
  if (wethPool) {
    const parts = [wethPool.baseToken, wethPool.quoteToken];
    const idx = wethPool.name.trim().toUpperCase().startsWith("WETH") ? 0 : 1;
    wethAddr = parts[idx] || null;
  }
  if (wethAddr) {
    try {
      tokens["WETH"] = await checkToken("WETH (discovered)", wethAddr);
    } catch {
      fail("WETH readback", wethAddr);
      wethAddr = null;
    }
  } else fail("WETH not found in GeckoTerminal pools");

  console.log("\n— 5. On-chain v4 pool confirmation (StateView) —");
  const confirmedPools: Array<{
    poolId: string;
    pair: string;
    fee: number;
    tickSpacing: number;
    tick: number;
    liquidity: string;
  }> = [];
  const pairsToProbe: Array<[string, string, string]> = [];
  if (tokens.USDG && tokens.WETH) pairsToProbe.push(["WETH/USDG", tokens.WETH.address, tokens.USDG.address]);
  if (tokens.TSLA && tokens.WETH) pairsToProbe.push(["WETH/TSLA", tokens.WETH.address, tokens.TSLA.address]);
  if (tokens.TSLA && tokens.USDG) pairsToProbe.push(["TSLA/USDG", tokens.TSLA.address, tokens.USDG.address]);
  // v4 pools commonly use native ETH (currency0 = address(0)) instead of WETH
  if (tokens.USDG) pairsToProbe.push(["ETH/USDG", zeroAddress, tokens.USDG.address]);
  if (tokens.TSLA) pairsToProbe.push(["ETH/TSLA", zeroAddress, tokens.TSLA.address]);
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
    chainId: 4663,
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
