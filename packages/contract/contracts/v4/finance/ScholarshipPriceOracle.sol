// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title  ScholarshipPriceOracle
 * @notice Token registry + admin-maintained USD exchange rates.
 *
 * @dev    WHY A SEPARATE CONTRACT
 *         ScholarshipCore is already at the EIP-170 bytecode limit, so this
 *         follows the same split pattern as ScholarshipAdmin. It also keeps
 *         mutable price data out of the contracts that move funds.
 *
 *         SCOPE — READ THIS BEFORE USING PRICES ON-CHAIN
 *         These rates are set manually by an admin and are intended for
 *         DISPLAY and NORMALISATION only: showing "≈ $X" next to a program
 *         funded in ETH, sorting programs by USD size, etc.
 *
 *         They are deliberately NOT consumed by ScholarshipCore/Treasury for
 *         any transfer, fee, or slash calculation. Doing so would let whoever
 *         holds RATE_ADMIN_ROLE move real value by editing a number — e.g.
 *         inflating a token's price to drain a program. If on-chain
 *         enforcement is ever needed, replace this with a real price feed
 *         (Chainlink AggregatorV3) plus staleness and deviation checks; the
 *         8-decimal convention below matches Chainlink to ease that swap.
 *
 *         DECIMALS
 *         `priceUsd` carries USD_DECIMALS (8) decimals: 1 ETH = $3,000.50 is
 *         stored as 300050000000. Token amounts use each token's own decimals
 *         (native 18, USDC 6) — `toUsd` reconciles the two.
 */
contract ScholarshipPriceOracle is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    // ── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant UPGRADER_ROLE   = keccak256("UPGRADER_ROLE");
    bytes32 public constant RATE_ADMIN_ROLE = keccak256("RATE_ADMIN_ROLE");

    string public constant VERSION = "4.0.0";

    /// @notice Decimals of every `priceUsd` value (Chainlink USD-feed convention).
    uint8 public constant USD_DECIMALS = 8;

    /// @notice Sentinel for the chain's native currency, matching
    ///         ScholarshipTypes.NATIVE_TOKEN.
    address public constant NATIVE_TOKEN = address(0);

    // ── Storage ──────────────────────────────────────────────────────────────

    struct TokenInfo {
        bool    registered;
        string  symbol;     // display only, e.g. "ETH" / "USDC"
        uint8   decimals;   // the token's own decimals — NOT USD_DECIMALS
        uint256 priceUsd;   // USD price with USD_DECIMALS decimals
        uint64  updatedAt;  // block timestamp of the last price write
    }

    mapping(address => TokenInfo) public tokens;
    address[] private _tokenList;

    /// @notice Age after which `getPrice` reports a rate as stale. Advisory —
    ///         consumers decide what to do about it (this contract never
    ///         blocks reads, so a stale price is visible rather than silently
    ///         reverting a UI).
    uint64 public maxPriceAge;

    // ── Events ───────────────────────────────────────────────────────────────

    event TokenRegistered(address indexed token, string symbol, uint8 decimals);
    event TokenDeregistered(address indexed token);
    event PriceUpdated(address indexed token, uint256 priceUsd, uint64 updatedAt);
    event MaxPriceAgeUpdated(uint64 maxPriceAge);

    // ── Errors ───────────────────────────────────────────────────────────────

    error TokenNotRegistered(address token);
    error TokenAlreadyRegistered(address token);
    error ArrayLengthMismatch();
    error InvalidDecimals(uint8 decimals);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE,      admin);
        _grantRole(RATE_ADMIN_ROLE,    admin);

        maxPriceAge = 24 hours;
    }

    // ═══════════════════════════════════════════════════════════════════
    // TOKEN REGISTRY
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Register a token so the UI can discover it and price it.
     * @param token    Token address, or NATIVE_TOKEN (address(0)) for the
     *                 chain's native currency.
     * @param symbol   Display symbol.
     * @param decimals The token's own decimals (18 native, 6 USDC).
     *
     * @dev Registering here does NOT permit a token to back a program — that
     *      whitelist lives in ScholarshipCore.setTokenConfig. Keep the two in
     *      sync: a token registered here but not whitelisted there will show
     *      in the UI yet revert with TokenNotSupported on createProgram.
     */
    function registerToken(
        address token,
        string calldata symbol,
        uint8 decimals
    ) external onlyRole(RATE_ADMIN_ROLE) {
        if (tokens[token].registered) revert TokenAlreadyRegistered(token);
        if (decimals > 36) revert InvalidDecimals(decimals);

        tokens[token] = TokenInfo({
            registered: true,
            symbol:     symbol,
            decimals:   decimals,
            priceUsd:   0,
            updatedAt:  0
        });
        _tokenList.push(token);

        emit TokenRegistered(token, symbol, decimals);
    }

    /**
     * @notice Remove a token from the registry.
     * @dev    Clears the record and swap-pops it out of the enumeration list.
     *         Existing programs already funded in this token are unaffected —
     *         their balances live in the Treasury, not here.
     */
    function deregisterToken(address token) external onlyRole(RATE_ADMIN_ROLE) {
        if (!tokens[token].registered) revert TokenNotRegistered(token);

        delete tokens[token];

        uint256 len = _tokenList.length;
        for (uint256 i = 0; i < len; ) {
            if (_tokenList[i] == token) {
                _tokenList[i] = _tokenList[len - 1];
                _tokenList.pop();
                break;
            }
            unchecked { ++i; }
        }

        emit TokenDeregistered(token);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRICES
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Set a token's USD price.
     * @param priceUsd Price with USD_DECIMALS (8) decimals.
     *                 $3,000.50 → 300050000000.
     */
    function setPrice(address token, uint256 priceUsd)
        external onlyRole(RATE_ADMIN_ROLE)
    {
        _setPrice(token, priceUsd);
    }

    /// @notice Batch variant so a whole rate sheet updates in one tx.
    function setPrices(address[] calldata tokenList, uint256[] calldata priceList)
        external onlyRole(RATE_ADMIN_ROLE)
    {
        if (tokenList.length != priceList.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < tokenList.length; ) {
            _setPrice(tokenList[i], priceList[i]);
            unchecked { ++i; }
        }
    }

    function _setPrice(address token, uint256 priceUsd) internal {
        TokenInfo storage info = tokens[token];
        if (!info.registered) revert TokenNotRegistered(token);

        info.priceUsd  = priceUsd;
        info.updatedAt = uint64(block.timestamp);

        emit PriceUpdated(token, priceUsd, info.updatedAt);
    }

    function setMaxPriceAge(uint64 newMaxAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxPriceAge = newMaxAge;
        emit MaxPriceAgeUpdated(newMaxAge);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Current price and freshness for a token.
     * @return priceUsd  USD price with USD_DECIMALS decimals.
     * @return updatedAt Timestamp of the last write (0 = never priced).
     * @return stale     True when never priced, or older than maxPriceAge.
     */
    function getPrice(address token)
        external view
        returns (uint256 priceUsd, uint64 updatedAt, bool stale)
    {
        TokenInfo storage info = tokens[token];
        if (!info.registered) revert TokenNotRegistered(token);

        priceUsd  = info.priceUsd;
        updatedAt = info.updatedAt;
        stale     = info.updatedAt == 0 || block.timestamp > info.updatedAt + maxPriceAge;
    }

    /**
     * @notice Convert a token amount into USD.
     * @param amount Amount in the token's own decimals.
     * @return usdValue USD value with USD_DECIMALS (8) decimals.
     *
     * @dev Multiplies before dividing so precision isn't lost on small
     *      amounts. Returns 0 for an unpriced token rather than reverting,
     *      so a missing rate degrades to "unknown" in the UI instead of
     *      breaking the whole page.
     */
    function toUsd(address token, uint256 amount)
        external view
        returns (uint256 usdValue)
    {
        TokenInfo storage info = tokens[token];
        if (!info.registered || info.priceUsd == 0) return 0;

        return (amount * info.priceUsd) / (10 ** uint256(info.decimals));
    }

    /// @notice Every registered token, for UI enumeration.
    function getTokens() external view returns (address[] memory) {
        return _tokenList;
    }

    /// @notice Registered token count.
    function tokenCount() external view returns (uint256) {
        return _tokenList.length;
    }

    // ── UUPS ─────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
