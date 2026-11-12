import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useProgram, useProgramApplicants } from '@/lib/api/hooks';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import { useRankedApplicants, useResolveShortlist, useSelectionAddress } from '@/lib/contracts/v4/hooks/selection';
import { useT } from '@/lib/i18n';
import { toDate } from '@/lib/time';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

/** Applicants handled per transaction; keeps every step small. */
const BATCH_SIZE = 50;

/**
 * Finalizes the shortlist. The order is not chosen here: ScholarshipSelection ranks the
 * applicants by screening score and the contract rejects any other order, so this modal
 * only shows what the system will do and submits it. Anyone can run it once it is time.
 */
export function ResolveShortlistModal({ isOpen, onClose, programId }: Props) {
  const { t } = useT();
  const { address } = useAccount();
  const selection = useSelectionAddress();
  const { screeningThreshold } = useProtocolLimits();

  const { data: program } = useProgram(String(programId));
  const { data: applicants = [] } = useProgramApplicants(String(programId));
  const { data: ranked = [] } = useRankedApplicants(programId, isOpen);
  const { resolveShortlist, isPending, isSuccess, reset } = useResolveShortlist();

  const scoreOf = new Map(applicants.map((a) => [a.wallet.toLowerCase(), Number(a.screeningScore)]));
  const total = program?.applicantCount ?? 0;
  const processed = Math.max(0, total - ranked.length);
  const maxCandidates = program?.maxCandidates ?? 0;

  // Who may call, and from when. Mirrors ScholarshipSelection.resolveShortlist.
  const isPublic = program?.openDonation ?? true;
  const isCreator = !!address && !!program && address.toLowerCase() === program.initiator.toLowerCase();
  const opensAt = isPublic ? toDate(program?.votingStart) : null;
  const tooEarly = !!opensAt && Date.now() < opensAt.getTime();
  const creatorOnly = !isPublic && !isCreator;

  const wasFinalBatch = useRef(false);
  useEffect(() => {
    if (!isSuccess) return;
    reset();
    if (wasFinalBatch.current) onClose();
  }, [isSuccess, reset, onClose]);

  const handleConfirm = () => {
    const segment = ranked.slice(0, BATCH_SIZE);
    wasFinalBatch.current = ranked.length <= BATCH_SIZE;
    resolveShortlist(BigInt(programId), segment, wasFinalBatch.current);
  };

  const blocked = !selection || tooEarly || creatorOnly || ranked.length === 0;
  const left = Math.max(0, ranked.length - BATCH_SIZE);
  const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t('shortlist.title', { id: programId })}>
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm space-y-2">
          <p className="text-gray-700">{t('shortlist.intro')}</p>
          <p className="font-bold">{t('shortlist.rule', { max: maxCandidates, threshold: screeningThreshold })}</p>
          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span>{t('shortlist.progress')}</span>
              <span className="font-data">{processed} / {total}</span>
            </div>
            <div className="w-full bg-white border-2 border-black rounded-full h-3 overflow-hidden">
              <div className="bg-skpurple h-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        {!selection && <Notice>{t('shortlist.noContract')}</Notice>}
        {selection && tooEarly && opensAt && <Notice>{t('shortlist.notYet', { date: opensAt.toLocaleString() })}</Notice>}
        {selection && creatorOnly && <Notice>{t('shortlist.creatorOnly')}</Notice>}

        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {ranked.map((wallet, i) => {
            const rank = processed + i + 1;
            const score = scoreOf.get(wallet.toLowerCase());
            const shortlisted = rank <= maxCandidates && (score ?? 0) >= screeningThreshold;
            return (
              <div key={wallet} className="flex items-center gap-3 p-3 rounded-xl border-2 border-black bg-white">
                <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {rank}
                </div>
                <WalletAvatar address={wallet} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm font-data truncate">{shortenAddress(wallet)}</p>
                  <p className="text-xs text-gray-500">
                    {t('shortlist.score')} <span className="font-bold font-data">{score ?? '—'}</span>
                  </p>
                </div>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 border-2 border-black rounded-full ${
                    shortlisted ? 'bg-skgreen' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {shortlisted ? t('shortlist.in') : t('shortlist.out')}
                </span>
              </div>
            );
          })}

          {ranked.length === 0 && <p className="text-center py-8 text-gray-500">{t('shortlist.empty')}</p>}
        </div>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={
              isPending
                ? t('shortlist.processing')
                : left > 0
                  ? t('shortlist.next', { left })
                  : t('shortlist.confirm', { count: ranked.length })
            }
            variant="primary"
            className="!rounded-xl"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending || blocked}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border-2 border-black bg-skred-light px-3 py-2 text-sm font-bold">{children}</p>;
}
