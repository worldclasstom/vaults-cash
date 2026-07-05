// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VaultPair} from "../src/VaultPair.sol";

contract MockERC20 { // shared
    string public name;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory n, uint8 d) {
        name = n;
        decimals = d;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockOracle {
    int256 public answer;
    uint256 public updatedAt;

    function set(int256 a) external {
        answer = a;
        updatedAt = block.timestamp;
    }

    function setStale(int256 a, uint256 t) external {
        answer = a;
        updatedAt = t;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract VaultPairTest is Test {
    MockERC20 weth;
    MockERC20 usdg;
    MockOracle oracle;
    VaultPair vault;

    address constant ROUTER = address(0xB0B);
    uint256 constant E8 = 1e8;

    // spec params
    uint256 constant SPREAD = 30;
    uint256 constant MIN_PROFIT = 25;
    uint256 constant MAX_AGE = 90;
    uint256 constant MAX_TRADE = 150e6;
    uint256 constant MAX_WEIGHT = 8000;

    function setUp() public {
        weth = new MockERC20("WETH", 18);
        usdg = new MockERC20("USDG", 6);
        oracle = new MockOracle();
        vm.warp(1_000_000);
        oracle.set(int256(1800 * E8)); // ETH = $1800

        vault = new VaultPair(
            address(weth), address(usdg), address(oracle),
            SPREAD, MIN_PROFIT, MAX_AGE, MAX_TRADE, MAX_WEIGHT
        );

        // fund: ~$275 of ETH + $275 USDG (pilot-like)
        weth.mint(address(this), 1 ether);
        usdg.mint(address(this), 1000e6);
        weth.approve(address(vault), type(uint256).max);
        usdg.approve(address(vault), type(uint256).max);
        vault.fund(0.15 ether, 275e6); // 0.15 ETH @1800 = $270 lot

        // router inventory for fills
        weth.mint(ROUTER, 100 ether);
        usdg.mint(ROUTER, 1_000_000e6);
    }

    // ------------------------------------------------------------ helpers

    function routerBuyFromUs(uint256 usdgIn) internal returns (uint256 out) {
        out = vault.getAmountOut(false, usdgIn);
        vm.startPrank(ROUTER);
        usdg.approve(address(vault), usdgIn);
        out = vault.swapExactIn(false, usdgIn, out, ROUTER, block.timestamp + 60);
        vm.stopPrank();
    }

    function routerSellToUs(uint256 wethIn) internal returns (uint256 out) {
        out = vault.getAmountOut(true, wethIn);
        vm.startPrank(ROUTER);
        weth.approve(address(vault), wethIn);
        out = vault.swapExactIn(true, wethIn, out, ROUTER, block.timestamp + 60);
        vm.stopPrank();
    }

    // -------------------------------------------------------------- quotes

    function test_bidQuoteMath() public view {
        // 0.05 ETH at mid 1800, spread 30bps: 0.05*1800*0.997 = 89.73 USDG
        uint256 out = vault.getAmountOut(true, 0.05 ether);
        assertEq(out, 89_730_000);
    }

    function test_askQuoteZero_whenAllLotsUnderwater() public {
        oracle.set(int256(1700 * E8)); // below funding lot basis 1800
        assertEq(vault.getAmountOut(false, 50e6), 0);
    }

    function test_askQuotes_whenLotProfitable() public {
        oracle.set(int256(1810 * E8)); // exec = 1810*1.003 = 1815.43 > 1800*1.0025 = 1804.5
        uint256 out = vault.getAmountOut(false, 50e6);
        assertGt(out, 0);
    }

    function test_staleOracle_quotesZero() public {
        oracle.setStale(int256(1800 * E8), block.timestamp - MAX_AGE - 1);
        assertEq(vault.getAmountOut(true, 0.01 ether), 0);
        assertEq(vault.getAmountOut(false, 10e6), 0);
    }

    function test_maxTrade_enforced() public view {
        // bid producing > $150 USDG out must quote 0
        assertEq(vault.getAmountOut(true, 0.1 ether), 0); // ~$179
        assertEq(vault.getAmountOut(false, 151e6), 0);
    }

    function test_weightCap_stopsBidding() public {
        // drain most USDG via successive bids until cap blocks
        for (uint256 i = 0; i < 20; i++) {
            uint256 q = vault.getAmountOut(true, 0.08 ether);
            if (q == 0) break;
            routerSellToUs(0.08 ether);
        }
        // at this point a further meaningful bid must be rejected by cap/balance
        assertEq(vault.getAmountOut(true, 0.08 ether), 0);
    }

    // ---------------------------------------------------------------- fills

    function test_bidFill_pushesLotAtMid() public {
        uint256 lotsBefore = vault.lotCount();
        routerSellToUs(0.05 ether);
        assertEq(vault.lotCount(), lotsBefore + 1);
        (uint128 amt, uint128 px) = vault.lots(vault.lotCount() - 1);
        assertEq(uint256(amt), 0.05 ether);
        assertEq(uint256(px), 1800 * E8);
    }

    function test_lifo_skipsUnderwaterNewerLot() public {
        // add USDG headroom so the 80% weight cap isn't the binding constraint
        // (this test is about lot selection, not the accumulation guard)
        vault.fund(0, 600e6);
        // buy a lot high, then price falls, buy cheap, then partial recovery
        oracle.set(int256(2000 * E8));
        routerSellToUs(0.05 ether); // lot @2000
        oracle.set(int256(1600 * E8));
        routerSellToUs(0.05 ether); // lot @1600
        oracle.set(int256(1700 * E8)); // 2000-lot underwater, 1600-lot profitable

        uint256 sellable = vault.getAmountOut(false, 60e6);
        assertGt(sellable, 0);
        uint256 lotsBefore = vault.lotCount();
        routerBuyFromUs(60e6);
        // newest profitable (1600) consumed; 2000 lot must still exist
        bool found2000;
        for (uint256 i = 0; i < vault.lotCount(); i++) {
            (, uint128 px) = vault.lots(i);
            if (uint256(px) == 2000 * E8) found2000 = true;
        }
        assertTrue(found2000, "underwater lot must never be consumed");
        assertLe(vault.lotCount(), lotsBefore);
    }

    function test_income_onlyIncreases_andPositive() public {
        oracle.set(int256(1600 * E8));
        routerSellToUs(0.05 ether);
        oracle.set(int256(1700 * E8));
        uint256 before = vault.cumulativeIncomeUsdg();
        routerBuyFromUs(40e6);
        assertGt(vault.cumulativeIncomeUsdg(), before);
    }

    function test_deadline_and_minOut_revert() public {
        vm.startPrank(ROUTER);
        weth.approve(address(vault), 0.01 ether);
        vm.expectRevert("expired");
        vault.swapExactIn(true, 0.01 ether, 0, ROUTER, block.timestamp - 1);
        uint256 q = vault.getAmountOut(true, 0.01 ether);
        vm.expectRevert("insufficient output");
        vault.swapExactIn(true, 0.01 ether, q + 1, ROUTER, block.timestamp + 60);
        vm.stopPrank();
    }

    function test_onlyOwner_ops() public {
        vm.prank(ROUTER);
        vm.expectRevert("not owner");
        vault.setPaused(true);
        vm.prank(ROUTER);
        vm.expectRevert("not owner");
        vault.withdrawAll();
    }

    function test_withdrawAll_returnsEverything() public {
        uint256 w = weth.balanceOf(address(vault));
        uint256 u = usdg.balanceOf(address(vault));
        uint256 wBefore = weth.balanceOf(address(this));
        uint256 uBefore = usdg.balanceOf(address(this));
        vault.withdrawAll();
        assertEq(weth.balanceOf(address(this)), wBefore + w);
        assertEq(usdg.balanceOf(address(this)), uBefore + u);
        assertEq(vault.lotCount(), 0);
    }

    // ------------------------------------------------------------ INVARIANT

    /// Fuzz a random price path with random fills; the vault must never
    /// realize a loss: cumulative income only increases, and every ask fill
    /// happens at exec >= basis * (1 + minProfit) (enforced by quote gating —
    /// asserted here via income delta > 0 whenever an ask fills).
    function testFuzz_neverRealizeLoss(uint256[8] memory prices, uint8[8] memory actions) public {
        uint256 income = vault.cumulativeIncomeUsdg();
        for (uint256 i = 0; i < 8; i++) {
            uint256 p = 1000 + (prices[i] % 3000); // $1000..$4000
            oracle.set(int256(p * E8));
            if (actions[i] % 2 == 0) {
                uint256 q = vault.getAmountOut(true, 0.02 ether);
                if (q > 0) routerSellToUs(0.02 ether);
            } else {
                uint256 usdgIn = 20e6;
                uint256 q = vault.getAmountOut(false, usdgIn);
                if (q > 0) {
                    routerBuyFromUs(usdgIn);
                    assertGt(vault.cumulativeIncomeUsdg(), income, "ask fill must realize profit");
                }
            }
            uint256 nowIncome = vault.cumulativeIncomeUsdg();
            assertGe(nowIncome, income, "income must never decrease");
            income = nowIncome;
        }
    }
}
