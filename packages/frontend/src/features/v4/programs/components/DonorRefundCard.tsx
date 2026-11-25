import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { NeoButton } from '@/components/ui/NeoButton';
import { useClaimRefund, useRefundableDonation } from '@/lib/contracts/v4/hooks/treasury';
import { formatTokenCompact } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import type { Program } from '@/lib/api/types';

/**
 * For a donor of a cancelled program whose donation was not sent back automatically (that happens
 * when a program has more donors than the contract pays in one go). Hidden for everyone else.
 */
export function DonorRefundCard({ program }: { program: Program }) {
  const { t } = useT();
  const { address } = useAccount();
  const { amount, refetch } = useRefundableDonation(program, address);
  const { claimRefund, isPending, isSuccess } = useClaimRefund();

  useEffect(() => {
    if (isSuccess) void refetch();
  }, [isSuccess, refetch]);

  if (!address || !amount) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border-2 border-black bg-skyellow p-5 shadow-[3px_3px_0_0_#000]">
      <div>
        <p className="font-paytone text-lg">{t('refund.title')}</p>
        <p className="text-sm">{t('refund.hint', { amount: formatTokenCompact(amount, program.token) })}</p>
      </div>
      <NeoButton
        label={isPending ? t('common.processing') : t('refund.claim')}
        variant="secondary"
        size="md"
        className="!rounded-xl shrink-0"
        loading={isPending}
        disabled={isPending}
        onClick={() => claimRefund(BigInt(program.pid), address)}
      />
    </div>
  );
}
