// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ScholarshipCoreBase} from "./ScholarshipCoreBase.sol";
import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

/**
 * @title  ScholarshipCoreLogic
 * @notice The callbacks other contracts make into ScholarshipCore, kept out of Core because Core is at
 *         the EIP-170 size limit.
 *
 * @dev    NOT called directly. Core's fallback delegatecalls here, so these functions run with Core's
 *         storage, Core's address and the original msg.sender (MilestoneManager or Bounty). This
 *         contract is built from the same ScholarshipCoreBase as Core, which keeps the storage layout
 *         identical; it must never declare state variables of its own.
 *
 *         They were missing from Core altogether, so releasing any milestone (MilestoneManager) and
 *         applying a fraud penalty (Bounty) reverted.
 */
contract ScholarshipCoreLogic is ScholarshipCoreBase {
    function _authorizeUpgrade(address) internal pure override {
        revert NotAdmin();
    }

    /// @notice A milestone was released: progress, spent fund, reputation and program completion.
    function onMilestoneCompleted(
        uint256 pid,
        address scholar,
        uint256 milestoneId,
        uint256 amount,
        ScholarshipTypes.MilestoneKind kind
    ) external onlyRole(MILESTONE_ROLE) {
        _onMilestoneCompleted(pid, scholar, milestoneId, amount, kind);
    }

    /// @notice The committee approved an optional or negotiated milestone: reserve its amount.
    function onOptionalApproved(uint256 pid, address scholar, uint256 amount) external onlyRole(MILESTONE_ROLE) {
        _onOptionalApproved(pid, scholar, amount);
    }

    /// @notice A report was upheld against a scholar: freeze them, and blacklist them for heavy fraud.
    function slashScholar(address wallet, uint256 pid, ScholarshipTypes.DisputeType disputeType)
        external onlyRole(BOUNTY_ROLE)
    {
        _slashScholar(wallet, pid, disputeType);
    }
}
