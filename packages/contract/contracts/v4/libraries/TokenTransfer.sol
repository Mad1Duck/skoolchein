// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ScholarshipTypes} from "./ScholarshipTypes.sol";

/**
 * @title  TokenTransfer
 * @notice Single place where "is this native or ERC20?" is decided.
 *
 * @dev    Every value-moving path in the protocol routes through here so the
 *         branch can't drift between Core / Treasury / Bounty.
 *
 *         NATIVE REENTRANCY WARNING
 *         `payOut` for the native path uses `.call{value:}` with no gas cap
 *         (2300-gas `transfer` is unsafe post-EIP-1884 and breaks smart-
 *         contract wallets). That hands execution control to the recipient.
 *         EVERY caller must therefore:
 *           - be `nonReentrant`, AND
 *           - follow strict CEI — zero/decrement the balance BEFORE calling.
 *         Do not relax either without re-auditing the call sites.
 */
library TokenTransfer {
    using SafeERC20 for IERC20;

    error NativeValueMismatch(uint256 expected, uint256 received);
    error UnexpectedNativeValue();
    error NativeTransferFailed(address to, uint256 amount);

    function isNative(address token) internal pure returns (bool) {
        return token == ScholarshipTypes.NATIVE_TOKEN;
    }

    /**
     * @notice Collect `amount` of `token` from the caller into `to`.
     *
     * @dev    Native: the funds already arrived with the call, so this only
     *         validates msg.value and forwards them on.
     *         ERC20: msg.value must be zero (otherwise ETH sent alongside an
     *         ERC20 call would be silently trapped in the contract forever).
     *
     * @param token   Payment token, or NATIVE_TOKEN for the chain currency.
     * @param from    Payer (ignored for native — msg.sender already paid).
     * @param to      Destination, normally the Treasury.
     * @param amount  Expected amount.
     */
    function pullIn(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (isNative(token)) {
            if (msg.value != amount) revert NativeValueMismatch(amount, msg.value);
            // msg.value already credited this contract; only move it if the
            // destination is somewhere else (e.g. Core forwarding to Treasury).
            if (to != address(this)) payOut(token, to, amount);
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20(token).safeTransferFrom(from, to, amount);
        }
    }

    /**
     * @notice Send `amount` of `token` to `to`.
     * @dev    See the native reentrancy warning on the library docblock —
     *         callers must be nonReentrant and CEI-ordered.
     */
    function payOut(
        address token,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) return;

        if (isNative(token)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert NativeTransferFailed(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /**
     * @notice Balance of `token` held by `who`.
     */
    function balanceOf(address token, address who) internal view returns (uint256) {
        return isNative(token) ? who.balance : IERC20(token).balanceOf(who);
    }
}
