# Roadmap

_Rewritten 2026-09-24. Earlier versions described the Robinhood-only build;
that history is in docs/DECISIONS.md._

## Now

- **Robinhood Chain end-to-end test**: fund the smart wallet with USDG plus
  a sliver of ETH on 4663, deposit into ETH/USDG, confirm the position,
  withdraw. Proves the Alchemy bundler, user-paid gas, the USDG path and the
  referral split on the second chain. Whether Privy's funding modal routes
  USDG to Robinhood Chain is part of the test.
- **Privy ticket**: Apple Pay does not render inside Stripe's Link sheet on
  Safari/iPhone even though Privy passes `applePay: "auto"`.
- **Docs pass** (done 2026-09-24) and repo public under MIT.

## Next

- **Targets — range orders for people who think in prices.** Buy the asset,
  set a range from today's price to an exit target, collect fees as price
  walks through it; the mirror (stable-only range below price) is a buy
  ladder. Maps 1:1 onto single-sided v4 positions; the engine already
  supports custom ticks and single-sided mints. Needs **auto-close** when
  the target is hit, or a retrace re-buys the asset: a tiny immutable
  contract (approve the NFT to it; anyone may call `close(tokenId)`; only
  succeeds past the upper tick; proceeds only to the NFT owner) with our
  hourly cron as the caller. First feature that justifies a contract and
  an audit (small reviewer or bounty, not a full-firm engagement). Naming
  candidates: "Targets" / "Buy zones".
- **Leverage loop** (Aave/Morpho): supply ETH → borrow USDC → LP,
  atomically; LTV cap ~40–50%, live health factor, one-tap unwind.
- **Managed "pick an outcome" layer** over the pools (MaxFi-style UX
  without the pooled-vault custody).
- **iOS app**: Expo + `@privy-io/expo`; `src/lib/*` is React-free and the
  `/api/agent/*` routes double as the mobile backend. Monorepo split
  (`packages/core`, `apps/web`, `apps/ios`) when this starts.
- **Stats fallback** for pools GeckoTerminal does not index.

## Later / shelved

- **The Vault (Rialto propAMM)** and the **1inch Aqua pilot** — research and
  an undeployed contract kept in `contracts/` and `docs/`. Not planned.
- v4 hooks for custom curves — only if Uniswap-side flow capture ever matters.
