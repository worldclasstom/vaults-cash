# Roadmap

## Now (MVP hardening)
- Live mainnet E2E: login → fund → deposit → portfolio → withdraw (needs Privy
  dashboard smart-wallet config for chain 4663 + fee wallet + test USDG)
- Vercel deploy + vaults.cash DNS

## Gas UX ladder (as Privy adds chain 4663 support)
1. **Now**: user pays gas in ETH from the embedded wallet (~$0.01/tx; Receive
   screen tells them to keep a little ETH).
2. **When Privy gas management supports 4663**: custom gas payment token =
   USDG — users pay fees from the same balance they invest, ETH disappears
   from the UX entirely. (Picker lacks Robinhood Chain today — requested.)
3. **When smart wallets/native sponsorship support 4663**: atomic one-tap
   batches + optional app-pays sponsorship (self-funding: ~$0.01 gas vs $0.30
   fee per $100 deposit), behind NEXT_PUBLIC_SPONSOR_GAS.

## Next
- **iOS app (near-term priority)** — Expo/React Native with `@privy-io/expo`
  (Privy smart-wallet client flows are React/React Native only, so Expo is the
  supported path; same app id, add the iOS bundle id in the Privy dashboard).
  Architecture is already shaped for it: `src/lib/*` is pure TypeScript/viem
  with zero React or Next imports (portable as a shared package), and the
  /api/agent/* routes double as the mobile backend — the iOS app can be a thin
  client that fetches plans and signs. When mobile work starts: restructure to
  a monorepo (`packages/core`, `apps/web`, `apps/ios`). Web stays mobile-first
  in layout so the PWA experience holds until the native app ships.
- **Referral / points system** — Postgres (Neon/Supabase) + Drizzle. Attribution
  is trustless: index USDG transfers into the fee wallet per user smart wallet.
  Start with points; rev-share (~20% of referred fees = 6bps of referred volume)
  is sustainable if we want it. Soft-pedal "airdrop" promises (regulatory).
- **MCP server** wrapping /api/agent/* so Claude/ChatGPT/Cursor agents can
  open LP positions conversationally (Robinhood's own agentic trading is MCP).

## Later — the Meteora/LFJ play
Thesis: the DLMM crowd (Meteora on Solana, LFJ on Avalanche/Monad) migrates to
Robinhood Chain as retail flow arrives; nobody serves them there yet. We want
to be positioned as their venue.

Approach: **Uniswap v4 hooks, not an AMM fork.** Deploy our own hooked pools on
the canonical PoolManager (dynamic fees, limit-order behavior, bin-like
liquidity shaping) so we stay inside the routing/aggregator/liquidity gravity
well instead of bootstrapping TVL from zero against Uniswap + Rialto.
Prereqs: real volume data from MVP, Solidity + audit budget, and a license
check on lfj-gg/joe-v2 if we ever borrow Liquidity Book mechanics directly.
