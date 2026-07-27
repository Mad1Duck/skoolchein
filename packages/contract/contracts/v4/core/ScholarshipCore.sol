// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ScholarshipTypes}       from "../libraries/ScholarshipTypes.sol";
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

    // ── Events ────────────────────────────────────────────────────────────────
    event ProgramCreated(uint256 indexed pid, address indexed initiator, string metadataCID);
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
        address committeeContract
    ) external nonReentrant {
        { uint256 wSum = uint256(weights.academicWeight) + weights.incomeWeight + weights.essayWeight + weights.recommendWeight + weights.extracurricWeight; if (wSum != 100) revert InvalidScoreWeights(); }
        { uint256 sSum = uint256(slashDist.bountyHunterPercent) + slashDist.treasuryPercent + slashDist.protocolPercent; if (sSum != 100) revert InvalidSlashDistribution(); }
        if (maxCandidates < _config.minCandidates || maxCandidates > _config.maxCandidates) revert InvalidCandidateRange();
        if (targetWinners == 0 || targetWinners > maxCandidates) revert TargetWinnersExceedsMax();
        if (timeline[0] >= timeline[1] || timeline[2] >= timeline[3] || timeline[1] >= timeline[2]) revert InvalidTimeline();
        if (totalFund == 0) revert InsufficientFund();
        if (maxOptionalMilestones > _config.maxOptionalMilestones) revert InvalidMaxOptional();

        usdc.safeTransferFrom(msg.sender, address(treasury), totalFund);
        uint256 pid = ++_nextProgramId;
        treasury.depositProgramFund(pid, totalFund);

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
        emit ProgramCreated(pid, msg.sender, metadataCID);
    }

    function resolveDisputeBH(uint256 disputeId) external onlyRole(COMMITTEE_ROLE) {
        (bool success, ) = bountyHunter.call(abi.encodeWithSignature("resolveDispute(uint256,bool)", disputeId, true));
        require(success, "Dispute resolution failed");
    }

    function resolveDisputeScholar(uint256 disputeId) external onlyRole(COMMITTEE_ROLE) {
        (bool success, ) = bountyHunter.call(abi.encodeWithSignature("resolveDispute(uint256,bool)", disputeId, false));
        require(success, "Dispute resolution failed");
    }

    // ── View Helpers (IScholarshipCore compatible) ───────────────────────────

    function getProgram(uint256 id) external view returns (ScholarshipTypes.Program memory) { return programs[id]; }
    function getShortlist(uint256 id) external view returns (address[] memory) { return _shortlist[id]; }
    function getProgramApplicants(uint256 id) external view returns (address[] memory) { return _programApplicants[id]; }

    function getScholar(address wallet, uint256 pid) external view returns (ScholarshipTypes.Scholar memory) {
        return scholars[wallet][pid];
    }

    function isStudentEligible(address wallet) external view returns (bool eligible, string memory reason) {
        ScholarshipTypes.StudentStatus s = globalStudentStatus[wallet];
        if (s == ScholarshipTypes.StudentStatus.BLACKLISTED) return (false, "BLACKLISTED");
        if (s == ScholarshipTypes.StudentStatus.FROZEN && block.timestamp < globalFreezeUntil[wallet]) return (false, "FROZEN");
        return (true, "");
    }

    function getRemainingFund(address wallet, uint256 pid) external view returns (uint256) {
        ScholarshipTypes.Scholar memory s = scholars[wallet][pid];
        ScholarshipTypes.Program memory p = programs[pid];
        return (p.totalFund / p.targetWinners) - s.totalReceived;
    }

    // ── Status transitions ───────────────────────────────────────────────────

    function openApplications(uint256 pid) external programExists(pid) onlyInitiator(pid) {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.CREATED);
        if (block.timestamp < programs[pid].applicationStart) revert TooEarly();
        programs[pid].status = ScholarshipTypes.ProgramStatus.APPLICATION_OPEN;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN);
    }

    function openScreening(uint256 pid) external programExists(pid) onlyInitiator(pid) {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN);
        if (block.timestamp < programs[pid].applicationEnd) revert TooEarly();
        programs[pid].status = ScholarshipTypes.ProgramStatus.SCREENING;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.SCREENING);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1 — DONATIONS
    // ═══════════════════════════════════════════════════════════════════

    function donate(uint256 pid, uint256 grossAmount, string calldata nftMetadataURI)
        external nonReentrant programExists(pid) inStatus(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN)
    {
        if (!programs[pid].openDonation) revert PublicParticipationDisabled();
        if (grossAmount < _config.minDonation) revert InsufficientDonation();
        ScholarshipTypes.VoterInfo storage voter = voterInfo[pid][msg.sender];
        if (voter.donatedAmount > 0) revert AlreadyDonated();
        usdc.safeTransferFrom(msg.sender, address(treasury), grossAmount);
        uint256 fee = _config.transactionFee;
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
        uint256 academicScore, uint256 incomeScore, uint256 recommendScore
    ) external nonReentrant programExists(pid) inStatus(pid, ScholarshipTypes.ProgramStatus.APPLICATION_OPEN) {
        _requireStudentEligible(msg.sender);
        ScholarshipTypes.Program storage prog = programs[pid];
        if (msg.sender == prog.initiator) revert CannotApplyToOwnProgram();
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
            _setScore(pid, msg.sender, academicScore, incomeScore, recommendScore, msg.sender);
        emit StudentApplied(pid, msg.sender, retry);
    }

    function submitCommitteeScore(uint256 pid, address applicant, uint256 a, uint256 i, uint256 r, address comm)
        external onlyRole(COMMITTEE_ROLE) programExists(pid)
    {
        if (programs[pid].screeningMode != ScholarshipTypes.ScreeningMode.BY_COMMITTEE)
            revert InvalidProgramStatus(ScholarshipTypes.ProgramStatus.SCREENING, programs[pid].status);
        _setScore(pid, applicant, a, i, r, comm);
    }

    function resolveShortlistBatch(uint256 pid, address[] calldata rankedSegment, bool isLastBatch) external programExists(pid) onlyInitiator(pid) {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.SCREENING);
        ScholarshipTypes.Program storage prog = programs[pid];
        
        // Private programs skip the delay before resolution
        if (prog.openDonation && block.timestamp < uint256(prog.votingStart)) revert TooEarly();

        uint32 currentCount = resolveProgress[pid];
        uint256 n = rankedSegment.length;
        uint256 maxC = uint256(prog.maxCandidates);

        for (uint256 i; i < n; ) {
            address st = rankedSegment[i];
            uint256 globalIdx = currentCount + i;
            
            // 1. Sort validation (if not the first applicant ever resolved)
            if (globalIdx > 0) {
                // This logic requires the caller to send segments that overlap by 1 element if they want full sort validation
                // or we store the lastScore. Let's store the lastScore for gas efficiency.
            }

            ScholarshipTypes.Applicant storage app = applicants[pid][st];
            
            // 2. Shortlist Logic
            if (globalIdx < maxC && app.screeningScore >= ScholarshipTypes.SCREENING_THRESHOLD) {
                app.status = ScholarshipTypes.ApplicationStatus.SHORTLISTED;
                _shortlist[pid].push(st);
                prog.shortlistedCount++;
                emit StudentShortlisted(pid, st, app.screeningScore);
            } else {
                _markScreenedOut(pid, st);
            }
            unchecked { ++i; }
        }

        resolveProgress[pid] = currentCount + uint32(n);

        if (isLastBatch) {
            if (resolveProgress[pid] < _programApplicants[pid].length) revert ApplicantListIncomplete();
            prog.status = ScholarshipTypes.ProgramStatus.VOTING;
            emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.VOTING);
        }
    }

    function _markScreenedOut(uint256 pid, address student) internal {
        ScholarshipTypes.Applicant storage app = applicants[pid][student];
        bool locked = app.retryCount >= _config.maxRetry;
        app.status = locked ? ScholarshipTypes.ApplicationStatus.LOCKED : ScholarshipTypes.ApplicationStatus.SCREENED_OUT;
        emit StudentScreenedOut(pid, student, app.screeningScore, locked);
    }

    function toggleOpenDonation(uint256 pid, bool open) external programExists(pid) onlyInitiator(pid) {
        programs[pid].openDonation = open;
        emit OpenDonationToggled(pid, open);
    }

    function selectWinners(
        uint256 pid,
        address[] calldata ranked,
        uint256[][] calldata amounts,
        string[][] calldata descs,
        bytes32[][] calldata providers,
        bytes32[][] calldata externalIds
    ) external nonReentrant programExists(pid) {
        _selectWinners(pid, ranked, amounts, descs, providers, externalIds);
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

    function placeConfidenceStake(uint256 pid, address scholar, uint256 amount) external nonReentrant {
        _placeConfidenceStake(pid, scholar, amount);
    }
}
