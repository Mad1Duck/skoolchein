import { scholarshipAdminAbi, v4Addresses } from "@/constants/contractsV4";
import { useTxHook } from "./use-tx-base";

const ADMIN_ADDRESS = v4Addresses.ScholarshipAdmin;

// ── ScholarshipAdmin — Protocol & Lifecycle Date Management ─────────────────

export function useExtendApplicationDeadline() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const extendApplicationDeadline = (pid: bigint, newEnd: bigint) => {
    writeContract({
      address: ADMIN_ADDRESS,
      abi: scholarshipAdminAbi,
      functionName: "extendApplicationDeadline",
      args: [pid, newEnd],
    });
  };

  return { extendApplicationDeadline, isPending, isSuccess, error, hash, reset };
}

export function useExtendVotingDeadline() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const extendVotingDeadline = (pid: bigint, newEnd: bigint) => {
    writeContract({
      address: ADMIN_ADDRESS,
      abi: scholarshipAdminAbi,
      functionName: "extendVotingDeadline",
      args: [pid, newEnd],
    });
  };

  return { extendVotingDeadline, isPending, isSuccess, error, hash, reset };
}


export function useUpdateProtocolConfig() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const updateProtocolConfig = (config: unknown) => {
    writeContract({
      address: ADMIN_ADDRESS,
      abi: scholarshipAdminAbi,
      functionName: "setProtocolConfig",
      args: [config as never],
    });
  };

  return { updateProtocolConfig, isPending, isSuccess, error, hash, reset };
}

export function useAdminForceStatus() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const forceStatus = (pid: bigint, newStatus: number) => {
    writeContract({
      address: ADMIN_ADDRESS,
      abi: scholarshipAdminAbi,
      functionName: "adminForceStatus",
      args: [pid, newStatus],
    });
  };

  return { forceStatus, isPending, isSuccess, error, hash, reset };
}

export function useAdminUpdateDates() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const updateDates = (
    pid: bigint,
    appStart: bigint,
    appEnd: bigint,
    voteStart: bigint,
    voteEnd: bigint
  ) => {
    writeContract({
      address: ADMIN_ADDRESS,
      abi: scholarshipAdminAbi,
      functionName: "adminUpdateDates",
      args: [pid, appStart, appEnd, voteStart, voteEnd],
    });
  };

  return { updateDates, isPending, isSuccess, error, hash, reset };
}
