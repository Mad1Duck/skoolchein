// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ScholarshipTypes}       from "../libraries/ScholarshipTypes.sol";
import {TokenTransfer}          from "../libraries/TokenTransfer.sol";
import {IScholarshipTreasury}   from "../interfaces/IScholarship.sol";
import {IScholarshipReputation} from "../interfaces/IScholarship.sol";
import {ICredentialNFT}         from "../interfaces/IScholarship.sol";
import {IMilestoneManager}      from "../interfaces/IScholarship.sol";

/**
 * @title  ScholarshipCoreBase v5
 * @notice Abstract base with storage, roles, and internal logic.
 */
abstract contract ScholarshipCoreBase is Initializable {
    using SafeERC20 for IERC20;
    using TokenTransfer for address;

    // ── Inline ReentrancyGuard ───────────────────────────────────────────────
    uint256 private _reentrancyStatus;
    error Reentrancy();
    modifier nonReentrant() {
        if (_reentrancyStatus == 2) revert Reentrancy();
        _reentrancyStatus = 2; _; _reentrancyStatus = 1;
    }
    function _initReentrancy() internal { _reentrancyStatus = 1; }

    // ── Inline UUPS ──────────────────────────────────────────────────────────
    bytes32 private constant _IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    event Upgraded(address indexed implementation);
    function upgradeTo(address newImpl) external {
        _authorizeUpgrade(newImpl);
        assembly { sstore(_IMPL_SLOT, newImpl) }
        emit Upgraded(newImpl);
    }
    function _authorizeUpgrade(address) internal view virtual;

    // ── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant UPGRADER_ROLE   = keccak256("UPGRADER_ROLE");
    bytes32 public constant BOUNTY_ROLE     = keccak256("BOUNTY_ROLE");
    bytes32 public constant COMMITTEE_ROLE  = keccak256("COMMITTEE_ROLE");
    bytes32 public constant MILESTONE_ROLE  = keccak256("MILESTONE_ROLE"); 
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE"); 
    bytes32 public constant CONFIG_ADMIN_ROLE = keccak256("CONFIG_ADMIN_ROLE"); 
    string  public constant VERSION         = "5.0.0";

    address public admin;
    mapping(bytes32 => mapping(address => bool)) internal _roles;

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);

    error NotAdmin();
    error MissingRole(bytes32 role, address account);

    function grantRole(bytes32 role, address account) external { if (msg.sender != admin) revert NotAdmin(); _roles[role][account] = true; emit RoleGranted(role, account); }
    function revokeRole(bytes32 role, address account) external { if (msg.sender != admin) revert NotAdmin(); _roles[role][account] = false; emit RoleRevoked(role, account); }
    function hasRole(bytes32 role, address account) public view returns (bool) { return _roles[role][account]; }
    function hasBountyRole(address account) external view returns (bool) { return _roles[BOUNTY_ROLE][account]; }

    function _requireRole(bytes32 role) internal view { if (!_roles[role][msg.sender]) revert MissingRole(role, msg.sender); }
    modifier onlyRole(bytes32 role) { _requireRole(role); _; }

    ScholarshipTypes.ProtocolConfig internal _config;
    event ProtocolConfigUpdated(address indexed updatedBy);
    error InvalidConfig();

    function _initConfig() internal {
        _config.minDonation            = ScholarshipTypes.DEFAULT_MIN_DONATION;
        _config.transactionFee         = ScholarshipTypes.DEFAULT_TRANSACTION_FEE;
        _config.minCandidates          = ScholarshipTypes.DEFAULT_MIN_CANDIDATES;
        _config.maxCandidates          = ScholarshipTypes.DEFAULT_MAX_CANDIDATES;
        _config.maxRetry               = ScholarshipTypes.DEFAULT_MAX_RETRY;
        _config.defenseWindow          = ScholarshipTypes.DEFAULT_DEFENSE_WINDOW;
        _config.bhCooldownNormal       = ScholarshipTypes.DEFAULT_BH_COOLDOWN_NORMAL;
        _config.bhCooldownFlagged      = ScholarshipTypes.DEFAULT_BH_COOLDOWN_FLAGGED;
        _config.bhStakePercent         = ScholarshipTypes.DEFAULT_BH_STAKE_PERCENT;
        _config.freezeLight            = ScholarshipTypes.DEFAULT_FREEZE_LIGHT;
        _config.freezeMilestone        = ScholarshipTypes.DEFAULT_FREEZE_MILESTONE;
        _config.freezeHeavy            = ScholarshipTypes.DEFAULT_FREEZE_HEAVY;
        _config.scoreMax               = ScholarshipTypes.DEFAULT_SCORE_MAX;
        _config.screeningThreshold     = ScholarshipTypes.DEFAULT_SCREENING_THRESHOLD;
        _config.quorumPercent          = ScholarshipTypes.DEFAULT_QUORUM_PERCENT;
        _config.confidenceSlashPct     = ScholarshipTypes.DEFAULT_CONFIDENCE_SLASH_PCT;
        _config.confidenceBonusPct     = ScholarshipTypes.DEFAULT_CONFIDENCE_BONUS_PCT;
        _config.maxCommitteeMembers    = ScholarshipTypes.DEFAULT_MAX_COMMITTEE_MEMBERS;
        _config.maxPushRefundDonors    = ScholarshipTypes.DEFAULT_MAX_PUSH_REFUND_DONORS;
        _config.maxMandatoryMilestones = ScholarshipTypes.DEFAULT_MAX_MANDATORY_MILESTONES;
        _config.maxOptionalMilestones  = ScholarshipTypes.DEFAULT_MAX_OPTIONAL_MILESTONES;
        _config.optionalApprovalWindow = ScholarshipTypes.DEFAULT_OPTIONAL_APPROVAL_WINDOW;
    }

    function getProtocolConfig() external view returns (ScholarshipTypes.ProtocolConfig memory) {
        return _config;
    }

    // ── External contracts ───────────────────────────────────────────────────
    IERC20                 public usdc;
    IScholarshipTreasury   public treasury;
    IScholarshipReputation public reputation;
    ICredentialNFT         public donorNFT;
    ICredentialNFT         public studentNFT;
    ICredentialNFT         public fraudNFT;
    IMilestoneManager      public milestoneManager;
    address                public bountyHunter; // Using address to match existing wiring or use IScholarshipBounty

    // ── Storage ──────────────────────────────────────────────────────────────
    uint256 internal _nextProgramId;
    mapping(uint256 => ScholarshipTypes.Program)                              internal programs;
    mapping(uint256 => mapping(address => ScholarshipTypes.Applicant))        internal applicants;
    mapping(uint256 => address[])                                             internal _programApplicants;
    mapping(uint256 => address[])                                             internal _shortlist;
    mapping(address => mapping(uint256 => ScholarshipTypes.Scholar))          internal scholars;
    mapping(address => ScholarshipTypes.StudentStatus)                        public globalStudentStatus;
    mapping(address => uint256)                                               public globalFreezeUntil;
    mapping(uint256 => mapping(address => ScholarshipTypes.ScoreComponents))  internal scoreComponents;
    mapping(uint256 => mapping(address => ScholarshipTypes.VoterInfo))        internal voterInfo;
    mapping(uint256 => mapping(address => uint8))                             public retryCount;
    mapping(uint256 => address)                                               public programCommittee;
    mapping(uint256 => uint256)                                               public programCompletedScholars;
    mapping(uint256 => uint32)                                                public resolveProgress;

    mapping(uint256 => uint8) public applicationExtensionCount;
    mapping(uint256 => uint8) public votingExtensionCount;

    // ── Payment tokens ───────────────────────────────────────────────────────
    // APPENDED DELIBERATELY. These must stay at the very end of the storage
    // layout: this is a UUPS proxy, so inserting a slot earlier would shift
    // everything after it and corrupt live program data. For the same reason
    // the token is tracked in its own mapping rather than as a new field on
    // ScholarshipTypes.Program (that struct lives in a mapping, so growing it
    // changes each entry's slot span).
    mapping(uint256 => address)                      public programToken;
    mapping(address => ScholarshipTypes.TokenConfig) public tokenConfig;

    /**
     * @notice Highest pid created before multi-token support existed.
     *
     * @dev    Disambiguates "token not set" from "token is native". Programs
     *         at or below this boundary predate `programToken` and are always
     *         USDC; without it their unset (zero) entry would be read as the
     *         native sentinel and their payouts would try to send ETH.
     *         Set once via setLegacyTokenBoundary() during the upgrade.
     */
    uint256 public legacyTokenBoundary;

    event TokenConfigUpdated(address indexed token, bool enabled, uint256 minDonation, uint256 transactionFee);
    event LegacyTokenBoundarySet(uint256 boundary);

    /**
     * @notice Whitelist (or de-list) a payment token and set its economics.
     * @dev    This is the only way `tokenConfig[token].enabled` can become
     *         true — without calling this at least once for a token,
     *         `createProgram` will always revert with `TokenNotSupported`.
     */
    function setTokenConfig(
        address token,
        bool enabled,
        uint256 minDonation,
        uint256 transactionFee
    ) external onlyRole(GOVERNANCE_ROLE) {
        tokenConfig[token] = ScholarshipTypes.TokenConfig({
            enabled: enabled,
            minDonation: minDonation,
            transactionFee: transactionFee
        });
        emit TokenConfigUpdated(token, enabled, minDonation, transactionFee);
    }

    /// @notice One-time (or as-needed) boundary set for legacy USDC-only programs.
    function setLegacyTokenBoundary(uint256 boundary) external onlyRole(GOVERNANCE_ROLE) {
        legacyTokenBoundary = boundary;
        emit LegacyTokenBoundarySet(boundary);
    }

    uint8   public constant MAX_EXTENSIONS        = 2;
    uint256 public constant MAX_EXTENSION_DURATION = 30 days;

    // ── Events ───────────────────────────────────────────────────────────────
    event VoteCast(uint256 indexed pid, address indexed voter, address indexed candidate, uint256 weight, bool useReputation);
    event ConfidenceStaked(uint256 indexed pid, address indexed voter, address indexed scholar, uint256 amount);
    event ScholarSelected(uint256 indexed pid, address indexed scholar);
    event ScholarSlashed(address indexed scholar, uint256 indexed pid, ScholarshipTypes.DisputeType dtype);
    event ScholarCompleted(uint256 indexed pid, address indexed scholar);
    event ProgramCompleted(uint256 indexed pid);
    event ProgramStatusChanged(uint256 indexed pid, ScholarshipTypes.ProgramStatus newStatus);
    event ScoreSubmitted(uint256 indexed pid, address indexed student, uint256 totalScore, address scoredBy);
    event ApplicationDeadlineExtended(uint256 indexed pid, uint256 oldEnd, uint256 newEnd, uint8 extensionCount);
    event VotingDeadlineExtended(uint256 indexed pid, uint256 oldEnd, uint256 newEnd, uint8 extensionCount);
    event AdminBypassStatusForced(uint256 indexed pid, ScholarshipTypes.ProgramStatus newStatus, address admin);
    event AdminBypassDatesUpdated(uint256 indexed pid, uint256 appStart, uint256 appEnd, uint256 voteStart, uint256 voteEnd, address admin);

    // ── Errors ───────────────────────────────────────────────────────────────
    error ProgramNotFound();
    error InvalidProgramStatus(ScholarshipTypes.ProgramStatus expected, ScholarshipTypes.ProgramStatus actual);
    error StudentFrozen(uint256 freezeUntil);
    error StudentBlacklisted();
    error VotingPowerLocked();
    error InsufficientVotingPower();
    error CandidateNotShortlisted();
    error ConfidenceStakeAlreadyExists();
    error MustVoteBeforeStaking();
    error ConfidenceStakeMismatch();
    error ConfidenceStakeExceedsDonation();
    error VotingNotEnded();
    error QuorumNotMet();
    error InvalidSortOrder();
    error OnlyInitiator();
    error ScholarNotActive();
    error InvalidTimeline();
    error AdminCannotForceTerminalStatus();
    error CannotShortenDeadline();
    error NewEndMustBeBeforeVotingStart();
    error NewVotingEndMustBeAfterVotingStart();
    error MaxExtensionsReached();
    error ExtensionTooLong();
    error TooEarly();
    error PublicParticipationDisabled();
    error StudentNotCompleted(uint256 pid, address scholar);
    error StudentNFTNotConfigured();

    // ── Shared Helpers ───────────────────────────────────────────────────────
    function _requireProgramExists(uint256 pid) internal view { if (pid == 0 || pid > _nextProgramId) revert ProgramNotFound(); }
    modifier programExists(uint256 pid) { _requireProgramExists(pid); _; }

    function _requireStatus(uint256 pid, ScholarshipTypes.ProgramStatus expected) internal view {
        if (programs[pid].status != expected) revert InvalidProgramStatus(expected, programs[pid].status);
    }
    modifier inStatus(uint256 pid, ScholarshipTypes.ProgramStatus expected) { _requireStatus(pid, expected); _; }

    function _requireInitiator(uint256 pid) internal view { if (msg.sender != programs[pid].initiator) revert OnlyInitiator(); }
    modifier onlyInitiator(uint256 pid) { _requireInitiator(pid); _; }

    function _requireStudentEligible(address wallet) internal view {
        ScholarshipTypes.StudentStatus s = globalStudentStatus[wallet];
        if (s == ScholarshipTypes.StudentStatus.BLACKLISTED) revert StudentBlacklisted();
        if (s == ScholarshipTypes.StudentStatus.FROZEN && block.timestamp < globalFreezeUntil[wallet]) revert StudentFrozen(globalFreezeUntil[wallet]);
    }

    function _sumArray(uint256[] memory arr) internal pure returns (uint256 s) {
        for (uint256 i; i < arr.length; ) { s += arr[i]; unchecked { ++i; } }
    }

    function _setScore(uint256 pid, address applicant, uint256 a, uint256 i, uint256 r, address scoredBy) internal {
        ScholarshipTypes.ScoreWeights memory w = programs[pid].scoreWeights;
        a = a > 100 ? 100 : a; i = i > 100 ? 100 : i; r = r > 100 ? 100 : r;
        uint256 sw = uint256(w.academicWeight) + w.incomeWeight + w.recommendWeight;
        uint256 norm = sw > 0 ? ((a * w.academicWeight + i * w.incomeWeight + r * w.recommendWeight) * ScholarshipTypes.SCORE_MAX) / (sw * 100) : 0;
        scoreComponents[pid][applicant] = ScholarshipTypes.ScoreComponents({ academicScore: a, incomeScore: i, recommendScore: r, isSubmitted: true, scoredBy: scoredBy });
        applicants[pid][applicant].screeningScore = uint32(norm);
        applicants[pid][applicant].totalScore = uint32(norm);
        applicants[pid][applicant].scoreTimestamp = uint48(block.timestamp);
        emit ScoreSubmitted(pid, applicant, norm, scoredBy);
    }

    // ── Internal Governance Setters ──────────────────────────────────────────
    function _setProtocolConfig(ScholarshipTypes.ProtocolConfig calldata c) internal {
        if (c.minDonation == 0 || c.minCandidates == 0 || c.minCandidates > c.maxCandidates) revert InvalidConfig();
        if (c.quorumPercent > 100 || c.bhStakePercent > 100) revert InvalidConfig();
        if (uint256(c.confidenceSlashPct) + c.confidenceBonusPct > 100) revert InvalidConfig();
        _config = c;
        emit ProtocolConfigUpdated(msg.sender);
    }

    function _adminForceStatus(uint256 pid, ScholarshipTypes.ProgramStatus s) internal {
        if (s == ScholarshipTypes.ProgramStatus.CANCELLED || s == ScholarshipTypes.ProgramStatus.COMPLETED) revert AdminCannotForceTerminalStatus();
        programs[pid].status = s;
        emit AdminBypassStatusForced(pid, s, msg.sender);
        emit ProgramStatusChanged(pid, s);
    }

    function _adminUpdateDates(uint256 pid, uint256 aS, uint256 aE, uint256 vS, uint256 vE) internal {
        if (aS >= aE || aE >= vS || vS >= vE) revert InvalidTimeline();
        ScholarshipTypes.Program storage prog = programs[pid];
        prog.applicationStart = uint48(aS); prog.applicationEnd = uint48(aE); prog.votingStart = uint48(vS); prog.votingEnd = uint48(vE);
        applicationExtensionCount[pid] = 0; votingExtensionCount[pid] = 0;
        emit AdminBypassDatesUpdated(pid, aS, aE, vS, vE, msg.sender);
    }

    function _extendApplicationDeadline(uint256 pid, uint256 nE) internal {
        if (applicationExtensionCount[pid] >= MAX_EXTENSIONS) revert MaxExtensionsReached();
        ScholarshipTypes.Program storage prog = programs[pid];
        uint256 oE = prog.applicationEnd;
        if (nE <= oE) revert CannotShortenDeadline();
        if (nE >= prog.votingStart) revert NewEndMustBeBeforeVotingStart();
        if (nE - oE > MAX_EXTENSION_DURATION) revert ExtensionTooLong();
        prog.applicationEnd = uint48(nE);
        uint8 count = ++applicationExtensionCount[pid];
        emit ApplicationDeadlineExtended(pid, oE, nE, count);
    }

    function _extendVotingDeadline(uint256 pid, uint256 nE) internal {
        if (votingExtensionCount[pid] >= MAX_EXTENSIONS) revert MaxExtensionsReached();
        ScholarshipTypes.Program storage prog = programs[pid];
        uint256 oE = prog.votingEnd;
        if (nE <= oE) revert CannotShortenDeadline();
        if (nE <= prog.votingStart) revert NewVotingEndMustBeAfterVotingStart();
        if (nE - oE > MAX_EXTENSION_DURATION) revert ExtensionTooLong();
        prog.votingEnd = uint48(nE);
        uint8 count = ++votingExtensionCount[pid];
        emit VotingDeadlineExtended(pid, oE, nE, count);
    }

    // ── Internal Core Logic Restoration ──────────────────────────────────────

    function _voteForCandidate(uint256 pid, address candidate, bool useReputation) internal {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.VOTING);
        ScholarshipTypes.Program storage p = programs[pid];
        if (!p.openDonation) revert PublicParticipationDisabled();
        if (block.timestamp < uint256(p.votingStart) || block.timestamp > uint256(p.votingEnd)) revert TooEarly();
        if (applicants[pid][candidate].status != ScholarshipTypes.ApplicationStatus.SHORTLISTED) revert CandidateNotShortlisted();
        
        uint256 power;
        if (useReputation) {
            if (reputation.isVotingPowerLocked(msg.sender)) revert VotingPowerLocked();
            power = reputation.balanceOf(msg.sender);
        } else {
            power = voterInfo[pid][msg.sender].remainingVotingPower;
            voterInfo[pid][msg.sender].remainingVotingPower = 0; // Spend donation power
        }

        if (power == 0) revert InsufficientVotingPower();

        voterInfo[pid][msg.sender].votedFor = candidate;
        applicants[pid][candidate].voteScore += uint128(power);
        programs[pid].totalVotes += uint128(power);

        emit VoteCast(pid, msg.sender, candidate, power, useReputation);
    }

    function _placeConfidenceStake(uint256 pid, address scholar, uint256 amount) internal {
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.VOTING);
        ScholarshipTypes.VoterInfo storage v = voterInfo[pid][msg.sender];
        if (v.votedFor != scholar) revert MustVoteBeforeStaking();
        if (v.confidenceStake > 0) revert ConfidenceStakeAlreadyExists();

        if (!programs[pid].openDonation) revert PublicParticipationDisabled();
        uint256 netDonation = programs[pid].totalFund;
        if (amount > netDonation) revert ConfidenceStakeExceedsDonation();

        v.confidenceStake = amount;
        v.confidenceStakeFor = scholar;

        // Collect the stake. This transfer was missing entirely: the stake was
        // recorded in the Treasury and later paid back out (principal + bonus
        // on success, or half returned on slash) without ever being paid in,
        // draining funds contributed by others.
        _programToken(pid).pullIn(msg.sender, address(treasury), amount);

        treasury.depositConfidenceStake(pid, msg.sender, scholar, amount);
        emit ConfidenceStaked(pid, msg.sender, scholar, amount);
    }

    // ── Payment-token helpers ────────────────────────────────────────────────

    /**
     * @notice Payment token for a program.
     * @dev    Programs created before the multi-token upgrade have no entry in
     *         `programToken`, which would read as address(0) — the native
     *         sentinel — and wrongly route their USDC payouts through the
     *         native path. Legacy programs (pid <= legacyTokenBoundary) are
     *         therefore pinned to the original USDC token.
     */
    function _programToken(uint256 pid) internal view returns (address) {
        address t = programToken[pid];
        if (t == address(0) && pid <= legacyTokenBoundary) return address(usdc);
        return t;
    }

    /// @notice Per-token economics, falling back to the global config for USDC.
    function _tokenEconomics(address token)
        internal
        view
        returns (uint256 minDonation, uint256 transactionFee)
    {
        ScholarshipTypes.TokenConfig storage tc = tokenConfig[token];
        if (tc.enabled) return (tc.minDonation, tc.transactionFee);
        // Unconfigured USDC keeps the pre-upgrade global values.
        return (_config.minDonation, _config.transactionFee);
    }

    function _onMilestoneCompleted(uint256 pid, address scholarAddr, uint256 /* mid */, uint256 amount, ScholarshipTypes.MilestoneKind kind) internal {
        ScholarshipTypes.Scholar storage s = scholars[scholarAddr][pid];
        if (s.status != ScholarshipTypes.StudentStatus.ACTIVE) revert ScholarNotActive();

        if (kind == ScholarshipTypes.MilestoneKind.MANDATORY) {
            s.mandatoryCompleted++;
        } else {
            s.optionalCompleted++;
        }

        s.totalReceived += amount;
        programs[pid].spentFund += amount;

        if (s.mandatoryCompleted == s.mandatoryTotal) {
            s.status = ScholarshipTypes.StudentStatus.COMPLETED;
            programCompletedScholars[pid]++;
            reputation.mint(scholarAddr, 100, "Scholarship Completion");
            emit ScholarCompleted(pid, scholarAddr);
            _checkProgramCompletion(pid);
        }
    }

    function _onOptionalApproved(uint256 pid, address s, uint256 amt) internal {
        scholars[s][pid].optionalApproved++;
        programs[pid].allocatedFund += amt;
    }

    function _checkProgramCompletion(uint256 pid) internal {
        ScholarshipTypes.Program storage p = programs[pid];
        if (programCompletedScholars[pid] >= p.targetWinners) {
            p.status = ScholarshipTypes.ProgramStatus.COMPLETED;
            emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.COMPLETED);
            emit ProgramCompleted(pid);
        }
    }

    function _slashScholar(address wallet, uint256 pid, ScholarshipTypes.DisputeType dtype) internal {
        scholars[wallet][pid].status = ScholarshipTypes.StudentStatus.FROZEN;
        if (dtype == ScholarshipTypes.DisputeType.HEAVY_FRAUD) {
            globalStudentStatus[wallet] = ScholarshipTypes.StudentStatus.BLACKLISTED;
            // Mint the "Scarlet Letter" NFT
            if (address(fraudNFT) != address(0)) {
                fraudNFT.mint(wallet, pid, "ipfs://QmFraudAlertMetadata");
            }
        } else {
            globalStudentStatus[wallet] = ScholarshipTypes.StudentStatus.FROZEN;
            globalFreezeUntil[wallet] = block.timestamp + _config.freezeHeavy;
        }
        emit ScholarSlashed(wallet, pid, dtype);
    }

    function _selectWinners(
        uint256 pid,
        address[] calldata ranked,
        uint256[][] calldata amounts,
        string[][] calldata descs,
        bytes32[][] calldata providers,
        bytes32[][] calldata externalIds
    ) internal {
        _requireInitiator(pid);
        _requireStatus(pid, ScholarshipTypes.ProgramStatus.VOTING);
        
        // Private programs funded by initiator skip the public voting quorum/time check
        if (programs[pid].openDonation) {
            if (block.timestamp < uint256(programs[pid].votingEnd)) revert VotingNotEnded();
            if (programs[pid].totalVotes == 0) revert QuorumNotMet();
        }

        programs[pid].status = ScholarshipTypes.ProgramStatus.ACTIVE;
        emit ProgramStatusChanged(pid, ScholarshipTypes.ProgramStatus.ACTIVE);

        for (uint256 i; i < ranked.length; i++) {
            address s = ranked[i];
            if (applicants[pid][s].status != ScholarshipTypes.ApplicationStatus.SHORTLISTED) revert CandidateNotShortlisted();
            
            scholars[s][pid] = ScholarshipTypes.Scholar({
                pid: pid,
                wallet: s,
                status: ScholarshipTypes.StudentStatus.ACTIVE,
                isBlacklisted: false,
                mandatoryTotal: uint32(amounts[i].length),
                mandatoryCompleted: 0,
                optionalApproved: 0,
                optionalCompleted: 0,
                freezeUntil: 0,
                totalReceived: 0
            });

            milestoneManager.createMandatoryBatch(pid, s, amounts[i], descs[i], providers[i], externalIds[i]);
            emit ScholarSelected(pid, s);
        }
    }

    function _resolveDisputeBH(uint256) internal {}
    function _resolveDisputeScholar(uint256) internal {}
}
