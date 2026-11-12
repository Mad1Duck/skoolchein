import { addr } from "@/lib/chain/addr";
import { committeeGovernanceAbi } from "@/constants/contractsV4";
import { useTxHook } from "./use-tx-base";


// ── CommitteeGovernance — Committee & Voting Actions ────────────────────────

export function useAddCommitteeMember() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const addMember = (pid: bigint, member: `0x${string}`) => {
    writeContract({
      address: addr("CommitteeGovernance"),
      abi: committeeGovernanceAbi,
      functionName: "addCommitteeMember",
      args: [pid, member],
    });
  };

  return { addMember, isPending, isSuccess, error, hash, reset };
}

export function useRemoveCommitteeMember() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const removeMember = (pid: bigint, member: `0x${string}`) => {
    writeContract({
      address: addr("CommitteeGovernance"),
      abi: committeeGovernanceAbi,
      functionName: "removeCommitteeMember",
      args: [pid, member],
    });
  };

  return { removeMember, isPending, isSuccess, error, hash, reset };
}

export function useCommitteeSubmitScore() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const submitScore = (args: {
    pid: bigint;
    applicant: `0x${string}`;
    academicScore: bigint;
    incomeScore: bigint;
    recommendScore: bigint;
  }) => {
    writeContract({
      address: addr("CommitteeGovernance"),
      abi: committeeGovernanceAbi,
      functionName: "submitScore",
      args: [
        args.pid,
        args.applicant,
        args.academicScore,
        args.incomeScore,
        args.recommendScore,
      ],
    });
  };

  return { submitScore, isPending, isSuccess, error, hash, reset };
}

export function useVoteOnDispute() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const voteOnDispute = (
    disputeId: bigint,
    pid: bigint,
    upholdDispute: boolean
  ) => {
    writeContract({
      address: addr("CommitteeGovernance"),
      abi: committeeGovernanceAbi,
      functionName: "voteOnDispute",
      args: [disputeId, pid, upholdDispute],
    });
  };

  return { voteOnDispute, isPending, isSuccess, error, hash, reset };
}

export function useVoteOnMilestone() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const voteOnMilestone = (
    milestoneId: bigint,
    pid: bigint,
    approve: boolean
  ) => {
    writeContract({
      address: addr("CommitteeGovernance"),
      abi: committeeGovernanceAbi,
      functionName: "voteOnMilestone",
      args: [milestoneId, pid, approve],
    });
  };

  return { voteOnMilestone, isPending, isSuccess, error, hash, reset };
}
