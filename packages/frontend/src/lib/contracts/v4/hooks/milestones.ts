import { addr } from "@/lib/chain/addr";
import { milestoneManagerAbi } from "@/constants/contractsV4";
import { stringToHex } from "viem";
import { useTxHook } from "./use-tx-base";


// ── MilestoneManager — Scholar & Committee Actions ──────────────────────────

export function useSubmitMilestone() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const submitMilestone = (milestoneId: bigint, proofCID: string) => {
    writeContract({
      address: addr("MilestoneManager"),
      abi: milestoneManagerAbi,
      functionName: "submitProof",
      args: [milestoneId, proofCID],
    });
  };

  return { submitMilestone, isPending, isSuccess, error, hash, reset };
}

export function useExecuteMilestone() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const executeMilestone = (milestoneId: bigint) => {
    writeContract({
      address: addr("MilestoneManager"),
      abi: milestoneManagerAbi,
      functionName: "executeMilestone",
      args: [milestoneId],
    });
  };

  return { executeMilestone, isPending, isSuccess, error, hash, reset };
}

/** The creator accepts a submitted milestone now: the funds are released in the same transaction. */
export function useApproveSubmission() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const approve = (milestoneId: bigint) => {
    writeContract({
      address: addr("MilestoneManager"),
      abi: milestoneManagerAbi,
      functionName: "approveSubmission",
      args: [milestoneId],
    });
  };

  return { approve, isPending, isSuccess, error, hash, reset };
}

/** The creator sends a submitted milestone back to the scholar, with an IPFS document explaining why. */
export function useRequestRevision() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const requestRevision = (milestoneId: bigint, reasonCID: string) => {
    writeContract({
      address: addr("MilestoneManager"),
      abi: milestoneManagerAbi,
      functionName: "requestRevision",
      args: [milestoneId, reasonCID],
    });
  };

  return { requestRevision, isPending, isSuccess, error, hash, reset };
}

export function useProposeMilestone() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /**
   * @param kind 1 = OPTIONAL, 2 = NEGOTIATED (0 = MANDATORY — not allowed here)
   */
  const proposeMilestone = (
    pid: bigint,
    kind: number,
    amount: bigint,
    descriptionCID: string,
    provider: string,
    externalId: string
  ) => {
    writeContract({
      address: addr("MilestoneManager"),
      abi: milestoneManagerAbi,
      functionName: "proposeMilestone",
      args: [
        pid,
        kind,
        amount,
        descriptionCID,
        stringToHex(provider || "", { size: 32 }),
        stringToHex(externalId || "", { size: 32 })
      ],
    });
  };

  return { proposeMilestone, isPending, isSuccess, error, hash, reset };
}
