/** True when Alchemy Gas Manager sponsorship is configured — the app pays
 *  network fees on the atomic path, and the UI stops mentioning ETH.
 *  (Swaps to a USDG-paymaster policy later with no code changes.) */
export const GAS_SPONSORED = Boolean(
  process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID,
);
