// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

/**
 * @title  MilestoneManager v5
 * @notice Handles all three milestone tiers:
 *
 *         1. MANDATORY  — created by program initiator at selectWinners()
 *                         via ScholarshipCore. Stored here, written by Core
 *                         through the `onlyCore` gate.
 *
 *         2. OPTIONAL   — proposed by scholar via proposeMilestone().
 *                         Requires committee approval before becoming PENDING.
 *
 *         3. NEGOTIATED — same proposal flow as OPTIONAL, but initiator
 *                         passes kind=NEGOTIATED to signal a co-designed goal.
 *
 * @dev    Extracted from ScholarshipCoreBase to keep ScholarshipCore ≤ 24 KB
 *         (EIP-170 limit). ScholarshipCore calls this contract for all
 *         milestone writes; this contract calls ScholarshipCore for scholar
 *         state reads and Treasury for disbursement.
 *
 *         GAS NOTES
 *         ──────────────────────────────────────────────────────────────
 *         • Committee approval is a single SSTORE (status PROPOSED→PENDING).
 *         • proposeMilestone() does NOT lock funds — funds come from the
 *           program's pre-deposited pool, allocated only on COMPLETED.
 *         • Timestamps packed as uint48 in Milestone struct save ~2 slots
 *           vs uint256 each.
 *         • Scholar optional counters use uint128 pair (one slot).
 */
contract MilestoneManager is Initializable, UUPSUpgradeable {

    // ── Reentrancy (inline, no import needed) ───────────────────────────────
    uint256 private _status;
    error Reentrancy();
    modifier nonReentrant() {
        if (_status == 2) revert Reentrancy();
        _status = 2; _; _status = 1;
    }

    // ── Roles ────────────────────────────────────────────────────────────────
    address public core;        // ScholarshipCore — only caller for writeMandatory
    address public admin;

    mapping(uint256 => address) public programCommittee; // pid → CommitteeGovernance

    modifier onlyCore()      { if (msg.sender != core)  revert NotCore();      _; }
    modifier onlyCoreOrSelection() { if (msg.sender != core && msg.sender != selection) revert NotCore(); _; }
    modifier onlyCommittee(uint256 pid) {
        address cg = programCommittee[pid];
        if (cg == address(0) || msg.sender != cg) revert NotCommittee();
        _;
    }

    // ── Storage ──────────────────────────────────────────────────────────────
    uint256 private _nextId;

    /// milestoneId → Milestone
    mapping(uint256 => ScholarshipTypes.Milestone) public milestones;

    /// milestoneId → owner (for quick auth)
    mapping(uint256 => address) public milestoneOwner;

    /// pid → scholar → mandatory milestoneIds[]
    mapping(uint256 => mapping(address => uint256[])) public mandatoryIds;

    /// pid → scholar → optional milestoneIds[]
    mapping(uint256 => mapping(address => uint256[])) public optionalIds;

    // ── Interface (minimal) to Core ──────────────────────────────────────────
    IScholarshipCoreMin private _coreContract;

    // ── Interface (minimal) to Treasury ─────────────────────────────────────
    ITreasuryMin private _treasuryContract;

    // ── Selection contract ───────────────────────────────────────────────────
    // APPENDED DELIBERATELY after every existing variable: this is a live UUPS proxy.
    /// ScholarshipSelection: creates a winner's mandatory milestones when winners are chosen.
    address public selection;

    // APPENDED DELIBERATELY (live UUPS proxy): how many times the creator sent a milestone back for a fix.
    mapping(uint256 => uint8) public revisionCount;
    /// A creator may send the same milestone back at most this many times.
    uint8 public constant MAX_REVISIONS = 2;

    // ── Events ───────────────────────────────────────────────────────────────
    event MilestoneCreated(uint256 indexed id, uint256 indexed pid, address indexed scholar, ScholarshipTypes.MilestoneKind kind, bytes32 provider, bytes32 externalId);
    event MilestoneProposed(uint256 indexed id, uint256 indexed pid, address indexed scholar, ScholarshipTypes.MilestoneKind kind, bytes32 provider, bytes32 externalId);
    event MilestoneApproved(uint256 indexed id, address approvedBy);
    event MilestoneRejected(uint256 indexed id, address rejectedBy);
    event MilestoneSubmitted(uint256 indexed id, address indexed scholar, string proofCID);
    event MilestoneCompleted(uint256 indexed id, address indexed scholar, uint256 amount);
    event MilestoneFrozen(uint256 indexed id);
    event MilestoneReleased(uint256 indexed id);
    event MilestoneRevisionRequested(uint256 indexed id, address indexed by, string reasonCID, uint8 count);

    // ── Errors ───────────────────────────────────────────────────────────────
    error NotCore();
    error NotCommittee();
    error NotFound();
    error NotOwner();
    error WrongStatus(ScholarshipTypes.MilestoneStatus got);
    error ScholarNotActive();
    error TooManyMandatory();
    error TooManyOptional();
    error OptionalDisabled();
    error DisputeWindowOpen();
    error NotBountyRole();
    error CommitteeNotSet();
    error AlreadyActed();
    error InsufficientProgramFund();
    error NotProgramInitiator();
    error TooManyRevisions();
    error ReviewWindowClosed();

    // ── Upgrades ─────────────────────────────────────────────────────────────
    // MilestoneManager was deployed behind a proxy but had no way to be upgraded, so any change to it meant a
    // brand new deployment (and losing every milestone). It is UUPS now; only the admin may upgrade it.
    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != admin) revert NotCore();
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _admin, address coreAddr, address treasuryAddr) external initializer {
        _status          = 1;
        admin            = _admin;
        core             = coreAddr;
        _coreContract    = IScholarshipCoreMin(coreAddr);
        _treasuryContract = ITreasuryMin(treasuryAddr);
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Set ScholarshipCore address post-deploy to resolve circular dependency.
     *         Call this once after Core is deployed — core starts as address(0).
     */
    function setCore(address coreAddr) external {
        if (msg.sender != admin) revert NotCore();
        require(core == address(0), "core already set");
        core          = coreAddr;
        _coreContract = IScholarshipCoreMin(coreAddr);
    }

    function setSelection(address selectionAddr) external {
        if (msg.sender != admin) revert NotCore();
        selection = selectionAddr;
    }

    function setProgramCommittee(uint256 pid, address committeeContract) external {
        if (msg.sender != admin && msg.sender != core) revert NotCore();
        programCommittee[pid] = committeeContract;
    }

    // ═══════════════════════════════════════════════════════════════════
    // TIER 1 — MANDATORY (written by Core at selectWinners)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Called by ScholarshipCore._activateScholar() for each winner.
     * @param  pid  Program ID.
     * @param  scholar    Winner address.
     * @param  amounts    Array of disbursement amounts — one per mandatory milestone.
     * @param  descs      Array of descriptionCIDs — same length as amounts.
     *                    Pass empty string to defer description off-chain.
     */
    function createMandatoryBatch(
        uint256 pid,
        address scholar,
        uint256[] calldata amounts,
        string[] calldata descs,
        bytes32[] calldata providers,
        bytes32[] calldata externalIds
    ) external onlyCoreOrSelection {
        uint256 n = amounts.length;
        uint8 maxMandatory = _coreContract.getProtocolConfig().maxMandatoryMilestones;
        if (n == 0 || n > maxMandatory) revert TooManyMandatory();
        // arrays length must match or be 0
        bool hasDescs = descs.length == n;
        bool hasProviders = providers.length == n;
        bool hasExternalIds = externalIds.length == n;

        for (uint256 i; i < n; ) {
            uint256 mId = ++_nextId;
            milestones[mId] = ScholarshipTypes.Milestone({
                id:             mId,
                pid:            pid,
                scholar:        scholar,
                kind:           ScholarshipTypes.MilestoneKind.MANDATORY,
                amount:         amounts[i],
                proposedBy:     address(0),
                approvedBy:     address(0),
                descriptionCID: hasDescs ? descs[i] : "",
                proofCID:       "",
                provider:       hasProviders ? providers[i] : bytes32(0),
                externalId:     hasExternalIds ? externalIds[i] : bytes32(0),
                status:         ScholarshipTypes.MilestoneStatus.PENDING,
                submittedAt:    0,
                disputeDeadline:0,
                completedAt:    0
            });
            milestoneOwner[mId] = scholar;
            mandatoryIds[pid][scholar].push(mId);
            emit MilestoneCreated(mId, pid, scholar, ScholarshipTypes.MilestoneKind.MANDATORY, hasProviders ? providers[i] : bytes32(0), hasExternalIds ? externalIds[i] : bytes32(0));
            unchecked { ++i; }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TIER 2 & 3 — OPTIONAL / NEGOTIATED (proposed by scholar)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Scholar proposes an optional or negotiated milestone.
     *
     * @param  pid      Program the scholar is enrolled in.
     * @param  kind           Must be OPTIONAL or NEGOTIATED.
     * @param  amount         Requested disbursement if approved & completed.
     * @param  descriptionCID IPFS CID describing the deliverable.
     *
     * @dev    Gas: one SSTORE for the Milestone struct (new slot),
     *         one SSTORE for milestoneOwner, one SSTORE array push.
     *         No fund lock here — amount is checked against program balance
     *         at approval time.
     */
    function proposeMilestone(
        uint256 pid,
        ScholarshipTypes.MilestoneKind kind,
        uint256 amount,
        string calldata descriptionCID,
        bytes32 provider,
        bytes32 externalId
    ) external nonReentrant {
        if (kind == ScholarshipTypes.MilestoneKind.MANDATORY) revert WrongStatus(ScholarshipTypes.MilestoneStatus.PROPOSED);

        // Scholar must be active
        ScholarshipTypes.Scholar memory s = _coreContract.getScholar(msg.sender, pid);
        if (s.status != ScholarshipTypes.StudentStatus.ACTIVE) revert ScholarNotActive();

        // Program must allow optional milestones
        ScholarshipTypes.Program memory prog = _coreContract.getProgram(pid);
        if (prog.maxOptionalMilestones == 0) revert OptionalDisabled();

        // Cap check (use runtime config)
        uint8 maxOptional = _coreContract.getProtocolConfig().maxOptionalMilestones;
        uint256 existing = optionalIds[pid][msg.sender].length;
        if (existing >= (prog.maxOptionalMilestones < maxOptional ? prog.maxOptionalMilestones : maxOptional)) revert TooManyOptional();

        // Committee must be set
        if (programCommittee[pid] == address(0)) revert CommitteeNotSet();

        uint256 mId = ++_nextId;
        milestones[mId] = ScholarshipTypes.Milestone({
            id:              mId,
            pid:             pid,
            scholar:         msg.sender,
            kind:            kind,
            amount:          amount,
            proposedBy:      msg.sender,
            approvedBy:      address(0),
            descriptionCID:  descriptionCID,
            proofCID:        "",
            provider:        provider,
            externalId:      externalId,
            status:          ScholarshipTypes.MilestoneStatus.PROPOSED,
            submittedAt:     0,
            disputeDeadline: 0,
            completedAt:     0
        });
        milestoneOwner[mId] = msg.sender;
        optionalIds[pid][msg.sender].push(mId);
        emit MilestoneProposed(mId, pid, msg.sender, kind, provider, externalId);
    }

    // ═══════════════════════════════════════════════════════════════════
    // COMMITTEE APPROVAL / REJECTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Committee approves a proposed optional/negotiated milestone.
     *
     * @dev    Called by CommitteeGovernance (or directly by a committee member
     *         if CommitteeGovernance delegates).
     *         Gas: two SSTOREs (status, approvedBy).
     *         Amount is verified against remaining program allocation.
     */
    function approveMilestone(uint256 milestoneId) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        if (m.status != ScholarshipTypes.MilestoneStatus.PROPOSED) revert WrongStatus(m.status);
        if (m.kind == ScholarshipTypes.MilestoneKind.MANDATORY) revert AlreadyActed();

        // Only committee of that program
        address cg = programCommittee[m.pid];
        if (cg == address(0)) revert CommitteeNotSet();
        if (msg.sender != cg) revert NotCommittee();

        // Check program has enough unallocated fund
        ScholarshipTypes.Program memory prog = _coreContract.getProgram(m.pid);
        uint256 available = prog.totalFund - prog.allocatedFund;
        if (m.amount > available) revert InsufficientProgramFund();

        // Approve
        m.status     = ScholarshipTypes.MilestoneStatus.PENDING;
        m.approvedBy = msg.sender;

        // Notify core to increment scholar.optionalApproved and allocatedFund
        _coreContract.onOptionalApproved(m.pid, m.scholar, m.amount);

        emit MilestoneApproved(milestoneId, msg.sender);
    }

    /**
     * @notice Committee rejects a proposed milestone.
     *         Scholar may propose again (different params) — slot is freed
     *         by removing from optionalIds array.
     */
    function rejectMilestone(uint256 milestoneId) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        if (m.status != ScholarshipTypes.MilestoneStatus.PROPOSED) revert WrongStatus(m.status);

        address cg = programCommittee[m.pid];
        if (cg == address(0)) revert CommitteeNotSet();
        if (msg.sender != cg) revert NotCommittee();

        m.status     = ScholarshipTypes.MilestoneStatus.REJECTED;
        m.approvedBy = msg.sender;

        // Free up the optional slot so scholar can re-propose
        _removeFromOptionalIds(m.pid, m.scholar, milestoneId);

        emit MilestoneRejected(milestoneId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4 — PROOF SUBMISSION & EXECUTION (all kinds)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Scholar submits proof for any PENDING milestone (mandatory or approved optional).
     */
    function submitProof(uint256 milestoneId, string calldata proofCID) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0)                   revert NotFound();
        if (msg.sender != m.scholar)     revert NotOwner();
        if (m.status != ScholarshipTypes.MilestoneStatus.PENDING) revert WrongStatus(m.status);

        ScholarshipTypes.Scholar memory s = _coreContract.getScholar(msg.sender, m.pid);
        if (s.status != ScholarshipTypes.StudentStatus.ACTIVE) revert ScholarNotActive();

        ScholarshipTypes.Program memory prog = _coreContract.getProgram(m.pid);

        m.proofCID       = proofCID;
        m.status         = ScholarshipTypes.MilestoneStatus.SUBMITTED;
        m.submittedAt    = uint48(block.timestamp);
        m.disputeDeadline = uint48(block.timestamp + prog.milestoneDisputeWindow);
        emit MilestoneSubmitted(milestoneId, msg.sender, proofCID);
    }

    /**
     * @notice Anyone can execute a SUBMITTED milestone once dispute window has passed.
     *         Triggers disbursement and progress update via Core.
     */
    function executeMilestone(uint256 milestoneId) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0)  revert NotFound();
        if (m.status != ScholarshipTypes.MilestoneStatus.SUBMITTED) revert WrongStatus(m.status);
        if (block.timestamp < m.disputeDeadline) revert DisputeWindowOpen();

        _completeMilestone(milestoneId, m);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CREATOR'S REVIEW OF A SUBMITTED MILESTONE
    // ═══════════════════════════════════════════════════════════════════
    // The review period is the creator's chance to look at the proof. Doing nothing changes nothing:
    // once it ends, anyone can still release the funds (`executeMilestone`), so a silent creator
    // can never keep a scholar from being paid.

    /**
     * @notice The program creator accepts a submitted milestone now, without waiting for the review
     *         period to run out: the funds are released to the scholar in this same transaction.
     */
    function approveSubmission(uint256 milestoneId) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        if (m.status != ScholarshipTypes.MilestoneStatus.SUBMITTED) revert WrongStatus(m.status);
        if (msg.sender != _coreContract.getProgram(m.pid).initiator) revert NotProgramInitiator();

        _completeMilestone(milestoneId, m);
    }

    /**
     * @notice The program creator sends a submitted milestone back to the scholar to fix, with a
     *         written reason (an IPFS document). Only while the review period is still open, and at
     *         most MAX_REVISIONS times per milestone, so it cannot be used to hold money back forever.
     *         The scholar then submits again, which starts a fresh review period.
     */
    function requestRevision(uint256 milestoneId, string calldata reasonCID) external nonReentrant {
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        if (m.status != ScholarshipTypes.MilestoneStatus.SUBMITTED) revert WrongStatus(m.status);
        if (msg.sender != _coreContract.getProgram(m.pid).initiator) revert NotProgramInitiator();
        if (block.timestamp >= m.disputeDeadline) revert ReviewWindowClosed();
        uint8 used = revisionCount[milestoneId];
        if (used >= MAX_REVISIONS) revert TooManyRevisions();

        revisionCount[milestoneId] = used + 1;
        m.status          = ScholarshipTypes.MilestoneStatus.PENDING;
        m.proofCID        = "";
        m.submittedAt     = 0;
        m.disputeDeadline = 0;

        emit MilestoneRevisionRequested(milestoneId, msg.sender, reasonCID, used + 1);
    }

    // ── Internal: complete ────────────────────────────────────────────────────
    function _completeMilestone(uint256 milestoneId, ScholarshipTypes.Milestone storage m) internal {
        m.status      = ScholarshipTypes.MilestoneStatus.COMPLETED;
        m.completedAt = uint48(block.timestamp);

        _treasuryContract.disburseMilestone(m.scholar, m.pid, milestoneId, m.amount);

        // Notify core — handles scholar progress, program spentFund, NFT, reputation
        _coreContract.onMilestoneCompleted(m.pid, m.scholar, milestoneId, m.amount, m.kind);

        emit MilestoneCompleted(milestoneId, m.scholar, m.amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // BOUNTY ROLE — FREEZE / RELEASE
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Called by ScholarshipBounty (holds BOUNTY_ROLE on Core).
    function freezeMilestone(uint256 milestoneId) external {
        if (!_coreContract.hasBountyRole(msg.sender)) revert NotBountyRole();
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        m.status = ScholarshipTypes.MilestoneStatus.FROZEN;
        emit MilestoneFrozen(milestoneId);
    }

    function releaseMilestone(uint256 milestoneId) external {
        if (!_coreContract.hasBountyRole(msg.sender)) revert NotBountyRole();
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        ScholarshipTypes.Program memory prog = _coreContract.getProgram(m.pid);
        m.status          = ScholarshipTypes.MilestoneStatus.SUBMITTED;
        m.disputeDeadline = uint48(block.timestamp + prog.milestoneDisputeWindow);
        emit MilestoneReleased(milestoneId);
    }

    // ── Called by BountyResolver after committee vote ─────────────────────────
    function forceCompleteMilestone(uint256 milestoneId) external {
        if (!_coreContract.hasBountyRole(msg.sender)) revert NotBountyRole();
        ScholarshipTypes.Milestone storage m = milestones[milestoneId];
        if (m.id == 0) revert NotFound();
        _completeMilestone(milestoneId, m);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function getMilestone(uint256 id) external view returns (ScholarshipTypes.Milestone memory) {
        return milestones[id];
    }

    function getMandatoryIds(uint256 pid, address scholar) external view returns (uint256[] memory) {
        return mandatoryIds[pid][scholar];
    }

    function getOptionalIds(uint256 pid, address scholar) external view returns (uint256[] memory) {
        return optionalIds[pid][scholar];
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    /**
     * @dev Swap-and-pop to remove a milestoneId from optionalIds.
     *      O(n) where n ≤ MAX_OPTIONAL_MILESTONES (≤5) → acceptable.
     */
    function _removeFromOptionalIds(uint256 pid, address scholar, uint256 mId) internal {
        uint256[] storage arr = optionalIds[pid][scholar];
        uint256 len = arr.length;
        for (uint256 i; i < len; ) {
            if (arr[i] == mId) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
            unchecked { ++i; }
        }
    }
}

// ─── Minimal interfaces (kept small to avoid import bloat) ──────────────────

interface IScholarshipCoreMin {
    function getScholar(address wallet, uint256 pid) external view returns (ScholarshipTypes.Scholar memory);
    function getProgram(uint256 pid) external view returns (ScholarshipTypes.Program memory);
    function hasBountyRole(address account) external view returns (bool);
    function getProtocolConfig() external view returns (ScholarshipTypes.ProtocolConfig memory);
    /// @notice Increment scholar.optionalApproved and program.allocatedFund
    function onOptionalApproved(uint256 pid, address scholar, uint256 amount) external;
    /// @notice Progress tracking after a milestone completes
    function onMilestoneCompleted(uint256 pid, address scholar, uint256 milestoneId, uint256 amount, ScholarshipTypes.MilestoneKind kind) external;
}

interface ITreasuryMin {
    function disburseMilestone(address scholar, uint256 pid, uint256 milestoneId, uint256 amount) external;
}
