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
 * Payouts never block a close: if a recipient can't take a transfer (a
 * contract without receive(), a blacklisted address), the amount is held
 * for them here and `claim` pays it out later. The owner's close goes
 * through regardless.
 *
 * No owner, no upgrade path, no pause, no way to move a rung anywhere but
 * to its owner. The one thing that can change is where the fee goes: the
 * current fee wallet may propose a new one, which has to accept, so a
 * typo can't strand the role. That touches nothing a user is owed. A
 * replacement contract is a new deployment the owner opts into by
 * re-registering; revoking this one is `setApprovalForAll(this, false)`.
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
    address public pendingFeeRecipient;
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
    /// @notice Amounts a payout could not deliver, claimable by the recipient.
    mapping(Currency => mapping(address => uint256)) public owed;
    uint256 private _lock = 1;

    event Registered(uint256 indexed ladderId, address indexed owner, address referrer, bool higherTick, uint256[] tokenIds);
    event Closed(uint256 indexed ladderId, address indexed caller, uint256 amount0ToOwner, uint256 amount1ToOwner, uint256 fee0, uint256 fee1);
    event FeeRecipientProposed(address indexed from, address indexed to);
    event FeeRecipientChanged(address indexed from, address indexed to);
    event Held(Currency indexed currency, address indexed recipient, uint256 amount);
    event Claimed(Currency indexed currency, address indexed recipient, uint256 amount);

    error NotOwner(uint256 tokenId);
    error NotApproved();
    error BadRungCount();
    error DuplicateRung(uint256 tokenId);
    error MixedPools();
    error HookedPool();
    error UnknownLadder();
    error AlreadyCrossed(uint256 tokenId);
    error NotCrossed(uint256 tokenId);
    error NothingToClose();
    error AlreadyClosed();
    error Reentrancy();
    error BadFee();
    error NotFeeRecipient();
    error NotPendingFeeRecipient();
    error TransferFailed();
    error TooLarge();

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

    /// @notice Propose a new fee wallet. Only the current fee wallet can, and
    ///         it only changes where OUR share goes. The new wallet must accept.
    function proposeFeeRecipient(address to) external {
        if (msg.sender != feeRecipient) revert NotFeeRecipient();
        if (to == address(0)) revert BadFee();
        pendingFeeRecipient = to;
        emit FeeRecipientProposed(feeRecipient, to);
    }

    /// @notice Accept the fee wallet role: proves the new address can transact.
    function acceptFeeRecipient() external {
        if (msg.sender != pendingFeeRecipient) revert NotPendingFeeRecipient();
        emit FeeRecipientChanged(feeRecipient, msg.sender);
        feeRecipient = msg.sender;
        pendingFeeRecipient = address(0);
    }

    /// @notice Pay out anything a close could not deliver to the caller.
    function claim(Currency currency) external nonReentrant returns (uint256 amount) {
        amount = owed[currency][msg.sender];
        if (amount == 0) return 0;
        owed[currency][msg.sender] = 0;
        if (!_send(currency, msg.sender, amount)) revert TransferFailed();
        emit Claimed(currency, msg.sender, amount);
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
            for (uint256 j = 0; j < i; j++) if (ids[j] == id) revert DuplicateRung(id);
            if (_ownerOf(id) != msg.sender) revert NotOwner(id);
            (PoolKey memory key, PositionInfo info) = positionManager.getPoolAndPositionInfo(id);
            if (i == 0) {
                poolId = info.poolId();
                // the "only to the owner, only once crossed" promise assumes no hook can
                // move price or take funds mid-burn
                if (address(key.hooks) != address(0)) revert HookedPool();
            } else if (info.poolId() != poolId) revert MixedPools();
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
        if (l.owner == address(0)) revert UnknownLadder();
        if (l.closed) revert AlreadyClosed();
        l.closed = true;

        (PoolKey memory key, uint256 principal0, uint256 principal1) = _burnAll(l);
        (uint256 fee0, uint256 own0) = _split(key.currency0.balanceOfSelf(), principal0);
        (uint256 fee1, uint256 own1) = _split(key.currency1.balanceOfSelf(), principal1);
        _payFee(key.currency0, fee0, l);
        _payFee(key.currency1, fee1, l);
        _pay(key.currency0, l.owner, own0);
        _pay(key.currency1, l.owner, own1);
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
            // the principal doubles as the minimum out: PositionManager then refuses the
            // burn if anything moved the price back into the rung mid-transaction
            if (p0 > type(uint128).max || p1 > type(uint128).max) revert TooLarge();
            params[live] = abi.encode(id, uint128(p0), uint128(p1), bytes(""));
            principal0 += p0;
            principal1 += p1;
            live++;
        }
        if (live == 0) revert NothingToClose();
        actions = abi.encodePacked(actions, uint8(Actions.TAKE_PAIR));
        params[live] = abi.encode(key.currency0, key.currency1, address(this));
        assembly ("memory-safe") {
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

    /// @dev zero for a burned token instead of a revert. Any other failure
    ///      (out of gas) also reads as "gone", which is safe: the burn that must
    ///      follow needs far more gas than this call, so the close reverts.
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
            _pay(c, r, share);
            fee -= share;
        }
        _pay(c, feeRecipient, fee);
    }

    /// @dev Push the amount; if the recipient can't take it, hold it for `claim`.
    function _pay(Currency c, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (_send(c, to, amount)) return;
        owed[c][to] += amount;
        emit Held(c, to, amount);
    }

    /// @dev A transfer that reports failure instead of reverting.
    function _send(Currency c, address to, uint256 amount) internal returns (bool ok) {
        if (c.isAddressZero()) {
            (ok,) = to.call{value: amount}("");
        } else {
            bytes memory ret;
            (ok, ret) = Currency.unwrap(c).call(abi.encodeWithSelector(0xa9059cbb, to, amount));
            ok = ok && (ret.length == 0 || abi.decode(ret, (bool))) && Currency.unwrap(c).code.length > 0;
        }
    }

    /// @dev native-currency pools pay out ETH through TAKE_PAIR
    receive() external payable {}
}
