# The Vault — strategy & contract spec (v0, pilot)

_Status: parameters SIGNED OFF by Tom 2026-07-04. This document is the
source of truth for what the pilot contract may and may not do with capital.
Remaining gate before deploy: Rialto onboarding confirmation for chain 4663._

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

## Deposits, redemptions & the cap (ERC-4626 phase)

- **The 80% cap is a ratio, not a quantity.** New USDG deposits grow NAV,
  ETH weight falls below the cap, and bidding resumes automatically — fresh
  capital is fresh dip-buying capacity at current prices. New (cheap) lots
  stack on top; LIFO means they harvest first on recovery.
- **Deposits: USDG only** (v1). Shares minted at NAV marked at oracle mid —
  entrants never buy hidden losses; drawdown is already in the share price.
- **Redemptions: pro-rata IN KIND (ETH + USDG), never USDG-only.** A
  USDG-only exit path would force selling underwater lots during full-ETH
  drawdowns, killing the core invariant exactly when it matters. In-kind
  keeps "never sells below basis" unconditional; the exiting user chooses
  whether to convert their ETH.
- **Disclosure requirement:** the no-realized-loss guarantee is a property
  of the VAULT'S TRADING, not of each depositor's round trip — a depositor
  entering at high NAV and exiting at low NAV realizes their own loss via
  share price. Say this verbatim wherever deposits happen.

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

## Appendix: vs HLP (decision record, 2026-07-04)

HLP = three engines: order-book MM (off-chain, closed-source algos) +
liquidation backstop + fee/funding accrual; USDC-denominated absolute-return
posture; realizes losses continuously to stay ~delta-neutral; ~15–30% APR
windows with 5–12% drawdown episodes; 4-day lock; no perf fee.

Only engine #1 (spread capture) exists on Robinhood Chain via Rialto
propAMM — no liquidation pipeline or funding to harvest. So the real choice
was philosophy A (this spec: exposure + income, never realize losses, NAV
rides ETH, income stalls underwater) vs B (HLP-style delta-managed MM:
steadier income, flat NAV, realizes losses by design — a stablecoin-yield
product for a different customer). CHOSEN: A — matches the user thesis
(exposure, held; income, visible), keeps the fully-deterministic on-chain
compliance posture. ADOPTED FROM HLP: the wrapper — one vault, shares,
deposit cooldown, no performance fee, radical transparency, no APY promises.
Revisit B only as a possible second internal strategy after pilot data.

## Appendix: backtest findings (2026-07-05, real data + drives real contract)

Same $550, 50/50 start, identical price paths & fill model. Fill model is
OPTIMISTIC (one clip captured per move; no adverse selection, no route
competition) — treat as directional, real income lands below these.

| Scenario | Vault | HODL 50/50 | UniV4 LP | Vault income |
|---|---|---|---|---|
| Chop, ends flat | **$558** | $550 | $550 | $7 |
| Crash then recover | **$557** | $550 | $550 | $6 |
| Straight rally +40% | $598 | **$660** | $651 | $39 |
| Crash −39% | $393 | **$444** | $430 | $0 |
| **REAL ETH H1-26 (−41%)** | $383 | **$439** | $428 | $34 |

Verdict: mean-reversion / range harvester. WINS in chop and round-trips
(the majority regime); LAGS in a straight rally (sells into strength);
LOSES to HODL in a sustained downtrend (accumulates into the fall → ends
over-exposed; realized income doesn't cover the extra market loss). This is
the strategy doing exactly what's specced (buy dips, never realize a loss),
not a bug. Bet = "ETH round-trips more than it trends." Reproduce:
`forge test --match-contract 'VaultBacktest|VaultSim' -vv`.
