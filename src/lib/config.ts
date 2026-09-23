/** True once a paymaster is configured for the chain in the Privy dashboard
 *  (smart wallets → chain → paymaster URL / Alchemy gas policy). Flip
 *  NEXT_PUBLIC_GAS_SPONSORED=1 after that, and the UI stops telling users
 *  they need ETH for network fees. Until then users pay gas from the smart
 *  wallet's own ETH balance. */
export const GAS_SPONSORED = process.env.NEXT_PUBLIC_GAS_SPONSORED === "1";
