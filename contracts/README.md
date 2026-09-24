# vaults.cash contracts

> **Shelved (2026-09-24).** Undeployed pilot kept for reference; not part of the product and out of scope for SECURITY.md.

Solidity for The Vault (see ../docs/VAULT_SPEC.md).

- `src/VaultPair.sol` — Rialto propAMM liquidity source implementing the
  LIFO no-loss grid strategy. Pilot v0: LLC-capital only, no third-party
  deposits (ERC-4626 wrapper comes after audit + counsel).

## Test

    forge test          # 13 tests incl. fuzzed no-realize-loss invariant
    forge test -vvv     # verbose

## Not yet done (pre-deploy gates)

- Rialto onboarding confirmed for Robinhood Chain (4663)
- External security audit
- Securities counsel sign-off before any pooled/user deposits
