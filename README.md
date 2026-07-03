# vaults.cash

> Docs: [OVERVIEW](docs/OVERVIEW.md) (source of truth) ·
> [DECISIONS](docs/DECISIONS.md) (why things are the way they are) ·
> [RUNBOOK](docs/RUNBOOK.md) (ops + gotchas) · [ROADMAP](ROADMAP.md)

Robinhood-simple liquidity positions on **Robinhood Chain** (chain id 4663).
Log in with email, pick a market (tokenized stocks or blue-chip crypto), and one
tap converts USDG into a Uniswap v4 LP position. Self-custodial via Privy
embedded + ERC-4337 smart wallets; gas fully sponsored.

## How money flows

Deposit (one atomic userOp, built in [src/lib/zap.ts](src/lib/zap.ts)):

1. 0.30% platform fee → fee wallet (plain USDG transfer)
2. USDG → Permit2 → UniversalRouter approvals
3. `V4_SWAP` exact-in: swap the range-ratio share of USDG into the asset
4. Permit2 approvals for the PositionManager
5. `modifyLiquidities` mint — slippage-bounded; the whole batch reverts together

Withdraw ([src/lib/withdraw.ts](src/lib/withdraw.ts)) burns the position, swaps
the asset side back to USDG (fee on the swap output only), and leaves everything
in the user's wallet.

## Ground truth

All addresses come from [src/lib/registry.json](src/lib/registry.json), written
by `npx tsx scripts/verify-chain.ts`, which asserts against mainnet RPC:
token metadata (USDG, stock tokens + ERC-8056 `uiMultiplier`), Uniswap v4/v3
bytecode, and live v4 pool ids via StateView. **Re-run it before every deploy**
(the chain is days old; facts move). `scripts/test-zap.ts` dry-runs deposit and
withdraw plans against live pools without sending.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local`:
   - `NEXT_PUBLIC_PRIVY_APP_ID` — from dashboard.privy.io. Enable: embedded
     wallets (create on login), **smart wallets** (Kernel or Safe), **gas
     sponsorship** for chain 4663, login methods email/sms/google/apple/passkey.
   - `NEXT_PUBLIC_FEE_RECIPIENT` — where platform fees accrue.
3. `npm run dev`

## Compliance

Stock-token markets are geofenced in [src/proxy.ts](src/proxy.ts) (US, CA, GB,
CH, AE) per the RHJ issuer restrictions, with disclosures at `/disclosures`.
Get legal review before public launch — a US operator facilitating LP on
tokenized securities is untested ground.

## Agent API

Agents (MCP hosts, bots, LLM tools) can use the same engine without the UI —
discovery at [/llms.txt](public/llms.txt):

- `GET /api/agent/markets` · `GET /api/agent/quote` — read-only
- `POST /api/agent/zap-plan` · `POST /api/agent/withdraw-plan` — executable,
  fee-inclusive call batches signed by the agent's own wallet
- `GET /api/agent/positions?owner=0x…`

An MCP server wrapper is planned once the API shape settles.
