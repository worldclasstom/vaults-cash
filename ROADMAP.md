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

- **Swap index — SHIPPED 2026-09-26.** `/api/cron/swaps` every five minutes
  writes every listed pool's Swap events to Neon (eight days, one cursor per
  chain); the activity engine reads the index and fetches only the tail.
- **Targets — v1 SHIPPED 2026-09-26.** Fourth tab. Sell ladders (up) and
  buy ladders (down), 2–8 equal rungs between today's price and the target,
  each rung a single-sided v4 position minted in one transaction; live
  ladder view (waiting / live / done rungs, price line, fees per rung);
  Cash out, Keep the asset (buy ladders), Collect fees, all through the
  same batch engine; 8% performance fee on trading fees earned, taken at
  collect/close with the referrer split; Portfolio hides rungs; MCP
  position tools refuse them. Keeper `/api/cron/targets` marks targets
  hit/expired and auto-closes ladders whose owner granted agent access
  (until the Privy signer is configured every ladder is notify-only).
  Next: notifications ("Rung 4 sold for $50.9 · +$1.40"), stickers you
  earn, share card for a hit target, the immutable close contract + audit
  before marketing it hard, weighting rungs toward the target.
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
