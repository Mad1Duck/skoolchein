import { addr, usdcAddr } from "@/lib/chain/addr";
import { scholarshipCoreAbi, scholarshipTreasuryAbi, mockUSDCAbi } from "@/constants/contractsV4";
import { parseUnits } from "viem";
import { useTxHook } from "./use-tx-base";
import { parseTokenAmount, nativeValueFor, isNativeToken } from "../token";


// ── USDC ──────────────────────────────────────────────────────────────────────

/**
 * Whether a payment needs an ERC20 approve() first. Native payments don't —
 * calling approve on the zero address would revert.
 */
export function needsApproval(token?: string | null): boolean {
  return !isNativeToken(token);
}

export function useApproveUSDC() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const approve = (spender: `0x${string}`, amountStr: string) => {
    writeContract({
      address: usdcAddr(),
      abi: mockUSDCAbi,
      functionName: "approve",
      args: [spender, parseUnits(amountStr, 6)],
    });
  };

  return { approve, isPending, isSuccess, error, hash, reset };
}

export function useMintUSDC() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const mint = (to: `0x${string}`, amountStr: string) => {
    writeContract({
      address: usdcAddr(),
      abi: mockUSDCAbi,
      functionName: "mint",
      args: [to, parseUnits(amountStr, 6)],
    });
  };

  return { mint, isPending, isSuccess, error, hash, reset };
}

// ── ScholarshipTreasury — Financial Actions ──────────────────────────────────

export function useDonate() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /**
   * @param token Program's payment token — pass `program.token` from the API.
   *              Native donations carry msg.value; ERC20 ones need a prior
   *              approve() (see useApproveUSDC / needsApproval).
   */
  const donate = (
    pid: bigint,
    amountStr: string,
    nftMetadataURI: string,
    token?: `0x${string}`,
  ) => {
    const amount = parseTokenAmount(amountStr, token);
    writeContract({
      address: addr("ScholarshipCore"),
      abi: scholarshipCoreAbi,
      functionName: "donate",
      args: [pid, amount, nftMetadataURI],
      value: nativeValueFor(amount, token),
    });
  };

  return { donate, isPending, isSuccess, error, hash, reset };
}

export function useClaimYield() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const claimYield = (pid: bigint, voteAddress: `0x${string}`) => {
    writeContract({
      address: addr("ScholarshipTreasury"),
      abi: scholarshipTreasuryAbi,
      functionName: "claimYield",
      args: [pid, voteAddress],
    });
  };

  return { claimYield, isPending, isSuccess, error, hash, reset };
}

/** Settle a confidence stake: the deposit (plus bonus, or minus the penalty) goes back to `voter`. */
export function useClaimConfidenceStake() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const claim = (pid: bigint, voter: `0x${string}`) => {
    writeContract({
      address: addr("ScholarshipTreasury"),
      abi: scholarshipTreasuryAbi,
      functionName: "claimConfidenceStake",
      args: [pid, voter],
    });
  };

  return { claim, isPending, isSuccess, error, hash, reset };
}

export function useFundBonusPool() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /** Native programs carry the amount as msg.value; ERC20 ones need the approve() from `useBonusPoolFlow`. */
  const fund = (pid: bigint, amountStr: string, token?: `0x${string}`) => {
    const amount = parseTokenAmount(amountStr, token);
    writeContract({
      address: addr("ScholarshipTreasury"),
      abi: scholarshipTreasuryAbi,
      functionName: "fundBonusPool",
      args: [pid, amount],
      value: nativeValueFor(amount, token),
    });
  };

  return { fund, isPending, isSuccess, error, hash, reset };
}

export function useClaimRefund() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const claimRefund = (pid: bigint, donor: `0x${string}`) => {
    writeContract({
      address: addr("ScholarshipTreasury"),
      abi: scholarshipTreasuryAbi,
      functionName: "claimRefund",
      args: [pid, donor],
    });
  };

  return { claimRefund, isPending, isSuccess, error, hash, reset };
}
