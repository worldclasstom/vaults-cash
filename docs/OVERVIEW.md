# vaults.cash — Overview (source of truth)

_Last updated: 2026-09-24. Living document — update alongside code changes.
Anything dated July describes the earlier Robinhood-only build; see
DECISIONS.md for what changed and why._

## What it is

A self-custodial interface for Uniswap v4 liquidity positions on **Base**
(chain 8453) and **Robinhood Chain** (chain 4663), built for people who have
never used DeFi. Log in with email, pick a pair, type a dollar amount, and one
tap turns the chain's stablecoin into a position in your own wallet.

vaults.cash deploys **no smart contracts**. It is a zap layer: the browser
builds a batch of calls to Uniswap's official contracts, shows every step in
words, and the user's wallet signs it. See `/trust` on the site for what that
does and does not let us do. Also usable by AI agents (MCP + REST).

- Production: https://vaults.cash (Vercel, `prosperity-labs` team, auto-deploys `main`)
- Repo: https://github.com/worldclasstom/vaults-cash (public, MIT — see SECURITY.md)
- Explorers: https://base.blockscout.com · https://robinhoodchain.blockscout.com

## Revenue

`NEXT_PUBLIC_FEE_BPS` (60 = **0.6%**) of the stablecoin converted at deposit
and of the converted output at withdrawal. Paid as plain ERC-20 transfers
inside the same atomic batch. When the depositor was referred, the fee is
split **50/50 on-chain** in that batch: half to the referrer's wallet, half
to the fee wallet (`NEXT_PUBLIC_FEE_RECIPIENT`). Minimum deposit **$5**
(`src/lib/limits.ts`) — a sponsored Base deposit costs ~700–800k gas, which
the fee on a $1 deposit does not cover.

## Architecture (one screen)

| Layer | Choice | Notes |
|---|---|---|
| Auth + wallets | Privy embedded EOA + **Privy smart wallets** (Kernel / ZeroDev v3.1) | same smart-wallet address on both chains; Solana embedded wallet also created |
| Gas | Base: CDP bundler + **CDP paymaster** (sponsored). Robinhood: Alchemy bundler, user pays sub-cent ETH | `NEXT_PUBLIC_GAS_SPONSORED=1` flips the Base copy |
| AMM | Uniswap v4, official deployments on both chains | pools may be currency0/currency1 in either order (`baseIsCurrency0`) |
| Markets | **auto-listed pairs** from per-chain registries; slug `<chain>/<base>-<quote>` | stablecoin-quoted, ETH-quoted, cbBTC-quoted; Robinhood stock tokens (ERC-8056 `uiMultiplier`) |
| Listing filters | ≥ ~$1k virtual quote reserve at registry time; `/api/stats` hides < $25k TVL; < $100 volume/24h is badged idle | GeckoTerminal batch stats, 60s cache |
| Chain reads | browser → `/api/rpc/<chainId>` (same-site, read-only methods); server → `BASE_RPC_URL` / `ROBINHOOD_RPC_URL` → Alchemy → public | Robinhood's public RPC has broken CORS (`*,*`); Alchemy key is origin-allowlisted |
| Positions | `/api/positions/nfts` (Alchemy NFT API → Blockscout → RPC logs) + localStorage "known positions" | a fresh mint shows instantly |
| Funding | Privy `useAddFunds` (Stripe card/bank, MoonPay, Relay crypto deposit); raw address as fallback | Apple Pay inside Stripe's Link sheet is Stripe-side (see RUNBOOK) |
| Referrals | httpOnly first-touch `?ref=` cookie (`src/proxy.ts`) → Privy JWT → wallet ownership verified via Privy REST → Neon Postgres ledger, hourly `/api/referral/sync` | payout is on-chain in the batch; the ledger only reports |
| Agents | MCP `https://vaults.cash/api/mcp/mcp` + REST `/api/agent/*` + `/llms.txt` | stateless; agents sign returned call batches |

## Money flow

Deposit (one ERC-4337 user operation, built in `src/lib/zap.ts`):

1. ERC-20 approve → Permit2; Permit2 approve → Universal Router
2. `V4_SWAP` exact-in: stablecoin → quote token when the pair is not
   stablecoin-quoted (e.g. cbBTC/ETH), then quote → base for the range ratio
3. Permit2 approvals for the Position Manager
4. `modifyLiquidities` mint (or add to an existing tokenId); native-ETH legs
   send only the guaranteed swap output and size the mint 1% under it
5. fee transfer(s): referrer share + fee wallet

Slippage-bounded; the whole batch reverts together. Withdraw
(`src/lib/withdraw.ts`) burns the position, unwinds both legs back to the
stablecoin (fee on the converted output only), and leaves everything in the
user's wallet. `src/lib/describeCalls.ts` renders every step in words on the
confirm sheet.

## Ground truth

All addresses live in `src/lib/registries/{base,robinhood}.json`, regenerated
by `npx tsx scripts/verify-chain.ts --chain <base|robinhood>` against mainnet.
Never hardcode elsewhere. `scripts/test-zap.ts` dry-runs plans for every
market without sending.

## Trust posture

No custody, no contracts, no admin keys. In-product proof: `/trust`, decoded
signing steps, "Open in Uniswap" and explorer links on every position, Privy
key export on Account. A contract enters the picture only when a feature
cannot be done from the user's wallet (first candidate: auto-close for
"Targets" range orders — see ROADMAP).

## Compliance posture

Robinhood stock tokens are listed (kind `stock`) since 2026-09-23, after US
regulators permitted stock tokens; the July jurisdiction gate in
`src/proxy.ts` was removed. Disclosures at `/disclosures` cover both chains
and stock tokens. Legal review before public marketing is still advised.

## Status (2026-09-24)

Live on both chains. First gasless Base deposit passed 2026-09-23 (position
#3084756). Robinhood Chain USDG deposit not yet exercised end to end by a
user. Referral split verified on-chain. Repo public.
