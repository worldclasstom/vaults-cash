// SPDX-License-Identifier: LicenseRef-Degensoft-Aqua-Source-1.1
pragma solidity 0.8.30;

// Powered by Aqua — © Degensoft Ltd 2025 (extends AquaApp; published under
// Aqua-Source-1.1 per its copyleft — see LICENSES in 1inch/aqua).

import { IAqua } from "@1inch/aqua/interfaces/IAqua.sol";
import { AquaApp } from "@1inch/aqua/AquaApp.sol";

/// @notice Flash-loan callback: receive `amount` of `token`, do anything, and
///         push back `amount + fee` to the maker's Aqua balance before returning.
interface IFlashLendCallback {
    function flashLendCallback(
        address token,
        uint256 amount,
        uint256 fee,
        address maker,
        bytes32 strategyHash,
        bytes calldata takerData
    ) external;
}

/// @title FlashLend — vaults.cash flash-loan app on Aqua (pilot)
/// @notice Lends a maker's idle wallet balance for exactly one transaction.
///         The borrower repays principal + fee atomically or everything
///         reverts — principal cannot be lost to a non-repaying borrower.
///         Funds never leave the maker's wallet between loans; this app only
///         has pull rights while a shipped strategy is active. Stacks with
///         other Aqua strategies on the same balance (shared liquidity).
contract FlashLend is AquaApp {
    error ZeroAmount();

    /// @param maker  liquidity provider whose wallet funds the loans
    /// @param token  the token this strategy lends
    /// @param feeBps fee per loan in basis points, rounded up, paid to maker
    /// @param salt   uniquifier so identical params can ship twice
    struct Strategy {
        address maker;
        address token;
        uint256 feeBps;
        bytes32 salt;
    }

    uint256 internal constant BPS_BASE = 10_000;

    event FlashLoan(
        address indexed maker,
        bytes32 indexed strategyHash,
        address indexed borrower,
        address token,
        uint256 amount,
        uint256 fee
    );

    constructor(IAqua aqua_) AquaApp(aqua_) { }

    /// @notice Largest loan currently available from this strategy.
    function maxFlashLoan(Strategy calldata strategy) external view returns (uint256 available) {
        (uint248 balance,) =
            AQUA.rawBalances(strategy.maker, address(this), keccak256(abi.encode(strategy)), strategy.token);
        return balance;
    }

    /// @notice Fee the borrower must repay on top of principal.
    function flashFee(Strategy calldata strategy, uint256 amount) public pure returns (uint256 fee) {
        // round up so no nonzero loan is ever free
        return (amount * strategy.feeBps + BPS_BASE - 1) / BPS_BASE;
    }

    /// @notice Borrow `amount`, receive callback, repay `amount + fee` — atomically.
    function flashLoan(
        Strategy calldata strategy,
        uint256 amount,
        address to,
        bytes calldata takerData
    ) external nonReentrantStrategy(strategy.maker, keccak256(abi.encode(strategy))) {
        require(amount > 0, ZeroAmount());
        bytes32 strategyHash = keccak256(abi.encode(strategy));

        // balance BEFORE the pull; repayment must restore it plus the fee
        (uint248 balanceBefore,) = AQUA.rawBalances(strategy.maker, address(this), strategyHash, strategy.token);
        uint256 fee = flashFee(strategy, amount);

        AQUA.pull(strategy.maker, strategyHash, strategy.token, amount, to);
        IFlashLendCallback(msg.sender).flashLendCallback(
            strategy.token, amount, fee, strategy.maker, strategyHash, takerData
        );
        _safeCheckAquaPush(strategy.maker, strategyHash, strategy.token, uint256(balanceBefore) + fee);

        emit FlashLoan(strategy.maker, strategyHash, msg.sender, strategy.token, amount, fee);
    }
}
