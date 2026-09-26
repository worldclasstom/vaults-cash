// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "v4-periphery/src/libraries/Actions.sol";
import {PositionInfo, PositionInfoLibrary} from "v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {LadderCloser} from "../../src/targets/LadderCloser.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IPosm721 {
    function ownerOf(uint256) external view returns (address);
    function setApprovalForAll(address, bool) external;
}

/// Fork tests against the live ETH/USDC 0.05% pool on Base.
contract LadderCloserBaseTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    IPositionManager constant POSM = IPositionManager(0x7C5f5A4bBd8fD63184577525326123B519429bDc);
    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    int24 constant SPACING = 10;

    PoolKey key;
    LadderCloser closer;
    PoolSwapTest router;
    address user = makeAddr("user");
    address referrer = makeAddr("referrer");
    address feeWallet = makeAddr("feeWallet");
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.createSelectFork("base");
        key = PoolKey(Currency.wrap(address(0)), Currency.wrap(USDC), 500, SPACING, IHooks(address(0)));
        assertEq(PoolId.unwrap(key.toId()), 0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a, "pool key");
        closer = new LadderCloser(POSM, feeWallet, 60, 800);
        router = new PoolSwapTest(PM);
        for (uint256 i = 0; i < 2; i++) {
            address a = i == 0 ? user : stranger;
            vm.deal(a, 1_000 ether);
            deal(USDC, a, 5_000_000e6);
            vm.startPrank(a);
            IERC20(USDC).approve(address(PERMIT2), type(uint256).max);
            IERC20(USDC).approve(address(router), type(uint256).max);
            PERMIT2.approve(USDC, address(POSM), type(uint160).max, type(uint48).max);
            vm.stopPrank();
        }
    }

    function tick() internal view returns (int24 t) {
        (, t,,) = PM.getSlot0(key.toId());
    }

    function roundUp(int24 t) internal pure returns (int24) {
        int24 r = t % SPACING;
        if (r < 0) r += SPACING;
        return r == 0 ? t : t + (SPACING - r);
    }

    /// Mint `n` adjacent rungs of width SPACING starting at `first` (upwards
    /// when ethSide, downwards otherwise), each with `liq` liquidity, as user.
    function mintRungs(int24 first, uint256 n, uint128 liq, bool ethSide) internal returns (uint256[] memory ids) {
        bytes memory actions;
        bytes[] memory params = new bytes[](n + 2);
        uint256 value;
        uint256 next = POSM.nextTokenId();
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            int24 lo = ethSide ? first + int24(int256(i)) * SPACING : first - int24(int256(i + 1)) * SPACING;
            int24 hi = lo + SPACING;
            uint160 sa = TickMath.getSqrtPriceAtTick(lo);
            uint160 sb = TickMath.getSqrtPriceAtTick(hi);
            uint256 a0 = ethSide ? SqrtPriceMath.getAmount0Delta(sa, sb, liq, true) + 1 : 0;
            uint256 a1 = ethSide ? 0 : SqrtPriceMath.getAmount1Delta(sa, sb, liq, true) + 1;
            actions = abi.encodePacked(actions, uint8(Actions.MINT_POSITION));
            params[i] = abi.encode(key, lo, hi, uint256(liq), uint128(a0), uint128(a1), user, bytes(""));
            value += a0;
            ids[i] = next + i;
        }
        actions = abi.encodePacked(actions, uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP));
        params[n] = abi.encode(key.currency0, key.currency1);
        params[n + 1] = abi.encode(key.currency0, user);
        vm.prank(user);
        POSM.modifyLiquidities{value: value}(abi.encode(actions, params), block.timestamp + 60);
        for (uint256 i = 0; i < n; i++) assertEq(IPosm721(address(POSM)).ownerOf(ids[i]), user, "minted to user");
    }

    function buyEth(uint256 usdcIn) internal {
        vm.prank(stranger);
        router.swap(key, SwapParams(false, -int256(usdcIn), TickMath.MAX_SQRT_PRICE - 1), PoolSwapTest.TestSettings(false, false), "");
    }

    function sellEth(uint256 ethIn) internal {
        vm.prank(stranger);
        router.swap{value: ethIn}(key, SwapParams(true, -int256(ethIn), TickMath.MIN_SQRT_PRICE + 1), PoolSwapTest.TestSettings(false, false), "");
    }

    function principal1(uint256[] memory ids) internal view returns (uint256 p) {
        for (uint256 i = 0; i < ids.length; i++) {
            (, int24 lo, int24 hi) = rung(ids[i]);
            p += SqrtPriceMath.getAmount1Delta(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), POSM.getPositionLiquidity(ids[i]), false);
        }
    }

    function principal0(uint256[] memory ids) internal view returns (uint256 p) {
        for (uint256 i = 0; i < ids.length; i++) {
            (, int24 lo, int24 hi) = rung(ids[i]);
            p += SqrtPriceMath.getAmount0Delta(TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), POSM.getPositionLiquidity(ids[i]), false);
        }
    }

    function rung(uint256 id) internal view returns (uint128 liq, int24 lo, int24 hi) {
        liq = POSM.getPositionLiquidity(id);
        (, PositionInfo info) = POSM.getPoolAndPositionInfo(id);
        lo = info.tickLower();
        hi = info.tickUpper();
    }

    // ------------------------------------------------------------ tests

    function test_upLadder_closesOnlyAfterTargetPrints() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 3, 2e15, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(3, true, referrer);
        vm.stopPrank();
        assertEq(ladderId, 1);
        assertFalse(closer.isClosable(ladderId));

        // too early: nothing has crossed
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotCrossed.selector, ids[0]));
        vm.prank(stranger);
        closer.close(ladderId);

        // part way: nudge price into the ladder but not past the top rung
        for (uint256 i = 0; i < 60 && tick() < first + SPACING; i++) buyEth(500e6);
        assertLt(tick(), first + 3 * SPACING, "swap step too big for this pool depth");
        assertFalse(closer.isClosable(ladderId));
        vm.expectRevert();
        vm.prank(stranger);
        closer.close(ladderId);

        // target prints
        buyEth(400_000e6);
        assertGe(tick(), first + 3 * SPACING, "target crossed");
        assertTrue(closer.isClosable(ladderId));

        uint256 p1 = principal1(ids);
        uint256 uBefore = IERC20(USDC).balanceOf(user);
        uint256 fBefore = IERC20(USDC).balanceOf(feeWallet);
        uint256 rBefore = IERC20(USDC).balanceOf(referrer);
        vm.prank(stranger);
        closer.close(ladderId);

        uint256 toUser = IERC20(USDC).balanceOf(user) - uBefore;
        uint256 toFee = IERC20(USDC).balanceOf(feeWallet) - fBefore;
        uint256 toRef = IERC20(USDC).balanceOf(referrer) - rBefore;
        uint256 received = toUser + toFee + toRef;
        assertGe(received, p1, "rungs paid at least their principal");
        uint256 earned = received - p1;
        assertGt(earned, 0, "the swap through the rungs paid fees");
        uint256 expectedFee = (p1 * 60) / 10_000 + (earned * 800) / 10_000;
        assertApproxEqAbs(toFee + toRef, expectedFee, 2, "0.6% of principal + 8% of fees");
        assertApproxEqAbs(toRef, expectedFee / 2, 2, "referrer gets half");
        assertEq(toUser, received - toFee - toRef);
        assertEq(IERC20(USDC).balanceOf(address(closer)), 0, "nothing stays in the contract");
        assertEq(address(closer).balance, 0);
        assertEq(user.balance, 1_000 ether - (1_000 ether - user.balance), "no ETH movement on close beyond mint");
        for (uint256 i = 0; i < ids.length; i++) {
            vm.expectRevert();
            IPosm721(address(POSM)).ownerOf(ids[i]);
        }
        assertFalse(closer.isClosable(ladderId));
        vm.expectRevert(LadderCloser.AlreadyClosed.selector);
        closer.close(ladderId);
    }

    function test_downLadder_paysOutEth() public {
        int24 first = roundUp(tick()) - SPACING; // top of the first rung sits at or below price
        if (first + SPACING > tick()) first -= SPACING;
        uint256[] memory ids = mintRungs(first + SPACING, 3, 2e15, false);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(3, false, address(0));
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotCrossed.selector, ids[0]));
        closer.close(ladderId);

        sellEth(300 ether);
        assertLt(tick(), first + SPACING - 3 * SPACING, "target crossed downward");

        uint256 p0 = principal0(ids);
        uint256 uBefore = user.balance;
        uint256 fBefore = feeWallet.balance;
        closer.close(ladderId);
        uint256 toUser = user.balance - uBefore;
        uint256 toFee = feeWallet.balance - fBefore;
        uint256 received = toUser + toFee;
        assertGe(received, p0);
        uint256 expectedFee = (p0 * 60) / 10_000 + ((received - p0) * 800) / 10_000;
        assertApproxEqAbs(toFee, expectedFee, 2, "no referrer: whole fee to the fee wallet");
        assertEq(address(closer).balance, 0);
        assertEq(IERC20(USDC).balanceOf(address(closer)), 0);
    }

    function test_feeRecipient_handoffOnlyByCurrentWallet() public {
        address next = makeAddr("nextFeeWallet");
        vm.expectRevert(LadderCloser.NotFeeRecipient.selector);
        closer.setFeeRecipient(next);
        vm.prank(feeWallet);
        closer.setFeeRecipient(next);
        assertEq(closer.feeRecipient(), next);
        vm.prank(feeWallet);
        vm.expectRevert(LadderCloser.NotFeeRecipient.selector);
        closer.setFeeRecipient(feeWallet);
    }

    function test_register_needsApproval() public {
        int24 first = roundUp(tick() + 1);
        mintRungs(first, 2, 1e15, true);
        vm.prank(user);
        vm.expectRevert(LadderCloser.NotApproved.selector);
        closer.registerLatest(2, true, address(0));
    }

    function test_register_rejectsAlreadyCrossedRung() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, 1e15, true);
        // a rung above price registered as a "lower" ladder would be closable at once
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.AlreadyCrossed.selector, ids[0]));
        closer.registerLatest(2, false, address(0));
        vm.stopPrank();
    }

    function test_register_rejectsSomeoneElsesRungs() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, 1e15, true);
        vm.startPrank(stranger);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotOwner.selector, ids[0]));
        closer.register(ids, true, address(0));
        vm.stopPrank();
    }

    function test_close_skipsRungsTheOwnerAlreadyBurned() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 3, 2e15, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(3, true, address(0));
        // the owner cashes out the middle rung by hand
        bytes memory actions = abi.encodePacked(uint8(Actions.BURN_POSITION), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(ids[1], uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, user);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp + 60);
        vm.stopPrank();

        buyEth(450_000e6);
        assertTrue(closer.isClosable(ladderId));
        uint256 before = IERC20(USDC).balanceOf(user);
        closer.close(ladderId);
        assertGt(IERC20(USDC).balanceOf(user), before);
        vm.expectRevert();
        IPosm721(address(POSM)).ownerOf(ids[0]);
        vm.expectRevert();
        IPosm721(address(POSM)).ownerOf(ids[2]);
    }

    function test_close_revertsWhenEveryRungIsGone() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 1, 1e15, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(1, true, address(0));
        bytes memory actions = abi.encodePacked(uint8(Actions.BURN_POSITION), uint8(Actions.TAKE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(ids[0], uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, user);
        POSM.modifyLiquidities(abi.encode(actions, params), block.timestamp + 60);
        vm.stopPrank();
        assertFalse(closer.isClosable(ladderId));
        vm.expectRevert(LadderCloser.NothingToClose.selector);
        closer.close(ladderId);
    }

    function test_revokedApproval_blocksClose() public {
        int24 first = roundUp(tick() + 1);
        mintRungs(first, 2, 1e15, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(2, true, address(0));
        IPosm721(address(POSM)).setApprovalForAll(address(closer), false);
        vm.stopPrank();
        buyEth(450_000e6);
        assertTrue(closer.isClosable(ladderId));
        vm.expectRevert();
        closer.close(ladderId);
    }
}
