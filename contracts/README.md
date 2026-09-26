# vaults.cash contracts

Foundry workspace. The product contract:

- `src/targets/LadderCloser.sol` — auto-close for Targets ladders. No owner,
  no upgrade path. `registerLatest` / `register` from the rung owner's wallet
  (after `setApprovalForAll` on the PositionManager); `close(ladderId)` by
  anyone, succeeds only once every rung is fully crossed, pays the owner less
  0.6% of principal + 8% of fees earned (half of the fee to the referrer).
  The current fee wallet may hand its role to another address; nothing else
  can change.

`archive/vaultpair/` is the shelved 2026-09 propAMM pilot, kept for reference
and not compiled.

## Test

Fork tests against the live ETH/USDC pool on Base and TSLA/USDG on Robinhood:

    export BASE_RPC_URL=…            # any Base RPC
    export ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
    forge test --match-path 'test/targets/*' -vv

## Deploy

See docs/RUNBOOK.md → "LadderCloser".
