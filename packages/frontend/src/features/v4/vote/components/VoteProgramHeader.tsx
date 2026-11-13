import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { Program } from '@/lib/api/types';
import { useReputation } from '@/lib/api/hooks';
import { formatTokenWithSymbol } from '@/lib/contracts/v4/token';
import { toDate } from '@/lib/time';
import { useFormatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n';
import { useVotingClock } from '../useVotingClock';

/** Default share of the final score that votes carry when the creator did not choose one. */
const DEFAULT_VOTE_WEIGHT_BPS = 3000;

/**
 * Everything someone needs to know about a program before voting: how long is left, how much is at
 * stake, how many winners, how much their vote counts, and how much voting weight they hold.
 */
export function VoteProgramHeader({ program }: { program: Program }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { address } = useAccount();
  const clock = useVotingClock(program.votingEnd, program.votingStart);
  const { data: rep } = useReputation(address ?? '');
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  const token = program.token as `0x${string}`;
  const power = BigInt(rep?.remainingVotingPower ?? '0');
  const weightPct = (program.voteWeightBps ?? DEFAULT_VOTE_WEIGHT_BPS) / 100;
  const start = toDate(program.votingStart);
  const end = toDate(program.votingEnd);

  return (
    <section className="rounded-2xl border-2 border-black bg-white p-5 md:p-6 shadow-[5px_5px_0_0_#000] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-500">Program #{program.pid}</p>
          <h2 className="font-paytone text-2xl md:text-3xl leading-tight [overflow-wrap:anywhere]">
            {meta?.name ?? `Program #${program.pid}`}
          </h2>
        </div>

        <div className="rounded-xl border-2 border-black bg-skyellow px-4 py-2 text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-widest">
            {clock.ended ? t('votePage.ended') : t('votePage.endsIn')}
          </p>
          <p className="font-data text-xl font-bold">{clock.text ?? '—'}</p>
        </div>
      </div>

      {clock.progress !== null && (
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full border-2 border-black bg-gray-200">
            <div className="h-full bg-skpurple transition-all duration-1000" style={{ width: `${clock.progress * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-gray-500 font-data">
            <span>{start?.toLocaleDateString()}</span>
            <span>{end?.toLocaleDateString()}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label={t('votePage.fund')} value={fmt(program.totalFund, program.token)} />
        <Tile label={t('votePage.winners')} value={String(program.targetWinners)} />
        <Tile label={t('votePage.weight')} value={`${weightPct}%`} />
        <Tile
          label={t('votePage.myPower')}
          value={!address ? '—' : formatTokenWithSymbol(power, token)}
          hint={!address ? t('votePage.connect') : power === 0n ? t('votePage.noPower') : undefined}
        />
      </div>

      <details className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">
        <summary className="cursor-pointer font-bold">{t('votePage.how')}</summary>
        <ol className="mt-2 list-decimal ml-5 space-y-1 text-gray-700">
          <li>{t('votePage.step1')}</li>
          <li>{t('votePage.step2')}</li>
          <li>{t('votePage.step3')}</li>
        </ol>
        <p className="mt-2 text-xs text-gray-600">{t('votePage.weightNote')}</p>
      </details>
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-black bg-white p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-data text-lg font-bold mt-1 [overflow-wrap:anywhere]">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-500 leading-snug">{hint}</p>}
    </div>
  );
}
