// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {LadderCloser} from "../src/targets/LadderCloser.sol";

/**
 * Deploys LadderCloser with the fee wallet and the fixed fees. Same constructor
 * on every chain; the PositionManager differs.
 *
 *   FEE_RECIPIENT=0x… forge script script/DeployLadderCloser.s.sol \
 *     --rpc-url base --broadcast --verify --verifier blockscout \
 *     --verifier-url https://base.blockscout.com/api --private-key $KEEPER_PRIVATE_KEY
 */
contract DeployLadderCloser is Script {
    function run() external {
        address posm = block.chainid == 8453
            ? 0x7C5f5A4bBd8fD63184577525326123B519429bDc
            : block.chainid == 4663 ? 0x58daec3116aae6D93017bAAea7749052E8a04fA7 : address(0);
        require(posm != address(0), "unsupported chain");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        vm.startBroadcast();
        LadderCloser closer = new LadderCloser(IPositionManager(posm), feeRecipient, 60, 800);
        vm.stopBroadcast();
        console.log("LadderCloser", block.chainid, address(closer));
    }
}
