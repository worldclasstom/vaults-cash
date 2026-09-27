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
import {ISubscriber} from "v4-periphery/src/interfaces/ISubscriber.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {LadderCloser} from "../../src/targets/LadderCloser.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IPosm721 {
    function ownerOf(uint256) external view returns (address);
    function setApprovalForAll(address, bool) external;
    function transferFrom(address, address, uint256) external;
    function subscribe(uint256 tokenId, address newSubscriber, bytes calldata data) external payable;
    function unsubscribe(uint256 tokenId) external payable;
}

contract NoopSubscriber is ISubscriber {
    function notifySubscribe(uint256, bytes memory) external {}
    function notifyUnsubscribe(uint256) external {}
    function notifyBurn(uint256, address, PositionInfo, uint256, BalanceDelta) external {}
    function notifyModifyLiquidity(uint256, int256, BalanceDelta) external {}
}

contract BurnsGas {
    receive() external payable {
        while (true) {}
    }
}

/// Fork tests against a live hookless v4 pool: currency0 is the asset (native
/// or ERC-20), currency1 the stablecoin. Concrete chains at the bottom.
abstract contract LadderCloserForkTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using PositionInfoLibrary for PositionInfo;

    IAllowanceTransfer constant PERMIT2 = IAllowanceTransfer(0x000000000022D473030F116dDEE9F6B43aC78BA3);

    IPositionManager POSM;
    IPoolManager PM;
    address USDC; // the stablecoin (currency1)
    address ASSET; // currency0; address(0) for native ETH
    int24 SPACING;
    uint24 FEE;
    bytes32 EXPECTED_POOL_ID;
    string RPC_ALIAS;
    uint256 SWAP_STEP_STABLE; // stablecoin units per partial nudge
    uint256 SWAP_BIG_STABLE; // enough to cross three rungs
    uint256 SWAP_BIG_ASSET; // asset units to cross three rungs downward
    uint128 LIQ; // liquidity per rung

    PoolKey key;
    LadderCloser closer;
    PoolSwapTest router;
    address user = makeAddr("user");
    address referrer = makeAddr("referrer");
    address feeWallet = makeAddr("feeWallet");
    address stranger = makeAddr("stranger");

    function configure() internal virtual;

    function setUp() public {
        configure();
        vm.createSelectFork(RPC_ALIAS);
        key = PoolKey(Currency.wrap(ASSET), Currency.wrap(USDC), FEE, SPACING, IHooks(address(0)));
        assertEq(PoolId.unwrap(key.toId()), EXPECTED_POOL_ID, "pool key");
        closer = new LadderCloser(POSM, feeWallet, 60, 800);
        router = new PoolSwapTest(PM);
        for (uint256 i = 0; i < 2; i++) {
            address a = i == 0 ? user : stranger;
            vm.deal(a, 1_000 ether);
            deal(USDC, a, 50_000_000e6);
            if (ASSET != address(0)) deal(ASSET, a, 1_000_000 ether);
            vm.startPrank(a);
            IERC20(USDC).approve(address(PERMIT2), type(uint256).max);
            IERC20(USDC).approve(address(router), type(uint256).max);
            PERMIT2.approve(USDC, address(POSM), type(uint160).max, type(uint48).max);
            if (ASSET != address(0)) {
                IERC20(ASSET).approve(address(PERMIT2), type(uint256).max);
                IERC20(ASSET).approve(address(router), type(uint256).max);
                PERMIT2.approve(ASSET, address(POSM), type(uint160).max, type(uint48).max);
            }
            vm.stopPrank();
        }
    }

    function assetBalance(address a) internal view returns (uint256) {
        return ASSET == address(0) ? a.balance : IERC20(ASSET).balanceOf(a);
    }

    function tick() internal view returns (int24 t) {
        (, t,,) = PM.getSlot0(key.toId());
    }

    function roundUp(int24 t) internal view returns (int24) {
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
            if (ASSET == address(0)) value += a0;
            ids[i] = next + i;
        }
        actions = abi.encodePacked(actions, uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP));
        params[n] = abi.encode(key.currency0, key.currency1);
        params[n + 1] = abi.encode(key.currency0, user);
        vm.prank(user);
        POSM.modifyLiquidities{value: value}(abi.encode(actions, params), block.timestamp + 60);
        for (uint256 i = 0; i < n; i++) assertEq(IPosm721(address(POSM)).ownerOf(ids[i]), user, "minted to user");
    }

    /// Mint one position that straddles the current price (both sides), as user.
    function mintInRange(uint128 liq) internal returns (uint256 id) {
        int24 lo = roundUp(tick()) - SPACING;
        if (lo > tick()) lo -= SPACING;
        int24 hi = lo + 2 * SPACING;
        (uint160 sp,,,) = PM.getSlot0(key.toId());
        uint256 a0 = SqrtPriceMath.getAmount0Delta(sp, TickMath.getSqrtPriceAtTick(hi), liq, true) + 1;
        uint256 a1 = SqrtPriceMath.getAmount1Delta(TickMath.getSqrtPriceAtTick(lo), sp, liq, true) + 1;
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR), uint8(Actions.SWEEP));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(key, lo, hi, uint256(liq), uint128(a0), uint128(a1), user, bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        params[2] = abi.encode(key.currency0, user);
        id = POSM.nextTokenId();
        vm.prank(user);
        POSM.modifyLiquidities{value: ASSET == address(0) ? a0 : 0}(abi.encode(actions, params), block.timestamp + 60);
        assertLe(lo, tick());
        assertGt(hi, tick());
    }

    function buyEth(uint256 usdcIn) internal {
        vm.prank(stranger);
        router.swap(key, SwapParams(false, -int256(usdcIn), TickMath.MAX_SQRT_PRICE - 1), PoolSwapTest.TestSettings(false, false), "");
    }

    function sellEth(uint256 assetIn) internal {
        vm.prank(stranger);
        router.swap{value: ASSET == address(0) ? assetIn : 0}(key, SwapParams(true, -int256(assetIn), TickMath.MIN_SQRT_PRICE + 1), PoolSwapTest.TestSettings(false, false), "");
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
        uint256[] memory ids = mintRungs(first, 3, LIQ, true);
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
        for (uint256 i = 0; i < 60 && tick() < first + SPACING; i++) buyEth(SWAP_STEP_STABLE);
        assertLt(tick(), first + 3 * SPACING, "swap step too big for this pool depth");
        assertFalse(closer.isClosable(ladderId));
        vm.expectRevert();
        vm.prank(stranger);
        closer.close(ladderId);

        // target prints
        buyEth(SWAP_BIG_STABLE);
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
        uint256[] memory ids = mintRungs(first + SPACING, 3, LIQ, false);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(3, false, address(0));
        vm.stopPrank();

        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotCrossed.selector, ids[0]));
        closer.close(ladderId);

        sellEth(SWAP_BIG_ASSET);
        assertLt(tick(), first + SPACING - 3 * SPACING, "target crossed downward");

        uint256 p0 = principal0(ids);
        uint256 uBefore = assetBalance(user);
        uint256 fBefore = assetBalance(feeWallet);
        closer.close(ladderId);
        uint256 toUser = assetBalance(user) - uBefore;
        uint256 toFee = assetBalance(feeWallet) - fBefore;
        uint256 received = toUser + toFee;
        assertGe(received, p0);
        uint256 expectedFee = (p0 * 60) / 10_000 + ((received - p0) * 800) / 10_000;
        assertApproxEqAbs(toFee, expectedFee, 2, "no referrer: whole fee to the fee wallet");
        assertEq(address(closer).balance, 0);
        assertEq(IERC20(USDC).balanceOf(address(closer)), 0);
        assertEq(assetBalance(address(closer)), 0);
    }

    function test_feeRecipient_twoStepHandoff() public {
        address next = makeAddr("nextFeeWallet");
        vm.expectRevert(LadderCloser.NotFeeRecipient.selector);
        closer.proposeFeeRecipient(next);
        vm.prank(feeWallet);
        closer.proposeFeeRecipient(next);
        assertEq(closer.feeRecipient(), feeWallet, "unchanged until accepted");
        vm.expectRevert(LadderCloser.NotPendingFeeRecipient.selector);
        closer.acceptFeeRecipient();
        vm.prank(next);
        closer.acceptFeeRecipient();
        assertEq(closer.feeRecipient(), next);
        vm.prank(feeWallet);
        vm.expectRevert(LadderCloser.NotFeeRecipient.selector);
        closer.proposeFeeRecipient(feeWallet);
    }

    function test_register_rejectsDuplicateRung() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        uint256[] memory dup = new uint256[](3);
        (dup[0], dup[1], dup[2]) = (ids[0], ids[1], ids[0]);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.DuplicateRung.selector, ids[0]));
        closer.register(dup, true, address(0));
        vm.stopPrank();
    }

    function test_close_unknownLadderReverts() public {
        vm.expectRevert(LadderCloser.UnknownLadder.selector);
        closer.close(999);
    }

    /// A fee wallet that can't receive the pool's native currency must not block the owner's close.
    function test_close_holdsFeeForRecipientThatRejects() public {
        if (ASSET != address(0)) return; // needs a native-ETH pool
        RejectsEth bad = new RejectsEth();
        vm.prank(feeWallet);
        closer.proposeFeeRecipient(address(bad));
        vm.prank(address(bad));
        closer.acceptFeeRecipient();

        int24 first = roundUp(tick()) - SPACING;
        if (first + SPACING > tick()) first -= SPACING;
        mintRungs(first + SPACING, 2, LIQ, false);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(2, false, address(0));
        vm.stopPrank();
        sellEth(SWAP_BIG_ASSET);

        uint256 uBefore = user.balance;
        closer.close(ladderId); // does not revert although the fee wallet rejects ETH
        assertGt(user.balance, uBefore, "owner paid");
        uint256 held = closer.owed(key.currency0, address(bad));
        assertGt(held, 0, "fee held for the recipient");
        assertEq(address(closer).balance, held, "contract holds exactly the held amount");

        // the recipient can still claim later, once it can receive
        bad.allow();
        vm.prank(address(bad));
        uint256 got = closer.claim(key.currency0);
        assertEq(got, held);
        assertEq(address(closer).balance, 0);
        assertEq(closer.owed(key.currency0, address(bad)), 0);
    }

    function test_register_needsApproval() public {
        int24 first = roundUp(tick() + 1);
        mintRungs(first, 2, LIQ / 2, true);
        vm.prank(user);
        vm.expectRevert(LadderCloser.NotApproved.selector);
        closer.registerLatest(2, true, address(0));
    }

    function test_register_rejectsAlreadyCrossedRung() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        // a rung above price registered as a "lower" ladder would be closable at once
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.AlreadyCrossed.selector, ids[0]));
        closer.registerLatest(2, false, address(0));
        vm.stopPrank();
    }

    function test_register_rejectsSomeoneElsesRungs() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        vm.startPrank(stranger);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotOwner.selector, ids[0]));
        closer.register(ids, true, address(0));
        vm.stopPrank();
    }

    function test_close_skipsRungsTheOwnerAlreadyBurned() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 3, LIQ, true);
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

        buyEth(SWAP_BIG_STABLE);
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
        uint256[] memory ids = mintRungs(first, 1, LIQ / 2, true);
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
        mintRungs(first, 2, LIQ / 2, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 ladderId = closer.registerLatest(2, true, address(0));
        IPosm721(address(POSM)).setApprovalForAll(address(closer), false);
        vm.stopPrank();
        buyEth(SWAP_BIG_STABLE);
        assertTrue(closer.isClosable(ladderId));
        vm.expectRevert();
        closer.close(ladderId);
    }

    /// F1 regression: money held for one recipient must survive a later close in the same currency.
    function test_heldPayout_survivesLaterClose() public {
        if (ASSET != address(0)) return;
        RejectsEth bad = new RejectsEth();
        vm.prank(feeWallet);
        closer.proposeFeeRecipient(address(bad));
        vm.prank(address(bad));
        closer.acceptFeeRecipient();

        // ladder A: down ladder, close with the fee held for `bad`
        int24 first = roundUp(tick()) - SPACING;
        if (first + SPACING > tick()) first -= SPACING;
        mintRungs(first + SPACING, 2, LIQ, false);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 a = closer.registerLatest(2, false, address(0));
        vm.stopPrank();
        sellEth(SWAP_BIG_ASSET);
        closer.close(a);
        uint256 held = closer.owed(key.currency0, address(bad));
        assertGt(held, 0);
        assertEq(address(closer).balance, held);

        // ladder B: another down ladder below the new price, closed later
        int24 first2 = roundUp(tick()) - SPACING;
        if (first2 + SPACING > tick()) first2 -= SPACING;
        mintRungs(first2 + SPACING, 2, LIQ, false);
        vm.prank(user);
        uint256 b = closer.registerLatest(2, false, address(0));
        sellEth(SWAP_BIG_ASSET);
        uint256 uBefore = user.balance;
        closer.close(b);
        assertGt(user.balance, uBefore, "B's owner paid");
        uint256 owedNow = closer.owed(key.currency0, address(bad));
        assertGe(owedNow, held, "A's held amount untouched (B's fee is held for the same wallet)");
        assertEq(address(closer).balance, owedNow, "contract holds exactly what it owes");

        // and A's recipient gets exactly what it is owed, to an address of its choosing
        address other = makeAddr("other");
        uint256 totalOwed = closer.owed(key.currency0, address(bad));
        vm.prank(address(bad));
        closer.claimTo(key.currency0, other);
        assertEq(other.balance, totalOwed);
        assertEq(closer.owed(key.currency0, address(bad)), 0);
        assertEq(address(closer).balance, 0, "nothing left once every reserve is claimed");
    }

    /// A recipient that burns all the gas it is given must not break the close either.
    function test_close_survivesGasBurningRecipient() public {
        if (ASSET != address(0)) return;
        BurnsGas bad = new BurnsGas();
        vm.prank(feeWallet);
        closer.proposeFeeRecipient(address(bad));
        vm.prank(address(bad));
        closer.acceptFeeRecipient();
        int24 first = roundUp(tick()) - SPACING;
        if (first + SPACING > tick()) first -= SPACING;
        mintRungs(first + SPACING, 2, LIQ, false);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 id = closer.registerLatest(2, false, address(0));
        vm.stopPrank();
        sellEth(SWAP_BIG_ASSET);
        uint256 uBefore = user.balance;
        closer.close(id);
        assertGt(user.balance, uBefore);
        assertGt(closer.owed(key.currency0, address(bad)), 0, "fee held, not lost");
    }

    function test_subscribedRung_rejectedAtRegistrationAndAtClose() public {
        NoopSubscriber sub = new NoopSubscriber();
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        IPosm721(address(POSM)).subscribe(ids[0], address(sub), "");
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.SubscribedRung.selector, ids[0]));
        closer.registerLatest(2, true, address(0));
        IPosm721(address(POSM)).unsubscribe(ids[0]);
        uint256 ladderId = closer.registerLatest(2, true, address(0));
        // subscribed after registration: the close refuses until the owner unsubscribes
        IPosm721(address(POSM)).subscribe(ids[1], address(sub), "");
        vm.stopPrank();
        buyEth(SWAP_BIG_STABLE);
        assertTrue(closer.isClosable(ladderId));
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.SubscribedRung.selector, ids[1]));
        closer.close(ladderId);
        vm.prank(user);
        IPosm721(address(POSM)).unsubscribe(ids[1]);
        closer.close(ladderId);
    }

    function test_register_rejectsTwoSidedPosition() public {
        uint256 id = mintInRange(LIQ / 2);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotSingleSided.selector, id));
        closer.register(ids, true, address(0));
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.NotSingleSided.selector, id));
        closer.register(ids, false, address(0));
        vm.stopPrank();
    }

    function test_cancel_andOneOpenLadderPerRung() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 a = closer.registerLatest(2, true, address(0));
        assertEq(closer.ladderOf(ids[0]), a);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.AlreadyRegistered.selector, ids[0]));
        closer.register(ids, true, address(0));
        vm.stopPrank();
        vm.prank(stranger);
        vm.expectRevert(LadderCloser.NotLadderOwner.selector);
        closer.cancel(a);
        vm.prank(user);
        closer.cancel(a);
        assertEq(closer.ladderOf(ids[0]), 0);
        assertEq(IPosm721(address(POSM)).ownerOf(ids[0]), user, "rungs untouched");
        buyEth(SWAP_BIG_STABLE);
        vm.expectRevert(LadderCloser.AlreadyClosed.selector);
        closer.close(a);
        // may be registered again afterwards (crossed now, so as a "lower" ladder it is refused, as an "upper" it is AlreadyCrossed)
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(LadderCloser.AlreadyCrossed.selector, ids[0]));
        closer.register(ids, true, address(0));
    }

    /// R1 regression: a rung sold to someone else can be registered by its new owner,
    /// and the old ladder can no longer act on it, even if it comes back.
    function test_transferredRung_newOwnerCanRegister_oldLadderLetsGo() public {
        int24 first = roundUp(tick() + 1);
        uint256[] memory ids = mintRungs(first, 2, LIQ / 2, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 a = closer.registerLatest(2, true, address(0));
        IPosm721(address(POSM)).transferFrom(user, stranger, ids[0]);
        vm.stopPrank();
        uint256[] memory one = new uint256[](1);
        one[0] = ids[0];
        vm.startPrank(stranger);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        uint256 b = closer.register(one, true, address(0));
        vm.stopPrank();
        assertEq(closer.ladderOf(ids[0]), b, "binding follows the current owner");
        // the old owner cancelling A must not disturb B's binding
        vm.prank(user);
        closer.cancel(a);
        assertEq(closer.ladderOf(ids[0]), b);
        // even if the rung goes back to the old owner, A is done and B still owns the binding
        vm.prank(stranger);
        IPosm721(address(POSM)).transferFrom(stranger, user, ids[0]);
        vm.expectRevert(LadderCloser.AlreadyClosed.selector);
        closer.close(a);
        assertFalse(closer.isClosable(b), "B's rung no longer belongs to B's owner");
    }

    function test_closerItself_rejectedAsRecipient() public {
        vm.prank(feeWallet);
        vm.expectRevert(LadderCloser.SelfAsRecipient.selector);
        closer.proposeFeeRecipient(address(closer));
        vm.expectRevert(LadderCloser.SelfAsRecipient.selector);
        closer.claimTo(key.currency0, address(closer));
        int24 first = roundUp(tick() + 1);
        mintRungs(first, 1, LIQ / 2, true);
        vm.startPrank(user);
        IPosm721(address(POSM)).setApprovalForAll(address(closer), true);
        vm.expectRevert(LadderCloser.SelfAsRecipient.selector);
        closer.registerLatest(1, true, address(closer));
        vm.stopPrank();
    }

    function test_pushToken_onlySelf() public {
        vm.expectRevert(LadderCloser.OnlySelf.selector);
        closer.pushToken(USDC, user, 1);
    }
}

contract RejectsEth {
    bool public open;

    function allow() external {
        open = true;
    }

    receive() external payable {
        require(open, "no");
    }
}

/// ETH/USDC 0.05% on Base (currency0 = native ETH).
contract LadderCloserBaseTest is LadderCloserForkTest {
    function configure() internal override {
        RPC_ALIAS = "base";
        POSM = IPositionManager(0x7C5f5A4bBd8fD63184577525326123B519429bDc);
        PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
        USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        ASSET = address(0);
        FEE = 500;
        SPACING = 10;
        EXPECTED_POOL_ID = 0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a;
        SWAP_STEP_STABLE = 500e6;
        SWAP_BIG_STABLE = 400_000e6;
        SWAP_BIG_ASSET = 300 ether;
        LIQ = 2e15;
    }
}

/// TSLA/USDG 0.3% on Robinhood Chain (currency0 = TSLA, an ERC-20).
contract LadderCloserRobinhoodTest is LadderCloserForkTest {
    function configure() internal override {
        RPC_ALIAS = "robinhood";
        POSM = IPositionManager(0x58daec3116aae6D93017bAAea7749052E8a04fA7);
        PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
        USDC = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
        ASSET = 0x322F0929c4625eD5bAd873c95208D54E1c003b2d;
        FEE = 3000;
        SPACING = 60;
        EXPECTED_POOL_ID = 0x8517f8071ae5b831b738052f12125e8e3d6c158b78728aa44ce3b25e5104d32e;
        SWAP_STEP_STABLE = 2_000e6;
        SWAP_BIG_STABLE = 3_000_000e6;
        SWAP_BIG_ASSET = 20_000 ether;
        LIQ = 2e17;
    }
}
