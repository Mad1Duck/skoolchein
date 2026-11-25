import { useReadContract, useReadContracts } from "wagmi";
import { addr, usdcAddr } from "@/lib/chain/addr";
import { useActiveChain, useV4Addresses } from "@/lib/chain/useActiveChain";
import { scholarshipCoreAbi, scholarshipTreasuryAbi, mockUSDCAbi } from "@/constants/contractsV4";
import { parseUnits } from "viem";
import { useTxHook } from "./use-tx-base";
import { parseTokenAmount, nativeValueFor, isNativeToken, formatTokenWithSymbol } from "../token";
import { describeNextTx } from "@/lib/tx/txStore";


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
    describeNextTx(formatTokenWithSymbol(amount, token));
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
    describeNextTx(formatTokenWithSymbol(amount, token));
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

/** What the Treasury still holds for a program. Only read once the program is completed. */
export function useLeftoverBalance(program: { pid: number; status: string } | undefined) {
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const completed = program?.status === "COMPLETED";
  const { data, refetch } = useReadContract({
    chainId,
    address: v4.ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: "programBalance",
    args: program ? [BigInt(program.pid)] : undefined,
    query: { enabled: completed },
  });
  return { balance: completed ? (data as bigint | undefined) : undefined, refetch };
}

/** What each wallet got from a program's leftover fund, keyed by lower-case address. */
export function useLeftoverShares(pid: number | undefined, wallets: string[]) {
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const { data, refetch } = useReadContracts({
    contracts: wallets.map((wallet) => ({
      chainId,
      address: v4.ScholarshipTreasury,
      abi: scholarshipTreasuryAbi,
      functionName: "leftoverReceived" as const,
      args: [BigInt(pid ?? 0), wallet as `0x${string}`] as const,
    })),
    query: { enabled: pid !== undefined && wallets.length > 0 },
  });

  const shares = new Map<string, bigint>();
  let total = 0n;
  wallets.forEach((wallet, i) => {
    const amount = (data?.[i]?.result as bigint | undefined) ?? 0n;
    shares.set(wallet.toLowerCase(), amount);
    total += amount;
  });
  return { shares, total, refetch };
}

/** A donor's donation still held for them. Only read for a cancelled program. */
export function useRefundableDonation(program: { pid: number; status: string }, donor: `0x${string}` | undefined) {
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const enabled = program.status === "CANCELLED" && !!donor;
  const { data, refetch } = useReadContract({
    chainId,
    address: v4.ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: "donorBalance",
    args: donor ? [BigInt(program.pid), donor] : undefined,
    query: { enabled },
  });
  return { amount: enabled ? (data as bigint | undefined) : undefined, refetch };
}

/** Share a completed program's unspent fund among the scholars who finished it. Anyone may call it. */
export function useReleaseLeftover() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const releaseLeftover = (pid: bigint) => {
    writeContract({
      address: addr("ScholarshipTreasury"),
      abi: scholarshipTreasuryAbi,
      functionName: "releaseLeftover",
      args: [pid],
    });
  };

  return { releaseLeftover, isPending, isSuccess, error, hash, reset };
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
