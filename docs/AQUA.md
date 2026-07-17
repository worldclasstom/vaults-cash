# Aqua (1inch) — grounded reference for vaults.cash

_Compiled 2026-07-17 from the whitepaper (Dev Preview 1.0), the full protocol
source (lib/aqua, v1.0.0), and the TypeScript SDK (@1inch/aqua-sdk, updated
2026-07-16). Everything address-shaped below was verified on-chain._

## What it is (whitepaper, distilled)

LP-centric shared liquidity layer. Motivating data: 84–97% of AMM pool
liquidity sat idle on 90% of days in 2025 (their Dune dashboard,
dune.com/1inch/idle). Aqua's answer: capital never leaves the maker's wallet;
an on-chain registry tracks *virtual balances* that N strategies can spend
from simultaneously. Settlement is atomic at trade time.

- **Maker** = LP (us). **App** = strategy contract. **Taker** = swapper.
- Strategy = ABI-encoded immutable params, opaque to Aqua;
  `strategyHash = keccak256(strategyBytes)`.
- **SLAC** = total provisioned liquidity / wallet equity. Their pitch: 3x
  money-market leverage × 3x strategy multiplexing = 9x notional per equity.
- "Toxic flow" reframe: with high utilization, arb volume = fee revenue.
- O(n) by design (one swap may touch several makers). Discovery is OFF-CHAIN
  (aggregators index `Shipped` events); settlement on-chain. Takers are
  expected to arrive via aggregators/solvers, chiefly 1inch itself.

## The entire core is 215 lines (read in full)

`Aqua.sol` (81 lines): 4-level mapping
`maker → app → strategyHash → token → Balance{uint248 amount, uint8 tokensCount}`
packed in ONE slot (assembly load/store, 1 SLOAD/SSTORE).

Semantics that matter (from source + their 51-test suite):

- **ship(app, strategyBytes, tokens[], amounts[])** — registers balances.
  Reverts if any (maker,app,hash,token) slot was ever used
  (`tokensCount != 0`) → strategies are immutable.
- **dock(app, hash, tokens[])** — must list EXACTLY all shipped tokens
  (`tokensCount == tokens.length`); sets `tokensCount = 0xff` (_DOCKED).
  **Dock is permanent for that hash**: ship→dock→ship of the identical
  strategy REVERTS (testShipDockShipSameStrategyReverts). Re-shipping needs a
  new salt in the strategy struct. Operational rule: salts are one-shot.
- **pull(maker, hash, token, amount, to)** — `msg.sender` IS the app (it's
  the mapping key — only the app can pull, only up to virtual balance).
  No active-check needed: docked balance is 0, so underflow reverts.
  Transfers real tokens maker→taker via `safeTransferFrom` (maker's one-time
  ERC-20 approval to Aqua is the outer security boundary).
- **push(maker, app, hash, token, amount)** — requires ACTIVE strategy;
  transfers real tokens from caller→maker and credits the virtual balance:
  earnings auto-compound into strategy capacity.
- **rawBalances** (no status check) vs **safeBalances** (reverts unless
  token is in an active strategy) — quote paths should use safeBalances or
  check status, else you'll quote on docked strategies.

`AquaApp.sol` (69 lines): base for apps. Canonical swap shape:
`nonReentrantStrategy(maker, hash)` → compute quote → `AQUA.pull(out to
taker)` → taker callback → `_safeCheckAquaPush(tokenIn, balBefore + owed)`.
The push-check REQUIRES the reentrancy lock to be held (enforced in code).

`AquaRouter.sol` (22 lines): Aqua + Simulator + Multicall + Rescuable(owner).
Owner can ONLY rescue stuck tokens (Aqua never holds funds in operation).

## Deployments (verified on-chain 2026-07-17)

| Where | Address | Status |
|---|---|---|
| Base + 11 other chains (SDK canonical) | `0x4a055aa172c98ec32de118b9b5b6ac8b4099a580` | 5,619B code, live |
| Robinhood Chain (SDK canonical) | `0x7c2d4aa5c900c08004fadb1c0d953c5b099fec86` | 5,619B code, live |
| Blog-post address (Nov 2025) | `0x499943e74fb0ce105688beee8ef2abec5d936d31` | 6,251B code — OLDER preview build. Do not use. |

Same-size bytecode SDK-address deployments on Ethereum/Base/RH confirm the
SDK table (Ethereum, BSC, Polygon, Arbitrum, Avalanche, Gnosis, Base,
Optimism, zkSync, Linea, Unichain, Sonic + Robinhood) is the current release.
**Use `AQUA_CONTRACT_ADDRESSES` from @1inch/aqua-sdk, never hardcode.**
Note: 1inch ships a ROBINHOOD NetworkEnum — Aqua runs on RH chain too, so the
grid could someday run there without Rialto.

## TypeScript SDK (@1inch/aqua-sdk)

Thin, viem-based encode/decode: `AquaProtocolContract.ship()/dock()` build
`{to, data, value}` CallInfo; `calculateStrategyHash(bytes)`; typed parsers
for Shipped/Docked/Pulled/Pushed events (that's the off-chain discovery
surface). No quoting/indexing infra in the SDK — indexing strategies is the
integrator's job. pull/push are NOT in the SDK: those are app-contract calls.

## Risks & ops rules for our pilot

1. **Illiquidity ≠ pause.** If the maker wallet balance drops below virtual
   commitments, pulls revert but strategies KEEP QUOTING on virtual balances.
   Stale quotes + returning liquidity = adverse fills (whitepaper §6.2).
   → Dedicated maker wallet holding ONLY pilot funds; monitor real-vs-virtual;
   dock fast when underfunded.
2. **ERC-20 approval to Aqua is the real exposure cap.** Approve exactly the
   pilot budget, not infinity.
3. **A malicious/buggy APP can pull up to its virtual balance.** Ship only to
   apps we wrote or audited. (Aqua bounds the blast radius; it doesn't
   eliminate it.)
4. **Dock permanence**: rotate salts; treat (hash) as single-use.
5. **Flow is not guaranteed.** Discovery is off-chain; in the dev-preview era
   assume WE run the first taker/keeper against our own strategies until
   1inch routing demonstrably indexes Aqua on Base.
6. **License (Aqua-Source-1.1)**: apps extending AquaApp are copyleft
   (publish + attribution — done for FlashLend). Commercial triggers:
   >$100k charged fees/12mo or >$10M liquidity-under-control. STRICT §2.2
   reading requires a commercial license the moment we charge third-party
   fees through Aqua — re-read with counsel before productizing.

## Our assets so far

- `contracts/src/aqua/FlashLend.sol` + 7 tests vs real Aqua (incl. 256-run
  never-lose-principal fuzz).
- Next: `GridSwap` port of VaultPair v0.2 (LIFO no-loss grid, pool-mid
  pricing) keyed by (maker, strategyHash); then ship both on ~$500 after
  explicit go.
