# Security

vaults.cash deploys no smart contracts. Every deposit and withdrawal is a batch
of calls to Uniswap v4's official contracts, built in the browser
(`src/lib/zap.ts`, `src/lib/withdraw.ts`) and signed by the user's own wallet.
The interesting surface is therefore:

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
- The contracts under `contracts/` are an unfinished, undeployed pilot and are
  not part of the product.
