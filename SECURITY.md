# Security

vaults.cash deploys one small contract, `LadderCloser`
(`contracts/src/targets/LadderCloser.sol`): the auto-close for Targets. It has
no owner and no upgrade path; anyone may call `close`, which only succeeds
once every rung of a registered ladder is crossed and can only pay the rung
owner less the fixed fees. Everything else is a batch of calls to Uniswap v4's
official contracts, built in the browser (`src/lib/zap.ts`,
`src/lib/withdraw.ts`, `src/lib/targets.ts`) and signed by the user's own
wallet. The interesting surface is therefore:

- `LadderCloser` itself (a way to close an uncrossed rung, to route proceeds
  anywhere but the owner, or to touch a position that was never registered)

- the transaction builders (wrong calls, wrong recipients, missing slippage bounds)
- the referral API (`src/app/api/referral/*`, Privy JWT auth)
- the RPC proxy (`src/app/api/rpc/[chainId]`)
- the pool listing / stats layer (a mislabelled pool is a user-harm bug too)

## Reporting

Please report vulnerabilities privately through GitHub's "Report a
vulnerability" button on this repository's Security tab. We aim to acknowledge
within 3 days. Please don't open a public issue for anything exploitable.

## Scope notes

- Uniswap v4, Permit2, Privy, ZeroDev/Kernel and the CDP/Alchemy bundlers are
  third-party; report issues in them upstream.
- `contracts/archive/` is a shelved, undeployed pilot and not part of the
  product. `contracts/src/targets/` is.
