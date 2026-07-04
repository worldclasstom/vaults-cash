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

## Later — the Vault (Rialto propAMM; supersedes the hooks/DLMM plan)

Thesis: users want asset exposure + income visibly ticking up daily, without
operating anything. The venue is Rialto's propAMM (two-function interface:
`getAmountOut` quote + `swapExactIn` settle; our contract holds inventory and
competes for Robinhood-router flow net of gas). The model is HLP: ONE vault,
one daily-ticking share price, radical transparency, withdrawal cooldown,
zero APY promises.

Design (autonomous-vault): quote = Chainlink read AT CALL TIME + immutable
spread/inventory-skew params — no off-chain quoting server, no operator
discretion; inventory-aware skew subsumes grid/accumulate/distribute as
special cases. ERC-4626 shares over the same inventory; permissionless exit;
flat protocol fee. Stock tokens: market-hours-aware spread widening is the
chain-specific edge (24/7 tokens vs closed underlying — where curve LPs bleed).

Sequence: (1) treasury pilot on ETH/USDG with LLC capital — the pilot
contract IS the vault prototype; public live-P&L page as track record;
(2) audit + counsel gate; (3) open ERC-4626 deposits. Prereqs: pilot P&L,
Solidity + audit budget, Rialto onboarding confirmed for chain 4663 (their
registration doc currently says Arbitrum One — verify), securities counsel
before any stock-token pair or pooled deposits.

(v4 hooks: demoted 2026-07-04 — propAMM is strictly more flexible and plugs
into Robinhood's own router flow; revisit only if Uniswap-side flow capture
someday matters.)
