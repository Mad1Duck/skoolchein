import { addr } from "@/lib/chain/addr";
import { scholarshipBountyAbi } from "@/constants/contractsV4";
import { useTxHook } from "./use-tx-base";


// ── ScholarshipBounty — Security & Dispute Actions ───────────────────────────

export function useRaiseDispute() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const raiseDispute = (
    pid: bigint,
    scholar: `0x${string}`,
    milestoneId: bigint,
    disputeType: number,
    evidenceCID: string
  ) => {
    writeContract({
      address: addr("ScholarshipBounty"),
      abi: scholarshipBountyAbi,
      functionName: "raiseDispute",
      args: [pid, scholar, milestoneId, disputeType, evidenceCID],
    });
  };

  return { raiseDispute, isPending, isSuccess, error, hash, reset };
}

export function useDefendDispute() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const submitDefense = (disputeId: bigint, evidenceCID: string) => {
    writeContract({
      address: addr("ScholarshipBounty"),
      abi: scholarshipBountyAbi,
      functionName: "submitCounterEvidence",
      args: [disputeId, evidenceCID],
    });
  };

  return { submitDefense, isPending, isSuccess, error, hash, reset };
}

export function useConcedeDispute() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const concede = (disputeId: bigint) => {
    writeContract({
      address: addr("ScholarshipBounty"),
      abi: scholarshipBountyAbi,
      functionName: "concede",
      args: [disputeId],
    });
  };

  return { concede, isPending, isSuccess, error, hash, reset };
}

export function useTriggerAutoGuilty() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const triggerAutoGuilty = (disputeId: bigint) => {
    writeContract({
      address: addr("ScholarshipBounty"),
      abi: scholarshipBountyAbi,
      functionName: "triggerAutoGuilty",
      args: [disputeId],
    });
  };

  return { triggerAutoGuilty, isPending, isSuccess, error, hash, reset };
}
