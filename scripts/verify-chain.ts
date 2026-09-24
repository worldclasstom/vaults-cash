/**
 * Phase 0 ground-truth verification for vaults.cash, per chain.
 *
 * Verifies against the chain's RPC:
 *  1. chain id
 *  2. Uniswap v4 + Permit2 contracts have bytecode at the documented addresses
 *     (Uniswap warns addresses differ per chain — never assume)
 *  3. quote stablecoin + candidate asset tokens (symbol/decimals/supply read on-chain)
 *  4. discovers live pools via GeckoTerminal + confirms v4 pools on-chain (StateView)
 *
 * Writes src/lib/registries/<chain>.json — the only source of addresses the
 * app may use for that chain.
 *
 * Run: npx tsx scripts/verify-chain.ts --chain base
 *      npx tsx scripts/verify-chain.ts --chain robinhood
 *
 * Adding a market = add its token address to the chain's CANDIDATES here,
 * re-run, then list it in src/lib/markets.ts. A wrong address surfaces as a
 * symbol mismatch, never a silent bad market.
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
import { CHAINS, type ChainId } from "../src/lib/chain";

type ChainSpec = {
  chainId: ChainId;
  file: string;
  /** private RPC env var; public fallback otherwise */
  rpc: string;
  candidates: Record<string, string>;
};

const SPECS: Record<string, ChainSpec> = {
  base: {
    chainId: 8453,
    file: "base.json",
    // mainnet.base.org rate-limits hard on a scan this size — use the CDP RPC
    // (BASE_RPC_URL in .env.local), falling back to a public node.
    // NOTE: the CDP key has a domain allowlist, so origin-less requests are
    // REJECTED (same trap Alchemy sprang on us) — an explicit Origin is sent.
    rpc: process.env.BASE_RPC_URL || "https://base-rpc.publicnode.com",
    /** Crypto only: no tokenized equities on this product. */
    candidates: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      WETH: "0x4200000000000000000000000000000000000006",
      cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      cbXRP: "0xcb585250f852C6c6bf90434AB21A00f02833a4af",
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
    },
  },
  robinhood: {
    chainId: 4663,
    file: "robinhood.json",
    rpc: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
    /** Official token registry from docs.robinhood.com/chain/contracts.
     *  Stock tokens are scanned so the registry knows their pools, but only
     *  crypto markets are listed (see markets.ts). */
    candidates: {
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
      USO: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
    },
  },
};

const argChain = process.argv[process.argv.indexOf("--chain") + 1];
const spec = SPECS[argChain ?? ""];
if (!spec) {
  console.error(`usage: npx tsx scripts/verify-chain.ts --chain <${Object.keys(SPECS).join("|")}>`);
  process.exit(2);
}
const cfg = CHAINS[spec.chainId];
const UNISWAP = cfg.uniswap;
const QUOTE = cfg.quote.symbol;

const client = createPublicClient({
  chain: cfg.chain,
  transport: http(spec.rpc, {
    batch: true,
    retryCount: 5,
    retryDelay: 700,
    timeout: 30_000,
    fetchOptions: { headers: { Origin: "https://vaults.cash" } },
  }),
});

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

/** The candidate key IS the expected symbol — guards against a wrong
 *  address quietly resolving to some other token. */
async function checkToken(label: string, address: string) {
  const addr = getAddress(address);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: addr, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: addr, abi: erc20Abi, functionName: "totalSupply" }),
  ]);
  if (symbol.toLowerCase() !== label.toLowerCase()) {
    fail(label, `SYMBOL MISMATCH: expected ${label}, chain says ${symbol} @ ${addr}`);
    return null;
  }
  ok(label, `${name} (${symbol}), ${decimals} dec`);
  return { address: addr, name, symbol, decimals, totalSupply: totalSupply.toString() };
}

async function main() {
  console.log(`\n— 1. Chain (${cfg.chain.name}) —`);
  const chainId = await client.getChainId();
  if (chainId === spec.chainId) ok(`chain id ${spec.chainId} (${cfg.chain.name})`);
  else fail(`chain id mismatch: ${chainId}`);
  ok("RPC live", `block ${await client.getBlockNumber()}`);

  console.log(`\n— 2. Uniswap v4 contracts on ${cfg.chain.name} —`);
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
    if (code && code.length > 2) ok(label, addr);
    else fail(`${label} has NO code`, addr);
  }

  console.log("\n— 3. Tokens —");
  const tokens: Record<string, NonNullable<Awaited<ReturnType<typeof checkToken>>>> = {};
  for (const [label, addr] of Object.entries(spec.candidates)) {
    try {
      const t = await checkToken(label, addr);
      if (t) tokens[label] = t;
    } catch (e) {
      fail(label, `read failed at ${addr}: ${(e as Error).message.slice(0, 100)}`);
    }
  }
  if (!tokens[QUOTE]) fail(`quote token ${QUOTE} missing`);
  else if (tokens[QUOTE].address.toLowerCase() !== cfg.quote.address.toLowerCase())
    fail(`quote token ${QUOTE} address differs from chain.ts`, tokens[QUOTE].address);

  console.log(`\n— 4. Pool discovery (GeckoTerminal, network=${cfg.gecko}) —`);
  const discovered: Array<{
    geckoAddress: string;
    name: string;
    dex: string;
    reserveUsd: number;
    volume24hUsd: number;
  }> = [];
  for (const page of [1, 2]) {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${cfg.gecko}/pools?page=${page}&include=dex`,
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
  // probe every token vs native ETH and vs the quote stablecoin, all tiers
  const quoteAddr = tokens[QUOTE]?.address;
  const pairsToProbe: Array<[string, string, string]> = [];
  if (quoteAddr) pairsToProbe.push([`ETH/${QUOTE}`, zeroAddress, quoteAddr]);
  for (const [sym, t] of Object.entries(tokens)) {
    if (sym === QUOTE) continue;
    pairsToProbe.push([`${sym}/ETH`, t.address, zeroAddress]);
    if (quoteAddr) pairsToProbe.push([`${sym}/${QUOTE}`, t.address, quoteAddr]);
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
    chainId: spec.chainId,
    verified: failures === 0,
    uniswap: UNISWAP,
    tokens,
    v4Pools: confirmedPools,
    geckoTopPools: discovered.slice(0, 25),
  };
  const out = join(import.meta.dirname, "../src/lib/registries", spec.file);
  writeFileSync(out, JSON.stringify(registry, null, 2));
  console.log(`  wrote ${out}`);
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED — registry marked unverified`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
