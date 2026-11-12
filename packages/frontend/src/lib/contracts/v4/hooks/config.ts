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
  const cfg = data as { minCandidates: number; maxCandidates: number; maxOptionalMilestones: number } | undefined;
  return {
    minCandidates: Number(cfg?.minCandidates ?? 5),
    maxCandidates: Number(cfg?.maxCandidates ?? 20),
    maxOptional: Number(cfg?.maxOptionalMilestones ?? 5),
    loaded: Boolean(cfg),
  };
}
