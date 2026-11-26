// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ScholarshipTypes}    from "../libraries/ScholarshipTypes.sol";
import {TokenTransfer}       from "../libraries/TokenTransfer.sol";
import {IScholarshipCore}    from "../interfaces/IScholarship.sol";
import {IScholarshipTreasury} from "../interfaces/IScholarship.sol";
import {IMilestoneManager} from "../interfaces/IScholarship.sol";

/// @dev The payment token of a program, as ScholarshipCore records it (address(0) = native).
interface ICoreToken {
    function programToken(uint256 pid) external view returns (address);
}

/**
 * @title  ScholarshipBounty
 * @author Scholarship Protocol
 * @notice Decentralised watchdog layer for the scholarship protocol.
 *
 * @dev    BOUNTY HUNTER MECHANICS
 *         ┌────────────────────────────────────────────────────────────────┐
 *         │ Anyone can raise a dispute against an ACTIVE scholar at ANY     │
 *         │ point during the programme — not limited to milestone windows.  │
 *         │                                                                 │
 *         │ Valid evidence examples:                                        │
 *         │  • Photo of luxury car / house (contradicts income claim)       │
 *         │  • Real income documents different from those submitted         │
 *         │  • Proof student dropped out of school                          │
 *         │  • Fabricated milestone proof                                   │
 *         └────────────────────────────────────────────────────────────────┘
 *
 *         STAKE MECHANISM
 *         Stake = BH_STAKE_PERCENT (10%) of potential reward.
 *         Potential reward = bountyHunterPercent (default 20%) of remaining fund.
 *         Example: remaining = 1000 USDC → reward = 200 USDC → stake = 20 USDC.
 *         Win: receive 200 USDC (+10x return).  Lose: the 20 USDC goes to the accused scholar.
 *
 *         ANTI-SPAM
 *         • 1 active dispute per BH address at a time
 *         • 30-day cooldown after a lost dispute
 *         • 90-day cooldown if flagged as BAD_ACTOR (≥3 consecutive losses)
 *         • A lost report pays its deposit to the accused scholar
 *         • Deposits are paid in the program's own token; one that cannot be delivered waits for its
 *           owner (`withdrawOwed`). Nobody else can take deposits out.
 *
 *         FRAUD TYPE → PENALTY
 *         • LIGHT_FRAUD     → 6-month freeze
 *         • MILESTONE_FRAUD → 1-year freeze
 *         • HEAVY_FRAUD     → 2-year freeze + permanent blacklist
 *
 * UPGRADEABILITY
 *   UUPS — only UPGRADER_ROLE may authorise an upgrade.
 *
 * ROLES
 *   DEFAULT_ADMIN_ROLE – governance / multisig
 *   UPGRADER_ROLE      – proxy admin
 *   RESOLVER_ROLE      – CommitteeGovernance (final dispute resolution)
 */
contract ScholarshipBounty is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using TokenTransfer for address;

    // ── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");

    string  public constant VERSION       = "4.0.0";

    // ── External contracts ───────────────────────────────────────────────────

    IERC20                public usdc;
    IScholarshipCore      public core;
    IScholarshipTreasury  public treasury;
    IMilestoneManager  public milestone;

    // ── Storage ──────────────────────────────────────────────────────────────

    uint256 private _nextDisputeId;

    // disputeId → Dispute
    mapping(uint256 => ScholarshipTypes.Dispute)          public disputes;
    // bounty hunter address → record
    mapping(address => ScholarshipTypes.BountyHunterRecord) public bhRecords;
    // scholar → programId → active disputeId (0 = none)
    mapping(address => mapping(uint256 => uint256)) public activeDisputeForScholar;

    // APPENDED (live proxy). True when a report's deposit was paid in its program's token; reports
    // raised before that paid in USDC.
    mapping(uint256 => bool) public stakeInProgramToken;
    /// @notice Money that could not be delivered, by token and recipient.
    mapping(address => mapping(address => uint256)) public owed;

    // ── Events ───────────────────────────────────────────────────────────────

    event DisputeRaised(
        uint256 indexed disputeId,
        uint256 indexed pid,
        address indexed scholar,
        address         bountyHunter,
        ScholarshipTypes.DisputeType disputeType,
        string          evidenceCID,
        uint256         stake,
        uint256         potentialReward
    );
    event StudentDefended(uint256 indexed disputeId, string counterEvidenceCID);
    event StudentConceded(uint256 indexed disputeId, address scholar);
    event DisputeAutoGuilty(uint256 indexed disputeId, address scholar);
    event DisputeResolved(
        uint256 indexed disputeId,
        bool    bountyHunterWon,
        uint256 bhReward
    );
    event BHFlagged(address indexed bountyHunter, uint256 cooldownUntil);
    event PaymentOwed(address indexed token, address indexed account, uint256 amount);
    event OwedWithdrawn(address indexed token, address indexed account, uint256 amount);
    /// @notice A rejected report: the reporter's deposit was paid to the scholar they accused.
    event ScholarCompensated(uint256 indexed disputeId, address indexed scholar, uint256 amount);
    event GriefingStakeApplied(uint256 indexed disputeId, uint256 originalStake, uint256 appliedStake);

    // ── Errors ───────────────────────────────────────────────────────────────

    error BHHasActiveDispute();
    error BHOnCooldown(uint256 cooldownUntil);
    error ScholarNotActive();
    error ScholarAlreadyDisputed();
    error DisputeNotFound();
    error DisputeAlreadyResolved();
    error DefenseWindowStillOpen();
    error DefenseWindowExpired();
    error NotScholar();
    error CounterEvidenceRequired();
    error MilestoneManagerNotSet();
    error DepositTooLow(uint256 required);
    error NothingOwed();

    // ── Constructor / Initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    /**
     * @notice Proxy initializer.
     *
     * @param admin     Initial admin.
     * @param _usdc     USDC token address.
     * @param _core     ScholarshipCore proxy address.
     * @param _treasury ScholarshipTreasury proxy address.
     */
    function initialize(
        address admin,
        address _usdc,
        address _core,
        address _treasury
    ) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE,      admin);
        _grantRole(RESOLVER_ROLE,      admin); // CommitteeGovernance will be granted this

        usdc     = IERC20(_usdc);
        core     = IScholarshipCore(_core);
        treasury = IScholarshipTreasury(_treasury);
    }

    event MilestoneManagerSet(address indexed manager);

    /**
     * @notice Point the Bounty at MilestoneManager.
     * @dev    `initialize` takes no milestone manager and nothing else ever set it, so every report
     *         that names a milestone (and resolving one) hit a call to the zero address and reverted
     *         with no reason. Must be called once after deployment.
     */
    function setMilestoneManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        milestone = IMilestoneManager(manager);
        emit MilestoneManagerSet(manager);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1 — RAISE DISPUTE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Raise a dispute against an ACTIVE scholar.
     *
     *         Can target a specific milestone (milestoneId > 0) or the programme
     *         in general (milestoneId = 0) — e.g. fabricated application documents.
     *
     *         Stake = 10% of potential reward, in the program's token: approve it to this contract
     *         first, or send it as value for a native-currency program (any excess comes back).
     *         If potential reward is 0 (empty fund),
     *         no stake is required — BH still takes on cooldown risk.
     *
     * @param pid    Programme the scholar is enrolled in.
     * @param scholar      Scholar wallet to dispute.
     * @param milestoneId  Specific milestone to freeze (0 = general dispute).
     * @param disputeType  Fraud severity: LIGHT_FRAUD | MILESTONE_FRAUD | HEAVY_FRAUD.
     * @param evidenceCID  IPFS CID of evidence package.
     */
    function raiseDispute(
        uint256 pid,
        address scholar,
        uint256 milestoneId,
        ScholarshipTypes.DisputeType disputeType,
        string calldata evidenceCID
    ) external payable nonReentrant {
        ScholarshipTypes.BountyHunterRecord storage bh = bhRecords[msg.sender];

        // Anti-spam / cooldown checks
        if (bh.activeDisputeId != 0)               revert BHHasActiveDispute();
        if (block.timestamp < bh.cooldownUntil)     revert BHOnCooldown(bh.cooldownUntil);

        // A milestone-level report needs the MilestoneManager; fail loudly if it was never wired.
        if (milestoneId != 0 && address(milestone) == address(0)) revert MilestoneManagerNotSet();

        // Scholar must be active
        ScholarshipTypes.Scholar memory scholarData = core.getScholar(scholar, pid);
        if (scholarData.status != ScholarshipTypes.StudentStatus.ACTIVE)
            revert ScholarNotActive();

        // One dispute per scholar per programme at a time
        if (activeDisputeForScholar[scholar][pid] != 0)
            revert ScholarAlreadyDisputed();

        // Calculate stake and potential reward
        uint256 remainingFund    = core.getRemainingFund(scholar, pid);
        ScholarshipTypes.Program memory prog = core.getProgram(pid);

        uint256 potentialReward  = (remainingFund * prog.slashDist.bountyHunterPercent) / 100;
        uint256 stakeRequired    = (potentialReward * ScholarshipTypes.BH_STAKE_PERCENT) / 100;

        // Anti-griefing: 2x stake if raised within 6 hours of milestone deadline
        if (milestoneId != 0) {
            ScholarshipTypes.Milestone memory m = milestone.getMilestone(milestoneId);
            if (m.disputeDeadline > 0 && block.timestamp > m.disputeDeadline - 6 hours) {
                stakeRequired *= 2;
            }
        }

        address token = ICoreToken(address(core)).programToken(pid);
        if (token.isNative()) {
            if (msg.value < stakeRequired) revert DepositTooLow(stakeRequired);
        } else {
            if (msg.value != 0) revert TokenTransfer.UnexpectedNativeValue();
            if (stakeRequired > 0) IERC20(token).safeTransferFrom(msg.sender, address(this), stakeRequired);
        }

        uint256 disputeId = ++_nextDisputeId;
        stakeInProgramToken[disputeId] = true;

        disputes[disputeId] = ScholarshipTypes.Dispute({
            id:                 disputeId,
            pid:                pid,
            scholar:            scholar,
            milestoneId:        milestoneId,
            bountyHunter:       msg.sender,
            disputeType:        disputeType,
            status:             ScholarshipTypes.DisputeStatus.ACTIVE,
            evidenceCID:        evidenceCID,
            counterEvidenceCID: "",
            stake:              stakeRequired,
            potentialReward:    potentialReward,
            raisedAt:           block.timestamp,
            defenseDeadline:    block.timestamp + ScholarshipTypes.DEFENSE_WINDOW,
            resolvedAt:         0,
            resolvedBy:         address(0)
        });

        bh.activeDisputeId                         = disputeId;
        activeDisputeForScholar[scholar][pid] = disputeId;

        // Freeze the relevant milestone if this is a milestone-level dispute.
        // Validate that the milestone actually belongs to this scholar — prevents
        // a BH from accidentally (or maliciously) freezing another scholar's milestone.
        if (milestoneId != 0) {
            ScholarshipTypes.Milestone memory targetMilestone = milestone.getMilestone(milestoneId);
            require(
                targetMilestone.scholar == scholar,
                "ScholarshipBounty: milestone does not belong to this scholar"
            );
            require(
                targetMilestone.pid == pid,
                "ScholarshipBounty: milestone not in this program"
            );
            milestone.freezeMilestone(milestoneId);
        }

        emit DisputeRaised(
            disputeId, pid, scholar, msg.sender,
            disputeType, evidenceCID, stakeRequired, potentialReward
        );
        // After DisputeRaised, so whoever follows the events already knows the report it refers to.
        uint256 normalStake = (potentialReward * ScholarshipTypes.BH_STAKE_PERCENT) / 100;
        if (stakeRequired > normalStake) emit GriefingStakeApplied(disputeId, normalStake, stakeRequired);

        if (token.isNative()) _payOrOwe(token, msg.sender, msg.value - stakeRequired);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2A — STUDENT DEFENSE (counter-evidence)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Scholar submits counter-evidence within the 7-day defense window.
     *         After this, the case is escalated to committee review.
     *
     * @param disputeId           ID of the active dispute.
     * @param counterEvidenceCID  IPFS CID of rebuttal documents.
     */
    function submitCounterEvidence(
        uint256 disputeId,
        string calldata counterEvidenceCID
    ) external nonReentrant {
        ScholarshipTypes.Dispute storage d = disputes[disputeId];
        if (d.id == 0)                                             revert DisputeNotFound();
        if (d.status != ScholarshipTypes.DisputeStatus.ACTIVE)     revert DisputeAlreadyResolved();
        if (msg.sender != d.scholar)                               revert NotScholar();
        if (block.timestamp > d.defenseDeadline)                   revert DefenseWindowExpired();

        d.counterEvidenceCID = counterEvidenceCID;
        emit StudentDefended(disputeId, counterEvidenceCID);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2B — STUDENT CONCEDES
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Scholar voluntarily concedes — accepts the dispute is valid.
     *         Penalty applies immediately without committee review.
     *         Faster and cheaper for all parties.
     *
     * @param disputeId  ID of the active dispute.
     */
    function concede(uint256 disputeId) external nonReentrant {
        ScholarshipTypes.Dispute storage d = disputes[disputeId];
        if (d.id == 0)                                             revert DisputeNotFound();
        if (d.status != ScholarshipTypes.DisputeStatus.ACTIVE)     revert DisputeAlreadyResolved();
        if (msg.sender != d.scholar)                               revert NotScholar();

        d.status     = ScholarshipTypes.DisputeStatus.STUDENT_CONCEDED;
        d.resolvedAt = block.timestamp;

        _executeBHWin(disputeId);
        emit StudentConceded(disputeId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2C — AUTO-GUILTY (defense window expired, no response)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Trigger auto-guilty resolution when the defense window has expired
     *         and the scholar submitted no counter-evidence.
     *
     *         Permissionless — anyone may call for liveness.
     *
     * @param disputeId  ID of the expired dispute.
     */
    function triggerAutoGuilty(uint256 disputeId) external nonReentrant {
        ScholarshipTypes.Dispute storage d = disputes[disputeId];
        if (d.id == 0)                                             revert DisputeNotFound();
        if (d.status != ScholarshipTypes.DisputeStatus.ACTIVE)     revert DisputeAlreadyResolved();
        if (block.timestamp <= d.defenseDeadline)                  revert DefenseWindowStillOpen();
        // If student responded → must go through committee
        if (bytes(d.counterEvidenceCID).length > 0)               revert CounterEvidenceRequired();

        d.status     = ScholarshipTypes.DisputeStatus.AUTO_GUILTY;
        d.resolvedAt = block.timestamp;

        _executeBHWin(disputeId);
        emit DisputeAutoGuilty(disputeId, d.scholar);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3 — COMMITTEE RESOLUTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Committee finalises a dispute where the scholar submitted
     *         counter-evidence.  Only RESOLVER_ROLE (CommitteeGovernance) may call.
     *
     * @param disputeId        ID of the dispute to resolve.
     * @param bountyHunterWon  true  = BH wins, scholar guilty.
     *                         false = BH loses, scholar innocent.
     */
    function resolveDispute(
        uint256 disputeId,
        bool    bountyHunterWon
    ) external nonReentrant onlyRole(RESOLVER_ROLE) {
        ScholarshipTypes.Dispute storage d = disputes[disputeId];
        if (d.id == 0)                                             revert DisputeNotFound();
        if (d.status != ScholarshipTypes.DisputeStatus.ACTIVE)     revert DisputeAlreadyResolved();
        // Counter-evidence must exist to reach this path
        require(bytes(d.counterEvidenceCID).length > 0, "ScholarshipBounty: use triggerAutoGuilty");

        d.resolvedAt = block.timestamp;
        d.resolvedBy = msg.sender;

        if (bountyHunterWon) {
            d.status = ScholarshipTypes.DisputeStatus.BH_WON;
            _executeBHWin(disputeId);
        } else {
            d.status = ScholarshipTypes.DisputeStatus.BH_LOST;
            _executeBHLoss(disputeId);
        }

        emit DisputeResolved(
            disputeId,
            bountyHunterWon,
            bountyHunterWon ? d.potentialReward : 0
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESOLUTION EXECUTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @dev BH wins path:
     *      1. Slash scholar (Core applies freeze / blacklist, punishes voters)
     *      2. Distribute remaining program fund (Treasury)
     *      3. Return BH's stake (they earned it back + the reward)
     *      4. Reset BH state; clear active dispute
     */
    function _executeBHWin(uint256 disputeId) internal {
        ScholarshipTypes.Dispute storage d  = disputes[disputeId];
        ScholarshipTypes.BountyHunterRecord storage bh = bhRecords[d.bountyHunter];
        ScholarshipTypes.Program memory prog = core.getProgram(d.pid);

        // Slash the scholar via Core
        core.slashScholar(d.scholar, d.pid, d.disputeType);

        // Distribute remaining fund via Treasury
        treasury.slashAndDistribute(
            d.pid,
            d.scholar,
            d.bountyHunter,
            prog.slashDist.bountyHunterPercent,
            prog.slashDist.treasuryPercent,
            prog.slashDist.protocolPercent
        );

        // Update BH record
        bh.activeDisputeId   = 0;
        bh.totalWins        += 1;
        bh.consecutiveLosses = 0; // Reset consecutive loss counter on win

        activeDisputeForScholar[d.scholar][d.pid] = 0;

        // Return BH stake (they won — stake is theirs again)
        _payOrOwe(_stakeToken(disputeId), d.bountyHunter, d.stake);
    }

    /**
     * @dev BH loses path:
     *      1. Release frozen milestone (if milestone-specific dispute)
     *      2. Apply cooldown to BH; escalate to BAD_ACTOR if ≥3 in a row
     *      3. BH stake goes 100% to the wrongly accused scholar, as compensation for the freeze
     *         and for having to defend themselves
     */
    function _executeBHLoss(uint256 disputeId) internal {
        ScholarshipTypes.Dispute storage d  = disputes[disputeId];
        ScholarshipTypes.BountyHunterRecord storage bh = bhRecords[d.bountyHunter];

        // Unfreeze milestone if applicable
        if (d.milestoneId != 0) {
            milestone.releaseMilestone(d.milestoneId);
        }

        // Update BH record
        bh.activeDisputeId    = 0;
        bh.totalLosses       += 1;
        bh.consecutiveLosses += 1;

        uint256 cooldown;
        if (bh.consecutiveLosses >= 3) {
            bh.isFlagged = true;
            cooldown     = ScholarshipTypes.BH_COOLDOWN_FLAGGED;
            emit BHFlagged(d.bountyHunter, block.timestamp + cooldown);
        } else {
            cooldown = ScholarshipTypes.BH_COOLDOWN_NORMAL;
        }

        bh.cooldownUntil = block.timestamp + cooldown;
        activeDisputeForScholar[d.scholar][d.pid] = 0;

        // The reporter's deposit goes to the person they wrongly accused (state is final above).
        if (d.stake > 0 && _payOrOwe(_stakeToken(disputeId), d.scholar, d.stake)) {
            emit ScholarCompensated(disputeId, d.scholar, d.stake);
        }
    }

    function _stakeToken(uint256 disputeId) internal view returns (address) {
        return stakeInProgramToken[disputeId]
            ? ICoreToken(address(core)).programToken(disputes[disputeId].pid)
            : address(usdc);
    }

    /// @dev Send, or remember the amount for `withdrawOwed`. A refused payment must not stop a ruling.
    /// @return sent  Whether the money arrived now.
    function _payOrOwe(address token, address to, uint256 amount) internal returns (bool sent) {
        if (amount == 0) return true;
        sent = token.trySend(to, amount);
        if (!sent) {
            owed[token][to] += amount;
            emit PaymentOwed(token, to, amount);
        }
    }

    /// @notice Collect money that could not be delivered earlier. Anyone may call; it goes to `account`.
    function withdrawOwed(address token, address account) external nonReentrant {
        uint256 amount = owed[token][account];
        if (amount == 0) revert NothingOwed();
        owed[token][account] = 0;
        token.payOut(account, amount);
        emit OwedWithdrawn(token, account, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function getDispute(uint256 disputeId)
        external view returns (ScholarshipTypes.Dispute memory)
    {
        return disputes[disputeId];
    }

    function getBHRecord(address bh)
        external view returns (ScholarshipTypes.BountyHunterRecord memory)
    {
        return bhRecords[bh];
    }

    /**
     * @notice Preview stake and potential reward before calling raiseDispute.
     * @param scholar    Scholar wallet.
     * @param pid  Target programme.
     * @return stakeRequired    USDC BH must lock.
     * @return potentialReward  USDC BH earns if dispute is upheld.
     */
    function calculateStake(
        address scholar,
        uint256 pid
    ) external view returns (uint256 stakeRequired, uint256 potentialReward) {
        uint256 remaining    = core.getRemainingFund(scholar, pid);
        ScholarshipTypes.Program memory prog = core.getProgram(pid);
        potentialReward      = (remaining * prog.slashDist.bountyHunterPercent) / 100;
        stakeRequired        = (potentialReward * ScholarshipTypes.BH_STAKE_PERCENT) / 100;
    }

    // ── UUPS ─────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
