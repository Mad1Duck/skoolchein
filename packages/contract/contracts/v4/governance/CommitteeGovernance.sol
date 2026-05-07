// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

/**
 * @title  CommitteeGovernance v5
 * @notice Per-programme committee with THREE responsibilities (up from two):
 *
 *  1. SCORING      — members submit scores for applicants (unchanged).
 *  2. DISPUTE VOTE — members vote to resolve BH disputes (unchanged).
 *  3. MILESTONE APPROVAL — members approve/reject optional milestone proposals.
 *
 * @dev    CHANGES FROM v4
 *         ─────────────────────────────────────────────────────────────
 *         • approveMilestoneProposal() / rejectMilestoneProposal()
 *           — simple majority vote among committee members.
 *           — Calls MilestoneManager.approveMilestone() / rejectMilestone()
 *             on reaching majority.  Single external call on resolution;
 *             no extra storage per-vote beyond a bytes32 bitmap trick.
 *
 *         GAS NOTES
 *         ──────────────────────────────────────────────────────────────
 *         Milestone approval votes are packed into a uint256 bitmap
 *         (up to 15 members = 15 bits used out of 256) — one SSTORE per
 *         vote cast, one SLOAD to check majority.  No array push needed.
 */
contract CommitteeGovernance is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // ── External contract ────────────────────────────────────────────────────
    IScholarshipCoreGov private _core;
    IMilestoneManagerGov private _mm;

    // ── Per-program committee ────────────────────────────────────────────────
    mapping(uint256 => address[]) private _committeeMembers;
    mapping(uint256 => mapping(address => bool)) public isCommitteeMember;
    // member index (1-based) for bitmap; 0 = not a member
    mapping(uint256 => mapping(address => uint8)) private _memberIndex;
    mapping(uint256 => uint256) public activeMemberCount;

    // ── Scoring (unchanged) ──────────────────────────────────────────────────
    mapping(uint256 => mapping(address => mapping(address => bool))) public hasScored;

    // ── Dispute voting (unchanged) ───────────────────────────────────────────
    mapping(uint256 => mapping(address => bool)) public hasVotedOnDispute;
    mapping(uint256 => uint256) public disputeVotesFor;
    mapping(uint256 => uint256) public disputeVotesAgainst;

    // ── Milestone approval voting (v5) ───────────────────────────────────────
    // milestoneId → bitmap of "voted approve" (bit i = member index i)
    mapping(uint256 => uint256) private _approveVotes;
    // milestoneId → bitmap of "voted reject"
    mapping(uint256 => uint256) private _rejectVotes;
    // milestoneId → resolved (prevent double-execution)
    mapping(uint256 => bool) public milestoneResolved;

    // ── Events ───────────────────────────────────────────────────────────────
    event CommitteeMemberAdded(uint256 indexed pid, address member);
    event CommitteeMemberRemoved(uint256 indexed pid, address member);
    event ScoreSubmitted(uint256 indexed pid, address indexed applicant, uint256 score);
    event DisputeVoteCast(uint256 indexed disputeId, address member, bool upholdDispute);
    event MilestoneVoteCast(uint256 indexed milestoneId, address member, bool approve);
    event MilestoneVoteResolved(uint256 indexed milestoneId, bool approved);

    // ── Errors ───────────────────────────────────────────────────────────────
    error InitiatorCannotBeCommittee();
    error AlreadyCommitteeMember();
    error TooManyCommitteeMembers();
    error NotCommitteeMember();
    error AlreadyVotedOnDispute();
    error AlreadyVotedOnMilestone();
    error MilestoneAlreadyResolved();
    error OnlyInitiator();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address core, address milestoneManager) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _core = IScholarshipCoreGov(core);
        _mm   = IMilestoneManagerGov(milestoneManager);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ═══════════════════════════════════════════════════════════════════
    // COMMITTEE MANAGEMENT (unchanged)
    // ═══════════════════════════════════════════════════════════════════

    function addCommitteeMember(uint256 pid, address member) external {
        ScholarshipTypes.Program memory prog = _core.getProgram(pid);
        if (msg.sender != prog.initiator) revert OnlyInitiator();
        if (member == prog.initiator) revert InitiatorCannotBeCommittee();
        if (isCommitteeMember[pid][member]) revert AlreadyCommitteeMember();
        if (_committeeMembers[pid].length >= ScholarshipTypes.MAX_COMMITTEE_MEMBERS) revert TooManyCommitteeMembers();

        uint8 idx = uint8(_committeeMembers[pid].length + 1); // 1-based
        isCommitteeMember[pid][member] = true;
        _memberIndex[pid][member] = idx;
        _committeeMembers[pid].push(member);
        activeMemberCount[pid]++;
        emit CommitteeMemberAdded(pid, member);
    }

    function removeCommitteeMember(uint256 pid, address member) external {
        ScholarshipTypes.Program memory prog = _core.getProgram(pid);
        if (msg.sender != prog.initiator) revert OnlyInitiator();
        if (!isCommitteeMember[pid][member]) revert NotCommitteeMember();
        
        isCommitteeMember[pid][member] = false;
        activeMemberCount[pid]--;
        // Note: index kept to preserve bitmap integrity for past votes.
        emit CommitteeMemberRemoved(pid, member);
    }

    function getCommitteeMembers(uint256 pid) external view returns (address[] memory) {
        return _committeeMembers[pid];
    }

    // ═══════════════════════════════════════════════════════════════════
    // SCORING (unchanged from v4)
    // ═══════════════════════════════════════════════════════════════════

    function submitScore(
        uint256 pid,
        address applicant,
        uint256 academicScore,
        uint256 incomeScore,
        uint256 recommendScore
    ) external {
        if (!isCommitteeMember[pid][msg.sender]) revert NotCommitteeMember();
        hasScored[pid][applicant][msg.sender] = true;
        _tryFinalizeScore(pid, applicant, academicScore, incomeScore, recommendScore);
        emit ScoreSubmitted(pid, applicant, academicScore);
    }

    function _tryFinalizeScore(uint256 pid, address applicant, uint256 academic, uint256 income, uint256 recommend) internal {
        address[] memory members = _committeeMembers[pid];
        uint256 n = members.length;
        uint256 voted;
        for (uint256 i; i < n; ) {
            // Only count votes from members who are STILL active
            if (isCommitteeMember[pid][members[i]] && hasScored[pid][applicant][members[i]]) {
                voted++;
            }
            unchecked { ++i; }
        }

        // Majority Scoring: trigger when more than 50% of ACTIVE members have voted
        uint256 activeCount = activeMemberCount[pid];
        uint256 majority    = activeCount / 2 + 1;
        
        if (voted >= majority && activeCount > 0) {
            _core.submitCommitteeScore(pid, applicant, academic, income, recommend, msg.sender);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DISPUTE VOTING (unchanged from v4)
    // ═══════════════════════════════════════════════════════════════════

    function voteOnDispute(uint256 disputeId, uint256 pid, bool upholdDispute) external {
        if (!isCommitteeMember[pid][msg.sender]) revert NotCommitteeMember();
        if (hasVotedOnDispute[disputeId][msg.sender]) revert AlreadyVotedOnDispute();
        hasVotedOnDispute[disputeId][msg.sender] = true;
        if (upholdDispute) disputeVotesFor[disputeId]++;
        else               disputeVotesAgainst[disputeId]++;
        emit DisputeVoteCast(disputeId, msg.sender, upholdDispute);

        uint256 majority = activeMemberCount[pid] / 2 + 1;
        if (disputeVotesFor[disputeId] >= majority) {
            _core.resolveDisputeBH(disputeId);
        } else if (disputeVotesAgainst[disputeId] >= majority) {
            _core.resolveDisputeScholar(disputeId);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // MILESTONE APPROVAL (v5)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Committee member votes to approve or reject a proposed milestone.
     *
     * @dev    Uses bitmap voting:
     *         - Each member has a 1-based index stored at _memberIndex[programId][member].
     *         - Their vote is stored as a bit in _approveVotes[milestoneId] or _rejectVotes[].
     *         - On majority: calls MilestoneManager.approveMilestone() or rejectMilestone().
     *
     *         GAS: ~1 SLOAD + 1 SSTORE per vote. Resolution adds 1 external call.
     *         No array iteration needed — popcount via Brian Kernighan is O(set bits).
     */
    function voteOnMilestone(uint256 milestoneId, uint256 pid, bool approve) external {
        if (!isCommitteeMember[pid][msg.sender]) revert NotCommitteeMember();
        if (milestoneResolved[milestoneId]) revert MilestoneAlreadyResolved();

        uint8 idx = _memberIndex[pid][msg.sender];
        uint256 bit = 1 << (idx - 1);

        // Prevent double voting (check both bitmaps)
        if ((_approveVotes[milestoneId] | _rejectVotes[milestoneId]) & bit != 0) revert AlreadyVotedOnMilestone();

        if (approve) _approveVotes[milestoneId] |= bit;
        else         _rejectVotes[milestoneId]  |= bit;

        emit MilestoneVoteCast(milestoneId, msg.sender, approve);

        uint256 majority = activeMemberCount[pid] / 2 + 1;

        uint256 approveCount = _popcount(_approveVotes[milestoneId]);
        uint256 rejectCount  = _popcount(_rejectVotes[milestoneId]);

        if (approveCount >= majority) {
            milestoneResolved[milestoneId] = true;
            _mm.approveMilestone(milestoneId);
            emit MilestoneVoteResolved(milestoneId, true);
        } else if (rejectCount >= majority) {
            milestoneResolved[milestoneId] = true;
            _mm.rejectMilestone(milestoneId);
            emit MilestoneVoteResolved(milestoneId, false);
        }
    }

    // ── Brian Kernighan bit count (gas-efficient for sparse bitmaps) ─────────
    function _popcount(uint256 x) internal pure returns (uint256 count) {
        while (x != 0) { x &= x - 1; unchecked { ++count; } }
    }
}

// ── Minimal interfaces ───────────────────────────────────────────────────────

interface IScholarshipCoreGov {
    function getProgram(uint256 pid) external view returns (ScholarshipTypes.Program memory);
    function submitCommitteeScore(uint256 pid, address applicant, uint256 academic, uint256 income, uint256 recommend, address committeeAddress) external;
    function resolveDisputeBH(uint256 disputeId) external;
    function resolveDisputeScholar(uint256 disputeId) external;
}

interface IMilestoneManagerGov {
    function approveMilestone(uint256 milestoneId) external;
    function rejectMilestone(uint256 milestoneId) external;
}
