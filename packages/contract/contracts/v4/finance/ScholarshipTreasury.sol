// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IScholarshipTreasury} from "../interfaces/IScholarship.sol";
import {ScholarshipTypes}     from "../libraries/ScholarshipTypes.sol";
import {TokenTransfer}        from "../libraries/TokenTransfer.sol";

/// @dev The slice of ScholarshipCore the Treasury reads to settle a confidence stake.
interface IStakeCore {
    function getProgram(uint256 pid) external view returns (ScholarshipTypes.Program memory);
    function getScholar(address wallet, uint256 pid) external view returns (ScholarshipTypes.Scholar memory);
    function getProtocolConfig() external view returns (ScholarshipTypes.ProtocolConfig memory);
    function getShortlist(uint256 pid) external view returns (address[] memory);
    function bountyHunter() external view returns (address);
    function optionalReceived(address wallet, uint256 pid) external view returns (uint256);
    function tokenConfig(address token) external view returns (bool enabled, uint256 minDonation, uint256 transactionFee);
}

/// @dev The slice of ScholarshipBounty that says whether a report against a scholar is still open.
interface IOpenReports {
    function activeDisputeForScholar(address scholar, uint256 pid) external view returns (uint256);
}

/**
 * @title  ScholarshipTreasury
 * @author Scholarship Protocol
 * @notice Custodian of all USDC in the scholarship protocol.
 *
 * @dev    RESPONSIBILITIES
 *         1. Hold program funds deposited by initiators
 *         2. Hold donor contributions and track pro-rata shares
 *         3. Release milestone payments to scholars
 *         4. Distribute slash proceeds (BH reward + treasury reserve + protocol)
 *         5. Manage confidence-stake lifecycle (deposit → resolve/slash)
 *         6. Distribute yield share to voters at programme end
 *         7. Refund donors and the creator on programme cancellation
 *         8. Hand a completed programme's unspent fund to the scholars who finished it
 *
 *         YIELD (Phase 1)
 *         Protocol accumulates a fraction of fees and distributes pro-rata
 *         to donors at programme end.
 *
 *         YIELD (Phase 2 — future)
 *         Idle funds will be deposited to Aave aUSDC; yield harvested at end.
 *         The interface is already yield-aware so no architecture change is needed.
 *
 * UPGRADE
 *   UUPS — only UPGRADER_ROLE may authorise an upgrade.
 *
 * ROLES
 *   DEFAULT_ADMIN_ROLE – governance / multisig
 *   UPGRADER_ROLE      – proxy admin
 *   CORE_ROLE          – ScholarshipCore (program setup, milestones, yield)
 *   BOUNTY_ROLE        – ScholarshipBounty (slash execution)
 */
contract ScholarshipTreasury is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    IScholarshipTreasury
{
    using SafeERC20 for IERC20;
    using TokenTransfer for address;

    // ── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant CORE_ROLE     = keccak256("CORE_ROLE");
    bytes32 public constant BOUNTY_ROLE   = keccak256("BOUNTY_ROLE");

    string  public constant VERSION       = "4.0.0";

    // ── Storage ──────────────────────────────────────────────────────────────

    IERC20  public usdc;
    address public protocolFeeRecipient;

    // -- Program balances and yield ----------------------------------------
    mapping(uint256 => uint256) public programBalance;
    mapping(uint256 => uint256) public programYield;

    /**
     * @notice Payment token backing each program's balance.
     * @dev    Set once, on the first `depositProgramFund` call for a pid
     *         (Core calls this exactly once, inside createProgram). Every
     *         other fund-moving function looks this up instead of taking
     *         a token argument, so their signatures stay stable.
     */
    mapping(uint256 => address) public programToken;

    // -- Donor tracking per program (yield distribution + refunds) ----------
    // pid → donor → net donated amount
    mapping(uint256 => mapping(address => uint256)) public donorBalance;
    mapping(uint256 => uint256)                     public programTotalDonated;
    mapping(uint256 => address[])                  private _programDonors;

    // -- Confidence stakes --------------------------------------------------
    // pid → voter → staked amount
    mapping(uint256 => mapping(address => uint256)) public confidenceStakes;
    // pid → voter → scholar they staked on
    mapping(uint256 => mapping(address => address)) public confidenceStakeFor;
    mapping(uint256 => uint256)                     public totalConfidenceStake;

    // -- Yield claim tracking -----------------------------------------------
    mapping(uint256 => mapping(address => bool)) public yieldClaimed;
    mapping(uint256 => bool)                     public yieldDistributed;

    // -- Protocol fee accumulator ------------------------------------------
    uint256 public protocolFeeAccumulated;

    // -- Admin-configurable cap for push-refund ---------------------------
    uint8   public maxPushRefundDonors;

    // -- Confidence-stake settlement -------------------------------------------
    // Appended after the original layout so an upgrade of a live proxy stays safe.

    /// @notice ScholarshipCore, read to learn a staked scholar's outcome and the admin's rates.
    IStakeCore public stakeCore;

    /**
     * @notice Per-program pool the confidence-stake bonus is paid from.
     * @dev    Filled by the penalties of stakes on penalized scholars and by `fundBonusPool`. Kept
     *         apart from `programYield`, which belongs to the donor yield share, so the two never
     *         spend the same tokens.
     */
    mapping(uint256 => uint256) public bonusPool;

    /// @notice What each scholar received from a completed program's leftover fund, on top of their milestones.
    mapping(uint256 => mapping(address => uint256)) public leftoverReceived;

    /// @notice Service fee a creator pays on top of the fund when creating a program, in basis points.
    uint256 public creationFeeBps;

    /// @notice Per token, the platform's own money held here: the reserve share of penalties and the
    ///         donation fees. This is all an admin can withdraw; the rest belongs to programs and users.
    mapping(address => uint256) public reserveBalance;

    uint256 public constant MAX_CREATION_FEE_BPS = 500; // 5%

    /// @notice Money that could not be delivered (the recipient refused it), by token and recipient.
    mapping(address => mapping(address => uint256)) public owed;

    enum StakeOutcome { REFUND, SUCCESS, SLASH }

    // ── Events ───────────────────────────────────────────────────────────────

    event FundDeposited(uint256 indexed pid, address depositor, uint256 amount);
    event DonationRecorded(uint256 indexed pid, address donor, uint256 netAmount);
    event MilestoneDisbursed(uint256 indexed pid, address scholar, uint256 milestoneId, uint256 amount);
    event SlashDistributed(
        uint256 indexed pid,
        address indexed scholar,
        address indexed bountyHunter,
        uint256 bhReward,
        uint256 treasuryAmount,
        uint256 protocolAmount
    );
    event ConfidenceStakeDeposited(uint256 indexed pid, address voter, address scholar, uint256 amount);
    event ConfidenceStakeResolved(
        uint256 indexed pid,
        address indexed voter,
        uint256 returned,
        uint256 bonus,
        bool    slashed
    );
    event BonusPoolFunded(uint256 indexed pid, address indexed from, uint256 amount);
    event StakeCoreSet(address indexed core);
    event YieldAdded(uint256 indexed pid, uint256 amount);
    event YieldDistributed(uint256 indexed pid, uint256 totalYield);
    event YieldClaimed(uint256 indexed pid, address voter, uint256 amount);
    event DonorRefunded(uint256 indexed pid, address donor, uint256 amount);
    event TreasuryReserveWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event CreatorRefunded(uint256 indexed pid, address creator, uint256 amount);
    event LeftoverReleased(uint256 indexed pid, address scholar, uint256 amount);
    event CreationFeeSet(uint256 bps);
    event PaymentOwed(address indexed token, address indexed account, uint256 amount);
    event OwedWithdrawn(address indexed token, address indexed account, uint256 amount);
    event CreationFeeCharged(uint256 indexed pid, address token, uint256 amount);

    // ── Errors ───────────────────────────────────────────────────────────────

    error InsufficientProgramBalance();
    error AlreadyClaimedYield();
    error YieldNotYetDistributed();
    error ConfidenceStakeAlreadyExists();
    error NothingToRefund();
    error NothingToWithdraw();
    error TooManyDonorsForPushRefund();
    error StakeNotSettled();
    error StakeCoreNotSet();
    error UnknownProgram();
    error ProgramNotCancelled();
    error ProgramNotCompleted();
    error ReportStillOpen();
    error NoCompletedScholar();
    error FeeTooHigh();
    error InsufficientReserve();

    // ── Native token support ────────────────────────────────────────────────
    // Required so TokenTransfer.payOut's low-level call can forward native
    // funds from Core (createProgram/placeConfidenceStake) into this contract.
    receive() external payable {}

    // ── Constructor / Initializer ────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    /**
     * @notice Proxy initializer.
     * @param admin                  Initial admin (multisig recommended).
     * @param _usdc                  USDC token address.
     * @param _protocolFeeRecipient  Address that receives protocol's share.
     */
    function initialize(
        address admin,
        address _usdc,
        address _protocolFeeRecipient
    ) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE,      admin);

        usdc                 = IERC20(_usdc);
        protocolFeeRecipient = _protocolFeeRecipient;
        maxPushRefundDonors  = ScholarshipTypes.DEFAULT_MAX_PUSH_REFUND_DONORS;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROGRAM FUND MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Record initator fund deposit when a program is created.
     *         Core has already transferred `amount` plus `creationFee(amount)` to this contract;
     *         the program gets `amount` and the fee goes to the protocol.
     */
    function depositProgramFund(
        uint256 pid,
        uint256 amount,
        address token
    ) external override nonReentrant onlyRole(CORE_ROLE) {
        programToken[pid]    = token;
        programBalance[pid] += amount;
        emit FundDeposited(pid, msg.sender, amount);

        uint256 fee = creationFee(amount);
        if (fee > 0) {
            token.payOut(protocolFeeRecipient, fee);
            emit CreationFeeCharged(pid, token, fee);
        }
    }

    /// @notice What a creator pays on top of a program fund of `amount`.
    function creationFee(uint256 amount) public view override returns (uint256) {
        return (amount * creationFeeBps) / 10_000;
    }

    /// @notice Set the creation service fee. Only turn it on once ScholarshipCore collects it.
    function setCreationFeeBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_CREATION_FEE_BPS) revert FeeTooHigh();
        creationFeeBps = bps;
        emit CreationFeeSet(bps);
    }

    /**
     * @notice Record a donor's contribution for yield/refund accounting.
     *         USDC was already transferred to this contract by Core.
     *
     * @dev    First donation from a new address pushes to the donors list so
     *         it can be iterated during refunds / yield distribution.
     */
    function recordDonation(
        uint256 pid,
        address donor,
        uint256 netAmount
    ) external override onlyRole(CORE_ROLE) {
        if (donorBalance[pid][donor] == 0) {
            _programDonors[pid].push(donor);
        }
        donorBalance[pid][donor] += netAmount;
        programTotalDonated[pid] += netAmount;
        programBalance[pid]      += netAmount;

        // Core transferred the donation including its fee; the fee is the platform's.
        if (address(stakeCore) != address(0)) {
            address token = programToken[pid];
            reserveBalance[token] += _donationFee(token);
        }

        emit DonationRecorded(pid, donor, netAmount);
    }

    /// @dev The same fee ScholarshipCore deducts: the token's own setting, else the global one.
    function _donationFee(address token) internal view returns (uint256) {
        (bool enabled, , uint256 fee) = stakeCore.tokenConfig(token);
        return enabled ? fee : stakeCore.getProtocolConfig().transactionFee;
    }

    // ═══════════════════════════════════════════════════════════════════
    // MILESTONE DISBURSEMENT
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Release one milestone payment to a scholar.
     *         Called by Core after the dispute window expires with no challenge,
     *         or after the BH loses a dispute.
     *
     * @dev    CEI: balance decremented before transfer.
     */
    function disburseMilestone(
        address scholar,
        uint256 pid,
        uint256 milestoneId,
        uint256 amount
    ) external override nonReentrant onlyRole(CORE_ROLE) {
        if (programBalance[pid] < amount)
            revert InsufficientProgramBalance();

        programBalance[pid] -= amount;
        programToken[pid].payOut(scholar, amount);

        emit MilestoneDisbursed(pid, scholar, milestoneId, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SLASH DISTRIBUTION
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute what a penalized scholar had not yet received of their own portion.
     *         The other scholars' portions stay in the program.
     *
     *         Default split: 20% → BH, 70% → treasury reserve, 10% → protocol.
     *         The treasury share stays in this contract for reallocation.
     *
     * @dev    A scholar who was already paid in full forfeits nothing, and the ruling still goes
     *         through. CEI: programBalance reduced BEFORE any transfer.
     * @return bhReward Amount sent to the bounty hunter.
     */
    function slashAndDistribute(
        uint256 pid,
        address scholarAddr,
        address bountyHunter,
        uint256 bhPercent,
        uint256, /* treasuryPercent — treasury share stays in contract, no transfer */
        uint256 protocolPercent
    ) external override nonReentrant onlyRole(BOUNTY_ROLE) returns (uint256 bhReward) {
        uint256 forfeited = _unpaidPortion(pid, scholarAddr);

        // CEI: take it out of the program first
        programBalance[pid] -= forfeited;

        bhReward             = (forfeited * bhPercent)       / 100;
        uint256 toProtocol   = (forfeited * protocolPercent) / 100;
        // remainder (treasuryPercent) stays in contract — no transfer needed

        address token = programToken[pid];
        // A reporter that refuses payment must not be able to block the ruling.
        _payOrOwe(token, bountyHunter, bhReward);
        if (toProtocol > 0) {
            protocolFeeAccumulated += toProtocol;
            _payOrOwe(token, protocolFeeRecipient, toProtocol);
        }

        uint256 toTreasury = forfeited - bhReward - toProtocol; // implicitly = treasuryPercent share
        reserveBalance[token] += toTreasury;
        emit SlashDistributed(pid, scholarAddr, bountyHunter, bhReward, toTreasury, toProtocol);
    }

    /// @dev One winner's portion (the same split the milestones are created from) minus what they
    ///      have received from it (optional milestones are paid from elsewhere), never more than the
    ///      program still holds.
    function _unpaidPortion(uint256 pid, address scholar) internal view returns (uint256 unpaid) {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();
        ScholarshipTypes.Program memory p = stakeCore.getProgram(pid);
        uint256 portion  = p.totalFund / p.targetWinners;
        uint256 received = stakeCore.getScholar(scholar, pid).totalReceived - stakeCore.optionalReceived(scholar, pid);
        if (portion > received) unpaid = portion - received;
        if (unpaid > programBalance[pid]) unpaid = programBalance[pid];
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONFIDENCE STAKE
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Lock a voter's optional conviction stake.
     *         USDC was already transferred to this contract by Core.
     *         One stake per voter per program.
     */
    function depositConfidenceStake(
        uint256 pid,
        address voter,
        address scholar,
        uint256 amount
    ) external override nonReentrant onlyRole(CORE_ROLE) {
        if (confidenceStakes[pid][voter] > 0)
            revert ConfidenceStakeAlreadyExists();

        confidenceStakes[pid][voter]   = amount;
        confidenceStakeFor[pid][voter] = scholar;
        totalConfidenceStake[pid]      += amount;

        emit ConfidenceStakeDeposited(pid, voter, scholar, amount);
    }

    /**
     * @notice Resolve a voter's confidence stake, driven by Core.
     * @dev    Kept for the existing interface. Nothing in Core calls it today, so voters settle
     *         with `claimConfidenceStake` below instead.
     */
    function resolveConfidenceStake(
        uint256 pid,
        address voter,
        bool    scholarSucceeded
    ) external override nonReentrant onlyRole(CORE_ROLE) {
        if (confidenceStakes[pid][voter] == 0) return;
        _settleStake(pid, voter, scholarSucceeded ? StakeOutcome.SUCCESS : StakeOutcome.SLASH);
    }

    /**
     * @notice Settle a confidence stake once the staked candidate's outcome is known.
     *         Anyone may call it; the money always goes to `voter`.
     *
     *         Candidate was not chosen, or the program was cancelled → the deposit comes back whole.
     *         Scholar COMPLETED   → deposit + bonus (`confidenceBonusPct`, capped by the bonus pool).
     *         Scholar FROZEN or BLACKLISTED → `confidenceSlashPct` of the deposit goes to the
     *                                         program's bonus pool, the rest comes back.
     *         Scholar still ACTIVE, or the vote not decided → reverts with StakeNotSettled.
     */
    function claimConfidenceStake(uint256 pid, address voter) external nonReentrant {
        if (confidenceStakes[pid][voter] == 0) revert NothingToRefund();
        (bool settled, StakeOutcome outcome) = _outcomeFor(pid, confidenceStakeFor[pid][voter]);
        if (!settled) revert StakeNotSettled();
        _settleStake(pid, voter, outcome);
    }

    /// @notice Whether `voter`'s stake can be settled now, and how it would settle.
    function stakeStatus(uint256 pid, address voter)
        external view returns (bool settled, StakeOutcome outcome)
    {
        if (confidenceStakes[pid][voter] == 0) return (false, StakeOutcome.REFUND);
        return _outcomeFor(pid, confidenceStakeFor[pid][voter]);
    }

    /// @dev Bonus and penalty rates come from the admin's protocol config; the old fixed
    ///      20% / 50% apply only until `setStakeCore` has been called.
    function _stakeRates() internal view returns (uint256 bonusPct, uint256 slashPct) {
        if (address(stakeCore) == address(0)) return (20, 50);
        ScholarshipTypes.ProtocolConfig memory c = stakeCore.getProtocolConfig();
        return (c.confidenceBonusPct, c.confidenceSlashPct);
    }

    function _outcomeFor(uint256 pid, address scholar)
        internal view returns (bool settled, StakeOutcome outcome)
    {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();

        ScholarshipTypes.ProgramStatus st = stakeCore.getProgram(pid).status;
        bool cancelled = st == ScholarshipTypes.ProgramStatus.CANCELLED;
        if (!cancelled && st != ScholarshipTypes.ProgramStatus.ACTIVE && st != ScholarshipTypes.ProgramStatus.COMPLETED)
            return (false, StakeOutcome.REFUND);

        ScholarshipTypes.Scholar memory s = stakeCore.getScholar(scholar, pid);
        // Winners are chosen: someone who never became a scholar simply lost, so the deposit is returned.
        if (s.wallet == address(0)) return (true, StakeOutcome.REFUND);
        if (s.status == ScholarshipTypes.StudentStatus.COMPLETED) return (true, StakeOutcome.SUCCESS);
        if (s.status == ScholarshipTypes.StudentStatus.FROZEN || s.status == ScholarshipTypes.StudentStatus.BLACKLISTED)
            return (true, StakeOutcome.SLASH);
        return (cancelled, StakeOutcome.REFUND);
    }

    /// @dev CEI: the stake is zeroed before any transfer.
    function _settleStake(uint256 pid, address voter, StakeOutcome outcome) internal {
        uint256 stake = confidenceStakes[pid][voter];
        confidenceStakes[pid][voter] = 0;
        totalConfidenceStake[pid]   -= stake;

        (uint256 bonusPct, uint256 slashPct) = _stakeRates();
        address token = programToken[pid];

        if (outcome == StakeOutcome.SUCCESS) {
            uint256 wanted = (stake * bonusPct) / 100;
            uint256 pool   = bonusPool[pid];
            uint256 bonus  = wanted <= pool ? wanted : pool;
            bonusPool[pid] = pool - bonus;
            token.payOut(voter, stake + bonus);
            emit ConfidenceStakeResolved(pid, voter, stake, bonus, false);
        } else if (outcome == StakeOutcome.SLASH) {
            uint256 cut = (stake * slashPct) / 100;
            bonusPool[pid] += cut;
            emit BonusPoolFunded(pid, voter, cut);
            token.payOut(voter, stake - cut);
            emit ConfidenceStakeResolved(pid, voter, stake - cut, 0, true);
        } else {
            token.payOut(voter, stake);
            emit ConfidenceStakeResolved(pid, voter, stake, 0, false);
        }
    }

    /**
     * @notice Add to a program's bonus pool, which pays the bonus to supporters of a scholar
     *         who completes the program. Open to anyone; the funds can only leave as such bonuses.
     * @dev    The program's own payment token. For a native-currency program, send `amount` as value.
     */
    function fundBonusPool(uint256 pid, uint256 amount) external payable nonReentrant {
        address token = programToken[pid];
        // programToken is set when the program is created; a native program stores address(0), so
        // an unknown pid is recognised by having no balance entry at all.
        if (token == address(0) && programBalance[pid] == 0 && programTotalDonated[pid] == 0)
            revert UnknownProgram();
        if (amount == 0) revert NothingToWithdraw();

        token.pullIn(msg.sender, address(this), amount);
        bonusPool[pid] += amount;
        emit BonusPoolFunded(pid, msg.sender, amount);
    }

    /// @notice Point the Treasury at ScholarshipCore. Required before stakes can be settled.
    function setStakeCore(address core) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakeCore = IStakeCore(core);
        emit StakeCoreSet(core);
    }

    // ═══════════════════════════════════════════════════════════════════
    // YIELD
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Add yield to a programme's pool.
     *         Phase 1: Manual (from protocol fee revenue).
     *         Phase 2: Automated after harvesting Aave aUSDC positions.
     */
    function addYield(
        uint256 pid,
        uint256 amount
    ) external override onlyRole(CORE_ROLE) {
        programYield[pid] += amount;
        emit YieldAdded(pid, amount);
    }

    /**
     * @notice Mark yield as ready for individual claims.
     *         Called once when a programme completes.
     */
    function distributeYield(uint256 pid)
        external override onlyRole(CORE_ROLE)
    {
        yieldDistributed[pid] = true;
        emit YieldDistributed(pid, programYield[pid]);
    }

    /**
     * @notice Voter pulls their pro-rata yield share.
     *         Share = (voterDonation / totalDonated) × totalYield
     *
     * @dev    Permissionless pull so any voter can claim at any time
     *         after the programme completes.  Safe — state updated before transfer.
     */
    function claimYield(uint256 pid, address voter)
        external nonReentrant
    {
        if (!yieldDistributed[pid])    revert YieldNotYetDistributed();
        if (yieldClaimed[pid][voter])  revert AlreadyClaimedYield();

        uint256 voterDonation = donorBalance[pid][voter];
        if (voterDonation == 0) revert NothingToRefund();

        uint256 totalDonated = programTotalDonated[pid];
        uint256 totalYield   = programYield[pid];
        uint256 voterShare   = (totalYield * voterDonation) / totalDonated;

        yieldClaimed[pid][voter] = true;

        if (voterShare > 0) {
            programToken[pid].payOut(voter, voterShare);
            emit YieldClaimed(pid, voter, voterShare);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DONOR REFUNDS (on cancellation)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Settle a cancelled programme. The creator gets back everything that did not come from
     *         donors, and donors get their donations back.
     *
     * @dev    Donors are paid here only while there are at most `maxPushRefundDonors` of them.
     *         Larger programmes are not blocked: each donor then collects with `claimRefund`.
     */
    function refundDonors(uint256 pid)
        external override nonReentrant onlyRole(CORE_ROLE)
    {
        _settleCancelled(pid);
    }

    /**
     * @notice The same settlement for a programme that ended CANCELLED after it started, because
     *         every one of its winners was penalized. Anyone may call it; the money can only go to
     *         the creator and the donors.
     */
    function settleCancelledProgram(uint256 pid) external nonReentrant {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();
        if (stakeCore.getProgram(pid).status != ScholarshipTypes.ProgramStatus.CANCELLED)
            revert ProgramNotCancelled();
        if (programBalance[pid] == 0) revert NothingToWithdraw();
        _settleCancelled(pid);
    }

    function _settleCancelled(uint256 pid) internal {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();

        uint256 balance = programBalance[pid];
        uint256 donated = programTotalDonated[pid];

        if (balance > donated) {
            uint256 rest    = balance - donated;
            address creator = stakeCore.getProgram(pid).initiator;
            programBalance[pid] = donated;
            _payOrOwe(programToken[pid], creator, rest);
            emit CreatorRefunded(pid, creator, rest);
        }

        address[] memory donors = _programDonors[pid];
        if (donors.length > maxPushRefundDonors) return;

        for (uint256 i = 0; i < donors.length; ) {
            _refundDonor(pid, donors[i]);
            unchecked { ++i; }
        }
    }

    /**
     * @notice A donor of a CANCELLED programme collects their donation.
     *         Anyone may call it; the money always goes to `donor`.
     */
    function claimRefund(uint256 pid, address donor)
        external nonReentrant
    {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();
        if (stakeCore.getProgram(pid).status != ScholarshipTypes.ProgramStatus.CANCELLED)
            revert ProgramNotCancelled();
        if (donorBalance[pid][donor] == 0) revert NothingToRefund();
        _refundDonor(pid, donor);
    }

    /**
     * @dev A donor never gets more than they gave. If the balance no longer covers every donation,
     *      what is left is shared in proportion; reducing the outstanding total with each refund keeps
     *      that proportion the same whatever order donors collect in. CEI: state before transfer.
     */
    function _refundDonor(uint256 pid, address donor) internal {
        uint256 donated = donorBalance[pid][donor];
        if (donated == 0) return;

        uint256 outstanding = programTotalDonated[pid];
        uint256 balance     = programBalance[pid];
        uint256 refund      = balance >= outstanding ? donated : (balance * donated) / outstanding;

        donorBalance[pid][donor]  = 0;
        programTotalDonated[pid]  = outstanding - donated;
        programBalance[pid]       = balance - refund;

        if (refund > 0) {
            _payOrOwe(programToken[pid], donor, refund);
            emit DonorRefunded(pid, donor, refund);
        }
    }

    /// @dev Send, or remember the amount for `withdrawOwed` if the recipient refuses it.
    function _payOrOwe(address token, address to, uint256 amount) internal {
        if (amount == 0 || token.trySend(to, amount)) return;
        owed[token][to] += amount;
        emit PaymentOwed(token, to, amount);
    }

    /// @notice Collect money that could not be delivered earlier. Anyone may call; it goes to `account`.
    function withdrawOwed(address token, address account) external nonReentrant {
        uint256 amount = owed[token][account];
        if (amount == 0) revert NothingToWithdraw();
        owed[token][account] = 0;
        token.payOut(account, amount);
        emit OwedWithdrawn(token, account, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // LEFTOVER FUND (completed programmes)
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Share whatever a COMPLETED programme did not spend equally among the scholars who
     *         completed it. Anyone may call it; the money can only go to those scholars.
     *         Waits while a report against any of the programme's scholars is still open, because
     *         upholding it distributes this same balance.
     */
    function releaseLeftover(uint256 pid) external nonReentrant {
        if (address(stakeCore) == address(0)) revert StakeCoreNotSet();
        if (stakeCore.getProgram(pid).status != ScholarshipTypes.ProgramStatus.COMPLETED)
            revert ProgramNotCompleted();

        uint256 balance = programBalance[pid];
        if (balance == 0) revert NothingToWithdraw();

        (address[] memory scholars, uint256 n) = _completedScholars(pid);
        if (n == 0) revert NoCompletedScholar();

        programBalance[pid] = 0;

        address token = programToken[pid];
        uint256 each  = balance / n;
        for (uint256 i = 0; i < n; ) {
            // The last one also gets the rounding remainder, so nothing stays behind.
            uint256 amount = i + 1 == n ? balance - each * (n - 1) : each;
            if (amount > 0) {
                leftoverReceived[pid][scholars[i]] += amount;
                _payOrOwe(token, scholars[i], amount);
                emit LeftoverReleased(pid, scholars[i], amount);
            }
            unchecked { ++i; }
        }
    }

    /// @dev Winners are always taken from the shortlist. Only the first `n` entries of `done` are filled.
    function _completedScholars(uint256 pid) internal view returns (address[] memory done, uint256 n) {
        address[] memory list = stakeCore.getShortlist(pid);
        address reports       = stakeCore.bountyHunter();
        done = new address[](list.length);

        for (uint256 i = 0; i < list.length; ) {
            ScholarshipTypes.Scholar memory s = stakeCore.getScholar(list[i], pid);
            if (s.wallet != address(0)) {
                if (reports != address(0) && IOpenReports(reports).activeDisputeForScholar(s.wallet, pid) != 0)
                    revert ReportStillOpen();
                if (s.status == ScholarshipTypes.StudentStatus.COMPLETED) done[n++] = s.wallet;
            }
            unchecked { ++i; }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════════════

    function getProgramBalance(uint256 pid)
        external view override returns (uint256)
    {
        return programBalance[pid];
    }

    function getAccruedYield(uint256 pid)
        external view override returns (uint256)
    {
        return programYield[pid];
    }

    function getProgramDonors(uint256 pid)
        external view override returns (address[] memory)
    {
        return _programDonors[pid];
    }

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN UTILITIES
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Update the protocol fee recipient address.
     *         Only DEFAULT_ADMIN_ROLE (multisig) may call.
     */
    function setProtocolFeeRecipient(address newRecipient)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        protocolFeeRecipient = newRecipient;
    }

    /**
     * @notice Update the max number of donors allowed in a push-refund (gas safety cap).
     *         Only DEFAULT_ADMIN_ROLE may call.
     */
    function setMaxPushRefundDonors(uint8 newMax) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMax > 0, "max=0");
        maxPushRefundDonors = newMax;
    }
    
    /**
     * @notice Withdraw from the platform's reserve (penalty shares and donation fees), never more
     *         than the reserve holds, so program funds, stakes and bonus pools cannot be taken.
     * @param token      Which token's reserve.
     * @param recipient  Address to receive the funds.
     * @param amount     Amount to withdraw.
     */
    function withdrawTreasuryReserve(address token, address recipient, uint256 amount)
        external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (amount == 0) revert NothingToWithdraw();
        if (amount > reserveBalance[token]) revert InsufficientReserve();
        reserveBalance[token] -= amount;
        token.payOut(recipient, amount);
        emit TreasuryReserveWithdrawn(token, recipient, amount);
    }

    // ── UUPS ─────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
