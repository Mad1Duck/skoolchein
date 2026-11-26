import { useReadContract, useReadContracts } from "wagmi";
import { zeroAddress } from "viem";
import { useActiveChain, useV4Addresses } from "@/lib/chain/useActiveChain";
import { scholarshipBountyAbi, scholarshipCoreAbi, scholarshipTreasuryAbi } from "@/constants/contractsV4";
import { splitCancelled, splitLeftover } from "@/lib/fundSplit";

/** Position of COMPLETED in the contract's StudentStatus enum. */
const COMPLETED = 1;

/**
 * Preview of `releaseLeftover`, read from the chain the same way the contract decides it.
 * `data` is undefined until every figure is in.
 */
export function useLeftoverPreview(pid: number, enabled: boolean) {
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const args = [BigInt(pid)] as const;
  const core = { chainId, address: v4.ScholarshipCore, abi: scholarshipCoreAbi } as const;

  const balanceQ = useReadContract({
    chainId,
    address: v4.ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: "programBalance",
    args,
    query: { enabled },
  });
  const listQ = useReadContract({ ...core, functionName: "getShortlist", args, query: { enabled } });
  const list = (listQ.data ?? []) as readonly `0x${string}`[];

  const scholarsQ = useReadContracts({
    contracts: list.map((wallet) => ({ ...core, functionName: "getScholar" as const, args: [wallet, BigInt(pid)] as const })),
    allowFailure: false,
    query: { enabled: enabled && list.length > 0 },
  });
  const reportsQ = useReadContracts({
    contracts: list.map((wallet) => ({
      chainId,
      address: v4.ScholarshipBounty,
      abi: scholarshipBountyAbi,
      functionName: "activeDisputeForScholar" as const,
      args: [wallet, BigInt(pid)] as const,
    })),
    allowFailure: false,
    query: { enabled: enabled && list.length > 0 },
  });

  const balance = balanceQ.data as bigint | undefined;
  const scholars = scholarsQ.data as unknown as { wallet: string; status: number }[] | undefined;
  const reports = reportsQ.data as unknown as bigint[] | undefined;
  const loaded =
    balance !== undefined && listQ.data !== undefined && (list.length === 0 || (!!scholars && !!reports));

  let data;
  if (loaded) {
    // Shortlisted candidates who were not chosen have no scholar record.
    const winners = (scholars ?? [])
      .map((s, i) => ({ ...s, reportOpen: reports![i] !== 0n }))
      .filter((s) => s.wallet !== zeroAddress);
    const finishers = winners.filter((s) => s.status === COMPLETED).map((s) => s.wallet);
    data = {
      balance,
      shares: splitLeftover(balance, finishers),
      excluded: winners.filter((s) => s.status !== COMPLETED).map((s) => s.wallet),
      waitingOnReport: winners.some((s) => s.reportOpen),
    };
  }
  const isError = balanceQ.isError || listQ.isError || scholarsQ.isError || reportsQ.isError;
  return { data, isError };
}

/** Preview of `settleCancelledProgram`. `data` is undefined until every figure is in. */
export function useCancelledPreview(pid: number, enabled: boolean) {
  const { chainId } = useActiveChain();
  const v4 = useV4Addresses();
  const treasury = { chainId, address: v4.ScholarshipTreasury, abi: scholarshipTreasuryAbi } as const;
  const args = [BigInt(pid)] as const;

  const totalsQ = useReadContracts({
    contracts: [
      { ...treasury, functionName: "programBalance", args },
      { ...treasury, functionName: "programTotalDonated", args },
      { ...treasury, functionName: "getProgramDonors", args },
      { ...treasury, functionName: "maxPushRefundDonors" },
    ],
    allowFailure: false,
    query: { enabled },
  });
  const [balance, donated, donorList, cap] = (totalsQ.data ?? []) as unknown as [
    bigint?, bigint?, (readonly `0x${string}`[])?, number?,
  ];
  const donors = donorList ?? [];

  const donationsQ = useReadContracts({
    contracts: donors.map((wallet) => ({ ...treasury, functionName: "donorBalance" as const, args: [BigInt(pid), wallet] as const })),
    allowFailure: false,
    query: { enabled: enabled && donors.length > 0 },
  });
  const donations = donationsQ.data as unknown as bigint[] | undefined;
  const loaded =
    balance !== undefined && donated !== undefined && donorList !== undefined && cap !== undefined &&
    (donors.length === 0 || !!donations);

  const data = loaded
    ? {
        balance,
        ...splitCancelled(balance, donated, donors.map((wallet, i) => ({ wallet, donated: donations![i] })), Number(cap)),
      }
    : undefined;
  return { data, isError: totalsQ.isError || donationsQ.isError };
}
