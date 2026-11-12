// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {ScholarshipTypes} from "../libraries/ScholarshipTypes.sol";

/// @notice The slice of ScholarshipCore this contract uses.
interface IScholarshipCoreSelection {
    function getProgram(uint256 pid) external view returns (ScholarshipTypes.Program memory);
    function getShortlist(uint256 pid) external view returns (address[] memory);
    function getProgramApplicants(uint256 pid) external view returns (address[] memory);
    function getApplicant(uint256 pid, address wallet)
        external view returns (bool exists, ScholarshipTypes.ApplicationStatus status, uint32 screeningScore, uint128 voteScore);
    function getProtocolConfig() external view returns (ScholarshipTypes.ProtocolConfig memory);
    function voterCapBps() external view returns (uint16);
    function setVoterCapBps(uint16 bps) external;
    function resolveProgress(uint256 pid) external view returns (uint32);
    function selectionApplyBatch(uint256 pid, address[] calldata shortlisted, address[] calldata screenedOut, bool isLast) external;
    function selectionActivate(uint256 pid, address[] calldata winners, uint32 mandatoryTotal) external;
    function milestoneManager() external view returns (address);
}

interface IMilestoneManagerSelection {
    function createMandatoryBatch(
        uint256 pid,
        address scholar,
        uint256[] calldata amounts,
        string[] calldata descs,
        bytes32[] calldata providers,
        bytes32[] calldata externalIds
    ) external;
}

/**
 * @title  ScholarshipSelection
 * @notice Decides who is shortlisted and who wins, from scores and votes, with the
 *         program creator out of the loop wherever the outcome should not be theirs.
 *
 * @dev    WHY A SEPARATE CONTRACT
 *         ScholarshipCore is at the EIP-170 size limit, so this logic cannot live there.
 *         It holds no funds and owns no program state. It reads scores from Core, verifies
 *         the caller's ordering on-chain, and asks Core to record the result through the
 *         SELECTION_ROLE hooks (selectionApplyBatch / selectionActivate).
 *
 *         "BY SYSTEM"
 *         Sorting N applicants on-chain is too expensive, so the ordering is supplied by
 *         the caller (use rankApplicants()/rankShortlist(), or compute it off-chain) and
 *         VERIFIED here. A wrong order reverts, so for public programs anyone may submit it
 *         and nobody can slant the outcome.
 *
 *         ORDER
 *           1. Higher key first. 2. Ties: lower address first (a fixed, public rule).
 *         Because that is a strict total order, requiring each element to come strictly after
 *         the previous one also proves there are no duplicates.
 *
 *         FINAL SCORE (public programs)
 *           final = screening x (1 - w) + voteShare x w
 *           voteShare = candidate's votes / total votes, scaled to scoreMax
 *           w         = the creator's chosen vote weight (capped by the admin's maximum)
 *         Votes are a bonus on top of screening: with no votes (or turnout below the
 *         quorum) the ranking is simply the screening score.
 *
 *         PRIVATE PROGRAMS (openDonation == false)
 *         There is no voting and the money is the creator's own, so the creator chooses
 *         freely among the shortlisted, limited to targetWinners.
 */
contract ScholarshipSelection is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    uint256 private constant BPS = 10_000;

    IScholarshipCoreSelection public core;

    /// Milestone plan applied to EVERY winner of a program, as shares of one winner's
    /// portion of the fund (basis points, summing to 10_000). Shares, not absolute amounts,
    /// so the plan stays valid however much the fund grows from donations.
    struct MilestonePlan {
        uint16[]  shareBps;
        string[]  descriptions;
        bytes32[] providers;
        bytes32[] externalIds;
    }

    struct RankKey { uint32 score; address who; bool has; }

    ScholarshipTypes.SelectionConfig private _cfg;

    mapping(uint256 => uint16)         public voteWeightBps;   // creator's choice
    mapping(uint256 => bool)           public voteWeightSet;
    mapping(uint256 => bool)           public planSet;
    mapping(uint256 => MilestonePlan)  private _plans;
    mapping(uint256 => RankKey)        public lastShortlistKey; // progress of a multi-batch resolution

    // ── Events ───────────────────────────────────────────────────────────────
    event ProgramConfigured(uint256 indexed pid, uint16 voteWeightBps, uint256 milestoneCount);
    event WinnersSelected(uint256 indexed pid, address[] winners, bool bySystem);
    event ConfigUpdated(uint16 maxVoteWeightBps, uint16 defaultVoteWeightBps, uint16 voterCapBps);

    // ── Errors ───────────────────────────────────────────────────────────────
    error ProgramNotFound();
    error NotInitiator();
    error WrongStatus(ScholarshipTypes.ProgramStatus actual);
    error LockedAfterScreening(ScholarshipTypes.ProgramStatus actual);
    error VoteWeightTooHigh(uint16 max);
    error InvalidPlan();
    error TooEarly();
    error VotingNotEnded();
    error NotAnApplicant(address who);
    error AlreadyProcessed(address who);
    error NotShortlisted(address who);
    error InvalidSortOrder();
    error RankingIncomplete();
    error NoCandidates();
    error WrongWinnerCount();
    error DuplicateWinner(address who);
    error InvalidConfig();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address _core) external initializer {
        __AccessControl_init();
        __UUPSUpgradeable_init();
        core = IScholarshipCoreSelection(_core);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN CONFIG
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Current settings; protocol defaults for the weights until an admin sets them.
    /// @return maxVoteWeightBps     Highest vote share of the final score a creator may choose.
    /// @return defaultVoteWeightBps Used when a creator did not choose.
    /// @return capBps               One donor's counted power, as a share of the program fund (0 = no cap). Held by Core.
    function config() public view returns (uint16 maxVoteWeightBps, uint16 defaultVoteWeightBps, uint16 capBps) {
        ScholarshipTypes.SelectionConfig memory c = _cfg;
        if (!c.isSet) {
            c.maxVoteWeightBps     = ScholarshipTypes.DEFAULT_MAX_VOTE_WEIGHT_BPS;
            c.defaultVoteWeightBps = ScholarshipTypes.DEFAULT_VOTE_WEIGHT_BPS;
        }
        return (c.maxVoteWeightBps, c.defaultVoteWeightBps, core.voterCapBps());
    }

    function setConfig(uint16 maxVoteWeightBps, uint16 defaultVoteWeightBps, uint16 capBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (maxVoteWeightBps > BPS || defaultVoteWeightBps > maxVoteWeightBps || capBps > BPS) revert InvalidConfig();
        _cfg = ScholarshipTypes.SelectionConfig(maxVoteWeightBps, defaultVoteWeightBps, true);
        core.setVoterCapBps(capBps); // needs SELECTION_ROLE on Core
        emit ConfigUpdated(maxVoteWeightBps, defaultVoteWeightBps, capBps);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CREATOR SETUP
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Choose how much votes count and what every winner's milestones look like.
     * @dev    Creator only, and only until screening ends: once candidates are shortlisted and
     *         voting can start, changing the weight would let the creator react to the votes.
     *
     * @param weightBps   Share of the final score taken from votes (0 = screening only,
     *                    10_000 = votes only). At most the admin's maxVoteWeightBps.
     * @param shareBps    Each mandatory milestone's share of a winner's portion; must sum to 10_000.
     * @param descs       Per-milestone description CIDs (empty, or one per milestone).
     * @param providers   Per-milestone external provider (empty, or one per milestone).
     * @param externalIds Per-milestone external id (empty, or one per milestone).
     */
    function configureProgram(
        uint256 pid,
        uint16 weightBps,
        uint16[] calldata shareBps,
        string[] calldata descs,
        bytes32[] calldata providers,
        bytes32[] calldata externalIds
    ) external {
        ScholarshipTypes.Program memory p = _program(pid);
        if (msg.sender != p.initiator) revert NotInitiator();
        if (p.status > ScholarshipTypes.ProgramStatus.SCREENING) revert LockedAfterScreening(p.status);

        (uint16 maxWeight, , ) = config();
        if (weightBps > maxWeight) revert VoteWeightTooHigh(maxWeight);

        uint256 n = shareBps.length;
        if (n == 0 || n > core.getProtocolConfig().maxMandatoryMilestones) revert InvalidPlan();
        if ((descs.length != 0 && descs.length != n) ||
            (providers.length != 0 && providers.length != n) ||
            (externalIds.length != 0 && externalIds.length != n)) revert InvalidPlan();

        uint256 sum;
        for (uint256 i; i < n; ) {
            if (shareBps[i] == 0) revert InvalidPlan();
            sum += shareBps[i];
            unchecked { ++i; }
        }
        if (sum != BPS) revert InvalidPlan();

        voteWeightBps[pid] = weightBps;
        voteWeightSet[pid] = true;
        planSet[pid] = true;

        MilestonePlan storage plan = _plans[pid];
        delete _plans[pid];
        for (uint256 i; i < n; ) {
            plan.shareBps.push(shareBps[i]);
            unchecked { ++i; }
        }
        for (uint256 i; i < descs.length; ) { plan.descriptions.push(descs[i]); unchecked { ++i; } }
        for (uint256 i; i < providers.length; ) { plan.providers.push(providers[i]); unchecked { ++i; } }
        for (uint256 i; i < externalIds.length; ) { plan.externalIds.push(externalIds[i]); unchecked { ++i; } }

        emit ProgramConfigured(pid, weightBps, n);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1 - SHORTLIST
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Resolve the shortlist, one batch at a time.
     * @dev    Anyone may call it for a public program (once the voting window has started);
     *         the order is verified, so the caller has no say in who is shortlisted. For a
     *         private program only the creator may call, since they control when their own
     *         screening is finished.
     *
     *         Batches must continue the same ordering: the first applicant of batch 2 must
     *         come after the last of batch 1. The final batch (`isLast`) requires that every
     *         applicant was processed.
     *
     * @param ranked  Applicants, best first. Obtain with rankApplicants().
     */
    function resolveShortlist(uint256 pid, address[] calldata ranked, bool isLast) external {
        ScholarshipTypes.Program memory p = _program(pid);

        bool windowClosed = p.status == ScholarshipTypes.ProgramStatus.APPLICATION_OPEN && block.timestamp >= p.applicationEnd;
        if (p.status != ScholarshipTypes.ProgramStatus.SCREENING && !windowClosed) revert WrongStatus(p.status);

        if (p.openDonation) {
            if (block.timestamp < p.votingStart) revert TooEarly();
        } else if (msg.sender != p.initiator) {
            revert NotInitiator();
        }

        uint256 threshold = core.getProtocolConfig().screeningThreshold;
        uint256 progress = core.resolveProgress(pid);
        RankKey memory last = lastShortlistKey[pid];

        address[] memory yes = new address[](ranked.length);
        address[] memory no  = new address[](ranked.length);
        uint256 ny; uint256 nn;

        for (uint256 i; i < ranked.length; ) {
            address who = ranked[i];
            (bool exists, ScholarshipTypes.ApplicationStatus st, uint32 score, ) = core.getApplicant(pid, who);
            // Without this an unknown address could be used as padding to reach the applicant
            // count while leaving a real, high-scoring applicant out.
            if (!exists) revert NotAnApplicant(who);
            if (st != ScholarshipTypes.ApplicationStatus.PENDING_REVIEW) revert AlreadyProcessed(who);

            if (last.has && !_comesAfter(score, who, last.score, last.who)) revert InvalidSortOrder();
            last = RankKey(score, who, true);

            if (progress + i < p.maxCandidates && score >= threshold) yes[ny++] = who;
            else no[nn++] = who;
            unchecked { ++i; }
        }

        lastShortlistKey[pid] = last;
        core.selectionApplyBatch(pid, _trim(yes, ny), _trim(no, nn), isLast);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2 - WINNERS
    // ═══════════════════════════════════════════════════════════════════

    /**
     * @notice Pick the winners and start the program.
     *
     * @dev    PUBLIC program: callable by anyone after voting ends. `ranked` must be the COMPLETE
     *         shortlist ordered by final score, best first (use rankShortlist()). The top
     *         targetWinners become scholars. Zero votes is fine: the ranking is then the
     *         screening score alone.
     *
     *         PRIVATE program: only the creator. `ranked` is the creator's own pick among the
     *         shortlisted, at most targetWinners.
     */
    function selectWinners(uint256 pid, address[] calldata ranked) external {
        ScholarshipTypes.Program memory p = _program(pid);
        if (p.status != ScholarshipTypes.ProgramStatus.VOTING) revert WrongStatus(p.status);

        address[] memory shortlist = core.getShortlist(pid);
        if (shortlist.length == 0) revert NoCandidates();

        address[] memory winners;
        if (p.openDonation) {
            if (block.timestamp < p.votingEnd) revert VotingNotEnded();
            winners = _verifiedTop(pid, p, shortlist.length, ranked);
        } else {
            if (msg.sender != p.initiator) revert NotInitiator();
            if (ranked.length == 0 || ranked.length > p.targetWinners) revert WrongWinnerCount();
            for (uint256 i; i < ranked.length; ) {
                for (uint256 j = i + 1; j < ranked.length; ) {
                    if (ranked[i] == ranked[j]) revert DuplicateWinner(ranked[i]);
                    unchecked { ++j; }
                }
                unchecked { ++i; }
            }
            winners = ranked; // each is checked to be SHORTLISTED by Core
        }

        (uint256[] memory amounts, string[] memory descs, bytes32[] memory providers, bytes32[] memory ids) =
            _planFor(pid, p);
        // Core records the scholars (and re-checks each is shortlisted); then each gets the same plan.
        core.selectionActivate(pid, winners, uint32(amounts.length));
        IMilestoneManagerSelection mm = IMilestoneManagerSelection(core.milestoneManager());
        for (uint256 i; i < winners.length; ) {
            mm.createMandatoryBatch(pid, winners[i], amounts, descs, providers, ids);
            unchecked { ++i; }
        }
        emit WinnersSelected(pid, winners, p.openDonation);
    }

    // ═══════════════════════════════════════════════════════════════════
    // VIEWS (also the source of truth for keepers and the UI)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Applicants still waiting to be processed, best first. Feed this to resolveShortlist().
    function rankApplicants(uint256 pid) external view returns (address[] memory sorted) {
        address[] memory all = core.getProgramApplicants(pid);
        address[] memory pending = new address[](all.length);
        uint256[] memory keys = new uint256[](all.length);
        uint256 n;
        for (uint256 i; i < all.length; ) {
            (, ScholarshipTypes.ApplicationStatus st, uint32 score, ) = core.getApplicant(pid, all[i]);
            if (st == ScholarshipTypes.ApplicationStatus.PENDING_REVIEW) { pending[n] = all[i]; keys[n] = score; n++; }
            unchecked { ++i; }
        }
        return _sortDesc(pending, keys, n);
    }

    /// @notice The whole shortlist ordered by final score, best first. Feed this to selectWinners().
    function rankShortlist(uint256 pid) external view returns (address[] memory sorted) {
        ScholarshipTypes.Program memory p = _program(pid);
        address[] memory list = core.getShortlist(pid);
        uint256[] memory keys = new uint256[](list.length);
        (uint256 w, uint256 tn, bool counted, uint256 scoreMax) = _scoring(pid, p);
        for (uint256 i; i < list.length; ) {
            (, , uint32 score, uint128 votes) = core.getApplicant(pid, list[i]);
            keys[i] = _finalKey(score, votes, w, tn, counted, scoreMax);
            unchecked { ++i; }
        }
        return _sortDesc(list, keys, list.length);
    }

    /// @notice A candidate's final-score key (higher is better). Comparable only within one program.
    function finalKey(uint256 pid, address who) external view returns (uint256) {
        ScholarshipTypes.Program memory p = _program(pid);
        (, , uint32 score, uint128 votes) = core.getApplicant(pid, who);
        (uint256 w, uint256 tn, bool counted, uint256 scoreMax) = _scoring(pid, p);
        return _finalKey(score, votes, w, tn, counted, scoreMax);
    }

    /// @notice The vote weight that will apply to `pid` (creator's choice, else the default, capped by the admin's max).
    function effectiveVoteWeightBps(uint256 pid) public view returns (uint256 w) {
        (uint16 maxWeight, uint16 defaultWeight, ) = config();
        w = voteWeightSet[pid] ? voteWeightBps[pid] : defaultWeight;
        if (w > maxWeight) w = maxWeight;
    }

    function getPlan(uint256 pid) external view returns (MilestonePlan memory) { return _plans[pid]; }

    // ═══════════════════════════════════════════════════════════════════
    // INTERNALS
    // ═══════════════════════════════════════════════════════════════════

    function _program(uint256 pid) internal view returns (ScholarshipTypes.Program memory p) {
        p = core.getProgram(pid);
        if (p.pid == 0) revert ProgramNotFound();
    }

    /// @dev true if (scoreA, a) ranks strictly AFTER (scoreB, b): lower score, or equal score and higher address.
    function _comesAfter(uint256 scoreA, address a, uint256 scoreB, address b) private pure returns (bool) {
        return scoreA < scoreB || (scoreA == scoreB && a > b);
    }

    /// @dev Weight, vote scaling, whether votes count at all, and the score scale for one program.
    function _scoring(uint256 pid, ScholarshipTypes.Program memory p)
        private view returns (uint256 w, uint256 tn, bool counted, uint256 scoreMax)
    {
        ScholarshipTypes.ProtocolConfig memory cfg = core.getProtocolConfig();
        w = effectiveVoteWeightBps(pid);
        scoreMax = cfg.scoreMax;
        uint256 total = p.totalVotes;
        // Votes count only when there are some and turnout (as a share of the fund) reaches the quorum.
        counted = total > 0 && (cfg.quorumPercent == 0 || total * 100 >= p.totalFund * cfg.quorumPercent);
        tn = counted ? total : 1;
    }

    /**
     * @dev key = screening x (BPS - w) x T + votes x scoreMax x w, where T is the total votes.
     *      That is final score x T x BPS, so no division and no rounding, and comparable between
     *      candidates of the same program. When votes do not count, T = 1 and votes = 0.
     */
    function _finalKey(uint256 screening, uint256 votes, uint256 w, uint256 tn, bool counted, uint256 scoreMax)
        private pure returns (uint256)
    {
        uint256 v = counted ? votes : 0;
        return screening * (BPS - w) * tn + v * scoreMax * w;
    }

    /// @dev Verify `ranked` is the complete shortlist in strictly descending final order; return the top winners.
    function _verifiedTop(uint256 pid, ScholarshipTypes.Program memory p, uint256 shortlistLen, address[] calldata ranked)
        private view returns (address[] memory winners)
    {
        if (ranked.length != shortlistLen) revert RankingIncomplete();
        (uint256 w, uint256 tn, bool counted, uint256 scoreMax) = _scoring(pid, p);

        uint256 prevKey;
        address prevWho;
        for (uint256 i; i < ranked.length; ) {
            (, ScholarshipTypes.ApplicationStatus st, uint32 score, uint128 votes) = core.getApplicant(pid, ranked[i]);
            if (st != ScholarshipTypes.ApplicationStatus.SHORTLISTED) revert NotShortlisted(ranked[i]);
            uint256 key = _finalKey(score, votes, w, tn, counted, scoreMax);
            if (i > 0 && !(key < prevKey || (key == prevKey && ranked[i] > prevWho))) revert InvalidSortOrder();
            prevKey = key;
            prevWho = ranked[i];
            unchecked { ++i; }
        }

        uint256 k = p.targetWinners < ranked.length ? p.targetWinners : ranked.length;
        winners = new address[](k);
        for (uint256 i; i < k; ) { winners[i] = ranked[i]; unchecked { ++i; } }
    }

    /// @dev The plan every winner gets. No plan set = one milestone for a winner's whole portion.
    function _planFor(uint256 pid, ScholarshipTypes.Program memory p)
        private view
        returns (uint256[] memory amounts, string[] memory descs, bytes32[] memory providers, bytes32[] memory ids)
    {
        uint256 share = p.totalFund / p.targetWinners;
        if (!planSet[pid]) {
            amounts = new uint256[](1);
            amounts[0] = share;
            return (amounts, new string[](0), new bytes32[](0), new bytes32[](0));
        }
        MilestonePlan storage plan = _plans[pid];
        uint256 n = plan.shareBps.length;
        amounts = new uint256[](n);
        uint256 assigned;
        for (uint256 i; i + 1 < n; ) {
            amounts[i] = (share * plan.shareBps[i]) / BPS;
            assigned += amounts[i];
            unchecked { ++i; }
        }
        amounts[n - 1] = share - assigned; // the remainder, so the milestones add up to exactly one portion
        return (amounts, plan.descriptions, plan.providers, plan.externalIds);
    }

    function _trim(address[] memory a, uint256 n) private pure returns (address[] memory out) {
        out = new address[](n);
        for (uint256 i; i < n; ) { out[i] = a[i]; unchecked { ++i; } }
    }

    /// @dev Insertion sort, descending by key; ties by ascending address. Fine for a view; never used in a transaction.
    function _sortDesc(address[] memory addrs, uint256[] memory keys, uint256 n) private pure returns (address[] memory out) {
        out = new address[](n);
        uint256[] memory k = new uint256[](n);
        for (uint256 i; i < n; ) {
            uint256 j = i;
            while (j > 0 && (keys[i] > k[j - 1] || (keys[i] == k[j - 1] && addrs[i] < out[j - 1]))) {
                out[j] = out[j - 1];
                k[j] = k[j - 1];
                unchecked { --j; }
            }
            out[j] = addrs[i];
            k[j] = keys[i];
            unchecked { ++i; }
        }
    }
}
