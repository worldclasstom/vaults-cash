import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import { CHAINS, type ChainId } from "./chain";
import type { Call } from "./uniswap";

/**
 * Paying gas in the chain's own dollar (USDG on Robinhood Chain) through
 * Alchemy's ERC-20 paymaster. The user never needs ETH: each user op carries
 * an approval letting the paymaster pull at most `maxTokenAmount` of the
 * stablecoin after the op runs (post-op mode), and the paymaster context
 * tells Alchemy which policy and token to charge.
 *
 * Nothing here runs unless the chain has `gasToken` configured (see chain.ts).
 */

/** The most one op may cost the user in the gas token, in dollars. Also the
 *  per-op approval, so a runaway estimate can't drain more than this. */
export const GAS_TOKEN_MAX_USD = 0.5;
/** Dollars of the gas token to leave in the wallet when the user taps Max. */
export const GAS_RESERVE_USD = 0.5;

export function gasTokenOf(chainId: ChainId) {
  return CHAINS[chainId].gasToken;
}

function maxUnits(chainId: ChainId): bigint {
  return parseUnits(GAS_TOKEN_MAX_USD.toFixed(6), CHAINS[chainId].quote.decimals);
}

/** Prepends the paymaster approval when the chain charges gas in its stablecoin. */
export function withGasTokenApproval(chainId: ChainId, calls: Call[]): Call[] {
  const gt = gasTokenOf(chainId);
  if (!gt) return calls;
  const approve: Call = {
    to: CHAINS[chainId].quote.address,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [gt.paymaster, maxUnits(chainId)] }),
  };
  return [approve, ...calls];
}

/**
 * ERC-7677 paymaster context for Alchemy's ERC-20 mode. `proceedsPayGas`
 * skips Alchemy's up-front balance check for ops whose own output funds the
 * gas (a withdrawal lands in the stablecoin before the post-op charge).
 */
export function gasTokenContext(chainId: ChainId, opts: { proceedsPayGas?: boolean } = {}) {
  const gt = gasTokenOf(chainId);
  if (!gt) return undefined;
  return {
    policyId: gt.policyId,
    erc20Context: {
      tokenAddress: CHAINS[chainId].quote.address,
      maxTokenAmount: maxUnits(chainId).toString(),
      ...(opts.proceedsPayGas ? { skipBalanceCheck: true } : {}),
    },
  };
}

/** True when `usd` can leave the wallet and still cover one op's gas. */
export function leavesGasReserve(chainId: ChainId, balanceUsd: number, usd: number): boolean {
  return gasTokenOf(chainId) ? usd <= balanceUsd - GAS_RESERVE_USD : usd <= balanceUsd;
}

/** The most the user can spend from `balanceUsd` on this chain. */
export function spendableUsd(chainId: ChainId, balanceUsd: number): number {
  return gasTokenOf(chainId) ? Math.max(0, balanceUsd - GAS_RESERVE_USD) : balanceUsd;
}
