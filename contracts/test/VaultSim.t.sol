// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {VaultPair} from "../src/VaultPair.sol";
import {MockERC20, MockOracle, MockStateView, PriceMath} from "./VaultPair.t.sol";

/// @notice Head-to-head simulation of the pilot strategy vs (a) HODL 50/50 and
///         (b) a full-range x*y=k Uniswap LP, over identical price paths and an
///         identical fill model. Drives the REAL VaultPair contract.
///
/// FILL MODEL (stated openly — results are directional, not a profit forecast):
///   - Each step price moves; on a DOWN move the vault buys one clip (accumulate),
///     on an UP move it sells one clip IF it has a lot clearing basis+minProfit.
///     This is the classic grid/mean-reversion capture the spec claims.
///   - LP earns feeTier on the same clip volume and follows x*y=k inventory.
///   - HODL just marks to market.
/// All three start from the SAME $ (50/50). We report terminal total value,
/// realized income (the ticking counter), and ETH exposure retained.
contract VaultSim is Test {
    uint256 constant E8 = 1e8;
    uint256 constant PRICE_SCALE = 1e20;
    uint256 constant LP_FEE_BPS = 5; // ETH/USDG 0.05% pool
    address constant ROUTER = address(0xB0B);

    MockERC20 weth;
    MockERC20 usdg;
    MockOracle oracle;
    MockStateView pool;
    VaultPair vault;

    // starting capital: $275 ETH + $275 USDG at p0=$1800  => 0.152778 ETH
    uint256 constant P0 = 1800;
    uint256 constant START_USDG = 275e6;
    uint256 wethStart; // set per scenario at p0
    uint256 constant CLIP_WETH = 0.02 ether; // ~$36 per fill (< maxTrade)

    uint256 startPrice; // path[0]: all three strategies start 50/50 here

    function _setMid(uint256 usd) internal {
        oracle.set(int256(usd * E8));
        pool.set(PriceMath.sqrtP(usd));
    }

    function _fresh(uint256 p0) internal {
        startPrice = p0;
        weth = new MockERC20("WETH", 18);
        usdg = new MockERC20("USDG", 6);
        oracle = new MockOracle();
        pool = new MockStateView();
        vm.warp(1_000_000);
        _setMid(p0);
        vault = new VaultPair(
            address(weth), address(usdg), address(oracle),
            address(pool), bytes32(uint256(1)),
            30, 25, 90_000, 150e6, 8000, 100
        );
        wethStart = (START_USDG * PRICE_SCALE) / (p0 * E8); // equal $ in ETH at p0
        weth.mint(address(this), 1000 ether);
        usdg.mint(address(this), 10_000_000e6);
        weth.approve(address(vault), type(uint256).max);
        usdg.approve(address(vault), type(uint256).max);
        vault.fund(wethStart, START_USDG);
        weth.mint(ROUTER, 100_000 ether);
        usdg.mint(ROUTER, 1_000_000_000e6);
    }

    function _buy(uint256 wethIn) internal returns (bool) {
        uint256 q = vault.getAmountOut(true, wethIn);
        if (q == 0) return false;
        vm.startPrank(ROUTER);
        weth.approve(address(vault), wethIn);
        vault.swapExactIn(true, wethIn, q, ROUTER, block.timestamp + 60);
        vm.stopPrank();
        return true;
    }

    function _sellUsdgForWeth(uint256 wethTarget, uint256 price) internal returns (bool) {
        // find a USDG-in that yields ~wethTarget at current ask
        uint256 exec = (PriceMath.mid(price) * (10_000 + 30)) / 10_000;
        uint256 usdgIn = (wethTarget * exec) / PRICE_SCALE;
        if (usdgIn == 0 || usdgIn > 150e6) return false;
        uint256 q = vault.getAmountOut(false, usdgIn);
        if (q == 0) return false;
        vm.startPrank(ROUTER);
        usdg.approve(address(vault), usdgIn);
        vault.swapExactIn(false, usdgIn, q, ROUTER, block.timestamp + 60);
        vm.stopPrank();
        return true;
    }

    /// returns (vaultNAV, vaultIncome, hodlValue, lpValue) in USDG (1e6), at endP
    function _run(uint256[] memory path) internal returns (uint256, uint256, uint256, uint256) {
        _fresh(path[0]);
        uint256 lpFees;
        uint256 prev = path[0];
        for (uint256 i = 0; i < path.length; i++) {
            uint256 p = path[i];
            _setMid(p);

            // vault fills
            if (p < prev) {
                _buy(CLIP_WETH);
            } else if (p > prev) {
                _sellUsdgForWeth(CLIP_WETH, p);
            }

            // LP rebalances along x*y=k to the new price; earns fee on the clip
            // clip notional in USDG:
            uint256 clipUsdg = (CLIP_WETH * p * E8) / PRICE_SCALE;
            lpFees += (clipUsdg * LP_FEE_BPS) / 10_000;
            prev = p;
        }

        uint256 endP = path[path.length - 1];

        // vault terminal
        _setMid(endP);
        uint256 vNav = vault.nav();
        uint256 vIncome = vault.cumulativeIncomeUsdg();

        // HODL 50/50 terminal
        uint256 hodl = (wethStart * endP * E8) / PRICE_SCALE + START_USDG;

        // LP full-range x*y=k: 50/50 value tracks V0 * sqrt(p/p0) (classic IL
        // payoff) plus accumulated fees.
        uint256 v0 = START_USDG * 2; // total start USDG
        uint256 lpVal = (v0 * _sqrt((endP * 1e12) / startPrice)) / 1e6 + lpFees;

        return (vNav, vIncome, hodl, lpVal);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    function _report(string memory name, uint256[] memory path) internal {
        (uint256 vNav, uint256 vInc, uint256 hodl, uint256 lp) = _run(path);
        console.log("=== %s (end $%s) ===", name, path[path.length - 1]);
        console.log("  Vault NAV   : $%s.%s", vNav / 1e6, _cents(vNav));
        console.log("    of which realized income: $%s.%s", vInc / 1e6, _cents(vInc));
        console.log("  HODL 50/50  : $%s.%s", hodl / 1e6, _cents(hodl));
        console.log("  UniV4 LP    : $%s.%s", lp / 1e6, _cents(lp));
    }

    function _cents(uint256 v) internal pure returns (uint256) {
        return (v % 1e6) / 1e4;
    }

    // ---------------------------------------------------------- scenarios

    function test_sim_chop() public {
        // round-trip chop around $1800, ends flat — the strategy's best regime
        uint16[20] memory steps =
            [1800, 1770, 1740, 1780, 1810, 1780, 1750, 1720, 1760, 1800, 1830, 1800, 1770, 1800, 1820, 1790, 1760, 1790, 1810, 1800];
        _report("CHOP / round-trip, ends flat", _toPath(steps));
    }

    function test_sim_rally() public {
        uint16[11] memory steps = [1800, 1860, 1920, 1990, 2060, 2140, 2220, 2300, 2380, 2460, 2520];
        _report("STRAIGHT RALLY +40%", _toPath(steps));
    }

    function test_sim_crash() public {
        uint16[11] memory steps = [1800, 1720, 1650, 1560, 1480, 1400, 1320, 1260, 1200, 1150, 1100];
        _report("CRASH -39%", _toPath(steps));
    }

    function test_sim_crashRecover() public {
        // down then all the way back — where "hold the dip, harvest recovery" shines
        uint16[17] memory steps =
            [1800, 1700, 1600, 1500, 1450, 1400, 1450, 1520, 1600, 1660, 1700, 1740, 1760, 1780, 1790, 1800, 1800];
        _report("CRASH then FULL RECOVERY", _toPath(steps));
    }

    function _toPath(uint16[20] memory s) internal pure returns (uint256[] memory p) {
        p = new uint256[](20);
        for (uint256 i; i < 20; i++) p[i] = s[i];
    }

    function _toPath(uint16[11] memory s) internal pure returns (uint256[] memory p) {
        p = new uint256[](11);
        for (uint256 i; i < 11; i++) p[i] = s[i];
    }

    function _toPath(uint16[17] memory s) internal pure returns (uint256[] memory p) {
        p = new uint256[](17);
        for (uint256 i; i < 17; i++) p[i] = s[i];
    }
}
