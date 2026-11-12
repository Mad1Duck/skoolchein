import { useReadContract, useSignTypedData } from "wagmi";
import { hexToString, stringToHex } from "viem";
import { addr } from "@/lib/chain/addr";
import { getV4Addresses } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { scholarshipSelectionAbi } from "@/constants/contractsV4";
import { useTxHook } from "./use-tx-base";
import { RECOMMENDATION_TYPES, type SignedRecommendation } from "@/lib/recommendations";

/**
 * ScholarshipSelection: ranks the shortlist and chooses winners.
 *
 * The contract verifies every ordering on-chain, so the order is simply read from
 * rankApplicants() / rankShortlist() and handed back; nobody has to compute it.
 */

/** Address of the Selection contract on the active chain, or undefined when it is not deployed there. */
export function useSelectionAddress() {
  const { chainId } = useActiveChain();
  return getV4Addresses(chainId).ScholarshipSelection;
}

function useSelectionRead(functionName: string, args: readonly unknown[] = [], enabled = true) {
  const { chainId } = useActiveChain();
  const address = getV4Addresses(chainId).ScholarshipSelection;
  // wagmi's generated overloads can't take a runtime function name, so the result is typed loosely.
  return useReadContract({
    chainId,
    address,
    abi: scholarshipSelectionAbi,
    functionName: functionName as never,
    args: args as never,
    query: { enabled: !!address && enabled },
  }) as unknown as { data: unknown; isLoading: boolean; isError: boolean; error: Error | null; refetch: () => unknown };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Applicants still waiting to be processed, best first: the exact list resolveShortlist expects. */
export function useRankedApplicants(pid: number, enabled = true) {
  const r = useSelectionRead("rankApplicants", [BigInt(pid)], enabled);
  return { ...r, data: r.data as readonly `0x${string}`[] | undefined };
}

/** The whole shortlist ordered by final score, best first: the exact list selectWinners expects. */
export function useRankedShortlist(pid: number, enabled = true) {
  const r = useSelectionRead("rankShortlist", [BigInt(pid)], enabled);
  return { ...r, data: r.data as readonly `0x${string}`[] | undefined };
}

export interface SelectionConfig {
  /** Highest vote share of the final score a creator may choose, in basis points (10_000 = 100%). */
  maxVoteWeightBps: number;
  /** Used when a creator did not choose. */
  defaultVoteWeightBps: number;
  /** One donor's counted vote power as a share of the program fund (0 = no cap). */
  voterCapBps: number;
}

export function useSelectionConfig() {
  const r = useSelectionRead("config");
  const t = r.data as readonly [number, number, number] | undefined;
  const config: SelectionConfig | undefined = t
    ? { maxVoteWeightBps: Number(t[0]), defaultVoteWeightBps: Number(t[1]), voterCapBps: Number(t[2]) }
    : undefined;
  return { ...r, config };
}

/** The vote weight that will apply to a program (the creator's choice, else the default, capped by the admin's max). */
export function useEffectiveVoteWeight(pid: number) {
  const r = useSelectionRead("effectiveVoteWeightBps", [BigInt(pid)]);
  return { ...r, weightBps: r.data !== undefined ? Number(r.data as bigint) : undefined };
}

export interface MilestonePlan {
  shareBps: number[];
  descriptions: string[];
  providers: string[];
  externalIds: string[];
}

/** The milestone plan the creator saved (empty arrays when none). */
export function useMilestonePlan(pid: number) {
  const r = useSelectionRead("getPlan", [BigInt(pid)]);
  const raw = r.data as
    | { shareBps: readonly number[]; descriptions: readonly string[]; providers: readonly `0x${string}`[]; externalIds: readonly `0x${string}`[] }
    | undefined;
  const plan: MilestonePlan | undefined = raw
    ? {
        shareBps: raw.shareBps.map(Number),
        descriptions: [...raw.descriptions],
        providers: raw.providers.map(bytes32ToText),
        externalIds: raw.externalIds.map(bytes32ToText),
      }
    : undefined;
  return { ...r, plan };
}

function bytes32ToText(hex: `0x${string}`): string {
  try {
    // Trailing zero bytes are padding, not part of the text.
    return hexToString(hex, { size: 32 }).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

// ── Writes ────────────────────────────────────────────────────────────────────

/** Resolve one batch of the shortlist. `ranked` must be the leading part of rankApplicants(). */
export function useResolveShortlist() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const resolveShortlist = (pid: bigint, ranked: readonly `0x${string}`[], isLast: boolean) => {
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "resolveShortlist",
      args: [pid, ranked, isLast],
    });
  };
  return { resolveShortlist, isPending, isSuccess, error, hash, reset };
}

/**
 * Pick the winners. Public program: `ranked` is the complete shortlist from rankShortlist().
 * Private program: the creator's own choice among the shortlisted.
 */
export function useSelectWinners() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const selectWinners = (pid: bigint, ranked: readonly `0x${string}`[]) => {
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "selectWinners",
      args: [pid, ranked],
    });
  };
  return { selectWinners, isPending, isSuccess, error, hash, reset };
}

/** Creator: choose the vote weight and the milestone plan every winner receives. */
export function useConfigureProgram() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const configureProgram = (pid: bigint, weightBps: number, plan: MilestonePlan) => {
    // The contract accepts an empty array (or one entry per milestone). Skip the arrays nobody filled in.
    const descs = plan.descriptions.some((d) => d.trim()) ? plan.descriptions : [];
    const providers = plan.providers.some((p) => p) ? plan.providers.map((p) => stringToHex(p, { size: 32 })) : [];
    const ids = plan.externalIds.some((e) => e) ? plan.externalIds.map((e) => stringToHex(e, { size: 32 })) : [];
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "configureProgram",
      args: [pid, weightBps, plan.shareBps, descs, providers, ids],
    });
  };
  return { configureProgram, isPending, isSuccess, error, hash, reset };
}

/** Admin: set the maximum and default vote weight, and the per-voter cap. All in basis points. */
export function useSetSelectionConfig() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const setConfig = (maxVoteWeightBps: number, defaultVoteWeightBps: number, voterCapBps: number) => {
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "setConfig",
      args: [maxVoteWeightBps, defaultVoteWeightBps, voterCapBps],
    });
  };
  return { setConfig, isPending, isSuccess, error, hash, reset };
}

// ── Recommendations ───────────────────────────────────────────────────────────

/** How many verified recommendations an applicant has, and their average. */
export function useRecommendationOf(pid: number, student: string | undefined) {
  const r = useSelectionRead("recommendationOf", [BigInt(pid), student], !!student);
  const t = r.data as readonly [bigint, bigint] | undefined;
  return { ...r, count: t ? Number(t[0]) : 0, average: t ? Number(t[1]) : 0 };
}

/** Whether the creator has put `who` on the program's recommender list. */
export function useIsRecommender(pid: number, who: string | undefined) {
  const r = useSelectionRead("isRecommender", [BigInt(pid), who], !!who);
  return { ...r, allowed: Boolean(r.data) };
}

/** Sign a recommendation with the connected wallet (nothing is sent on-chain). */
export function useSignRecommendation() {
  const selection = useSelectionAddress();
  const { chainId } = useActiveChain();
  const { signTypedDataAsync, isPending } = useSignTypedData();

  const sign = async (args: Omit<SignedRecommendation, "signature" | "recommender"> & { recommender: `0x${string}` }): Promise<SignedRecommendation> => {
    if (!selection) throw new Error("The selection contract is not deployed on this network.");
    const signature = await signTypedDataAsync({
      domain: { name: "ScholarshipSelection", version: "1", chainId, verifyingContract: selection },
      types: RECOMMENDATION_TYPES,
      primaryType: "Recommendation",
      message: { pid: BigInt(args.pid), student: args.student, score: args.score, deadline: BigInt(args.deadline) },
    });
    return { ...args, signature };
  };
  return { sign, isSigning: isPending };
}

/** Deliver a signed recommendation to the contract. Anyone can pay for this. */
export function useSubmitRecommendation() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const submit = (r: SignedRecommendation) => {
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "submitRecommendation",
      args: [BigInt(r.pid), r.student, r.recommender, r.score, BigInt(r.deadline), r.signature],
    });
  };
  return { submit, isPending, isSuccess, error, hash, reset };
}

/** Creator: limit who may recommend applicants, and add allowed addresses. */
export function useConfigureRecommenders() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();
  const configure = (pid: bigint, restricted: boolean, add: `0x${string}`[], remove: `0x${string}`[] = []) => {
    writeContract({
      address: addr("ScholarshipSelection"),
      abi: scholarshipSelectionAbi,
      functionName: "configureRecommenders",
      args: [pid, restricted, add, remove],
    });
  };
  return { configure, isPending, isSuccess, error, hash, reset };
}
