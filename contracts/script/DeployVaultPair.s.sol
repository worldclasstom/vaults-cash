// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VaultPair} from "../src/VaultPair.sol";

/// @notice Deploys the pilot VaultPair (WETH/USDG) with the signed-off params.
///         LLC-capital only; owner = deployer = LLC treasury.
///
/// Required env:
///   PRIVATE_KEY        deployer (becomes owner)
///   ETH_USD_FEED       Chainlink ETH/USD aggregator on Robinhood Chain
///                      (READ FROM docs.chain.link — do NOT guess; must be
///                       8-decimals or the constructor reverts)
///
/// Run:
///   forge script script/DeployVaultPair.s.sol \
///     --rpc-url https://rpc.mainnet.chain.robinhood.com \
///     --broadcast --verify
contract DeployVaultPair is Script {
    // Robinhood Chain mainnet, from docs.robinhood.com/chain/contracts
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    // spec params (docs/VAULT_SPEC.md, signed off 2026-07-04)
    uint256 constant SPREAD_BPS = 30;
    uint256 constant MIN_PROFIT_BPS = 25;
    uint256 constant MAX_ORACLE_AGE = 90;
    uint256 constant MAX_TRADE_USDG = 150e6;
    uint256 constant MAX_ETH_WEIGHT_BPS = 8000;

    function run() external {
        address feed = vm.envAddress("ETH_USD_FEED");
        require(feed != address(0), "set ETH_USD_FEED (Chainlink ETH/USD on 4663)");
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        VaultPair vault = new VaultPair(
            WETH, USDG, feed,
            SPREAD_BPS, MIN_PROFIT_BPS, MAX_ORACLE_AGE, MAX_TRADE_USDG, MAX_ETH_WEIGHT_BPS
        );
        vm.stopBroadcast();

        console.log("VaultPair deployed:", address(vault));
        console.log("owner (LLC treasury):", vault.owner());
        console.log("Next: approve + fund(wethAmount, usdgAmount), then register with Rialto.");
    }
}
