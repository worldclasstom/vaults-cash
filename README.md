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
(pools drain and new ones appear). `scripts/test-zap.ts` dry-runs deposit and
withdraw plans against live pools without sending.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill in:
   - `NEXT_PUBLIC_PRIVY_APP_ID` — from dashboard.privy.io. Enable embedded
     wallets and **smart wallets (Kernel)**; add Base (CDP bundler + paymaster)
     and Robinhood Chain as a custom chain (Alchemy bundler); login methods
     email / SMS / Google / passkey.
   - `NEXT_PUBLIC_FEE_RECIPIENT` — where the platform fee goes (published on `/trust`).
   - `ALCHEMY_API_KEY` — server-side RPC + NFT indexer (optional locally; public
     RPCs work for reads).
   - `DATABASE_URL` and `PRIVY_APP_SECRET` — only needed for the referral API.
3. `npm run dev`

Docs: [docs/OVERVIEW.md](docs/OVERVIEW.md) (architecture),
[docs/RUNBOOK.md](docs/RUNBOOK.md) (ops + gotchas),
[docs/DECISIONS.md](docs/DECISIONS.md) (why), [ROADMAP.md](ROADMAP.md).

## Compliance

Robinhood stock tokens are listed as `stock` markets; disclosures at
`/disclosures` cover both chains. There is no jurisdiction gate today. Get
legal review before public marketing.

## Agent API

Agents (MCP hosts, bots, LLM tools) use the same engine without the UI —
discovery at [/llms.txt](public/llms.txt):

- MCP (Streamable HTTP): `https://vaults.cash/api/mcp/mcp`
- `GET /api/agent/markets` · `GET /api/agent/quote` — read-only
- `POST /api/agent/zap-plan` · `POST /api/agent/withdraw-plan` — executable,
  fee-inclusive call batches signed by the agent's own wallet
- `GET /api/agent/positions?owner=0x…`


## Security

No contracts, no custody, no admin keys. See [SECURITY.md](SECURITY.md) for
what's in scope and how to report privately.

## License

[MIT](LICENSE).
