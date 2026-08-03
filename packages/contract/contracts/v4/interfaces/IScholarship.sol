// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

// ═══════════════════════════════════════════════════════════════════════
// IScholarshipCore
// ═══════════════════════════════════════════════════════════════════════

/**
 * @notice Minimal surface exposed by ScholarshipCore to sibling contracts.
 *
 * @dev    v5 changes:
 *         + hasBountyRole()       — MilestoneManager auth check
 *         + onOptionalApproved()  — callback from MilestoneManager
 *         + onMilestoneCompleted() — callback from MilestoneManager
 *         + resolveDisputeBH() / resolveDisputeScholar() — called by CommitteeGovernance
 *         - getMilestone() removed — now lives on IMilestoneManager
 */
interface IScholarshipCore {

    // ── Queries ────────────────────────────────────────────────────────

    function getProgram(uint256 pid)
        external view returns (ScholarshipTypes.Program memory);

    function getScholar(address wallet, uint256 pid)
        external view returns (ScholarshipTypes.Scholar memory);

    function isStudentEligible(address wallet)
        external view returns (bool eligible, string memory reason);

    /// @notice USDC value of undisbursed milestones for a given scholar.
    ///         Used by ScholarshipBounty to calculate BH stake and potential reward.
    function getRemainingFund(address wallet, uint256 pid)
        external view returns (uint256);

    /// @notice Returns true if `account` holds BOUNTY_ROLE.
    ///         Used by MilestoneManager to gate freeze/release calls.
    function hasBountyRole(address account) external view returns (bool);

    // ── Callbacks (MILESTONE_ROLE only) ───────────────────────────────

    /**
     * @notice Called by MilestoneManager when a committee approves an
     *         optional or negotiated milestone proposal.
     *         Core increments scholar.optionalApproved and
     *         program.allocatedFund by `amount`.
     */
    function onOptionalApproved(
        uint256 pid,
        address scholar,
        uint256 amount
    ) external;

    /**
     * @notice Called by MilestoneManager when any milestone completes.
     *         Core updates progress counters, spentFund, reputation,
     *         and fires NFT mint + program completion if all mandatory done.
     */
    function onMilestoneCompleted(
        uint256 pid,
        address scholar,
        uint256 milestoneId,
        uint256 amount,
        ScholarshipTypes.MilestoneKind kind
    ) external;

    // ── Privilege mutations (BOUNTY_ROLE) ──────────────────────────────

    /**
     * @notice Apply fraud penalty to a scholar.
     *         Sets global freeze / blacklist and punishes voters.
     */
    function slashScholar(
        address wallet,
        uint256 pid,
        ScholarshipTypes.DisputeType disputeType
    ) external;

    // ── Privilege mutations (COMMITTEE_ROLE) ──────────────────────────

    /**
     * @notice Called by CommitteeGovernance to push averaged scores on-chain.
     */
    function submitCommitteeScore(
        uint256 pid,
        address applicant,
        uint256 academicScore,
        uint256 incomeScore,
        uint256 recommendScore,
        address committeeAddress
    ) external;

    /**
     * @notice Called by CommitteeGovernance when majority rules BH won.
     *         Core (or Bounty via Core) executes the slash + BH reward.
     */
    function resolveDisputeBH(uint256 disputeId) external;

    /**
     * @notice Called by CommitteeGovernance when majority rules scholar won.
     *         Core (or Bounty) releases the milestone and penalises BH.
     */
    function resolveDisputeScholar(uint256 disputeId) external;
}

// ═══════════════════════════════════════════════════════════════════════
// IMilestoneManager
// ═══════════════════════════════════════════════════════════════════════

/**
 * @notice Full public surface of MilestoneManager.
 *
 * @dev    Consumers:
 *         - ScholarshipCoreBase  → createMandatoryBatch(), setProgramCommittee()
 *         - CommitteeGovernance  → approveMilestone(), rejectMilestone()
 *         - ScholarshipBounty    → freezeMilestone(), releaseMilestone(),
 *                                  forceCompleteMilestone()
 *         - Frontend / indexer   → getMilestone(), getMandatoryIds(),
 *                                  getOptionalIds()
 *         - Scholar (EOA)        → proposeMilestone(), submitProof()
 *         - Anyone               → executeMilestone()
 */
interface IMilestoneManager {

    // ── Core-only writes ───────────────────────────────────────────────

    /**
     * @notice Create all mandatory milestones for a newly activated scholar.
     *         Only callable by ScholarshipCore (onlyCore modifier).
     * @param amounts  Disbursement amount per milestone.
     * @param descs    IPFS descriptionCIDs; pass empty array to defer.
     */
    function createMandatoryBatch(
        uint256 pid,
        address scholar,
        uint256[] calldata amounts,
        string[] calldata descs,
        bytes32[] calldata providers,
        bytes32[] calldata externalIds
    ) external;

    /**
     * @notice Register committee contract for a program.
     *         Called by ScholarshipCore inside createProgram().
     */
    function setProgramCommittee(uint256 pid, address committeeContract) external;

    /**
     * @notice Set ScholarshipCore address post-deploy (resolves circular dependency).
     *         Can only be called once by admin; core starts as address(0).
     */
    function setCore(address coreAddr) external;

    // ── Scholar writes ─────────────────────────────────────────────────

    /**
     * @notice Scholar proposes an optional or negotiated milestone.
     * @param kind           Must be OPTIONAL or NEGOTIATED.
     * @param amount         Requested disbursement if approved + completed.
     * @param descriptionCID IPFS CID describing the deliverable.
     */
    function proposeMilestone(
        uint256 pid,
        ScholarshipTypes.MilestoneKind kind,
        uint256 amount,
        string calldata descriptionCID,
        bytes32 provider,
        bytes32 externalId
    ) external;

    /**
     * @notice Scholar submits proof for a PENDING milestone.
     */
    function submitProof(uint256 milestoneId, string calldata proofCID) external;

    // ── Committee writes (called via CommitteeGovernance) ──────────────

    /**
     * @notice Approve a PROPOSED optional/negotiated milestone.
     *         Only callable by the program's CommitteeGovernance contract.
     */
    function approveMilestone(uint256 milestoneId) external;

    /**
     * @notice Reject a PROPOSED optional/negotiated milestone.
     *         Frees the scholar's optional slot for re-proposal.
     *         Only callable by the program's CommitteeGovernance contract.
     */
    function rejectMilestone(uint256 milestoneId) external;

    // ── Public execution ───────────────────────────────────────────────

    /**
     * @notice Anyone can execute a SUBMITTED milestone once dispute window
     *         has elapsed.  Triggers Treasury disbursement and Core callback.
     */
    function executeMilestone(uint256 milestoneId) external;

    // ── Bounty writes ──────────────────────────────────────────────────

    function freezeMilestone(uint256 milestoneId) external;

    function releaseMilestone(uint256 milestoneId) external;

    /// @notice Called by BountyResolver after committee votes BH won;
    ///         forces milestone to COMPLETED and disburses (edge case).
    function forceCompleteMilestone(uint256 milestoneId) external;

    // ── Views ──────────────────────────────────────────────────────────

    function getMilestone(uint256 milestoneId)
        external view returns (ScholarshipTypes.Milestone memory);

    /// @notice All mandatory milestone IDs for a scholar in a program.
    function getMandatoryIds(uint256 pid, address scholar)
        external view returns (uint256[] memory);

    /// @notice All optional/negotiated milestone IDs for a scholar.
    function getOptionalIds(uint256 pid, address scholar)
        external view returns (uint256[] memory);

    function milestoneOwner(uint256 milestoneId) external view returns (address);

    function programCommittee(uint256 pid) external view returns (address);
}

// ═══════════════════════════════════════════════════════════════════════
// IScholarshipTreasury
// ═══════════════════════════════════════════════════════════════════════

/**
 * @notice Interface for all fund movements in the protocol.
 *         ScholarshipCore and ScholarshipBounty call these; users never
 *         interact with the treasury directly.
 */
interface IScholarshipTreasury {

    function depositProgramFund(uint256 pid, uint256 amount, address token) external;

    function recordDonation(uint256 pid, address donor, uint256 netAmount) external;

    /// @notice Release milestone payment to scholar after dispute window clears.
    function disburseMilestone(
        address scholar,
        uint256 pid,
        uint256 milestoneId,
        uint256 amount
    ) external;

    function slashAndDistribute(
        uint256 pid,
        address scholar,
        address bountyHunter,
        uint256 bhPercent,
        uint256 treasuryPercent,
        uint256 protocolPercent
    ) external returns (uint256 bhReward);

    function depositConfidenceStake(
        uint256 pid,
        address voter,
        address scholar,
        uint256 amount
    ) external;

    function resolveConfidenceStake(
        uint256 pid,
        address voter,
        bool scholarSucceeded
    ) external;

    function addYield(uint256 pid, uint256 amount) external;

    function distributeYield(uint256 pid) external;

    function refundDonors(uint256 pid) external;

    function getProgramBalance(uint256 pid) external view returns (uint256);

    function getAccruedYield(uint256 pid) external view returns (uint256);

    function getProgramDonors(uint256 pid) external view returns (address[] memory);

    function programTotalDonated(uint256 pid) external view returns (uint256);
}

// ═══════════════════════════════════════════════════════════════════════
// ICredentialNFT
// ═══════════════════════════════════════════════════════════════════════

interface ICredentialNFT {
    function mint(
        address recipient,
        uint256 pid,
        string calldata metadataURI
    ) external returns (uint256 tokenId);
}

// ═══════════════════════════════════════════════════════════════════════
// IScholarshipBounty
// ═══════════════════════════════════════════════════════════════════════

/**
 * @notice External surface of the bounty / dispute contract.
 *         CommitteeGovernance reads dispute data and triggers resolution.
 */
interface IScholarshipBounty {
    function getDispute(uint256 disputeId)
        external view returns (ScholarshipTypes.Dispute memory);

    function resolveDispute(uint256 disputeId, bool bountyHunterWon) external;
}

// ═══════════════════════════════════════════════════════════════════════
// IScholarshipReputation
// ═══════════════════════════════════════════════════════════════════════

interface IScholarshipReputation {
    function mint(address to,   uint256 amount, string calldata reason) external;
    function burn(address from, uint256 amount, string calldata reason) external;
    function balanceOf(address account) external view returns (uint256);
    function lockVotingPower(address voter, uint256 lockUntil) external;
    function isVotingPowerLocked(address voter) external view returns (bool);
}

// ═══════════════════════════════════════════════════════════════════════
// ICommitteeGovernance
// ═══════════════════════════════════════════════════════════════════════

/**
 * @notice Minimal surface exposed by CommitteeGovernance to ScholarshipCore.
 */
interface ICommitteeGovernance {
    function isCommitteeMember(uint256 pid, address member)
        external view returns (bool);
}

