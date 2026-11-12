// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ScholarshipTypes}       from "../libraries/ScholarshipTypes.sol";
import {TokenTransfer}          from "../libraries/TokenTransfer.sol";
import {IScholarshipTreasury}   from "../interfaces/IScholarship.sol";
import {IScholarshipReputation} from "../interfaces/IScholarship.sol";
import {ICredentialNFT}         from "../interfaces/IScholarship.sol";
import {IMilestoneManager}      from "../interfaces/IScholarship.sol";
import {ScholarshipCoreBase}    from "./ScholarshipCoreBase.sol";

/**
 * @title  ScholarshipCore v5
 * @notice Entry-point contract. Inherits voting, scholar activation,
 *         and milestone callbacks from ScholarshipCoreBase.
 *
 * @dev    EIP-170 compliance: administrative and date management functions
 *         are restricted to the GOVERNANCE_ROLE and typically called via
 *         the ScholarshipAdmin contract to save bytecode space here.
 */
contract ScholarshipCore is ScholarshipCoreBase {
    using SafeERC20 for IERC20;
    using TokenTransfer for address;

    // ── Events ────────────────────────────────────────────────────────────────
    event ProgramCreated(uint256 indexed pid, address indexed initiator, string metadataCID, address token);
    event CommitteeAssigned(uint256 indexed pid, address committeeContract);
    event DonationReceived(uint256 indexed pid, address indexed donor, uint256 grossAmount, uint256 netAmount);
    event ProtocolFeeCollected(uint256 indexed pid, address indexed donor, uint256 feeAmount);
    event StudentApplied(uint256 indexed pid, address indexed student, uint8 retryCount);
    event StudentShortlisted(uint256 indexed pid, address indexed student, uint256 score);
    event StudentScreenedOut(uint256 indexed pid, address indexed student, uint256 score, bool locked);
    event ProgramCancelled(uint256 indexed pid);
    event OpenDonationToggled(uint256 indexed pid, bool open);

    // ── Errors ───────────────────────────────────────────────────────────────
    error InvalidScoreWeights();
    error InvalidSlashDistribution();
    error InvalidCandidateRange();
    error TargetWinnersExceedsMax();
    error InsufficientFund();
    error InsufficientDonation();
    error AlreadyDonated();
    error CannotApplyToOwnProgram();
    error MaxRetriesExceeded();
    error AlreadyApplied();
    error ApplicantListIncomplete();
    error InvalidMaxOptional();
    error TokenNotSupported(address token);
    error DisputeResolutionFailed();
    error ApplicantCannotDonate();
    error DonorCannotApply();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function _authorizeUpgrade(address) internal view override {
        if (msg.sender != admin && !_roles[UPGRADER_ROLE][msg.sender]) revert NotAdmin();
    }

    function initialize(
        address _admin,
        address _usdc,
        address _treasury,
        address _reputation,
        address _donorNFT,
        address _studentNFT,
        address _fraudNFT,
        address _milestoneManager,
        address _bountyHunter
    ) external initializer {
        _initReentrancy();
        _initConfig();
        admin            = _admin;
        _roles[UPGRADER_ROLE][_admin] = true;
        usdc             = IERC20(_usdc);
        treasury         = IScholarshipTreasury(_treasury);
        reputation       = IScholarshipReputation(_reputation);
        donorNFT         = ICredentialNFT(_donorNFT);
        studentNFT       = ICredentialNFT(_studentNFT);
        fraudNFT         = ICredentialNFT(_fraudNFT);
        milestoneManager = IMilestoneManager(_milestoneManager);
        bountyHunter     = _bountyHunter;
        _roles[MILESTONE_ROLE][_milestoneManager] = true;
        if (_bountyHunter != address(0)) {
            _roles[BOUNTY_ROLE][_bountyHunter] = true;
        }
    }

    function setFraudNFT(address _fraudNFT) external {
        if (msg.sender != admin) revert NotAdmin();
        fraudNFT = ICredentialNFT(_fraudNFT);
    }

    function setBounty(address _bounty) external {
        if (msg.sender != admin) revert NotAdmin();
        bountyHunter = _bounty;
        _roles[BOUNTY_ROLE][_bounty] = true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 0 — PROGRAM CREATION
    // ═══════════════════════════════════════════════════════════════════

    function createProgram(
        string calldata metadataCID,
        ScholarshipTypes.EducationLevel educationLevel,
        ScholarshipTypes.ScreeningMode  screeningMode,
        ScholarshipTypes.ScoreWeights   calldata weights,
        ScholarshipTypes.SlashDistribution calldata slashDist,
        uint8 maxCandidates,
        uint8 targetWinners,
        uint256[4] calldata timeline,
        uint256 milestoneDisputeWindow,
        uint256 totalFund,
        uint8   maxOptionalMilestones,
        address committeeContract,
        address token
    ) external payable nonReentrant {
        { uint256 wSum = uint256(weights.academicWeight) + weights.incomeWeight + weights.essayWeight + weights.recommendWeight + weights.extracurricWeight; if (wSum != 100) revert InvalidScoreWeights(); }
        { uint256 sSum = uint256(slashDist.bountyHunterPercent) + slashDist.treasuryPercent + slashDist.protocolPercent; if (sSum != 100) revert InvalidSlashDistribution(); }
        if (maxCandidates < _config.minCandidates || maxCandidates > _config.maxCandidates) revert InvalidCandidateRange();
        if (targetWinners == 0 || targetWinners > maxCandidates) revert TargetWinnersExceedsMax();
        if (timeline[0] >= timeline[1] || timeline[2] >= timeline[3] || timeline[1] >= timeline[2]) revert InvalidTimeline();
        if (totalFund == 0) revert InsufficientFund();
        if (maxOptionalMilestones > _config.maxOptionalMilestones) revert InvalidMaxOptional();
        // Whitelist check — without it any caller could back a program with an
        // arbitrary ERC20, including one that reenters or misreports balances.
        if (!tokenConfig[token].enabled) revert TokenNotSupported(token);

        uint256 pid = ++_nextProgramId;
        programToken[pid] = token;

        // Pulls ERC20 via transferFrom, or validates+forwards msg.value for native.
        TokenTransfer.pullIn(token, msg.sender, address(treasury), totalFund);
        treasury.depositProgramFund(pid, totalFund, token);

        programs[pid] = ScholarshipTypes.Program({
            pid:                   pid,
            initiator:             msg.sender,
            metadataCID:           metadataCID,
            educationLevel:        educationLevel,
            screeningMode:         screeningMode,
            status:                ScholarshipTypes.ProgramStatus.CREATED,
            scoreWeights:          weights,
            slashDist:             slashDist,
            maxCandidates:         uint8(maxCandidates),
            targetWinners:         uint8(targetWinners),
            maxOptionalMilestones: uint8(maxOptionalMilestones),
            openDonation:          true,
            // Timeline (packed uint48)
            applicationStart:      uint48(timeline[0]),
            applicationEnd:        uint48(timeline[1]),
            votingStart:           uint48(timeline[2]),
            votingEnd:             uint48(timeline[3]),
            milestoneDisputeWindow: uint48(milestoneDisputeWindow),
            // Counters (packed uint32)
            applicantCount:        0,
            shortlistedCount:      0,
            activeScholarCount:    0,
            totalVotes:            0,
            // Financials (uint256)
            totalFund:             totalFund,
            allocatedFund:         0,
            spentFund:             0,
            yieldAccrued:          0
        });

        if (committeeContract != address(0)) {
            programCommittee[pid] = committeeContract;
            milestoneManager.setProgramCommittee(pid, committeeContract);
            emit CommitteeAssigned(pid, committeeContract);
        }
        emit ProgramCreated(pid, msg.sender, metadataCID, token);
    }

    function resolveDisputeBH(uint256 disputeId) external onlyRole(COMMITTEE_ROLE) {
        (bool success, ) = bountyHunter.call(abi.encodeWithSignature("resolveDispute(uint256,bool)", disputeId, true));
        if (!success) revert DisputeResolutionFailed();
    }

    function resolveDisputeScholar(uint256 disputeId) external onlyRole(COMMITTEE_ROLE) {
        (bool success, ) = bountyHunter.call(abi.encodeWithSignature("resolveDispute(uint256,bool)", disputeId, false));
        if (!success) revert DisputeResolutionFailed();
    }

    // ── View Helpers (IScholarshipCore compatible) ───────────────────────────

    function getProgram(uint256 id) external view returns (ScholarshipTypes.Program memory) { return programs[id]; }
    function getShortlist(uint256 id) external view returns (address[] memory) { return _shortlist[id]; }
    function getProgramApplicants(uint256 id) external view returns (address[] memory) { return _programApplicants[id]; }

    function getScholar(address wallet, uint256 pid) external view returns (ScholarshipTypes.Scholar memory) {
        return scholars[wallet][pid];
    }

    function getRemainingFund(address wallet, uint256 pid) external view returns (uint256) {
        ScholarshipTypes.Scholar memory s = scholars[wallet][pid];
        ScholarshipTypes.Program memory p = programs[pid];
        return (p.totalFund / p.targetWinners) - s.totalReceived;
    }

    // ── Status transitions ───────────────────────────────────────────────────

    /**
     * @notice Move CREATED -> APPLICATION_OPEN once the application window has started.
     * @dev    Callable by anyone (a keeper, a donor, the creator). It carries no discretion:
     *         the only input is the clock, so restricting it to the creator only let a
     *         forgetful creator stall their own program. donate()/applyToProgram() also open
     *         the window themselves, so calling this is optional.
     */
    function openApplications(uint256 pid) external programExists(pid) {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.CREATED);
        if (block.timestamp < programs[pid].applicationStart) revert TooEarly();
        programs[pid].status = ScholarshipTypes.ProgramStatus.APPLICATION_OPEN;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN);
    }

    /// @notice Move APPLICATION_OPEN -> SCREENING once the application window has ended. Callable by anyone.
    function openScreening(uint256 pid) external programExists(pid) {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN);
        if (block.timestamp < programs[pid].applicationEnd) revert TooEarly();
        programs[pid].status = ScholarshipTypes.ProgramStatus.SCREENING;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.SCREENING);
    }

    /**
     * @dev Gate for donate()/applyToProgram(): the program must be inside its application
     *      window by the CLOCK, not merely carry a stored status. Opens the window on first
     *      use and, unlike the stored-status check this replaces, closes it at
     *      `applicationEnd` even if nobody has called openScreening().
     */
    function _syncApplicationWindow(uint256 pid) internal {
        ScholarshipTypes.Program storage p = programs[pid];
        ScholarshipTypes.ProgramStatus st = p.status;
        if (st == ScholarshipTypes.ProgramStatus.CREATED && block.timestamp >= p.applicationStart) {
            st = ScholarshipTypes.ProgramStatus.APPLICATION_OPEN;
            p.status = st;
            emit ProgramStatusChanged(pid, st);
        }
        if (st != ScholarshipTypes.ProgramStatus.APPLICATION_OPEN || block.timestamp >= p.applicationEnd)
            revert InvalidProgramStatus(ScholarshipTypes.ProgramStatus.APPLICATION_OPEN, st);
    }
    modifier inApplicationWindow(uint256 pid) { _syncApplicationWindow(pid); _; }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — DONATIONS
    // ═══════════════════════════════════════════════════════════════════

    function donate(uint256 pid, uint256 grossAmount, string calldata nftMetadataURI)
        external payable nonReentrant programExists(pid) inApplicationWindow(pid)
    {
        if (!programs[pid].openDonation) revert PublicParticipationDisabled();

        address token = _programToken(pid);
        // Per-token economics: minDonation/transactionFee are absolute amounts,
        // so the USDC values (6 decimals) are meaningless for an 18-decimal
        // native token — 50 * 1e6 wei would be no minimum at all.
        (uint256 minDonation, uint256 fee) = _tokenEconomics(token);

        if (grossAmount < minDonation) revert InsufficientDonation();
        // Guard the subtraction below: a fee larger than the donation would
        // underflow-revert, but an equal one would mint a zero-power voter.
        if (grossAmount <= fee) revert InsufficientDonation();

        ScholarshipTypes.VoterInfo storage voter = voterInfo[pid][msg.sender];
        if (voter.donatedAmount > 0) revert AlreadyDonated();
        // Donating buys voting power, so someone competing for the scholarship cannot donate to it.
        if (applicants[pid][msg.sender].wallet != address(0)) revert ApplicantCannotDonate();
        token.pullIn(msg.sender, address(treasury), grossAmount);
        uint256 net = grossAmount - fee;
        voter.donatedAmount = net; voter.remainingVotingPower = net;
        treasury.recordDonation(pid, msg.sender, net);
        donorNFT.mint(msg.sender, pid, nftMetadataURI);
        emit DonationReceived(pid, msg.sender, grossAmount, net);
        emit ProtocolFeeCollected(pid, msg.sender, fee);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2 — APPLICATION & SCREENING
    // ═══════════════════════════════════════════════════════════════════

    function applyToProgram(
        uint256 pid,
        string calldata pCID, string calldata dCID, string calldata eCID, string calldata rCID,
        uint256 academicScore, uint256 incomeScore, uint256 /* recommendScore: ignored, see below */
    ) external nonReentrant programExists(pid) inApplicationWindow(pid) {
        _requireStudentEligible(msg.sender);
        ScholarshipTypes.Program storage prog = programs[pid];
        if (msg.sender == prog.initiator) revert CannotApplyToOwnProgram();
        if (voterInfo[pid][msg.sender].donatedAmount != 0) revert DonorCannotApply(); // the other half of the rule above
        if (retryCount[pid][msg.sender] >= _config.maxRetry) revert MaxRetriesExceeded();
        ScholarshipTypes.ApplicationStatus es = applicants[pid][msg.sender].status;
        if (es == ScholarshipTypes.ApplicationStatus.SHORTLISTED) revert AlreadyApplied();
        if (es == ScholarshipTypes.ApplicationStatus.LOCKED) revert MaxRetriesExceeded();

        uint8 retry = ++retryCount[pid][msg.sender];
        applicants[pid][msg.sender] = ScholarshipTypes.Applicant({
            pid: pid, wallet: msg.sender, status: ScholarshipTypes.ApplicationStatus.PENDING_REVIEW,
            profileCID: pCID, documentCID: dCID, essayCID: eCID, recommendCID: rCID,
            screeningScore: 0, totalScore: 0, voteScore: 0, scoreTimestamp: 0, retryCount: retry, scoreDisputed: false
        });

        if (retry == 1) { 
            _programApplicants[pid].push(msg.sender); 
            prog.applicantCount++; 
        }
        if (prog.screeningMode == ScholarshipTypes.ScreeningMode.BY_STUDENT)
            // Academic and income stay self-reported. The recommendation is NOT: it comes only from
            // signed recommendations (ScholarshipSelection), so a value typed by the applicant is
            // ignored. A re-application keeps the score the recommenders already gave.
            _setScore(pid, msg.sender, academicScore, incomeScore, scoreComponents[pid][msg.sender].recommendScore, msg.sender);
        emit StudentApplied(pid, msg.sender, retry);
    }

    function submitCommitteeScore(uint256 pid, address applicant, uint256 a, uint256 i, uint256 r, address comm)
        external onlyRole(COMMITTEE_ROLE) programExists(pid)
    {
        if (programs[pid].screeningMode != ScholarshipTypes.ScreeningMode.BY_COMMITTEE)
            revert InvalidProgramStatus(ScholarshipTypes.ProgramStatus.SCREENING, programs[pid].status);
        _setScore(pid, applicant, a, i, r, comm);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SELECTION HOOKS: ScholarshipSelection only (SELECTION_ROLE)
    //
    // The ranking, vote weighting and winner choice live in ScholarshipSelection
    // (this contract is at the EIP-170 size limit). It verifies the order on-chain
    // and then asks Core to record the outcome here. Core keeps ownership of the
    // state; it just no longer decides who wins.
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Score and status of one applicant, for ScholarshipSelection.
    function getApplicant(uint256 pid, address wallet)
        external view returns (bool exists, ScholarshipTypes.ApplicationStatus status, uint32 screeningScore, uint128 voteScore)
    {
        ScholarshipTypes.Applicant storage a = applicants[pid][wallet];
        // An unset struct also reads as status PENDING_REVIEW, so existence must be explicit.
        return (a.wallet != address(0), a.status, a.screeningScore, a.voteScore);
    }

    /**
     * @notice Record one batch of the shortlist resolution.
     * @param isLast  true on the final batch: requires every applicant to have been processed,
     *                then opens the voting phase.
     */
    function selectionApplyBatch(
        uint256 pid,
        address[] calldata shortlisted,
        address[] calldata screenedOut,
        bool isLast
    ) external onlyRole(SELECTION_ROLE) {
        ScholarshipTypes.Program storage prog = programs[pid];
        // The window closed by the clock; no one has called openScreening() yet.
        if (prog.status == ScholarshipTypes.ProgramStatus.APPLICATION_OPEN) {
            prog.status = ScholarshipTypes.ProgramStatus.SCREENING;
            emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.SCREENING);
        }
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.SCREENING);

        for (uint256 i; i < shortlisted.length; ) {
            ScholarshipTypes.Applicant storage app = applicants[pid][shortlisted[i]];
            app.status = ScholarshipTypes.ApplicationStatus.SHORTLISTED;
            _shortlist[pid].push(shortlisted[i]);
            prog.shortlistedCount++;
            emit StudentShortlisted(pid, shortlisted[i], app.screeningScore);
            unchecked { ++i; }
        }
        for (uint256 i; i < screenedOut.length; ) {
            _markScreenedOut(pid, screenedOut[i]);
            unchecked { ++i; }
        }

        uint32 done = resolveProgress[pid] + uint32(shortlisted.length + screenedOut.length);
        resolveProgress[pid] = done;

        if (isLast) {
            if (done < _programApplicants[pid].length) revert ApplicantListIncomplete();
            prog.status = ScholarshipTypes.ProgramStatus.VOTING;
            emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.VOTING);
        }
    }

    /// @notice Set an applicant's recommendation score (the average of verified recommendations) and recompute their screening score.
    function selectionSetRecommendScore(uint256 pid, address student, uint256 score, address by)
        external onlyRole(SELECTION_ROLE)
    {
        ScholarshipTypes.ScoreComponents storage c = scoreComponents[pid][student];
        _setScore(pid, student, c.academicScore, c.incomeScore, score, by);
    }

    function _markScreenedOut(uint256 pid, address student) internal {
        ScholarshipTypes.Applicant storage app = applicants[pid][student];
        bool locked = app.retryCount >= _config.maxRetry;
        app.status = locked ? ScholarshipTypes.ApplicationStatus.LOCKED : ScholarshipTypes.ApplicationStatus.SCREENED_OUT;
        emit StudentScreenedOut(pid, student, app.screeningScore, locked);
    }

    /**
     * @notice Turn the chosen shortlisted applicants into scholars and start the program.
     * @dev    The mandatory milestones are created by ScholarshipSelection directly on the
     *         MilestoneManager, which keeps that array-heavy call out of this contract.
     * @param mandatoryTotal  Number of mandatory milestones each winner will have.
     */
    function selectionActivate(uint256 pid, address[] calldata winners, uint32 mandatoryTotal)
        external onlyRole(SELECTION_ROLE)
    {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.VOTING);
        programs[pid].status = ScholarshipTypes.ProgramStatus.ACTIVE;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.ACTIVE);

        for (uint256 i; i < winners.length; ) {
            address s = winners[i];
            if (applicants[pid][s].status != ScholarshipTypes.ApplicationStatus.SHORTLISTED) revert CandidateNotShortlisted();
            scholars[s][pid] = ScholarshipTypes.Scholar({
                pid: pid,
                wallet: s,
                status: ScholarshipTypes.StudentStatus.ACTIVE,
                isBlacklisted: false,
                mandatoryTotal: mandatoryTotal,
                mandatoryCompleted: 0,
                optionalApproved: 0,
                optionalCompleted: 0,
                freezeUntil: 0,
                totalReceived: 0
            });
            emit ScholarSelected(pid, s);
            unchecked { ++i; }
        }
    }

    function toggleOpenDonation(uint256 pid, bool open) external programExists(pid) onlyInitiator(pid) {
        programs[pid].openDonation = open;
        emit OpenDonationToggled(pid, open);
    }

    function cancelProgram(uint256 pid) external nonReentrant programExists(pid) onlyInitiator(pid) {
        ScholarshipTypes.Program storage prog = programs[pid];
        if (prog.status == ScholarshipTypes.ProgramStatus.ACTIVE || prog.status == ScholarshipTypes.ProgramStatus.COMPLETED || prog.status == ScholarshipTypes.ProgramStatus.CANCELLED)
            revert InvalidProgramStatus(ScholarshipTypes.ProgramStatus.CREATED, prog.status);
        prog.status = ScholarshipTypes.ProgramStatus.CANCELLED;
        treasury.refundDonors(pid);
        emit ProgramCancelled(pid);
    }

    // NFT CREDENTIAL CLAIMS

    function claimStudentNFT(uint256 pid, string calldata metadataURI) external nonReentrant programExists(pid) {
        ScholarshipTypes.Scholar storage s = scholars[msg.sender][pid];
        if (s.status != ScholarshipTypes.StudentStatus.COMPLETED) revert StudentNotCompleted(pid, msg.sender);
        if (address(studentNFT) == address(0)) revert StudentNFTNotConfigured();
        studentNFT.mint(msg.sender, pid, metadataURI);
    }

    // ── Governance entry points ──────────────────────────────────────────────

    // ── Governance entry points (Restricted to ScholarshipAdmin) ──────────────

    function setProtocolConfig(ScholarshipTypes.ProtocolConfig calldata c) external onlyRole(CONFIG_ADMIN_ROLE) {
        _setProtocolConfig(c);
    }

    function adminForceStatus(uint256 pid, ScholarshipTypes.ProgramStatus s) external onlyRole(CONFIG_ADMIN_ROLE) {
        _adminForceStatus(pid, s);
    }

    function adminUpdateDates(uint256 pid, uint256 aS, uint256 aE, uint256 vS, uint256 vE) external onlyRole(CONFIG_ADMIN_ROLE) {
        _adminUpdateDates(pid, aS, aE, vS, vE);
    }

    function extendApplicationDeadline(uint256 pid, uint256 nE) external onlyRole(CONFIG_ADMIN_ROLE) {
        _extendApplicationDeadline(pid, nE);
    }

    function extendVotingDeadline(uint256 pid, uint256 nE) external onlyRole(CONFIG_ADMIN_ROLE) {
        _extendVotingDeadline(pid, nE);
    }

    // ── Public Participation Entry Points ────────────────────────────────────

    function voteForCandidate(uint256 pid, address candidate, bool useReputation) external nonReentrant {
        _voteForCandidate(pid, candidate, useReputation);
    }

    function placeConfidenceStake(uint256 pid, address scholar, uint256 amount) external payable nonReentrant {
        _placeConfidenceStake(pid, scholar, amount);
    }
}
