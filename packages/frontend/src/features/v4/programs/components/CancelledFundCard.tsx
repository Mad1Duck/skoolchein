import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { NeoButton } from '@/components/ui/NeoButton';
import { FundBreakdownModal } from '@/components/FundBreakdownModal';
import { useSettleCancelled, useUnsettledFund } from '@/lib/contracts/v4/hooks/treasury';
import { useCancelledPreview } from '@/lib/contracts/v4/hooks/distribution';
import { formatTokenCompact } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import type { Program } from '@/lib/api/types';

/**
 * A cancelled program that still holds money (every recipient was penalized): its creator or a donor
 * sends it back to its owners, after seeing who gets what. Hidden for everyone else and when there is
 * nothing to return.
 */
export function CancelledFundCard({ program }: { program: Program }) {
  const { t } = useT();
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const { amount, donors, refetch } = useUnsettledFund(program);
  const { settle, isPending, isSuccess } = useSettleCancelled();
  const { data, isError } = useCancelledPreview(program.pid, open);

  useEffect(() => {
    if (!isSuccess) return;
    setOpen(false);
    void refetch();
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
        label={t('breakdown.open')}
        variant="secondary"
        size="md"
        className="!rounded-xl shrink-0"
        onClick={() => setOpen(true)}
      />

      {open && (
        <FundBreakdownModal
          title={t('cancelledFund.breakdownTitle')}
          token={program.token}
          summary={data && [
            { label: t('cancelledFund.held'), amount: data.balance },
            { label: t('cancelledFund.sentNow'), amount: data.sentNow },
          ]}
          rows={data && [
            ...(data.creator > 0n ? [{ wallet: program.initiator, role: t('cancelledFund.creator'), amount: data.creator }] : []),
            ...data.donors.map((d) => ({
              wallet: d.wallet,
              role: t('cancelledFund.donor'),
              amount: d.amount,
              note: [
                d.amount < d.donated ? t('cancelledFund.partial', { amount: formatTokenCompact(d.donated, program.token) }) : '',
                data.donorsPaidNow ? '' : t('cancelledFund.claimsOwn'),
              ].filter(Boolean).join(' ') || undefined,
            })),
          ]}
          isError={isError}
          confirmLabel={t('cancelledFund.return')}
          canConfirm={!!data && data.sentNow > 0n}
          isPending={isPending}
          onConfirm={() => settle(BigInt(program.pid))}
          onClose={() => setOpen(false)}
        >
          {data && !data.donorsPaidNow && <p className="text-sm">{t('cancelledFund.tooManyDonors')}</p>}
        </FundBreakdownModal>
      )}
    </div>
  );
}
