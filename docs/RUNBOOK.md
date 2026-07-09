# Runbook

_Operational knowledge. If it bit us once, it lives here._

## Environments & secrets

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | local + Vercel prod | Privy "VAULTS" app (Dev environment) |
| `NEXT_PUBLIC_FEE_RECIPIENT` | local + Vercel prod | fee wallet `0x9704…1384` |
| `NEXT_PUBLIC_FEE_BPS` | local + Vercel prod | `60` |
| `NEXT_PUBLIC_RPC_URL` | local + Vercel prod | Alchemy `robinhood-mainnet` key — **browser only** (see gotchas) |
| `DATABASE_URL` (+PG*) | Vercel all envs | Neon `neon-citron-coin`, injected by integration |
| `NEXT_PUBLIC_SPONSOR_GAS` | unset | legacy Privy sponsorship flag; superseded by Alchemy plan |

## Deploys

Push to `main` → Vercel auto-deploys production (git integration).
CLI alternative: `npx vercel deploy --prod --scope prosperity-labs`.
Before deploying after any token/pool change: `npx tsx scripts/verify-chain.ts`
(regenerates registry.json; everything reads from it) and
`npx tsx scripts/test-zap.ts` (dry-runs all markets against live pools).

## Gotchas that already bit us (do not relearn)

- **Vercel env values read back EMPTY on this team** (masking). Empty
  `vercel env pull` ≠ missing values. Verify via runtime behavior
  (e.g. `feeUsdg` on `/api/agent/quote`). Reliable writes: REST API upsert.
- **Alchemy domain allowlist blocks origin-less requests** — server-side
  code, curl, and scripts must use the public RPC
  (`https://rpc.mainnet.chain.robinhood.com`). Probing "is X deployed?"
  through the Alchemy URL returns false negatives.
- **Privy strips `authorizationList`** from `eth_sendTransaction` → silent
  type-2 no-op self-call. Never send type-4 directly; use the bundler path.
- **Privy auth field encodings are loose** (yParity arrived 32-byte padded);
  normalize every numeric via `Number(BigInt(x))`.
- **rundler rejects viem's compact 7702 factory marker** `0x7702` — the
  transport shim rewrites to the padded 20-byte form (adaptive).
- **`JSON.stringify` throws on BigInt** — userOp typed-data signing uses a
  replacer. (Symptom: "Do not know how to serialize a BigInt" at signing.)
- **v4 pool currency order varies per market** (`assetIsCurrency0`) — never
  assume USDG is currency1. All direction logic lives in `lib/uniswap.ts`.
- **Vercel CLI stdin quirks**: `vercel env rm` needs `--yes`; piped values
  must be newline-terminated; commit author email must match a GitHub
  account or team deploys are blocked (repo git config uses the
  worldclasstom noreply address).
- **Safari ignores SVG favicons** — keep `favicon.ico` real (generated from
  `public/brand/vaults-mark.png` via `npx png-to-ico`).

## Fee wallet & referral payouts

Fee wallet `0x9704…1384` accrues USDG. Referral ledger (Neon) must
reconcile with the wallet balance **exactly**: `/api/referral/sync` response
`ledger.feesUsd` vs on-chain `balanceOf`. Payouts: monthly, manual, from the
fee wallet, per `fee_events` grouped by `referrer_wallet` × 50%.

## Verification quick checks

- App up: `curl https://vaults.cash/api/agent/markets` → 8 markets w/ prices
- MCP up: POST initialize to `https://vaults.cash/api/mcp/mcp`
- Fee math live: `/api/agent/quote?...amountUsd=100` → `feeUsdg: "600000"`
- Ledger reconciles: `/api/referral/sync` → `ledger.feesUsd` == fee wallet balance

## Test wallets (Tom's)

- Fee wallet / LLC login: `0x970481E181189411aD0A4A4f22C08f111C6E1384`
- Test depositor (personal login): `0xFD03B83711B089D0Bc087B3381AAdDd92c204035`
  (7702-delegated; holds test USDG/ETH + live position)

## Incident log

- **2026-07-04 — "lost $6" withdrawal scare (no loss).** Invalid Gas Manager
  policy (testnet-scoped) made pm_getPaymasterData fail → atomic path broke
  on EVERY op → sequential fallback → Privy nonce race ("nonce too low")
  killed the ETH→USDG swap step after burns completed. Funds arrived as raw
  ETH+USDG; nothing lost; no fee charged (fee rides the swap). Lessons:
  (1) a configured-but-invalid paymaster is worse than none — validate a
  policy with a test op before trusting env; (2) sequential sends must sync
  confirmed nonce between steps (fixed in useSendCalls); (3) ETH landing
  unswapped needs a UI conversion path (TODO).

## Gas sponsorship policy (2026-07-07) — NOT YET ACTIVE

Policy "VAULTS.cash Gas Sponsorship" id `8d512c49-f1e5-4a61-b1b5-2235df108afa`
(Alchemy Gas Manager, review screen confirmed Robinhood Chain Mainnet).
Rules: $1/op, $1 + 20 ops per address, $25 + 2000 ops policy-wide, 10-min
sponsorship expiry, no end date, no custom rules.

DO NOT set NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID until ALL of:
1. Gas credits purchased in Alchemy (banner: sponsorship needs prepaid
   credits — with env set but no credits, every atomic op fails its
   paymaster step and degrades to sequential: the 200caf87 incident shape).
2. Network verified programmatically (policies list tooltip ambiguity:
   old testnet policy sits in the same list).
3. One live test deposit validated end-to-end with sponsorship applied
   (userOp receipt shows paymaster, user paid $0).

Rialto onboarding: issue #3 filed by Tom on rialto-plds/rialto-api-docs
(2026-07-07) + X DM channel. Monitor for reply; send contract address
once deployed.

## Gas sponsorship ACTIVATED (2026-07-08)

NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID=8d512c49-... set in Vercel Production +
.env.local. Validated non-destructively BEFORE enabling via paymaster probe:
`pm_getPaymasterData` on the app RPC (Origin: https://vaults.cash header —
Alchemy blocks origin-less calls) with a chain-4663 (0x1237) userOp returned
signed paymaster data stamped {"sponsor":{"name":"VAULTS.cash Gas
Sponsorship"}} — proving the policy exists, is mainnet-scoped, active, and
funded, without moving funds. This is the definitive check for the
"Policy ID(s) not found" failure that broke the atomic path last time.
Deployment confirmed current via /market/mu = 307 (restricted, exists) vs
/market/zzz = 404. GAS_SPONSORED messaging flips automatically off the env.

Reusable probe: node script POST pm_getPaymasterData to $NEXT_PUBLIC_RPC_URL
with Origin header; error "Policy ID(s) not found" = wrong network/app.

REMAINING: the first real embedded-wallet deposit (USDG-funded, zero-ETH
wallet) is the end-to-end smoke test — user pays $0, op shows paymaster.
Do this before inviting friends & family en masse.
