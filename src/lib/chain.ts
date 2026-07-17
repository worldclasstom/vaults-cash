import { base } from "viem/chains";

/** Base mainnet (chain id 8453) — the chain vaults.cash runs on.
 *  Pivoted from Base 2026-07-12: no fiat onramp reaches 8453 and
 *  its stock tokens are non-US-only, so US users could never fund or use it.
 *  Base has a real onramp (Coinbase), deep liquidity, and crypto-only markets
 *  (no tokenized securities => no geofence, no counsel gate). */
export const baseChain = base;

/** Uniswap v4 deployments on Base (chain id 8453), per
 *  developers.uniswap.org/contracts/v4/deployments. Uniswap explicitly warns
 *  addresses are NOT the same across chains, so verify-chain.ts asserts
 *  bytecode exists at each of these before the app trusts them. */
export const UNISWAP = {
  v4: {
    poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
    positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
    universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
    quoter: "0x0d5e0f971ed27fbff6c2837bf31316121532048d",
    stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
  },
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const;

/** Blockscout on Base — used to enumerate a user's v4 position NFTs. */
export const EXPLORER = {
  url: "https://base.blockscout.com",
  apiUrl: "https://base.blockscout.com/api/v2",
} as const;
