// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VaultPair — vaults.cash LIFO no-loss grid propAMM (pilot v0.2)
/// @notice Rialto propAMM liquidity source for WETH/USDG implementing the
///         strategy in docs/VAULT_SPEC.md: quote two-sided around a live mid,
///         but only ever sell inventory lots above their own entry
///         (most-recent first). Every realized trade is a profit by
///         construction; drawdowns are held as inventory.
///
///         PRICING (v0.2): mid = the live Uniswap v4 ETH/USDG pool price —
///         real-time, arb-corrected, never stale — bounded by Chainlink as a
///         sanity guardrail (quote 0 if the two diverge > maxDivergenceBps or
///         the feed is dead). v0.1 quoted from Chainlink directly, but the
///         feed on this chain is a 0.5%-deviation/24h-heartbeat feed: quoting
///         a stale mid tighter than the deviation band is systematic pick-off.
///         Pool-mid pricing lets the spread stay tight and competitive.
///         Manipulation economics: skewing the pool price costs pool fees +
///         impact, is capped by the divergence bound, and can extract at most
///         maxTradeUsdg * divergence per fill — unprofitable at pilot params.
///
///         token0 = WETH (18 dec), token1 = USDG (6 dec).
///         zeroForOne = true  : router sells WETH to us  (our BID / we buy)
///         zeroForOne = false : router buys WETH from us (our ASK / we sell)
///
///         Pilot is LLC-capital only: owner funds and can withdraw; there
///         are no third-party deposits at this stage (see spec §Trust).

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

interface IStateView {
    function getSlot0(bytes32 poolId)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}

contract VaultPair {
    // ---------------------------------------------------------------- types

    struct Lot {
        uint128 amountWeth; // remaining size of this lot (1e18)
        uint128 entryPriceE8; // Chainlink USD price at fill time (1e8)
    }

    // ---------------------------------------------------------------- config

    uint256 private constant BPS = 10_000;
    /// amountIn(1e18) * price(1e8) / 1e20 = usdg(1e6)
    uint256 private constant PRICE_SCALE = 1e20;
    uint256 private constant MAX_LOTS = 500;

    IERC20 public immutable weth;
    IERC20 public immutable usdg;
    IAggregatorV3 public immutable oracle; // ETH/USD guardrail, 8 decimals
    IStateView public immutable stateView; // Uniswap v4 StateView
    bytes32 public immutable poolId; // v4 ETH/USDG pool (the mid source)
    address public immutable owner; // LLC treasury

    uint256 public immutable spreadBps; // 30
    uint256 public immutable minProfitBps; // 25
    uint256 public immutable maxOracleAge; // guardrail: feed heartbeat + buffer
    uint256 public immutable maxTradeUsdg; // 150e6
    uint256 public immutable maxEthWeightBps; // 8000
    uint256 public immutable maxDivergenceBps; // pool mid vs Chainlink, 100

    // ---------------------------------------------------------------- state

    Lot[] public lots; // LIFO stack
    uint256 public cumulativeIncomeUsdg; // realized spread/grid profit (1e6)
    bool public paused;
    uint256 private unlocked = 1;

    // ---------------------------------------------------------------- events

    event Filled(bool zeroForOne, uint256 amountIn, uint256 amountOut, uint256 priceE8);
    event LotPushed(uint256 amountWeth, uint256 entryPriceE8);
    event LotConsumed(uint256 amountWeth, uint256 entryPriceE8, uint256 realizedProfitUsdg);
    event Paused(bool paused);
    event Funded(uint256 wethAmount, uint256 usdgAmount, uint256 priceE8);
    event Withdrawn(address to, uint256 wethAmount, uint256 usdgAmount);

    // ------------------------------------------------------------ modifiers

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier lock() {
        require(unlocked == 1, "reentrancy");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(
        address weth_,
        address usdg_,
        address oracle_,
        address stateView_,
        bytes32 poolId_,
        uint256 spreadBps_,
        uint256 minProfitBps_,
        uint256 maxOracleAge_,
        uint256 maxTradeUsdg_,
        uint256 maxEthWeightBps_,
        uint256 maxDivergenceBps_
    ) {
        require(spreadBps_ < BPS && minProfitBps_ < BPS && maxEthWeightBps_ <= BPS, "params");
        require(maxDivergenceBps_ > 0 && maxDivergenceBps_ < BPS, "divergence");
        require(IAggregatorV3(oracle_).decimals() == 8, "oracle decimals");
        weth = IERC20(weth_);
        usdg = IERC20(usdg_);
        oracle = IAggregatorV3(oracle_);
        stateView = IStateView(stateView_);
        poolId = poolId_;
        owner = msg.sender;
        spreadBps = spreadBps_;
        minProfitBps = minProfitBps_;
        maxOracleAge = maxOracleAge_;
        maxTradeUsdg = maxTradeUsdg_;
        maxEthWeightBps = maxEthWeightBps_;
        maxDivergenceBps = maxDivergenceBps_;
    }

    // ------------------------------------------------------- Rialto interface

    /// @notice Rialto quote hook. Returns 0 for any size/state we can't fill.
    function getAmountOut(bool zeroForOne, uint256 amountIn) public view returns (uint256) {
        if (paused || amountIn == 0) return 0;
        (uint256 mid, bool ok) = _price();
        if (!ok) return 0;

        if (zeroForOne) {
            // BID: router sells WETH, we pay USDG at mid - spread
            uint256 usdgOut = (amountIn * mid * (BPS - spreadBps)) / BPS / PRICE_SCALE;
            if (usdgOut == 0 || usdgOut > maxTradeUsdg) return 0;
            if (usdgOut > usdg.balanceOf(address(this))) return 0;
            if (lots.length >= MAX_LOTS) return 0;
            if (!_bidWithinWeightCap(amountIn, usdgOut, mid)) return 0;
            return usdgOut;
        } else {
            // ASK: router pays USDG, we deliver WETH at mid + spread,
            // only from lots clearing their own basis + minProfit.
            if (amountIn > maxTradeUsdg) return 0;
            uint256 execPrice = (mid * (BPS + spreadBps)) / BPS;
            uint256 wethOut = (amountIn * PRICE_SCALE) / execPrice;
            if (wethOut == 0) return 0;
            if (_sellableWeth(execPrice) < wethOut) return 0;
            return wethOut;
        }
    }

    /// @notice Rialto settlement hook. Router approves exactly amountIn to us,
    ///         we pull it, deliver >= amountOutMin of the other token to `to`.
    function swapExactIn(
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin,
        address to,
        uint256 deadline
    ) external lock returns (uint256 amountOut) {
        require(block.timestamp <= deadline, "expired");
        require(!paused, "paused");
        amountOut = getAmountOut(zeroForOne, amountIn);
        require(amountOut > 0 && amountOut >= amountOutMin, "insufficient output");

        (uint256 mid,) = _price();
        if (zeroForOne) {
            // we buy WETH: pull it, push a lot at current mid, pay USDG
            require(weth.transferFrom(msg.sender, address(this), amountIn), "pull weth");
            lots.push(Lot(uint128(amountIn), uint128(mid)));
            emit LotPushed(amountIn, mid);
            require(usdg.transfer(to, amountOut), "pay usdg");
        } else {
            // we sell WETH from profitable lots only, LIFO
            require(usdg.transferFrom(msg.sender, address(this), amountIn), "pull usdg");
            uint256 execPrice = (mid * (BPS + spreadBps)) / BPS;
            _consumeLots(amountOut, execPrice);
            require(weth.transfer(to, amountOut), "pay weth");
        }
        emit Filled(zeroForOne, amountIn, amountOut, mid);
    }

    // ------------------------------------------------------------ strategy

    /// mid = live v4 pool price in USD 1e8; ok only when Chainlink is alive
    /// and agrees within maxDivergenceBps. The pool is the price (real-time,
    /// arb-corrected); Chainlink is the tripwire against pool manipulation.
    function _price() internal view returns (uint256 mid, bool ok) {
        (uint160 sqrtP,,,) = stateView.getSlot0(poolId);
        // 2^104 bound keeps the squaring overflow-free; ETH would need to be
        // ~$1e16 to hit it on an 18/6-decimals pair
        if (sqrtP == 0 || uint256(sqrtP) >= 1 << 104) return (0, false);
        // (sqrtP/2^96)^2 = USDG-raw per WETH-raw; * 1e20 -> USD 1e8
        mid = (((uint256(sqrtP) * uint256(sqrtP)) >> 96) * PRICE_SCALE) >> 96;
        if (mid == 0) return (0, false);

        (, int256 answer,, uint256 updatedAt,) = oracle.latestRoundData();
        if (answer <= 0) return (mid, false);
        if (block.timestamp > updatedAt + maxOracleAge) return (mid, false);
        uint256 cl = uint256(answer);
        uint256 diff = mid > cl ? mid - cl : cl - mid;
        if (diff * BPS > cl * maxDivergenceBps) return (mid, false);
        return (mid, true);
    }

    /// Post-trade ETH weight must stay <= maxEthWeightBps of NAV (USDG terms).
    function _bidWithinWeightCap(uint256 wethIn, uint256 usdgOut, uint256 mid)
        internal
        view
        returns (bool)
    {
        uint256 wethAfter = weth.balanceOf(address(this)) + wethIn;
        uint256 usdgAfter = usdg.balanceOf(address(this)) - usdgOut;
        uint256 ethValue = (wethAfter * mid) / PRICE_SCALE;
        uint256 nav = ethValue + usdgAfter;
        if (nav == 0) return false;
        return (ethValue * BPS) / nav <= maxEthWeightBps;
    }

    /// Total WETH sellable at execPrice: lots whose basis clears minProfit.
    function _sellableWeth(uint256 execPriceE8) internal view returns (uint256 total) {
        uint256 n = lots.length;
        for (uint256 i = 0; i < n; i++) {
            Lot storage lot = lots[i];
            if ((uint256(lot.entryPriceE8) * (BPS + minProfitBps)) / BPS <= execPriceE8) {
                total += lot.amountWeth;
            }
        }
    }

    /// Consume `amount` of WETH from profitable lots, newest first.
    /// Invariant: never consumes a lot below its basis + minProfit.
    function _consumeLots(uint256 amount, uint256 execPriceE8) internal {
        uint256 remaining = amount;
        uint256 i = lots.length;
        while (remaining > 0 && i > 0) {
            i--;
            Lot storage lot = lots[i];
            if ((uint256(lot.entryPriceE8) * (BPS + minProfitBps)) / BPS > execPriceE8) {
                // unprofitable lot: skip (it stays; deeper lots may qualify)
                continue;
            }
            uint256 take = remaining < lot.amountWeth ? remaining : lot.amountWeth;
            uint256 profit = (take * (execPriceE8 - lot.entryPriceE8)) / PRICE_SCALE;
            cumulativeIncomeUsdg += profit;
            emit LotConsumed(take, lot.entryPriceE8, profit);
            remaining -= take;
            if (take == lot.amountWeth) {
                // remove lot i, preserving stack order above it
                for (uint256 j = i; j + 1 < lots.length; j++) {
                    lots[j] = lots[j + 1];
                }
                lots.pop();
            } else {
                lot.amountWeth -= uint128(take);
            }
        }
        require(remaining == 0, "insufficient sellable");
    }

    // ------------------------------------------------------------- owner ops

    /// Fund inventory. WETH funded here is lotted at the current mid.
    function fund(uint256 wethAmount, uint256 usdgAmount) external onlyOwner {
        (uint256 mid, bool ok) = _price();
        if (wethAmount > 0) {
            require(ok, "no price");
            require(weth.transferFrom(msg.sender, address(this), wethAmount), "pull weth");
            require(lots.length < MAX_LOTS, "lots full");
            lots.push(Lot(uint128(wethAmount), uint128(mid)));
            emit LotPushed(wethAmount, mid);
        }
        if (usdgAmount > 0) {
            require(usdg.transferFrom(msg.sender, address(this), usdgAmount), "pull usdg");
        }
        emit Funded(wethAmount, usdgAmount, mid);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit Paused(paused_);
    }

    /// Pilot escape hatch: return all inventory to the LLC treasury.
    function withdrawAll() external onlyOwner lock {
        uint256 w = weth.balanceOf(address(this));
        uint256 u = usdg.balanceOf(address(this));
        if (w > 0) require(weth.transfer(owner, w), "weth out");
        if (u > 0) require(usdg.transfer(owner, u), "usdg out");
        delete lots;
        emit Withdrawn(owner, w, u);
    }

    // -------------------------------------------------------------- views

    function lotCount() external view returns (uint256) {
        return lots.length;
    }

    /// NAV in USDG terms at the current mid (0 if pricing is unavailable).
    function nav() external view returns (uint256) {
        (uint256 mid, bool ok) = _price();
        if (!ok) return 0;
        return (weth.balanceOf(address(this)) * mid) / PRICE_SCALE + usdg.balanceOf(address(this));
    }
}
