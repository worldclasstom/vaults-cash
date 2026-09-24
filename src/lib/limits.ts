/** Smallest deposit or add we accept, in dollars. A Base deposit costs
 *  ~700–800k gas that the paymaster (we) pays — about $0.01 at quiet gas and
 *  10x that on busy days — so below this the 0.6% fee can't cover it, and
 *  the position earns cents that never show. Enforced in buildZapPlan so
 *  the UI, the agent API and MCP all share the one rule. */
export const MIN_DEPOSIT_USD = 5;

/** don't offer fee collection below this — it wouldn't meaningfully beat gas */
export const MIN_COLLECT_USD = 0.05;

/** A pool that traded less than this in 24h is "idle": listed (its
 *  liquidity is real) but badged, because it paid LPs essentially nothing.
 *  A strict zero would be defeated by a single dust swap — including the
 *  depositor's own zap. */
export const IDLE_VOL_USD = 100;
export function poolIdle(s: { vol24hUsd: number } | undefined): boolean {
  return s !== undefined && s.vol24hUsd < IDLE_VOL_USD;
}
