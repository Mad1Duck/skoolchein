import { useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { erc20Abi } from "viem";
import { addr } from "@/lib/chain/addr";
import { getV4Addresses } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { isNativeToken } from "../token";
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
    evidenceCID: string,
    /** Deposit sent as value, for a native-currency program only. */
    value?: bigint
  ) => {
    writeContract({
      address: addr("ScholarshipBounty"),
      abi: scholarshipBountyAbi,
      functionName: "raiseDispute",
      args: [pid, scholar, milestoneId, disputeType, evidenceCID],
      value,
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
// The reporter's deposit is paid in the PROGRAM'S token: sent as value for the
// native currency, otherwise pulled after approve(Bounty, stake). It comes from the on-chain
// view calculateStake(scholar, pid) — 10% of the possible reward, which itself
// is a share of the scholar's REMAINING fund — and DOUBLES when the report is
// raised within 6 hours of the milestone's dispute deadline.

/** Deposit and possible reward for reporting `scholar` in program `pid`, in the program's token. */
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
 * Report a problem. A native-currency deposit travels with the report; a token deposit is approved
 * first (for twice the base amount, so the late-report doubling never fails on allowance).
 */
export function useRaiseDisputeWithStake() {
  const approveTx = useTxHook();
  const raiseTx = useRaiseDispute();
  const [phase, setPhase] = useState<"idle" | "approving" | "raising">("idle");
  const pending = useRef<Parameters<typeof raiseTx.raiseDispute> | null>(null);

  const start = (
    args: [pid: bigint, scholar: `0x${string}`, milestoneId: bigint, disputeType: number, evidenceCID: string],
    deposit: { token: string; amount: bigint },
  ) => {
    pending.current = args;
    if (isNativeToken(deposit.token)) {
      setPhase("raising");
      raiseTx.raiseDispute(...args, deposit.amount);
    } else if (deposit.amount > 0n) {
      setPhase("approving");
      approveTx.writeContract({
        address: deposit.token as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [addr("ScholarshipBounty"), deposit.amount * 2n],
      });
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
