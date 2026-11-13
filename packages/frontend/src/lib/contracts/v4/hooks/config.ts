import { useReadContract } from "wagmi";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { getV4Addresses } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";

/**
 * Protocol limits that createProgram enforces on-chain (ScholarshipCore.getProtocolConfig).
 * Mirror them in the form so a value outside the range is caught before the wallet
 * prompt instead of reverting (e.g. maxCandidates=150 -> InvalidCandidateRange).
 * Falls back to the contract's defaults while the read is loading.
 */
export function useProtocolLimits() {
  const { chainId } = useActiveChain();
  const { data } = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "getProtocolConfig",
  });
  const cfg = data as { minCandidates: number; maxCandidates: number; maxOptionalMilestones: number; screeningThreshold: bigint; scoreMax: bigint; maxMandatoryMilestones: number; confidenceBonusPct: number; confidenceSlashPct: number } | undefined;
  return {
    minCandidates: Number(cfg?.minCandidates ?? 5),
    maxCandidates: Number(cfg?.maxCandidates ?? 20),
    maxOptional: Number(cfg?.maxOptionalMilestones ?? 5),
    maxMandatory: Number(cfg?.maxMandatoryMilestones ?? 10),
    /** Minimum screening score to be shortlisted (admin-set; contract default 600). */
    screeningThreshold: Number(cfg?.screeningThreshold ?? 600),
    /** Bonus a supporter earns when their scholar succeeds, as a % of the deposit (admin-set; default 20). */
    confidenceBonusPct: Number(cfg?.confidenceBonusPct ?? 20),
    /** Share of the deposit lost when their scholar is penalized (admin-set; default 50). */
    confidenceSlashPct: Number(cfg?.confidenceSlashPct ?? 50),
    /** The top of the screening scale (contract default 1000). */
    scoreMax: Number(cfg?.scoreMax ?? 1000),
    loaded: Boolean(cfg),
  };
}
