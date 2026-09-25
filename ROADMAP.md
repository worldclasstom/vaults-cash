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

- **Swap indexer cron (before Targets).** The activity engine caches each
  pool's 24h swaps in serverless memory, so a cold instance re-pays the
  first-load scan (~9s for a busy pool). Replace with a one-minute cron that
  appends new Swap events for every listed pool into Neon; page views then
  read from the table with zero RPC, and the same table is the trigger
  source for "rung sold" notifications and Targets auto-close.

- **Targets — range orders for people who think in prices.** Buy the asset,
  set a ladder of rungs from today's price to an exit target, collect fees
  as price walks through it; the mirror (stable-only rungs below price) is
  a buy ladder. v1 ships BOTH directions. Maps 1:1 onto single-sided v4
  positions; the engine already supports custom ticks and single-sided
  mints. Decisions (2026-09-25): name is "Targets" (rungs inside); rung
  defaults borrow Uniswap's limit-order controls (price + expiry), four
  equal rungs, 2–8 allowed; **auto-close** = the account-linked keeper
  (agent access session signer) closing the whole ladder only once the
  final target prints — rungs price crosses back into keep earning, and
  the setup sheet says so plainly; notify-only is the fallback for users
  who decline the signer; a tiny immutable close contract (anyone may call
  `close`, proceeds only to the NFT owner) comes later and is the first
  thing worth an audit. **Performance fee: 8% of trading fees earned, on
  Targets ladders only, never on Pools**, taken at close and at collect in
  the same batch as today's fee, with the referrer's 50% paid on-chain
  alongside it; the 0.6% withdraw fee applies to principal, not to the fee
  portion.
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
