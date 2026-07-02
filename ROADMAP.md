# Roadmap

## Now (MVP hardening)
- Live mainnet E2E: login → fund → deposit → portfolio → withdraw (needs Privy
  dashboard smart-wallet config for chain 4663 + fee wallet + test USDG)
- Vercel deploy + vaults.cash DNS

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
