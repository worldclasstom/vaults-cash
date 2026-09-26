// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "@uniswap/v4-core/src/libraries/SqrtPriceMath.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {PositionInfo, PositionInfoLibrary} from "v4-periphery/src/libraries/PositionInfoLibrary.sol";
import {Actions} from "v4-periphery/src/libraries/Actions.sol";

interface IPosmNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/**
 * @title LadderCloser
 * @notice Closes a vaults.cash Targets ladder the moment its target prints,
 *         with no signer and no admin.
 *
 * A ladder is a set of single-sided Uniswap v4 positions (rungs) between the
 * price at creation and the price the owner believes in. The owner registers
 * the rungs here from their own wallet, after approving this contract as an
 * operator on the position NFTs. From then on ANYONE may call `close` on
 * the ladder, but the call only succeeds once every rung has been fully
 * crossed by the pool price (the target has printed), and everything the
 * rungs pay out can only go to the NFT owner, less the fees below.
 *
 * Fees, fixed at deployment and identical to the app's own close flow:
 *   - exitFeeBps of the principal each rung returns (the "0.6% out")
 *   - perfFeeBps of the trading fees each rung earned (the "8% of fees")
 *   Half of the fee goes to the referrer the owner named at registration.
 *
 * No owner, no upgrade path, no pause, no way to move a rung anywhere but
 * to its owner. The one thing that can change is where the fee goes: the
 * current fee wallet may hand off to a new one, which touches nothing a
 * user is owed. A replacement contract is a new deployment the owner opts
 * into by re-registering; revoking this one is `setApprovalForAll(this, false)`.
 */
contract LadderCloser {
    using PoolIdLibrary for PoolKey;
    using PositionInfoLibrary for PositionInfo;
    using StateLibrary for IPoolManager;
    using CurrencyLibrary for Currency;

    uint256 public constant MAX_RUNGS = 16;
    uint256 public constant REFERRER_SHARE_BPS = 5000;
    uint256 private constant BPS = 10_000;

    IPositionManager public immutable positionManager;
    IPoolManager public immutable poolManager;
    address public feeRecipient;
    uint256 public immutable exitFeeBps;
    uint256 public immutable perfFeeBps;

    struct Ladder {
        address owner;
        address referrer;
        /// @dev true when the target sits at a HIGHER tick than the rungs
        ///      (a sell ladder on a base-is-currency0 pool): a rung is done
        ///      once tick >= tickUpper. false: done once tick < tickLower.
        bool higherTick;
        bool closed;
        uint256[] tokenIds;
    }

    uint256 public nextLadderId = 1;
    mapping(uint256 => Ladder) internal _ladders;
    uint256 private _lock = 1;

    event Registered(uint256 indexed ladderId, address indexed owner, address referrer, bool higherTick, uint256[] tokenIds);
    event Closed(uint256 indexed ladderId, address indexed caller, uint256 amount0ToOwner, uint256 amount1ToOwner, uint256 fee0, uint256 fee1);
    event FeeRecipientChanged(address indexed from, address indexed to);

    error NotOwner(uint256 tokenId);
    error NotApproved();
    error BadRungCount();
    error MixedPools();
    error AlreadyCrossed(uint256 tokenId);
    error NotCrossed(uint256 tokenId);
    error NothingToClose();
    error AlreadyClosed();
    error Reentrancy();
    error BadFee();
    error NotFeeRecipient();

    constructor(IPositionManager _positionManager, address _feeRecipient, uint256 _exitFeeBps, uint256 _perfFeeBps) {
        if (_exitFeeBps > 500 || _perfFeeBps > 2000 || _feeRecipient == address(0)) revert BadFee();
        positionManager = _positionManager;
        poolManager = _positionManager.poolManager();
        feeRecipient = _feeRecipient;
        exitFeeBps = _exitFeeBps;
        perfFeeBps = _perfFeeBps;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Hand the fee wallet role to another address. Only the current
    ///         fee wallet can do it, and it only changes where OUR share goes.
    function setFeeRecipient(address to) external {
        if (msg.sender != feeRecipient) revert NotFeeRecipient();
        if (to == address(0)) revert BadFee();
        emit FeeRecipientChanged(feeRecipient, to);
        feeRecipient = to;
    }

    // ---------------------------------------------------------------- views

    function ladder(uint256 ladderId) external view returns (Ladder memory) {
        return _ladders[ladderId];
    }

    /// @notice True once every live rung is fully crossed: the target printed.
    function isClosable(uint256 ladderId) public view returns (bool) {
        Ladder storage l = _ladders[ladderId];
        if (l.closed || l.owner == address(0)) return false;
        uint256 live;
        for (uint256 i = 0; i < l.tokenIds.length; i++) {
            (bool alive, bool crossed,,) = _rungState(l, l.tokenIds[i]);
            if (!alive) continue;
            if (!crossed) return false;
            live++;
        }
        return live > 0;
    }

    // ------------------------------------------------------------- register

    /**
     * @notice Register the newest `count` positions minted to the caller as
     *         one ladder. Meant to run in the same batch as the mints, so the
     *         ids are known without a race on `nextTokenId`.
     */
    function registerLatest(uint256 count, bool higherTick, address referrer) external returns (uint256 ladderId) {
        if (count == 0 || count > MAX_RUNGS) revert BadRungCount();
        uint256 next = positionManager.nextTokenId();
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) ids[i] = next - count + i;
        return _register(ids, higherTick, referrer);
    }

    /// @notice Register explicit position ids (for ladders minted earlier).
    function register(uint256[] calldata tokenIds, bool higherTick, address referrer) external returns (uint256 ladderId) {
        if (tokenIds.length == 0 || tokenIds.length > MAX_RUNGS) revert BadRungCount();
        return _register(tokenIds, higherTick, referrer);
    }

    function _register(uint256[] memory ids, bool higherTick, address referrer) internal returns (uint256 ladderId) {
        if (!IPosmNFT(address(positionManager)).isApprovedForAll(msg.sender, address(this))) revert NotApproved();
        bytes25 poolId;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (_ownerOf(id) != msg.sender) revert NotOwner(id);
            (PoolKey memory key, PositionInfo info) = positionManager.getPoolAndPositionInfo(id);
            if (i == 0) poolId = info.poolId();
            else if (info.poolId() != poolId) revert MixedPools();
            // a rung that is already past the target would be closable at once
            (, int24 tick,,) = poolManager.getSlot0(key.toId());
            if (_crossed(higherTick, tick, info.tickLower(), info.tickUpper())) revert AlreadyCrossed(id);
        }
        ladderId = nextLadderId++;
        Ladder storage l = _ladders[ladderId];
        l.owner = msg.sender;
        l.referrer = referrer;
        l.higherTick = higherTick;
        l.tokenIds = ids;
        emit Registered(ladderId, msg.sender, referrer, higherTick, ids);
    }

    // ---------------------------------------------------------------- close

    /**
     * @notice Close a ladder whose target has printed. Anyone may call.
     *         Burns every live rung, pays the fees, sends the rest to the
     *         rung owner. Reverts unless every live rung is fully crossed.
     */
    function close(uint256 ladderId) external nonReentrant {
        Ladder storage l = _ladders[ladderId];
        if (l.owner == address(0) || l.closed) revert AlreadyClosed();
        l.closed = true;

        (PoolKey memory key, uint256 principal0, uint256 principal1) = _burnAll(l);
        (uint256 fee0, uint256 own0) = _split(key.currency0.balanceOfSelf(), principal0);
        (uint256 fee1, uint256 own1) = _split(key.currency1.balanceOfSelf(), principal1);
        _payFee(key.currency0, fee0, l);
        _payFee(key.currency1, fee1, l);
        if (own0 > 0) key.currency0.transfer(l.owner, own0);
        if (own1 > 0) key.currency1.transfer(l.owner, own1);
        emit Closed(ladderId, msg.sender, own0, own1, fee0, fee1);
    }

    /// @dev Burn every live rung in one PositionManager call, taking both
    ///      currencies here. Reverts unless every live rung is crossed.
    ///      This contract never holds a balance between transactions, so
    ///      what it holds afterwards is exactly what the rungs paid out.
    function _burnAll(Ladder storage l) internal returns (PoolKey memory key, uint256 principal0, uint256 principal1) {
        uint256 n = l.tokenIds.length;
        bytes memory actions;
        bytes[] memory params = new bytes[](n + 1);
        uint256 live;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = l.tokenIds[i];
            (bool alive, bool crossed, uint256 p0, uint256 p1) = _rungState(l, id);
            if (!alive) continue;
            if (!crossed) revert NotCrossed(id);
            if (live == 0) (key,) = positionManager.getPoolAndPositionInfo(id);
            actions = abi.encodePacked(actions, uint8(Actions.BURN_POSITION));
            params[live] = abi.encode(id, uint128(0), uint128(0), bytes(""));
            principal0 += p0;
            principal1 += p1;
            live++;
        }
        if (live == 0) revert NothingToClose();
        actions = abi.encodePacked(actions, uint8(Actions.TAKE_PAIR));
        params[live] = abi.encode(key.currency0, key.currency1, address(this));
        assembly {
            mstore(params, add(live, 1))
        }
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    // ------------------------------------------------------------ internals

    /// @dev alive: the rung still exists, belongs to the ladder owner and has
    ///      liquidity. crossed: the pool price is fully past the rung in the
    ///      ladder's direction. p0/p1: the principal the rung holds now (all
    ///      one side once crossed).
    function _rungState(Ladder storage l, uint256 id) internal view returns (bool alive, bool crossed, uint256 p0, uint256 p1) {
        if (_ownerOf(id) != l.owner) return (false, false, 0, 0);
        uint128 liquidity = positionManager.getPositionLiquidity(id);
        if (liquidity == 0) return (false, false, 0, 0);
        (PoolKey memory key, PositionInfo info) = positionManager.getPoolAndPositionInfo(id);
        (, int24 tick,,) = poolManager.getSlot0(key.toId());
        crossed = _crossed(l.higherTick, tick, info.tickLower(), info.tickUpper());
        if (crossed) (p0, p1) = _principal(l.higherTick, info.tickLower(), info.tickUpper(), liquidity);
        alive = true;
    }

    /// @dev fully crossed: the rung is entirely currency1 (price above it) or currency0 (price below it)
    function _principal(bool higherTick, int24 lower, int24 upper, uint128 liquidity) internal pure returns (uint256 p0, uint256 p1) {
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(lower);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(upper);
        if (higherTick) p1 = SqrtPriceMath.getAmount1Delta(sqrtA, sqrtB, liquidity, false);
        else p0 = SqrtPriceMath.getAmount0Delta(sqrtA, sqrtB, liquidity, false);
    }

    /// @dev zero for a burned token instead of a revert
    function _ownerOf(uint256 id) internal view returns (address) {
        (bool ok, bytes memory ret) = address(positionManager).staticcall(abi.encodeCall(IPosmNFT.ownerOf, (id)));
        return ok && ret.length >= 32 ? abi.decode(ret, (address)) : address(0);
    }

    function _crossed(bool higherTick, int24 tick, int24 lower, int24 upper) internal pure returns (bool) {
        return higherTick ? tick >= upper : tick < lower;
    }

    /// @dev received = principal + fees earned (fees can't be negative; guard rounding)
    function _split(uint256 received, uint256 principal) internal view returns (uint256 fee, uint256 toOwner) {
        uint256 earned = received > principal ? received - principal : 0;
        uint256 base = received - earned;
        fee = (base * exitFeeBps) / BPS + (earned * perfFeeBps) / BPS;
        toOwner = received - fee;
    }

    function _payFee(Currency c, uint256 fee, Ladder storage l) internal {
        if (fee == 0) return;
        address r = l.referrer;
        if (r != address(0) && r != l.owner && r != feeRecipient) {
            uint256 share = (fee * REFERRER_SHARE_BPS) / BPS;
            if (share > 0) c.transfer(r, share);
            fee -= share;
        }
        if (fee > 0) c.transfer(feeRecipient, fee);
    }

    /// @dev native-currency pools pay out ETH through TAKE_PAIR
    receive() external payable {}
}
