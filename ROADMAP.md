# Roadmap

## Now (MVP hardening)
- Live mainnet E2E: login → fund → deposit → portfolio → withdraw (needs Privy
  dashboard smart-wallet config for chain 4663 + fee wallet + test USDG)
- Vercel deploy + vaults.cash DNS

## Gas + batching ladder
1. **Now (shipped)**: sequential EOA transactions, user pays gas in ETH
   (~$0.01/tx; Receive screen tells them to keep a little ETH).
2. **Next (no external dependency — build it): EIP-7702 atomic batching.**
   VERIFIED 2026-07-02: chain runs ArbOS 61 (ArbSys.arbOSVersion() = 116,
   nitro v3.11.2) — type-4 txs supported (7702 landed in ArbOS 40 "Callisto").
   Privy supports signing 7702 authorizations. Embedded EOA delegates to a
   batch executor (Kernel v3 7702 / Simple7702Account) and self-executes
   `execute(calls)` — the whole zap in ONE user-paid tx, no bundler, and the
   fee/swap/mint batch is atomic again. This obsoletes the sequential path.
3. **When Privy gas management supports 4663**: custom gas payment token =
   USDG — fees come from the invested balance, ETH leaves the UX (requested
   via Privy support 2026-07-02).
4. **Optional later**: app-pays sponsorship (self-funding: ~$0.01 gas vs $0.30
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

Approach: **Uniswap v4 hooks, not an AMM fork.** VERIFIED (developers.uniswap.org
custom-accounting guide): "Return deltas enable hooks to implement custom curves
that can completely bypass Uniswap's native pricing mechanism" — so true
DLMM mechanics (constant-price bins, zero slippage within bin) CAN live in a
v4 hook via BeforeSwapDelta, while inheriting PoolManager settlement + router/
aggregator integration. Honest scoping: that is a full AMM implemented inside
a hook — LB-fork-scale Solidity + audit work, hook-issued LP shares (not
standard v4 position NFTs), custom quoter. Cheap partial alternative that
works today with zero contracts: single-spacing-wide standard positions ≈
range orders (bin-like limit-order LPing, but price still moves within the
range — not zero-slippage). Prereqs unchanged: MVP volume data, Solidity +
audit budget, joe-v2 license check if borrowing LB mechanics.
