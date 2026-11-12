import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { addr } from "@/lib/chain/addr";
import { getV4Addresses } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { useApproveUSDC } from "./treasury";
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

// ── Dispute deposit ──────────────────────────────────────────────────────────
//
// raiseDispute pulls the reporter's deposit in USDC (safeTransferFrom), so it
// needs a prior approve(Bounty, stake). The deposit comes from the on-chain
// view calculateStake(scholar, pid) — 10% of the possible reward, which itself
// is a share of the scholar's REMAINING fund — and DOUBLES when the report is
// raised within 6 hours of the milestone's dispute deadline.

/** Deposit and possible reward for reporting `scholar` in program `pid` (USDC, 6 decimals). */
export function useBountyStake(scholar?: `0x${string}`, pid?: bigint) {
  const { chainId } = useActiveChain();
  const enabled = Boolean(scholar) && pid !== undefined;

  const q = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipBounty,
    abi: scholarshipBountyAbi,
    functionName: "calculateStake",
    args: enabled ? [scholar!, pid!] : undefined,
    query: { enabled },
  });

  const [stakeRequired, potentialReward] = (q.data as readonly [bigint, bigint] | undefined) ?? [0n, 0n];
  return { stakeRequired, potentialReward, isLoading: q.isLoading, isError: q.isError };
}

/**
 * Report a problem: approve the deposit, then raise the dispute.
 * Approves 2x the base deposit so the anti-griefing doubling never fails on allowance.
 */
export function useRaiseDisputeWithStake() {
  const approveTx = useApproveUSDC();
  const raiseTx = useRaiseDispute();
  const [phase, setPhase] = useState<"idle" | "approving" | "raising">("idle");
  const pending = useRef<Parameters<typeof raiseTx.raiseDispute> | null>(null);

  const start = (
    args: Parameters<typeof raiseTx.raiseDispute>,
    stakeRequired: bigint,
  ) => {
    pending.current = args;
    if (stakeRequired > 0n) {
      setPhase("approving");
      approveTx.approve(addr("ScholarshipBounty"), formatUnits(stakeRequired * 2n, 6));
    } else {
      setPhase("raising");
      raiseTx.raiseDispute(...args);
    }
  };

  useEffect(() => {
    if (phase === "approving" && approveTx.isSuccess && pending.current) {
      setPhase("raising");
      raiseTx.raiseDispute(...pending.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, approveTx.isSuccess]);

  const reset = () => {
    approveTx.reset();
    raiseTx.reset();
    pending.current = null;
    setPhase("idle");
  };

  return {
    start,
    phase,
    isPending: approveTx.isPending || raiseTx.isPending,
    isSuccess: raiseTx.isSuccess,
    error: approveTx.error ?? raiseTx.error,
    reset,
  };
}
