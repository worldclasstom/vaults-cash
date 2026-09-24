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
    permit2: `0x${string}`;
  };
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
};

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

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
      permit2: PERMIT2,
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
      permit2: PERMIT2,
    },
    explorer: {
      url: "https://robinhoodchain.blockscout.com",
      apiUrl: "https://robinhoodchain.blockscout.com/api/v2",
    },
    gecko: "robinhood",
    rpcEnv: "ROBINHOOD_RPC_URL",
    gasSponsored: false,
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
export function explorerNftUrl(chainId: number, tokenId: bigint) {
  const c = chainConfig(chainId);
  return `${c.explorer.url}/token/${c.uniswap.v4.positionManager}/instance/${tokenId}`;
}

/** The same position inside Uniswap's own app — the strongest "you don't
 *  need us" proof there is. Our chain slugs match Uniswap's URL slugs
 *  (checked 2026-09-24: /positions/v4/base/… and /positions/v4/robinhood/…). */
export function uniswapPositionUrl(chainId: number, tokenId: bigint) {
  return `https://app.uniswap.org/positions/v4/${chainConfig(chainId).slug}/${tokenId}`;
}
