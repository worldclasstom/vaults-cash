# Decision log

_Append-only. Date, decision, why. The "why" is the part that saves future-us._

> Entries from July 2026 describe the Robinhood-only build (EIP-7702
> accounts, Alchemy sponsorship, the Rialto propAMM vault). Where they
> conflict with the September entries, September wins.

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
  Drip was strictly worse than sponsorship and was reverted.
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
1%, maxTrade caps extraction at ~$1.50/fill. Fill rate was the driver; 24 tests pass; math validated against live chain (26bps divergence).

## 2026-07-07 — v0.2 pricing + spread 15bps (ladder-first)
Mid = live Uniswap v4 pool price (StateView.getSlot0), Chainlink demoted to
guardrail (alive + within maxDivergenceBps=100, age<=25h). Kills the
stale-oracle pick-off that forced wide spreads in v0.1. With live pricing,
The grid thesis holds: fills ARE the product (ladder entries/exits), not
spread capture vs informed flow — so quote TIGHT: spreadBps 30->15.
Remaining tight-spread cost is faster inventory build in downtrends
(bounded by 80% weight cap, accepted by thesis). Manipulation bounded:
divergence cap + $150 maxTrade makes pool-skew attacks unprofitable.
Router pays fill gas, not us. Spread is a constructor param — redeploy to
retune. 24 tests pass incl. divergence/stale/pool-mid-source guardrails.

## September 2026 — the Base + Robinhood Chain build

- **2026-07-16 → 2026-09-23 — Wallet layer: Privy → Coinbase CDP → Privy.**
  CDP smart accounts + paymaster were adopted for the Base pivot, then
  dropped because CDP has no Robinhood Chain. Privy smart wallets (Kernel)
  give one address on both chains; Base keeps the CDP bundler + paymaster
  through Privy's dashboard, Robinhood uses the Alchemy bundler with no
  paymaster (gas there is sub-cent and not sponsored).
- **2026-09-23 — Two chains, one wallet, chain in the URL.** Markets live
  at `/market/<chain>/<base>-<quote>`, the way Uniswap and Aerodrome do it.
  Every live v4 pool is auto-listed as a pair from the registries (dust
  floor, thin-TVL hide) instead of a hand-curated list.
- **2026-09-23 — Robinhood stock tokens listed.** Listed once US regulators
  permitted stock tokens; the July geofence was removed.
  Logos: Robinhood's official feather, as Uniswap and fomo do.
- **2026-09-23 — Browser reads through `/api/rpc/<chainId>`.** Robinhood's
  public RPC breaks CORS and the Alchemy key is origin-allowlisted; a proxy
  keeps keys server-side. Hardened 2026-09-24 (same-site, read-only) when
  the repo went public.
- **2026-09-24 — Referrer share paid on-chain in the batch.** Weekly off-chain
  batches were considered; the gas is a ~40k-gas transfer
  inside a 700k op the depositor already sends, so the split costs nothing
  and needs no payout process. The ledger only reports.
- **2026-09-24 — Wallet ownership verified against Privy** (`PRIVY_APP_SECRET`)
  before binding a referral.
- **2026-09-24 — Add funds leads with Privy's funding modal**, the raw
  address is the fallback, and every balance is labelled by chain.
- **2026-09-24 — $5 minimum deposit; idle pools badged, not hidden.** A $1
  deposit cost $0.013 in sponsored gas against a $0.006 fee. Pools with
  real liquidity but < $100 traded in 24h stay listed with a red badge and
  lose the Steady tag (a strict zero was defeated by the depositor's own
  zap swap).
- **2026-09-24 — Trust posture: no contracts of our own, prove it in the
  product.** `/trust`, decoded signing steps, Uniswap/explorer links per
  position, Privy key export. Dropped a "TVL through vaults.cash" metric
  as irrelevant for a zap tool. Repo made public under MIT with SECURITY.md;
  an audit is deferred until a contract exists (Targets auto-close).
- **2026-09-24 — Next product direction: "Targets".** Single-sided range
  orders (buy the asset, LP from today's price to a target, collect fees
  as price walks through). Needs auto-close when the target is hit — the
  first feature that justifies a small immutable contract.
- **Shelved:** Rialto propAMM vault (`contracts/`, VAULT_SPEC.md) and the
  1inch Aqua pilot (AQUA.md) — kept as reference, not on the roadmap.

- **2026-09-25 — Robinhood gas is paid in USDG (Alchemy ERC-20 Payments policy).**
  Users never need ETH on Robinhood Chain: each user op carries a $0.50
  USDG approval to Alchemy's ERC-20 paymaster (0x00000000000667f2…7ebb4)
  and the ERC-7677 context `{policyId, erc20Context}`; the paymaster charges
  the actual gas after the op (post-op mode) into the fee wallet. Base stays
  on the CDP paymaster (about a cent, covered). The 0.6% fee is untouched.
  Two things bit on the way in: (1) Privy's smart-wallet `sendTransaction`
  wrapper rebuilds the request and drops `paymasterContext`, so the
  dashboard's policy-only context reached Alchemy — `useSendCalls` now calls
  viem's `sendUserOperation` directly (the wrapper spreads the raw client)
  whenever a token context exists. (2) The Universal Router deployed on
  Robinhood Chain (0x8876…0904, the official address) was built from a
  v4-periphery whose `ExactInputSingleParams` still has `sqrtPriceLimitX96`
  — 10 head words — while the SDK planner encodes 9; the router's decoder
  read the token address where it expected an offset and reverted with no
  data. `legacySwapParams` on the chain config switches `buildSwapCall` to
  the 10-word struct (verified against successful swaps on chain and by
  `scripts/simulate-deposit.ts`, which dry-runs a full deposit via
  eth_simulateV1). Also: the Alchemy key is origin-allowlisted, so every
  server-side call to it sends `Origin: https://vaults.cash`.

- **2026-09-26 — Targets v1: ladders of single-sided rungs, keeper via agent access.**
  A target is N equal, spacing-aligned rungs between the current tick and
  the target tick, on the side where they are single-sided (asset for a sell
  ladder, quote for a buy ladder), each minted as its own position NFT in
  one batch (N `modifyLiquidities` calls — simpler than one multi-mint
  planner and cheap enough for N ≤ 8). "If it hits" is exact tick math per
  rung (a crossed rung converts at its band, so it lands near the band's
  midpoint, not the target). Close-at-target only: rungs price re-enters
  keep earning, and the setup copy says a retrace re-buys. Performance fee
  8% of trading fees earned, only on ladders, taken at collect/close in the
  same batch; the 0.6% applies to converted principal, never to the fee
  portion. Buy ladders close by keeping the asset (only the fee portion is
  converted so the performance fee is stablecoin). Rungs are hidden from
  Portfolio and refused by the plain MCP position tools so the fee can
  never touch a Pools position.
- **2026-09-26 — Header account menu; logout lands on home; first-tx gas note.**
  Every app puts Account and Log out one tap away; ours is a yellow sticker.
  The first transaction on a chain also deploys the smart wallet, so the
  review sheet says so instead of letting a 21¢ quote read as "expensive".

