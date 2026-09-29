# vaults.cash contracts

Foundry workspace. The product contract:

- `src/targets/LadderCloser.sol` — auto-close for Targets ladders. No owner,
  no upgrade path. `registerLatest` / `register` from the rung owner's wallet
  (after `setApprovalForAll` on the PositionManager); `close(ladderId)` by
  anyone, succeeds only once every rung is fully crossed, pays the owner less
  0.6% of principal + 8% of fees earned (half of the fee to the referrer).
  Payouts a recipient can't take (reverts, blacklists, gas-burning
  fallbacks) are held and claimable (`claim` / `claimTo`), so no recipient
  can block an owner's close; each close distributes only its own burns'
  balance deltas, so held reserves are never swept. Positions with a
  PositionManager subscriber are refused (owner-installed code between
  burns). One open ladder per position; the owner can `cancel`. The fee
  wallet changes only by two-step propose/accept. A rung sold to a new
  owner can be re-registered by them (the old ladder lets go). Token payouts
  run in a self-call frame that reverts on any non-standard result, so a
  "failed" payout always means nothing moved. Crossing is judged on the
  pool's sqrt price, so a rung exactly at its far edge counts as converted.
  Three independent review rounds 2026-09-26 (Claude, then ChatGPT/Codex
  twice); every finding above informational is fixed and regression-tested.

`archive/vaultpair/` is the shelved 2026-09 propAMM pilot, kept for reference
and not compiled.

## Deployed

`LadderCloser` is at `0xcF5b6aCaf67FB8154D84Ae6155f29d7941348Ffc` on both Base
(8453) and Robinhood Chain (4663), deployed 2026-09-29 from the keeper
account, source verified (Base Blockscout; Sourcify exact match on both).

## Test

Fork tests against the live ETH/USDC pool on Base and TSLA/USDG on Robinhood:

    export BASE_RPC_URL=…            # any Base RPC
    export ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
    forge test --match-path 'test/targets/*' -vv

## Deploy

See docs/RUNBOOK.md → "LadderCloser".
