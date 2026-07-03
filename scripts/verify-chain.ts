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

// Official token registry from docs.robinhood.com/chain/contracts (2026-07-02).
const CANDIDATES = {
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  TSLA: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  AMD: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC",
  AMZN: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
  BABA: "0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4",
  BE: "0x822CC93fFD030293E9842c30BBD678F530701867",
  COIN: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b",
  CRCL: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5",
  CRWV: "0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3",
  GOOGL: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3",
  INTC: "0xc72b96e0E48ecd4DC75E1e45396e26300BC39681",
  META: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
  MSFT: "0xe93237C50D904957Cf27E7B1133b510C669c2e74",
  MU: "0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD",
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  ORCL: "0xb0992820E760d836549ba69BC7598b4af75dEE03",
  PLTR: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A",
  SNDK: "0xB90A19fF0Af67f7779afF50A882A9CfF42446400",
  SPCX: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
  USAR: "0xd917B029C761D264c6A312BBbcDA868658eF86a6",
  QQQ: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68",
  SGOV: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5",
  SLV: "0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f",
  SPY: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
  CUSO: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
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
  // probe every asset vs USDG and vs native ETH across all fee tiers
  const pairsToProbe: Array<[string, string, string]> = [];
  if (tokens.USDG) pairsToProbe.push(["ETH/USDG", zeroAddress, tokens.USDG.address]);
  for (const [sym, t] of Object.entries(tokens)) {
    if (sym === "USDG") continue;
    if (tokens.USDG) pairsToProbe.push([`${sym}/USDG`, t.address, tokens.USDG.address]);
    pairsToProbe.push([`ETH/${sym}`, zeroAddress, t.address]);
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
