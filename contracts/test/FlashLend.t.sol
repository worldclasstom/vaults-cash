// SPDX-License-Identifier: LicenseRef-Degensoft-Aqua-Source-1.1
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { Aqua } from "@1inch/aqua/Aqua.sol";
import { IAqua } from "@1inch/aqua/interfaces/IAqua.sol";
import { FlashLend, IFlashLendCallback } from "../src/aqua/FlashLend.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test USDC", "USDC") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Borrower that repays principal + fee (the happy path).
contract GoodBorrower is IFlashLendCallback {
    Aqua immutable aqua;
    FlashLend immutable app;

    constructor(Aqua aqua_, FlashLend app_) {
        aqua = aqua_;
        app = app_;
    }

    function borrow(FlashLend.Strategy calldata s, uint256 amount) external {
        app.flashLoan(s, amount, address(this), "");
    }

    function flashLendCallback(
        address token,
        uint256 amount,
        uint256 fee,
        address maker,
        bytes32 strategyHash,
        bytes calldata
    ) external {
        // (arb would happen here) — repay principal + fee into maker's balance
        IERC20(token).approve(address(aqua), amount + fee);
        aqua.push(maker, address(app), strategyHash, token, amount + fee);
    }
}

/// Borrower that keeps the money (must revert the whole loan).
contract Thief is IFlashLendCallback {
    function borrow(FlashLend app, FlashLend.Strategy calldata s, uint256 amount) external {
        app.flashLoan(s, amount, address(this), "");
    }

    function flashLendCallback(address, uint256, uint256, address, bytes32, bytes calldata) external { }
}

contract FlashLendTest is Test {
    Aqua aqua;
    FlashLend app;
    TestToken usdc;
    GoodBorrower borrower;
    Thief thief;

    address constant MAKER = address(0xA11CE);
    uint256 constant BALANCE = 500e18; // the $500 pilot
    uint256 constant FEE_BPS = 5; // 0.05% per loan

    FlashLend.Strategy strategy;

    function setUp() public {
        aqua = new Aqua();
        app = new FlashLend(IAqua(address(aqua)));
        usdc = new TestToken();
        borrower = new GoodBorrower(aqua, app);
        thief = new Thief();

        usdc.mint(MAKER, BALANCE);
        // borrower needs a little working capital to cover fees in tests
        usdc.mint(address(borrower), 10e18);

        strategy = FlashLend.Strategy({
            maker: MAKER,
            token: address(usdc),
            feeBps: FEE_BPS,
            salt: bytes32(uint256(1))
        });

        // maker: one approval to Aqua, then ship the strategy (funds stay in wallet)
        vm.startPrank(MAKER);
        usdc.approve(address(aqua), type(uint256).max);
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = BALANCE;
        aqua.ship(address(app), abi.encode(strategy), tokens, amounts);
        vm.stopPrank();
    }

    function test_fundsStayInWallet() public view {
        assertEq(usdc.balanceOf(MAKER), BALANCE, "shipping must not move funds");
        assertEq(app.maxFlashLoan(strategy), BALANCE);
    }

    function test_flashLoan_realizesFee() public {
        uint256 amount = 400e18;
        uint256 fee = app.flashFee(strategy, amount); // 0.05% of 400 = 0.2
        assertEq(fee, 0.2e18);

        uint256 walletBefore = usdc.balanceOf(MAKER);
        borrower.borrow(strategy, amount);

        // maker's wallet grew by exactly the fee, atomically
        assertEq(usdc.balanceOf(MAKER), walletBefore + fee, "maker earns the fee");
        // and the strategy's virtual balance grew too — compounding capacity
        assertEq(app.maxFlashLoan(strategy), BALANCE + fee);
    }

    function test_flashLoan_feeRoundsUp() public view {
        assertEq(app.flashFee(strategy, 1), 1); // never free
    }

    function test_thief_reverts_wholeLoan() public {
        uint256 walletBefore = usdc.balanceOf(MAKER);
        vm.expectRevert(); // MissingTakerAquaPush
        thief.borrow(app, strategy, 100e18);
        assertEq(usdc.balanceOf(MAKER), walletBefore, "principal untouched after failed repay");
    }

    function test_zeroAmount_reverts() public {
        vm.expectRevert(FlashLend.ZeroAmount.selector);
        app.flashLoan(strategy, 0, address(this), "");
    }

    function test_dock_disablesLending() public {
        address[] memory tokens = new address[](1);
        tokens[0] = address(usdc);
        vm.prank(MAKER);
        aqua.dock(address(app), keccak256(abi.encode(strategy)), tokens);

        assertEq(app.maxFlashLoan(strategy), 0, "docked strategy has no balance");
        vm.expectRevert();
        borrower.borrow(strategy, 1e18);
    }

    /// Fuzz: for any loan size within balance, principal is always restored
    /// and the maker always nets exactly the fee.
    function testFuzz_neverLosePrincipal(uint256 amount) public {
        amount = bound(amount, 1, BALANCE);
        uint256 walletBefore = usdc.balanceOf(MAKER);
        uint256 fee = app.flashFee(strategy, amount);
        borrower.borrow(strategy, amount);
        assertEq(usdc.balanceOf(MAKER), walletBefore + fee);
    }
}
