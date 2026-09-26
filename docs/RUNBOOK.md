# Runbook

_Operational knowledge. If it bit us once, it lives here. Rewritten
2026-09-24 for the Base + Robinhood Chain / Privy smart-wallet build; the
July entries at the bottom are kept as history._

## Environments & secrets

`NEXT_PUBLIC_*` values are baked in at build time — set them in Vercel
**before** pushing.

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | local + Vercel | Privy app "VAULTS" (production mode since 2026-09-23) |
| `PRIVY_APP_SECRET` | Vercel (server only) | lets `/api/referral/me` verify a claimed wallet belongs to the signed-in user; without it the API only blocks wallets already bound to another user (logs a warning) |
| `NEXT_PUBLIC_FEE_RECIPIENT` | local + Vercel | fee wallet |
| `NEXT_PUBLIC_FEE_BPS` | local + Vercel | `60` |
| `NEXT_PUBLIC_GAS_SPONSORED` | Vercel | `1` when the CDP paymaster is live on Base; only changes copy |
| `CRON_SECRET` | Vercel (optional) | when set, `/api/cron/*` only run for calls carrying `Authorization: Bearer <secret>` (Vercel cron sends it automatically) |
| `NEXT_PUBLIC_GAS_TOKEN_POLICY_4663` | Vercel | Alchemy *ERC-20 Payments* policy id: users pay Robinhood gas in USDG (no ETH). Browser and server both use it. Privy's Robinhood chain entry needs the Alchemy paymaster URL + this id |
| `NEXT_PUBLIC_SOURCE_URL` | Vercel | repo URL shown on `/trust`; unset hides the line |
| `ALCHEMY_API_KEY` | Vercel prod/preview/dev | origin-allowlisted; server sends `Origin: https://vaults.cash` |
| `BASE_RPC_URL`, `ROBINHOOD_RPC_URL` | optional | override the server RPC (else Alchemy, else public) |
| `DATABASE_URL` (+`PG*`) | Vercel all envs | Neon, injected by the integration; referral ledger + agent keys |
| `NEXT_PUBLIC_PRIVY_SIGNER_ID` | Vercel | Privy key-quorum id of the server signer; the Account "Agent access" card hides until set |
| `NEXT_PUBLIC_PRIVY_SIGNER_POLICY_ID` | Vercel | optional Privy policy scoping that signer to our contracts |
| `PRIVY_AUTHORIZATION_PRIVATE_KEY` | Vercel (server only) | base64 PKCS8 P-256 key matching the quorum; signs session-signer requests |
| `BUNDLER_URL_8453`, `BUNDLER_URL_4663` | Vercel (server only) | bundler (+paymaster on Base) URLs the executor sends user ops to; 4663 falls back to Alchemy |

Privy dashboard: embedded wallets (Ethereum: users without wallets; Solana:
all users — "SVM wallets" toggle on), smart wallets = Kernel; Base uses the
CDP bundler + paymaster; Robinhood Chain is a custom chain on the Alchemy
bundler with no paymaster. Funding: Stripe (card, USD/EUR) + MoonPay on.

CDP (Base paymaster): the **contract allowlist must stay empty** and the
$15/mo free credit is the sponsorship budget (~1,000 deposits at quiet gas).

## Deploys

Push to `main` → Vercel production. Before any token/pool change:
`npx tsx scripts/verify-chain.ts --chain base` and `--chain robinhood`
(rewrites the registries everything reads from), then
`npx tsx scripts/test-zap.ts`. `scripts/check-referral-split.ts` and
`scripts/check-mint-value.ts` re-verify the two on-chain invariants below.

## Gotchas that already bit us (do not relearn)

- **CDP paymaster "failed to trace calls" on every op** = a stale entry in
  the CDP contract allowlist. Kernel factory deployments get rejected when
  the allowlist is non-empty. Keep it empty.
- **CDP needs `paymasterPostOpGasLimit` ≥ 27000** (error selector
  `0x74e8188b` `PostOpGasLimitExceeded()`, misnamed).
- **Native-ETH legs: mint value must be the swap's guaranteed output.** The
  SDK's `amount0Max` exceeded the wallet's post-swap ETH → "Execution
  reverted". `zap.ts` sends `swapOutMin` and sizes the mint 1% under.
- **Robinhood public RPC sends `Access-Control-Allow-Origin: *,*`** —
  browsers refuse it. All browser reads go through `/api/rpc/<chainId>`.
  Base's public RPC rate-limits dev traffic; same fix.
- **Robinhood Blockscout is Cloudflare-gated** — curl gets a challenge page.
  Position enumeration falls back to RPC `Transfer` logs there.
- **Alchemy key is origin-allowlisted** — server-side callers must send
  `Origin: https://vaults.cash` or they get false negatives.
- **GeckoTerminal is 30 req/min** — use the batch endpoints
  (`/pools/multi/`, ≤ 30 ids) never per-pool calls.
- **Dust floor sign**: `virtualQuoteUnits(..., quoteIsCurrency1 = baseIsCurrency0)`.
  The flipped form listed drained pools and dropped cbBTC/ETH.
- **Vercel env values read back empty** (masking) — verify by runtime
  behaviour, not `vercel env pull`. `vercel env add X preview` needs
  `--value … --yes` and a branch argument.
- **Privy funding modal needs CSP for Stripe/MoonPay/Coinbase/Relay** and
  `Permissions-Policy: payment=(…)`. "Something went wrong setting up
  checkout" = a blocked origin. Current list lives in `next.config.ts`.
- **Apple Pay on web**: Privy passes `wallets: {applePay: "auto"}` to
  Stripe's `collectPaymentMethod` (verified in the 3.45 bundle, not docs).
  Whether Apple Pay shows inside the Link sheet is Stripe-side. There is no
  switch on our side; escalate to Privy.
- **iPhone SMS login froze after the code was sent** (2026-09-24, once).
  A fresh tab fixed it. Unreproduced.
- **Next "cannot use different slug names"** — `/market/[chain]/page.tsx`
  and `/market/[chain]/[symbol]/page.tsx` must share the `[chain]` name.
- **React lint `set-state-in-effect`** — `useSearchParams` consumers go in
  a Suspense child, not the page.
- **Safari ignores SVG favicons** — keep `favicon.ico` real.
- **`ssh`/heredoc and zsh quoting quirks** — see the ops memory; not app-specific.

## Referral invariants

- Referrer share is paid **on-chain in the batch** (`feeCalls` in
  `zap.ts`/`withdraw.ts`); self-referrals and a zero recipient collapse to
  the plain fee transfer.
- `fee_events.referrer_amount` = what the referrer actually received;
  events before `SPLIT_FROM` (Base 51,720,000 / Robinhood 71,050,000) are
  the pre-split era and were settled manually.
- `users.wallet` = current smart wallet; `user_wallets` = every address a
  user has paid from, so a wallet change never orphans attribution.
- Schema bootstraps itself (`ensureSchema` in `src/lib/db.ts`); the fee
  column is `amount` (raw 6-decimal units; `chain_id` says USDC vs USDG).

## Verification quick checks

- App up: `curl https://vaults.cash/api/agent/markets` → markets with prices
- MCP up: POST `initialize` to `https://vaults.cash/api/mcp/mcp`
- Fee math: `/api/agent/quote?…amountUsd=100` → fee `600000`
- Proxy gate: POST to `/api/rpc/8453` without an `Origin` header → 403
- Referral: `/api/referral/me` with a Privy token → 200, no ownership warning in logs

## Fee wallet

- `NEXT_PUBLIC_FEE_RECIPIENT` (public on `/trust`)

## Incident log

- **2026-09-23 — every Base deposit rejected by the paymaster.** Root cause:
  stale Moonwell/Aerodrome entries in the CDP contract allowlist. Cleared →
  first live gasless deposit passed the same day.
- **2026-09-23 — "Execution reverted" on the first ETH/USDC mint.** Mint
  value exceeded the swap output. Fixed in `zap.ts` (see gotchas).
- **2026-09-24 — `/api/referral/me` 500.** Column named `amount_usdg` from
  the July schema vs code expecting `amount_usdc`. Migrated to `amount`;
  invite card now shows a retry state instead of vanishing.

## Dry-running a deposit

`npx tsx scripts/simulate-deposit.ts robinhood/tsla-usdg 0xOWNER 10.25` builds
the exact batch the app would send (gas-token approval included) and runs it
through `eth_simulateV1` from that wallet, printing each call's status. Use it
before blaming a wallet or a paymaster: a reverting step shows up here first.

## Crons

| Path | Schedule | Does |
|---|---|---|
| `/api/referral/sync` | hourly | ledgers fee-wallet inflows |
| `/api/cron/swaps` | every 5 min | swap index (lib/swapIndex.ts) |
| `/api/cron/targets` | every 5 min | Targets keeper: marks hit/expired, auto-closes ladders with agent access |

All three are safe to hit by hand (idempotent, work-bounded). `scripts/simulate-ladder.ts` dry-runs a ladder like `simulate-deposit.ts` does a deposit.

