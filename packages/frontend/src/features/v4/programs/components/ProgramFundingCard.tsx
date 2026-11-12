import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { useReputation } from '@/lib/api/hooks';
import type { Program, ProgramMetadata } from '@/lib/api/types';
import { donationPresets, formatTokenAmount, getTokenMeta } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import { toEpochSec } from '@/lib/time';
import { useFormatMoney } from '@/lib/money';
import { DonationPresets } from './DonationPresets';

interface Props {
  program: Program;
  meta?: ProgramMetadata;
  /** Opens the donate flow with the amount picked on this card. */
  onDonate: (amount: string) => void;
}

/** Epoch-seconds deadline relevant to the program's current phase, or null. */
function activeDeadline(program: Program): number | null {
  const raw =
    program.status === 'VOTING'
      ? program.votingEnd
      : program.status === 'APPLICATION_OPEN' || program.status === 'SCREENING'
        ? program.applicationEnd
        : null;
  return toEpochSec(raw);
}

function useCountdown(endSec: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endSec === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endSec]);
  if (endSec === null) return null;
  const left = Math.max(0, endSec - Math.floor(now / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return `${pad(d)}d:${pad(h)}h:${pad(m)}m:${pad(s)}s`;
}

export function ProgramFundingCard({ program, meta, onDonate }: Props) {
  const { t } = useT();
  const fmtAmount = useFormatMoney();
  const { address } = useAccount();
  const token = program.token;
  const tokenMeta = getTokenMeta(token);

  const [amount, setAmount] = useState(() => donationPresets(token)[2]);

  const endSec = activeDeadline(program);
  const countdown = useCountdown(endSec);
  const ended = endSec !== null && endSec * 1000 <= Date.now();

  // No fundraising goal exists in the program data, so the bar shows how much of
  // the pool has been allocated to scholars — real numbers, not an invented target.
  const total = Number(program.totalFund);
  const pctAllocated = total > 0 ? Math.min(100, (Number(program.allocatedFund) / total) * 100) : 0;

  const { data: rep } = useReputation(address ?? '');
  const votingPower = Number(formatTokenAmount(rep?.remainingVotingPower ?? '0', token));
  const name = meta?.name ?? `Program #${program.pid}`;
  const donateLabel = tokenMeta.isNative ? `${amount} ${tokenMeta.symbol}` : `$${Number(amount).toLocaleString('en-US')} ${tokenMeta.symbol}`;

  return (
    <div className="bg-white border-2 border-black rounded-2xl shadow-[5px_5px_0_0_#000] p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 shrink-0 rounded-xl border-2 border-black bg-skyellow flex items-center justify-center text-2xl shadow-[2px_2px_0_0_#000]">
            🎓
          </div>
          <div className="min-w-0">
            <h2 className="font-paytone text-xl md:text-2xl truncate">{name}</h2>
            <p className="text-sm text-gray-500 font-medium truncate">
              {meta?.organization ? `${t('fundCard.byOrg', { org: meta.organization })} · ` : ''}
              {t('fundCard.applicants', { n: program.applicantCount })}
            </p>
          </div>
        </div>
        <NeoBadge status={program.status} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-black bg-skpurple-light p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('fundCard.totalPool')}</p>
          <p className="font-paytone text-3xl md:text-4xl mt-1 break-words">{fmtAmount(program.totalFund, token)}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-skyellow-light p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('fundCard.endsIn')}</p>
          <p className="font-data text-xl md:text-2xl font-bold mt-2">
            {countdown === null ? t('fundCard.noDeadline') : ended ? t('fundCard.ended') : countdown}
          </p>
        </div>
      </div>

      <div>
        <div className="h-4 w-full rounded-full border-2 border-black bg-white overflow-hidden">
          <div
            className="h-full bg-skpurple border-r-2 border-black"
            style={{
              width: `${pctAllocated}%`,
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.25) 0 8px, transparent 8px 16px)',
            }}
          />
        </div>
        <p className="text-xs font-bold text-gray-500 mt-1.5">
          {t('fundCard.allocated', { pct: pctAllocated.toFixed(0) })}
        </p>
      </div>

      {program.openDonation && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DonationPresets token={token} value={amount} onChange={setAmount} />
            {address && (
              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border-2 border-black bg-skyellow font-bold text-sm shadow-[2px_2px_0_0_#000]">
                ⚡ {t('fundCard.votingPower', { amount: votingPower.toLocaleString('en-US', { maximumFractionDigits: 2 }) })}
              </span>
            )}
          </div>
          <NeoButton
            label={t('fundCard.donateAmount', { amount: donateLabel })}
            variant="primary"
            size="md"
            fullWidth
            onClick={() => onDonate(amount)}
          />
        </>
      )}
    </div>
  );
}
