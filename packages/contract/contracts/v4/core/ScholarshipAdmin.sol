// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

interface IScholarshipCoreAdmin {
    function adminForceStatus(uint256 pid, ScholarshipTypes.ProgramStatus newStatus) external;
    function adminUpdateDates(uint256 pid, uint256 appStart, uint256 appEnd, uint256 voteStart, uint256 voteEnd) external;
    function setProtocolConfig(ScholarshipTypes.ProtocolConfig calldata c) external;
    function extendApplicationDeadline(uint256 pid, uint256 newEnd) external;
    function extendVotingDeadline(uint256 pid, uint256 newEnd) external;
    function getProgram(uint256 pid) external view returns (ScholarshipTypes.Program memory);
}

/**
 * @title  ScholarshipAdmin v5
 * @notice Split contract for administrative and governance functions.
 *         Maintains EIP-170 compliance for ScholarshipCore by offloading
 *         infrequently used management logic.
 */
contract ScholarshipAdmin is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    IScholarshipCoreAdmin public core;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address _core) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        core = IScholarshipCoreAdmin(_core);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ── Admin Wrappers ───────────────────────────────────────────────────────

    function setProtocolConfig(ScholarshipTypes.ProtocolConfig calldata c) external onlyRole(DEFAULT_ADMIN_ROLE) {
        core.setProtocolConfig(c);
    }

    function adminForceStatus(uint256 pid, ScholarshipTypes.ProgramStatus newStatus) external onlyRole(DEFAULT_ADMIN_ROLE) {
        core.adminForceStatus(pid, newStatus);
    }

    function adminUpdateDates(
        uint256 pid,
        uint256 appStart,
        uint256 appEnd,
        uint256 voteStart,
        uint256 voteEnd
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        core.adminUpdateDates(pid, appStart, appEnd, voteStart, voteEnd);
    }

    // ── Extension Wrappers (Initiator or admin) ──────────────────────────────
    // ScholarshipCore only checks that the CALLER HOLDS the config-admin role, and that
    // caller is this contract, so it cannot tell who is behind the call. The check on who
    // may extend a given program therefore has to happen here.

    error NotInitiator();

    function _requireInitiatorOrAdmin(uint256 pid) internal view {
        if (msg.sender != core.getProgram(pid).initiator && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotInitiator();
    }

    function extendApplicationDeadline(uint256 pid, uint256 newEnd) external {
        _requireInitiatorOrAdmin(pid);
        core.extendApplicationDeadline(pid, newEnd);
    }

    function extendVotingDeadline(uint256 pid, uint256 newEnd) external {
        _requireInitiatorOrAdmin(pid);
        core.extendVotingDeadline(pid, newEnd);
    }
}
