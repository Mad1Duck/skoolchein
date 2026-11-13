import { useQuery } from '@tanstack/react-query';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { Program } from '@/lib/api/types';
import { useT } from '@/lib/i18n';
import { useFormatMoney } from '@/lib/money';
import { shortLeft } from '../useVotingClock';

interface ProgramVoteSelectorProps {
  program: Program;
  isSelected: boolean;
  onClick: () => void;
}

export function ProgramVoteSelector({ program, isSelected, onClick }: ProgramVoteSelectorProps) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });
  const left = shortLeft(program.votingEnd);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      className={`w-full text-left rounded-xl border-2 border-black p-4 transition-all duration-75 ${
        isSelected
          ? 'bg-skpink shadow-[4px_4px_0_0_#000] -translate-y-0.5'
          : 'bg-white hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000]'
      }`}
    >
      <div className="font-bold leading-tight">{meta?.name ?? `Program #${program.pid}`}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        <span className="rounded-full border-2 border-black bg-white px-2 py-0.5">
          {t('votePage.shortlisted', { n: program.shortlistedCount ?? 0 })}
        </span>
        {left && (
          <span className="rounded-full border-2 border-black bg-skyellow px-2 py-0.5 font-data">⏳ {left}</span>
        )}
      </div>
      <div className="mt-2 text-xs opacity-80 font-data">{fmt(program.totalFund, program.token)}</div>
    </button>
  );
}
