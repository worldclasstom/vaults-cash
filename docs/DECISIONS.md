# Decision log

_Append-only. Date, decision, why. The "why" is the part that saves future-us._

- **2026-07-02 — Ride Uniswap v4; no LFJ/DLMM fork now.** Liquidity gravity
  (official deployment, routers, aggregators) beats owning the AMM at day-2
  TVL. DLMM mechanics later via v4 hooks (`BeforeSwapDelta` custom curves —
  verified possible in official docs). Revisit with real volume data.
- **2026-07-02 — Fee: simple front-end skim, no custom contracts.** Plain
  USDG transfer inside the batch. No audit surface, transparent, ships now.
  Sickle-style contracts deferred until auto-compound/rebalance products.
- **2026-07-02 — Curated market registry, not permissionless listing.**
  Consumer app; every market hand-added after on-chain verification.
- **2026-07-02 — Privy for identity/wallets/funding; Alchemy for chain infra.**
  Alchemy hasn't confirmed embedded auth on 4663; Privy is on Robinhood's
  recommended list. Clean vendor split, no overlap.
- **2026-07-03 — Fee 0.30% → 0.60%, 50% earmarked for referrers.** Growth
  loop worth more than price optics while we're the only simple UX on chain.
  One env var to change.
- **2026-07-03 — EIP-7702 (EF Simple7702Account) over 4337 factory accounts.**
  Same address forever (funding continuity), delegate already deployed on
  4663, works with Privy's signing primitives. Privy strips `authorizationList`
  from `eth_sendTransaction`, so type-4 goes via bundler (`eip7702Auth`).
- **2026-07-03 — Fee transfer LAST in the batch.** Atomic path: order
  irrelevant. Sequential fallback: abandoned runs cost the user nothing.
- **2026-07-03 — Referral attribution from chain, not app state.** Indexer
  scans USDG transfers into the fee wallet; ledger must always reconcile
  with the fee wallet balance exactly. Off-chain 50% split; manual payouts.
- **2026-07-03 — Withdraw slippage 0.25%** (was 1%): the buffer IS the dust;
  ~250ms blocks make tighter tolerance safe (worst case: atomic revert+retry).
  Zero-dust withdraw-v2 (router `CONTRACT_BALANCE` sentinel) planned.
- **2026-07-03 — Privy wallet UI modals off (`showWalletUIs: false`).** Our
  confirm sheet is the single trust surface; raw `PackedUserOperation` hex
  terrified humans. Pro users get "Transaction details (advanced)" instead.
  External wallets keep their native prompts.
- **2026-07-03 — Apple login removed from code** until Apple OAuth is
  configured in Privy dashboard (needs Apple Developer Service ID; required
  for iOS milestone anyway).
- **2026-07-03 — USDG-as-gas via Alchemy "pay gas with any token"** (ERC-20
  paymaster, post-op threshold approvals ~$1/$10) chosen over Privy
  (chain unsupported) and self-hosted paymaster (ops burden). Users repay
  gas in USDG; requires PAYG billing tier.
- **2026-07-04 — Gas drip reverted; Alchemy sponsorship activated instead.**
  Drip was deployed without sign-off (process fix: money-spending features
  need explicit approval) and was strictly worse than sponsorship anyway.
  ERC-7677 paymaster behind `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID`; same
  integration swaps to a USDG ERC-20 policy when vendors support 4663.
- **2026-07-04 — v4-hooks DLMM plan demoted; Rialto propAMM is the active-liquidity path.**
  A propAMM quote function is a strictly more flexible strategy canvas than
  hook-constrained curves, and it plugs into Robinhood's own router flow.
  Hooks revisit only if evidence demands Uniswap-side flow capture.
- **2026-07-04 — ONE vault product, not a strategy menu.** Single strategy:
  oracle-mid bid/ask with inventory-aware skew (subsumes grid/accumulate/
  distribute as special cases). HLP model: one vault, one daily-ticking
  share price, radical transparency, withdrawal cooldown, no APY promises.
- **2026-07-04 — Autonomous-vault design for compliance posture.** Quote
  function reads Chainlink ON-CHAIN at call time + immutable params — no
  off-chain quoting server, no operator discretion, no custody; ERC-4626
  shares, permissionless exit, flat protocol fee (not fund-style fees).
  Stronger-than-HLP trustlessness as both differentiator and legal story.
  NOT legal immunity: counsel gate before any pooled user deposits; crypto
  pair (ETH/USDG) first; stock-token vaults inherit geofencing if ever.

## 2026-07-07 — Vault v0.2: pool-mid pricing, Chainlink demoted to guardrail

Chainlink on 4663 is a 0.5%-deviation/24h-heartbeat feed (measured median
~71min between updates). Quoting FROM it forces a bad choice: spread < 50bps
gets picked off by real-time routers; spread > 50bps loses every calm-market
route to the 5bps Uniswap pool. Resolution: mid = live v4 ETH/USDG pool
price (StateView, view-safe), Chainlink only bounds it (maxDivergenceBps
100, maxOracleAge 90,000s liveness). Spread stays 30bps. Manipulation is
uneconomic: pool-skew costs fees+impact, divergence bound caps mispricing at
1%, maxTrade caps extraction at ~$1.50/fill. Tom's fill-rate concern drove
this; 24 tests pass; math validated against live chain (26bps divergence).
