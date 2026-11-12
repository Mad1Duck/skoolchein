// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ScholarshipTypes v5
 * @notice Single source of truth for every shared type.
 *
 * @dev    CHANGES FROM v4 → v5
 *         ─────────────────────────────────────────────────────────────
 *         1. MilestoneKind enum  — MANDATORY | OPTIONAL | NEGOTIATED
 *         2. MilestoneStatus     — adds PROPOSED, APPROVED, REJECTED
 *         3. Milestone struct    — adds `kind`, `proposedBy`, `approvedBy`
 *                                  removes `isFirstMilestone` (derivable off-chain)
 *         4. Scholar struct      — splits totalMilestones into
 *                                  mandatoryTotal / optionalApproved
 *         5. New constants       — MAX_OPTIONAL_MILESTONES, MAX_MANDATORY_MILESTONES
 *
 *         GAS / SIZE NOTES
 *         ─────────────────────────────────────────────────────────────
 *         • Milestone packs kind+proposedBy+approvedBy into one slot
 *           by making kind a uint8 and packing with two addresses (won't
 *           fit one slot — kept as separate fields but ordered for
 *           minimal slot waste).
 *         • `isFirstMilestone` removed → saves 1 storage word per milestone.
 *         • Scholar counter split into two uint128 fields → still one slot.
 */
library ScholarshipTypes {

    // ═══════════════════════════════════════════════════════════════════
    // ENUMS
    // ═══════════════════════════════════════════════════════════════════

    enum EducationLevel { SD, SMP, SMA, UNIVERSITY }

    enum ScreeningMode { BY_COMMITTEE, BY_STUDENT }

    enum ProgramStatus {
        CREATED,
        APPLICATION_OPEN,
        SCREENING,
        VOTING,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum ApplicationStatus {
        PENDING_REVIEW,
        SHORTLISTED,
        SCREENED_OUT,
        LOCKED
    }

    /**
     * @notice Three-tier milestone classification.
     *
     *  MANDATORY   — set by program creator at selectWinners(); scholar cannot
     *                remove or skip. Baseline quality gate.
     *
     *  OPTIONAL    — proposed by scholar after activation; requires committee
     *                approval before becoming valid. Exploration / differentiation.
     *
     *  NEGOTIATED  — created by scholar proposal + explicitly approved by
     *                committee; identical flow to OPTIONAL but semantically
     *                signals a co-designed deliverable (e.g. a custom research
     *                goal agreed between mentor and scholar).
     *
     * @dev  Stored as uint8 in Milestone — no extra slot cost.
     */
    enum MilestoneKind { MANDATORY, OPTIONAL, NEGOTIATED }

    /**
     * @notice Full milestone lifecycle including proposal flow.
     *
     *  PROPOSED    — scholar submitted proposal; awaiting committee review.
     *  APPROVED    — committee approved the proposal; milestone is now active.
     *  REJECTED    — committee rejected; no funds locked, scholar may re-propose.
     *  PENDING     — approved/mandatory milestone, not yet submitted by scholar.
     *  SUBMITTED   — scholar submitted proof; dispute window active.
     *  DISPUTED    — bounty hunter raised dispute; frozen.
     *  COMPLETED   — cleared; funds released.
     *  FROZEN      — hard freeze (active dispute).
     */
    enum MilestoneStatus {
        PROPOSED,
        APPROVED,
        REJECTED,
        PENDING,
        SUBMITTED,
        DISPUTED,
        COMPLETED,
        FROZEN
    }

    enum DisputeType    { LIGHT_FRAUD, MILESTONE_FRAUD, HEAVY_FRAUD }
    enum DisputeStatus  { ACTIVE, STUDENT_CONCEDED, AUTO_GUILTY, BH_WON, BH_LOST }
    enum StudentStatus  { ACTIVE, COMPLETED, FROZEN, BLACKLISTED }

    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS — PROGRAM
    // ═══════════════════════════════════════════════════════════════════

    struct ScoreWeights {
        uint8 academicWeight;
        uint8 incomeWeight;
        uint8 essayWeight;
        uint8 recommendWeight;
        uint8 extracurricWeight;
    }

    struct SlashDistribution {
        uint8 bountyHunterPercent;
        uint8 treasuryPercent;
        uint8 protocolPercent;
    }

    struct Program {
        uint256           pid;
        address           initiator;
        string            metadataCID;

        EducationLevel    educationLevel;
        ScreeningMode     screeningMode;
        ProgramStatus     status;
        ScoreWeights      scoreWeights;
        SlashDistribution slashDist;

        uint8             maxCandidates;
        uint8             targetWinners;
        uint8             maxOptionalMilestones;
        bool              openDonation;

        // Timeline (packed)
        uint48            applicationStart;
        uint48            applicationEnd;
        uint48            votingStart;
        uint48            votingEnd;
        uint48            milestoneDisputeWindow;

        // Counters (packed)
        uint32            applicantCount;
        uint32            shortlistedCount;
        uint32            activeScholarCount;
        uint128           totalVotes;

        // Financials
        uint256           totalFund;
        uint256           allocatedFund;
        uint256           spentFund;
        uint256           yieldAccrued;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS — APPLICANT / SCHOLAR
    // ═══════════════════════════════════════════════════════════════════

    struct Applicant {
        uint256           pid;
        address           wallet;
        ApplicationStatus status;
        string            profileCID;
        string            documentCID;
        string            essayCID;
        string            recommendCID;
        uint32            screeningScore; // normalized to 1000
        uint32            totalScore;     // normalized to 1000
        uint128           voteScore;
        uint48            scoreTimestamp;
        uint8             retryCount;
        bool              scoreDisputed;
    }

    struct ScoreComponents {
        uint256 academicScore;
        uint256 incomeScore;
        uint256 recommendScore;
        bool    isSubmitted;
        address scoredBy;
    }

    /**
     * @notice Active scholar record.
     *
     * @dev    mandatoryTotal + optionalApproved packed into one slot as uint128.
     *         currentMilestone tracks sequential mandatory progress only.
     *         Optional/Negotiated milestones are tracked independently via
     *         per-scholar counters in MilestoneManager.
     */
    struct Scholar {
        uint256       pid;
        address       wallet;
        StudentStatus status;
        bool          isBlacklisted;
        uint32        mandatoryTotal;
        uint32        mandatoryCompleted;
        uint32        optionalApproved;
        uint32        optionalCompleted;
        uint256       freezeUntil;
        uint256       totalReceived;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS — MILESTONE (v5)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice One disbursement stage for a scholar.
     *
     * @dev    Storage layout (32-byte slots):
     *         slot 0 : id          (uint256)
     *         slot 1 : pid         (uint256)
     *         slot 2 : scholar     (address 20) | kind (uint8) — 11 bytes free
     *         slot 3 : amount      (uint256)
     *         slot 4 : proposedBy  (address 20) — who created this milestone
     *         slot 5 : approvedBy  (address 20) — who approved (address(0) = not yet)
     *         slot 6 : descriptionCID (string — pointer)
     *         slot 7 : proofCID       (string — pointer)
     *         slot 8 : status (uint8) | submittedAt (uint48) | disputeDeadline (uint48)
     *                  | completedAt (uint48)          — packed, saves ~2 slots vs v4
     *
     *         Net saving vs v4 Milestone: removes isFirstMilestone word,
     *         packs 3 timestamps + status into one slot.
     */
    struct Milestone {
        uint256         id;
        uint256         pid;
        address         scholar;
        MilestoneKind   kind;           // MANDATORY | OPTIONAL | NEGOTIATED
        uint256         amount;
        address         proposedBy;     // creator (initiator) or scholar
        address         approvedBy;     // committee member who approved; address(0) if n/a
        string          descriptionCID; // IPFS: what must be delivered
        string          proofCID;       // IPFS: scholar-submitted proof
        bytes32         provider;       // External learning provider (e.g. 'hackquest')
        bytes32         externalId;     // External course/mission ID
        MilestoneStatus status;
        uint48          submittedAt;
        uint48          disputeDeadline;
        uint48          completedAt;
    }

    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS — VOTING / BOUNTY (unchanged from v4)
    // ═══════════════════════════════════════════════════════════════════

    struct VoterInfo {
        uint256 donatedAmount;
        uint256 remainingVotingPower;
        address votedFor;
        uint256 confidenceStake;
        address confidenceStakeFor;
        bool    hasClaimedYield;
    }

    struct ConfidenceStake {
        address voter;
        address scholar;
        uint256 pid;
        uint256 amount;
        bool    isResolved;
        bool    slashed;
    }

    struct Dispute {
        uint256       id;
        uint256       pid;
        address       scholar;
        uint256       milestoneId;
        address       bountyHunter;
        DisputeType   disputeType;
        DisputeStatus status;
        string  evidenceCID;
        string  counterEvidenceCID;
        uint256 stake;
        uint256 potentialReward;
        uint256 raisedAt;
        uint256 defenseDeadline;
        uint256 resolvedAt;
        address resolvedBy;
    }

    struct BountyHunterRecord {
        uint256 activeDisputeId;
        uint256 cooldownUntil;
        uint256 totalWins;
        uint256 totalLosses;
        uint256 consecutiveLosses;
        bool    isFlagged;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PAYMENT TOKENS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Sentinel address representing the chain's native currency
     *         (ETH, or whatever the deployment chain uses) as a payment token.
     *         A program whose token == NATIVE_TOKEN is funded with msg.value
     *         instead of ERC20 transfers.
     */
    address constant NATIVE_TOKEN = address(0);

    /**
     * @notice Per-token economics and whitelist entry.
     *
     * @dev    Two reasons this can't be a single global config:
     *
     *         1. DECIMALS. minDonation/transactionFee are absolute amounts.
     *            USDC uses 6 decimals, native currencies use 18 — a shared
     *            `50 * 1e6` minimum would be 50 USDC but only 0.00000000005
     *            ETH, i.e. effectively no minimum at all.
     *
     *         2. SAFETY. `enabled` doubles as a whitelist. Without it any
     *            caller could create a program backed by an arbitrary ERC20,
     *            including a malicious one that reenters on transfer or
     *            misreports balances.
     */
    struct TokenConfig {
        bool    enabled;         // Admin must explicitly allow the token
        uint256 minDonation;     // In this token's own decimals
        uint256 transactionFee;  // In this token's own decimals
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROTOCOL CONSTANTS (compile-time defaults — overridable via ProtocolConfig)
    // ═══════════════════════════════════════════════════════════════════

    // NOTE: these two are USDC-denominated (6 decimals) and remain the
    // defaults for the protocol's original USDC path. Per-token overrides
    // live in TokenConfig — see the decimals note above.
    uint256 constant DEFAULT_MIN_DONATION             = 50  * 1e6;
    uint256 constant DEFAULT_TRANSACTION_FEE          = 10  * 1e6;

    // Native-currency equivalents (18 decimals). Deliberately conservative
    // defaults; admin should tune these per deployment/chain.
    uint256 constant DEFAULT_NATIVE_MIN_DONATION      = 0.01 ether;
    uint256 constant DEFAULT_NATIVE_TRANSACTION_FEE   = 0.001 ether;
    uint8   constant DEFAULT_MIN_CANDIDATES           = 5;
    uint8   constant DEFAULT_MAX_CANDIDATES           = 20;
    uint8   constant DEFAULT_MAX_RETRY                = 3;
    uint256 constant DEFAULT_DEFENSE_WINDOW           = 7 days;
    uint256 constant DEFAULT_BH_COOLDOWN_NORMAL       = 30 days;
    uint256 constant DEFAULT_BH_COOLDOWN_FLAGGED      = 90 days;
    uint8   constant DEFAULT_BH_STAKE_PERCENT         = 10;
    uint256 constant DEFAULT_FREEZE_LIGHT             = 180 days;
    uint256 constant DEFAULT_FREEZE_MILESTONE         = 365 days;
    uint256 constant DEFAULT_FREEZE_HEAVY             = 730 days;
    uint256 constant DEFAULT_SCORE_MAX                = 1000;
    uint256 constant DEFAULT_SCREENING_THRESHOLD      = 600;
    uint8   constant DEFAULT_QUORUM_PERCENT           = 0; // minimum turnout (% of fund) for votes to count toward the score; 0 = always
    uint8   constant DEFAULT_CONFIDENCE_SLASH_PCT     = 50;
    uint8   constant DEFAULT_CONFIDENCE_BONUS_PCT     = 20;
    uint8   constant DEFAULT_MAX_COMMITTEE_MEMBERS    = 15;
    uint8   constant DEFAULT_MAX_PUSH_REFUND_DONORS   = 50;
    uint8   constant DEFAULT_MAX_MANDATORY_MILESTONES = 10;
    uint8   constant DEFAULT_MAX_OPTIONAL_MILESTONES  = 5;
    uint256 constant DEFAULT_OPTIONAL_APPROVAL_WINDOW = 7 days;

    // Backward-compat aliases so existing code compiles without changes
    uint256 constant MIN_DONATION               = DEFAULT_MIN_DONATION;
    uint256 constant TRANSACTION_FEE            = DEFAULT_TRANSACTION_FEE;
    uint256 constant MIN_CANDIDATES             = DEFAULT_MIN_CANDIDATES;
    uint256 constant MAX_CANDIDATES             = DEFAULT_MAX_CANDIDATES;
    uint256 constant MAX_RETRY                  = DEFAULT_MAX_RETRY;
    uint256 constant DEFENSE_WINDOW             = DEFAULT_DEFENSE_WINDOW;
    uint256 constant BH_COOLDOWN_NORMAL         = DEFAULT_BH_COOLDOWN_NORMAL;
    uint256 constant BH_COOLDOWN_FLAGGED        = DEFAULT_BH_COOLDOWN_FLAGGED;
    uint256 constant BH_STAKE_PERCENT           = DEFAULT_BH_STAKE_PERCENT;
    uint256 constant FREEZE_LIGHT               = DEFAULT_FREEZE_LIGHT;
    uint256 constant FREEZE_MILESTONE           = DEFAULT_FREEZE_MILESTONE;
    uint256 constant FREEZE_HEAVY               = DEFAULT_FREEZE_HEAVY;
    uint256 constant SCORE_MAX                  = DEFAULT_SCORE_MAX;
    uint256 constant SCREENING_THRESHOLD        = DEFAULT_SCREENING_THRESHOLD;
    uint256 constant QUORUM_PERCENT             = DEFAULT_QUORUM_PERCENT;
    uint256 constant CONFIDENCE_SLASH_PCT       = DEFAULT_CONFIDENCE_SLASH_PCT;
    uint256 constant CONFIDENCE_BONUS_PCT       = DEFAULT_CONFIDENCE_BONUS_PCT;
    uint256 constant MAX_COMMITTEE_MEMBERS      = DEFAULT_MAX_COMMITTEE_MEMBERS;
    uint256 constant MAX_PUSH_REFUND_DONORS     = DEFAULT_MAX_PUSH_REFUND_DONORS;
    uint256 constant MAX_MANDATORY_MILESTONES   = DEFAULT_MAX_MANDATORY_MILESTONES;
    uint256 constant MAX_OPTIONAL_MILESTONES    = DEFAULT_MAX_OPTIONAL_MILESTONES;
    uint256 constant OPTIONAL_APPROVAL_WINDOW   = DEFAULT_OPTIONAL_APPROVAL_WINDOW;

    // ═══════════════════════════════════════════════════════════════════
    // PROTOCOL CONFIG STRUCT (stored on-chain, admin-updatable)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Runtime-configurable protocol parameters.
     *         Stored in ScholarshipCoreBase and readable by all contracts via IScholarshipCoreMin.
     *         Admin can call setProtocolConfig() to update any field.
     */
    struct ProtocolConfig {
        // Donations
        uint256 minDonation;            // Minimum donation (USDC, 6 decimals)
        uint256 transactionFee;         // Protocol fee per donation (USDC, 6 decimals)
        // Program creation
        uint8   minCandidates;          // Minimum maxCandidates value
        uint8   maxCandidates;          // Maximum maxCandidates value
        uint8   maxRetry;               // Max application retries per student per program
        // Bounty / Dispute
        uint256 defenseWindow;          // Seconds student has to submit counter-evidence
        uint256 bhCooldownNormal;       // BH normal cooldown after dispute
        uint256 bhCooldownFlagged;      // BH cooldown when flagged
        uint8   bhStakePercent;         // % of program balance as BH stake
        // Scholar freeze durations
        uint256 freezeLight;
        uint256 freezeMilestone;
        uint256 freezeHeavy;
        // Scoring
        uint256 scoreMax;               // Maximum raw score
        uint256 screeningThreshold;     // Minimum score to be shortlisted
        uint8   quorumPercent;          // Votes count toward the final score only if total vote power >= this % of the program fund (0 = always count)
        // Confidence stakes
        uint8   confidenceSlashPct;     // % of stake slashed on scholar fail
        uint8   confidenceBonusPct;     // % bonus from yield pool on scholar success
        // Committee
        uint8   maxCommitteeMembers;    // Per program
        // Treasury
        uint8   maxPushRefundDonors;    // Max donors for push-refund (gas limit)
        // Milestones
        uint8   maxMandatoryMilestones; // Per scholar per program
        uint8   maxOptionalMilestones;  // Per scholar per program
        uint256 optionalApprovalWindow; // Window for committee to act on proposal
    }

    /**
     * @notice Admin-tunable parameters for winner selection (stored in ScholarshipSelection).
     *
     * @dev    Deliberately NOT part of ProtocolConfig: that struct sits in the middle of
     *         ScholarshipCoreBase's storage layout, so growing it would shift every variable
     *         declared after it and corrupt a live proxy.
     *
     *         Basis points (10_000 = 100%). `isSet` distinguishes "admin never configured"
     *         (use the defaults) from "admin deliberately set zeros". The per-voter cap is the
     *         third setting but is stored in Core (voterCapBps), where the vote path reads it.
     */
    struct SelectionConfig {
        uint16 maxVoteWeightBps;      // Ceiling a program creator may choose for the vote share of the final score
        uint16 defaultVoteWeightBps;  // Used when the creator did not choose one
        bool   isSet;
    }

    uint16 constant DEFAULT_MAX_VOTE_WEIGHT_BPS     = 10_000; // creators may go up to 100%
    uint16 constant DEFAULT_VOTE_WEIGHT_BPS         = 3_000;  // 30% when the creator does not choose
    uint16 constant BPS                             = 10_000;
}
