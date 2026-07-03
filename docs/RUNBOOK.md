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
