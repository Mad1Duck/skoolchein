import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { PANEL } from '@/components/ui/surface';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useReputation } from '@/lib/api/hooks';
import type { Program, ProgramMetadata } from '@/lib/api/types';
import { donationPresets, formatTokenAmount, getTokenMeta } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import { toEpochSec } from '@/lib/time';
import { useFormatMoney } from '@/lib/money';
import { displayStatus, type DisplayStatus } from '@/lib/programStatus';
import { DonationPresets } from './DonationPresets';

interface Props {
  program: Program;
  meta?: ProgramMetadata;
  /** Opens the donate flow with the amount picked on this card. */
  onDonate: (amount: string) => void;
  /** When set, donating is not available to this visitor; the card explains why instead. */
  donateBlockedReason?: string;
  /** What this visitor can do with the program in its current stage. */
  actions?: ReactNode;
  /** Settings shown to the creator only. */
  settings?: ReactNode;
}

/** The next moment of the program's current stage, or null when nothing is being waited for. */
function activeDeadline(program: Program, status: DisplayStatus) {
  const [raw, key] =
    status === 'CREATED' ? [program.applicationStart, 'applyOpens' as const]
    : status === 'APPLICATION_OPEN' || status === 'EXPIRED' ? [program.applicationEnd, 'applyEnds' as const]
    : status === 'SCREENING' ? [program.votingStart, 'votingOpens' as const]
    : status === 'VOTING' ? [program.votingEnd, 'votingEnds' as const]
    : [null, null];
  const at = toEpochSec(raw);
  return at === null || key === null ? null : { at, key };
}

const LABEL = 'text-[11px] font-extrabold uppercase tracking-widest text-gray-500';

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

export function ProgramFundingCard({ program, meta, onDonate, donateBlockedReason, actions, settings }: Props) {
  const { t } = useT();
  const fmtAmount = useFormatMoney();
  const { address } = useAccount();
  const token = program.token;
  const tokenMeta = getTokenMeta(token);

  const [amount, setAmount] = useState(() => donationPresets(token)[2]);

  const phase = displayStatus(program);
  const deadline = activeDeadline(program, phase);
  const endSec = deadline?.at ?? null;
  const countdown = useCountdown(endSec);
  const ended = endSec !== null && endSec * 1000 <= Date.now();

  // No fundraising goal exists in the program data, so the bar shows how much of
  // the pool has been allocated to scholars — real numbers, not an invented target.
  const total = Number(program.totalFund);
  // `allocatedFund` only counts optional milestones, so money already paid out counts as allocated too.
  const committed = Math.max(Number(program.allocatedFund), Number(program.spentFund));
  const pctAllocated = total > 0 ? Math.min(100, (committed / total) * 100) : 0;
  // The contract accepts donations only while applications are open.
  const donationsClosed = phase !== 'CREATED' && phase !== 'APPLICATION_OPEN';
  const donationsRunning = phase === 'APPLICATION_OPEN' && !(endSec !== null && ended);

  const { data: rep } = useReputation(address ?? '');
  const votingPower = Number(formatTokenAmount(rep?.remainingVotingPower ?? '0', token));
  const name = meta?.name ?? `Program #${program.pid}`;
  const donateLabel = tokenMeta.isNative ? `${amount} ${tokenMeta.symbol}` : `$${Number(amount).toLocaleString('en-US')} ${tokenMeta.symbol}`;

  return (
    <div className={`${PANEL} p-5 md:p-6 space-y-5`}>
      <div className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-4 min-w-0">
          <div aria-hidden className="w-14 h-14 shrink-0 rounded-xl border-2 border-black bg-skyellow flex items-center justify-center text-2xl shadow-[2px_2px_0_0_#000]">
            🎓
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="font-paytone text-2xl md:text-4xl leading-tight [overflow-wrap:anywhere]">{name}</h1>
            {meta?.description && (
              <p className="text-gray-600 max-w-2xl leading-relaxed [overflow-wrap:anywhere]">{meta.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-gray-500">
              <WalletAvatar address={program.initiator} size={20} />
              <span className="font-data">{shortenAddress(program.initiator)}</span>
              {meta?.organization && <span className="font-medium">· {meta.organization}</span>}
            </div>
          </div>
        </div>
        <NeoBadge status={phase} className="self-start shrink-0 !px-4 !py-2 !text-xs shadow-[2px_2px_0_0_#000]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-black bg-skpurple-light p-4">
          <p className={LABEL}>{t('fundCard.totalPool')}</p>
          <p className="font-paytone text-3xl md:text-4xl mt-1 break-words">{fmtAmount(program.totalFund, token)}</p>
        </div>
        {/* While a stage is running: how long is left. Afterwards: how much has reached recipients. */}
        <div className="rounded-xl border-2 border-black bg-skyellow-light p-4">
          <p className={LABEL}>{deadline ? t(`phase.clock.${deadline.key}`) : t('detail.statSpent')}</p>
          {deadline ? (
            <p className="font-data text-xl md:text-2xl font-bold mt-2">
              {ended ? t(`phase.clock.${deadline.key}.over`) : countdown}
            </p>
          ) : (
            <p className="font-paytone text-3xl md:text-4xl mt-1 break-words">{fmtAmount(program.spentFund, token)}</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x-2 divide-black rounded-xl border-2 border-black">
        {[
          [t('detail.statApplicants'), program.applicantCount],
          [t('detail.targetWinners'), program.targetWinners],
          [t('detail.statScholars'), program.activeScholarCount],
        ].map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col justify-between gap-1 p-2 sm:p-3 md:px-4">
            <dt className={`${LABEL} max-sm:!text-[9px] max-sm:!tracking-normal [overflow-wrap:anywhere]`}>{label}</dt>
            <dd className="font-data text-xl md:text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

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

      {program.openDonation && donationsClosed && (
        <p className="rounded-xl border-2 border-black bg-gray-100 px-3 py-2 text-sm font-bold">{t('fundCard.donationsOver')}</p>
      )}

      {program.openDonation && donationsRunning && donateBlockedReason && (
        <p className="rounded-xl border-2 border-black bg-skyellow-light px-3 py-2 text-sm font-bold">{donateBlockedReason}</p>
      )}

      {program.openDonation && donationsRunning && !donateBlockedReason && (
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
            className="!rounded-xl"
            onClick={() => onDonate(amount)}
          />
        </>
      )}

      {actions}
      {settings && <div className="border-t-2 border-black/10 pt-4">{settings}</div>}
    </div>
  );
}
