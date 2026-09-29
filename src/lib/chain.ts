import { defineChain, type Chain } from "viem";
import { base } from "viem/chains";

/** Base mainnet (chain id 8453) — where vaults.cash launched. Real onramp
 *  (Coinbase), deep liquidity, crypto-only markets (no geofence). */
export const baseChain = base;

/** Robinhood Chain (chain id 4663), an Arbitrum Orbit L2. Added back
 *  2026-09: MoonPay ships a USDG onramp to it (2026-07-30) and Privy smart
 *  wallets support it as a custom chain, so one wallet now spans both. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/v2",
    },
  },
});

export type ChainId = typeof baseChain.id | typeof robinhoodChain.id;

export type QuoteToken = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
};

export type ChainConfig = {
  chain: Chain;
  /** short label for UI ("Base", "Robinhood") */
  label: string;
  /** URL segment: /market/<slug>/<symbol> */
  slug: "base" | "robinhood";
  /** Alchemy network prefix for <network>.g.alchemy.com (NFT API) */
  alchemy: string;
  /** the dollar stablecoin every market on this chain is quoted in */
  quote: QuoteToken;
  /** Uniswap v4 deployments per developers.uniswap.org/contracts/v4/deployments.
   *  Uniswap explicitly warns addresses are NOT the same across chains, so
   *  verify-chain.ts asserts bytecode exists at each before the app trusts
   *  them (Permit2 is the one canonical CREATE2 address). */
  uniswap: {
    v4: {
      poolManager: `0x${string}`;
      positionManager: `0x${string}`;
      universalRouter: `0x${string}`;
      quoter: `0x${string}`;
      stateView: `0x${string}`;
    };
    /** Uniswap v3: one contract per pool, WETH not native ETH */
    v3?: V3Contracts;
    permit2: `0x${string}`;
  };
  /** Aerodrome Slipstream (Base): a Uniswap v3 fork keyed by tick spacing */
  aerodrome?: V3Contracts;
  /** Blockscout — used to enumerate a user's v4 position NFTs */
  explorer: { url: string; apiUrl: string };
  /** GeckoTerminal network slug for pool stats */
  gecko: string;
  /** env var (server) / NEXT_PUBLIC_ var (browser) holding a private RPC URL;
   *  falls back to the chain's public RPC when unset */
  rpcEnv: string;
  /** Whether the paymaster configured for this chain in the Privy dashboard
   *  sponsors gas. Base: CDP paymaster ($15/mo free tier). Robinhood: none —
   *  users pay their own (sub-cent) gas from the wallet's ETH. */
  gasSponsored: boolean;
  /** Set when users pay gas in this chain's stablecoin through Alchemy's
   *  ERC-20 paymaster (no ETH needed). `paymaster` is the contract the op
   *  approves; Alchemy reports it from pm_getPaymasterStubData. */
  gasToken?: { policyId: string; paymaster: `0x${string}` };
  /** The Universal Router on this chain was built from a v4-periphery whose
   *  ExactInputSingleParams still carries `sqrtPriceLimitX96` (10 head words).
   *  Verified from successful swaps on Robinhood Chain; the SDK's planner
   *  encodes the newer 9-word struct, which that router rejects. */
  legacySwapParams?: boolean;
};

/** How gas is paid on a chain: by us, in the chain's own dollar, or in ETH. */
export function gasMode(chainId: ChainId): "sponsored" | "token" | "eth" {
  const c = CHAINS[chainId];
  return c.gasSponsored ? "sponsored" : c.gasToken ? "token" : "eth";
}

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export type V3Contracts = {
  factory: `0x${string}`;
  positionManager: `0x${string}`;
  quoter: `0x${string}`;
  swapRouter: `0x${string}`;
  weth: `0x${string}`;
};

export const CHAINS: Record<ChainId, ChainConfig> = {
  8453: {
    chain: baseChain,
    label: "Base",
    slug: "base",
    alchemy: "base-mainnet",
    quote: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
    uniswap: {
      v4: {
        poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
        positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
        universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
        quoter: "0x0d5e0f971ed27fbff6c2837bf31316121532048d",
        stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
      },
      v3: {
        factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        positionManager: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
        quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        swapRouter: "0x2626664c2603336E57B271c5C0b26F421741e481",
        weth: "0x4200000000000000000000000000000000000006",
      },
      permit2: PERMIT2,
    },
    aerodrome: {
      factory: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
      positionManager: "0x827922686190790b37229fd06084350E74485b72",
      quoter: "0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0",
      swapRouter: "0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5",
      weth: "0x4200000000000000000000000000000000000006",
    },
    explorer: { url: "https://base.blockscout.com", apiUrl: "https://base.blockscout.com/api/v2" },
    gecko: "base",
    rpcEnv: "BASE_RPC_URL",
    gasSponsored: process.env.NEXT_PUBLIC_GAS_SPONSORED === "1",
  },
  4663: {
    chain: robinhoodChain,
    label: "Robinhood",
    slug: "robinhood",
    alchemy: "robinhood-mainnet",
    quote: { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", decimals: 6 },
    uniswap: {
      v4: {
        poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
        positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
        universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
        quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
        stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
      },
      v3: {
        factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
        positionManager: "0x73991a25c818bf1f1128deaab1492d45638de0d3",
        quoter: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
        swapRouter: "0xcaf681a66d020601342297493863e78c959e5cb2",
        weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      },
      permit2: PERMIT2,
    },
    explorer: {
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/v2",
    },
    gecko: "robinhood",
    rpcEnv: "ROBINHOOD_RPC_URL",
    gasSponsored: false,
    legacySwapParams: true,
    gasToken: process.env.NEXT_PUBLIC_GAS_TOKEN_POLICY_4663
      ? { policyId: process.env.NEXT_PUBLIC_GAS_TOKEN_POLICY_4663, paymaster: "0x00000000000667f27d4db42334ec11a25db7ebb4" }
      : undefined,
  },
};

export const CHAIN_IDS = Object.keys(CHAINS).map(Number) as ChainId[];

export function isChainId(id: number): id is ChainId {
  return id in CHAINS;
}

export function chainConfig(id: number): ChainConfig {
  if (!isChainId(id)) throw new Error(`unsupported chain ${id}`);
  return CHAINS[id];
}

export function chainBySlug(slug: string): ChainConfig | undefined {
  return CHAIN_IDS.map((id) => CHAINS[id]).find((c) => c.slug === slug.toLowerCase());
}

/** Explorer link for a tx / address on a given chain. */
export function explorerUrl(chainId: number, kind: "tx" | "address", value: string) {
  return `${chainConfig(chainId).explorer.url}/${kind}/${value}`;
}

/** The position NFT on the chain's Blockscout explorer. */
export type Venue = "uniswap-v4" | "uniswap-v3" | "aerodrome";
export const VENUE_LABEL: Record<Venue, string> = { "uniswap-v4": "Uniswap v4", "uniswap-v3": "Uniswap v3", aerodrome: "Aerodrome" };

/** The position NFT contract a venue mints on a chain. */
export function positionManagerOf(chainId: number, venue: Venue): `0x${string}` {
  const c = chainConfig(chainId);
  if (venue === "uniswap-v4") return c.uniswap.v4.positionManager;
  const v = venue === "uniswap-v3" ? c.uniswap.v3 : c.aerodrome;
  if (!v) throw new Error(`${VENUE_LABEL[venue]} is not on ${c.label}`);
  return v.positionManager;
}

export function explorerNftUrl(chainId: number, tokenId: bigint, venue: Venue = "uniswap-v4") {
  const c = chainConfig(chainId);
  return `${c.explorer.url}/token/${positionManagerOf(chainId, venue)}/instance/${tokenId}`;
}

/** The same position inside Uniswap's own app — the strongest "you don't
 *  need us" proof there is. Our chain slugs match Uniswap's URL slugs
 *  (checked 2026-09-24: /positions/v4/base/… and /positions/v4/robinhood/…). */
export function uniswapPositionUrl(chainId: number, tokenId: bigint, venue: Venue = "uniswap-v4") {
  if (venue === "aerodrome") return `https://aerodrome.finance/deposit`;
  return `https://app.uniswap.org/positions/${venue === "uniswap-v3" ? "v3" : "v4"}/${chainConfig(chainId).slug}/${tokenId}`;
}
