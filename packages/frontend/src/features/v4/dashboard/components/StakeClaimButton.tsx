import { useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { NeoButton } from '@/components/ui/NeoButton';
import { scholarshipTreasuryAbi } from '@/constants/contractsV4';
import { getV4Addresses } from '@/lib/chain/chains';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { useClaimConfidenceStake } from '@/lib/contracts/v4/hooks/treasury';
import { useT } from '@/lib/i18n';

/**
 * Settles a supporter's deposit once the scholar's outcome is known: the deposit comes back, with
 * the bonus if the scholar completed the program, or minus the penalty if they were penalized.
 * Until the outcome is decided the button stays off, so no transaction is wasted.
 */
export function StakeClaimButton({ pid, voter }: { pid: number; voter: string }) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { claim, isPending, isSuccess } = useClaimConfidenceStake();

  const { data, refetch } = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: 'stakeStatus',
    args: [BigInt(pid), voter as `0x${string}`],
  });
  const settled = Array.isArray(data) ? Boolean(data[0]) : false;

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  return (
    <NeoButton
      label={isPending ? t('stake.claiming') : settled ? t('stake.claim') : t('stake.claimNotYet')}
      variant={settled ? 'success' : 'ghost'}
      size="sm"
      loading={isPending}
      disabled={!settled || isPending}
      onClick={() => claim(BigInt(pid), voter as `0x${string}`)}
    />
  );
}
