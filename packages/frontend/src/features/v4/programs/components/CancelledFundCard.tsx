import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { NeoButton } from '@/components/ui/NeoButton';
import { useSettleCancelled, useUnsettledFund } from '@/lib/contracts/v4/hooks/treasury';
import { formatTokenCompact } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import type { Program } from '@/lib/api/types';

/**
 * A cancelled program that still holds money (every recipient was penalized): its creator or a donor
 * sends it back to its owners. Hidden for everyone else and when there is nothing to return.
 */
export function CancelledFundCard({ program }: { program: Program }) {
  const { t } = useT();
  const { address } = useAccount();
  const { amount, donors, refetch } = useUnsettledFund(program);
  const { settle, isPending, isSuccess } = useSettleCancelled();

  useEffect(() => {
    if (isSuccess) void refetch();
  }, [isSuccess, refetch]);

  const me = address?.toLowerCase();
  const involved = !!me && [program.initiator, ...donors].some((a) => a.toLowerCase() === me);
  if (!involved || !amount) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border-2 border-black bg-skyellow p-5 shadow-[3px_3px_0_0_#000]">
      <div>
        <p className="font-paytone text-lg">{t('cancelledFund.title')}</p>
        <p className="text-sm">{t('cancelledFund.hint', { amount: formatTokenCompact(amount, program.token) })}</p>
      </div>
      <NeoButton
        label={isPending ? t('common.processing') : t('cancelledFund.return')}
        variant="secondary"
        size="md"
        className="!rounded-xl shrink-0"
        loading={isPending}
        disabled={isPending}
        onClick={() => settle(BigInt(program.pid))}
      />
    </div>
  );
}
