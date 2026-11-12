import { addr } from "@/lib/chain/addr";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { stringToHex } from "viem";
import { useTxHook } from "./use-tx-base";
import { NATIVE_TOKEN, parseTokenAmount, nativeValueFor } from "../token";


// ── Program Lifecycle ─────────────────────────────────────────────────────────

export function useCreateProgram() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const create = (args: {
    metadataCID: string;
    educationLevel: number;
    screeningMode: number;
    weights: {
      academicWeight: number;
      incomeWeight: number;
      essayWeight: number;
      recommendWeight: number;
      extracurricWeight: number;
    };
    slashDist: {
      bountyHunterPercent: number;
      treasuryPercent: number;
      protocolPercent: number;
    };
    maxCandidates: number;
    targetWinners: number;
    timeline: readonly [bigint, bigint, bigint, bigint];
    milestoneDisputeWindow: bigint;
    totalFund: string;
    maxOptionalMilestones: number;
    committeeContract: `0x${string}`;
    /** Payment token. Zero address = native currency. Must be whitelisted
     *  on-chain via setTokenConfig, else the call reverts TokenNotSupported. */
    token?: `0x${string}`;
  }) => {
    const token = (args.token ?? NATIVE_TOKEN) as `0x${string}`;
    // Decimals come from the chosen token (native 18 / USDC 6) — a hardcoded
    // 6 here would under-fund a native program by 10^12.
    const totalFund = parseTokenAmount(args.totalFund, token);

    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "createProgram",
      args: [
        args.metadataCID,
        args.educationLevel,
        args.screeningMode,
        args.weights,
        args.slashDist,
        args.maxCandidates,
        args.targetWinners,
        args.timeline,
        args.milestoneDisputeWindow,
        totalFund,
        args.maxOptionalMilestones,
        args.committeeContract,
        token,
      ],
      // Native funds travel as msg.value; ERC20 relies on a prior approve().
      value: nativeValueFor(totalFund, token),
    });
  };

  return { create, isPending, isSuccess, error, hash, reset };
}

export function useOpenApplications() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const openApplications = (pid: bigint) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "openApplications",
      args: [pid],
    });
  };
  return { openApplications, isPending, isSuccess, error, hash, reset };
}

export function useOpenScreening() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const openScreening = (pid: bigint) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "openScreening",
      args: [pid],
    });
  };
  return { openScreening, isPending, isSuccess, error, hash, reset };
}

export function useCancelProgram() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const cancelProgram = (pid: bigint) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "cancelProgram",
      args: [pid],
    });
  };
  return { cancelProgram, isPending, isSuccess, error, hash, reset };
}

export function useResolveShortlistBatch() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const resolveShortlistBatch = (pid: bigint, rankedSegment: `0x${string}`[], isLastBatch: boolean) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "resolveShortlistBatch",
      args: [pid, rankedSegment, isLastBatch],
    });
  };
  return { resolveShortlistBatch, isPending, isSuccess, error, hash, reset };
}

export function useSelectWinners() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const selectWinners = (
    pid: bigint,
    ranked: `0x${string}`[],
    amounts: bigint[][],
    descs: string[][],
    providers: string[][],
    externalIds: string[][]
  ) => {
    const hexProviders = providers.map(row => row.map(s => stringToHex(s || "", { size: 32 })));
    const hexExternalIds = externalIds.map(row => row.map(s => stringToHex(s || "", { size: 32 })));

    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "selectWinners",
      args: [pid, ranked, amounts, descs, hexProviders, hexExternalIds],
    });
  };
  return { selectWinners, isPending, isSuccess, error, hash, reset };
}

export function useToggleOpenDonation() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const toggle = (pid: bigint, open: boolean) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "toggleOpenDonation",
      args: [pid, open],
    });
  };
  return { toggle, isPending, isSuccess, error, hash, reset };
}

// ── Applications & Screening ──────────────────────────────────────────────────

export function useApplyProgram() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const apply = (args: {
    pid: bigint;
    profileCID: string;
    documentCID: string;
    essayCID: string;
    recommendCID: string;
    academicScore: bigint;
    incomeScore: bigint;
    recommendScore: bigint;
  }) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "applyToProgram",
      args: [
        args.pid,
        args.profileCID,
        args.documentCID,
        args.essayCID,
        args.recommendCID,
        args.academicScore,
        args.incomeScore,
        args.recommendScore,
      ],
    });
  };
  return { apply, isPending, isSuccess, error, hash, reset };
}

export function useSubmitScore() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const submitScore = (args: {
    pid: bigint;
    applicant: `0x${string}`;
    academicScore: bigint;
    incomeScore: bigint;
    recommendScore: bigint;
    committeeAddress: `0x${string}`;
  }) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "submitCommitteeScore",
      args: [
        args.pid,
        args.applicant,
        args.academicScore,
        args.incomeScore,
        args.recommendScore,
        args.committeeAddress,
      ],
    });
  };
  return { submitScore, isPending, isSuccess, error, hash, reset };
}

// ── Voting ────────────────────────────────────────────────────────────────────

export function useVoteForCandidate() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const vote = (pid: bigint, candidate: `0x${string}`, useReputation: boolean) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "voteForCandidate",
      args: [pid, candidate, useReputation],
    });
  };
  return { vote, isPending, isSuccess, error, hash, reset };
}

export function usePlaceConfidenceStake() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  /**
   * @param token Program's payment token — pass `program.token` from the API.
   *              Determines both the decimals and whether funds travel as
   *              msg.value (native) or via a prior approve() (ERC20).
   */
  const stake = (
    pid: bigint,
    scholar: `0x${string}`,
    amountStr: string,
    token?: `0x${string}`,
  ) => {
    const amount = parseTokenAmount(amountStr, token);
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "placeConfidenceStake",
      args: [pid, scholar, amount],
      value: nativeValueFor(amount, token),
    });
  };
  return { stake, isPending, isSuccess, error, hash, reset };
}

export function useSetBounty() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const setBounty = (bounty: `0x${string}`) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "setBounty",
      args: [bounty],
    });
  };

  return { setBounty, isPending, isSuccess, error, hash, reset };
}

// ── NFT Credentials ─────────────────────────────────────────────────────────────

export function useClaimStudentNFT() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const claim = (pid: bigint, metadataURI: string) => {
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "claimStudentNFT",
      args: [pid, metadataURI],
    });
  };

  return { claim, isPending, isSuccess, error, hash, reset };
}
