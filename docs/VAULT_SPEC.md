# The Vault — strategy & contract spec (v0, pilot)

_Status: DRAFT for Tom's review before any Solidity. This document is the
source of truth for what the pilot contract may and may not do with capital._

## One-sentence strategy

Quote two-sided liquidity around the Chainlink mid, **but only ever sell
inventory lots above their own entry price (most-recent lots first)** — so
every realized trade is a profit, drawdowns are held as inventory, and
income accrues from spread capture in both directions.

## Venue

Rialto propAMM (Robinhood's router). Canonical two-function interface:

- `getAmountOut(bool zeroForOne, uint256 amountIn) → uint256` (view quote;
  return 0 for unsupported sizes)
- `swapExactIn(bool zeroForOne, uint256 amountIn, uint256 amountOutMin,
  address to, uint256 deadline)` (settlement; router pulls input via
  transferFrom, contract must deliver ≥ amountOutMin)

The contract holds its own inventory; Rialto never custodies. Quotes compete
against other liquidity sources net of gas.

**OPEN ITEM: confirm Rialto propAMM registration is open for Robinhood
Chain (4663) — their doc currently lists Arbitrum One.**

## Strategy mechanics

State: a stack of **lots** `{ amountEth, entryPriceX18 }`.

- **Pricing source:** Chainlink ETH/USD read inside `getAmountOut` at call
  time. Reject (quote 0) if `updatedAt` older than `maxOracleAge`.
- **Bid (router sells ETH to us / we buy):** price `mid × (1 − spreadBps)`.
  Size limited by USDG balance and `maxTradeSize`. Every fill pushes a lot.
- **Ask (router buys ETH from us / we sell):** walk the lot stack
  **LIFO**; a lot is sellable only if
  `entryPrice × (1 + minProfitBps) ≤ mid × (1 − spreadBps… net)` — i.e. the
  sale realizes at least `minProfitBps` over that lot's entry. Ask size =
  sum of sellable lots (capped at `maxTradeSize`); fills pop lots
  most-recent-first. **No sellable lots ⇒ no ask side.** Never sell below a
  lot's basis, structurally.
- **Initial inventory:** starting ETH is lotted at the deployment-time mid.
- **Skew (v0 = keep simple):** none beyond the emergent behavior — bids
  naturally dominate when USDG-heavy, asks when lots are in profit.
  Explicit inventory-cap: stop bidding when ETH weight > `maxEthWeightBps`
  of NAV (prevents unbounded accumulation of a falling knife beyond design).

## Parameters (immutable in v0; redeploy to change)

| Param | Pilot value (proposed) | Note |
|---|---|---|
| spreadBps | 30 | each side vs mid |
| minProfitBps | 25 | per-lot realized profit floor |
| maxOracleAge | 90s | else quote 0 |
| maxTradeSize | $150 notional | per fill |
| maxEthWeightBps | 8000 (80%) | stop bidding beyond |
| pair | ETH / USDG | crypto-only for pilot (compliance) |

## Expected behavior (agree to these before funding)

- **Chop / round-trips:** harvests spread + grid profits. Best regime.
- **Straight rally:** sells lots profitably on the way up → lags pure HODL
  beyond captured spread. Accepted tradeoff.
- **Sustained drawdown:** accumulates until 80% ETH cap, then holds; asks
  silent until price recovers into the lot stack; **income counter stalls;
  USD NAV marks down (unrealized).** Accepted-by-thesis: exposure we want
  to hold anyway. Never sold at a loss.

## Accounting & display (two counters, never conflated)

1. **Income earned** — cumulative realized spread/grid profit in USDG.
   Monotonically increasing by construction. The daily-ticking number.
2. **Portfolio value** — inventory marked at oracle mid. Fluctuates with
   ETH. Shown as exposure, never as yield. **No APY promises anywhere.**

## Trust & safety properties

- Fully deterministic on-chain: oracle read at call time + immutable params.
  No off-chain quoting service, no operator price discretion.
- Owner powers in v0: `pause()` (stops quoting; funds untouched) and
  `withdrawAll(to)` **restricted to the LLC treasury address** — pilot is
  LLC-capital-only. No user deposits until audit + counsel (then ERC-4626
  wrapper with permissionless exit + cooldown, and these owner powers burn).
- Router-side protections per Rialto docs: exact-allowance pattern,
  settlement reverts unless output delivered.

## Pilot success criteria (≈4 weeks)

- Realized income > 0 with zero loss-realizing fills (invariant holds)
- Win share of Rialto routes (observed fills) — competitiveness check
- No oracle-staleness incidents / no reverts from our side
- Honest comparison vs (a) HODL 50/50, (b) Uniswap v4 LP same capital
