# vaults.cash

> Docs: [OVERVIEW](docs/OVERVIEW.md) (source of truth) ·
> [DECISIONS](docs/DECISIONS.md) (why things are the way they are) ·
> [RUNBOOK](docs/RUNBOOK.md) (ops + gotchas) · [ROADMAP](ROADMAP.md)

Dead-simple Uniswap v4 liquidity positions on **Base** (8453) and **Robinhood
Chain** (4663), for people new to DeFi. Log in with email, pick a pair (blue-chip
crypto, ETH-quoted pairs, or Robinhood stock tokens), type a dollar amount, and
one tap turns the chain's stablecoin (USDC / USDG) into a Uniswap v4 LP position
in your own wallet. Self-custodial via Privy embedded + ERC-4337 smart wallets;
gas sponsored on Base.

**vaults.cash has no contracts of its own.** It is a zap layer: the app builds a
batch of calls to Uniswap's official contracts, shows every step in words, and
the user's wallet signs it. See [/trust](https://vaults.cash/trust) for what
that does and doesn't let us do.

## How money flows

Deposit (one atomic userOp, built in [src/lib/zap.ts](src/lib/zap.ts)):

1. Platform fee (`NEXT_PUBLIC_FEE_BPS`, 0.6% in prod) → fee wallet, split
   50/50 with the referrer's wallet when there is one (plain ERC-20 transfers)
2. Stablecoin → Permit2 → UniversalRouter approvals
3. `V4_SWAP` exact-in: stablecoin → quote token when the pair isn't
   stablecoin-quoted (e.g. cbBTC/ETH), then quote → base for the range ratio
4. Permit2 approvals for the PositionManager
5. `modifyLiquidities` mint (or add to an existing tokenId) — slippage-bounded;
   the whole batch reverts together

Withdraw ([src/lib/withdraw.ts](src/lib/withdraw.ts)) burns the position,
unwinds both legs back to the stablecoin (fee on the converted output only),
and leaves everything in the user's wallet. Minimum deposit: $5
([src/lib/limits.ts](src/lib/limits.ts)).

## Ground truth

All addresses come from [src/lib/registries/](src/lib/registries/) (one file per chain; markets are every live pool, listed as pairs), written
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


## Security

No contracts, no custody, no admin keys. See [SECURITY.md](SECURITY.md) for
what's in scope and how to report privately.

## License

[MIT](LICENSE).
