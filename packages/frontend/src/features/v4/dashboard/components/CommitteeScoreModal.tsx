import { useEffect, useState } from 'react';
import { useReadContract } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useCommitteeSubmitScore } from '@/lib/contracts/write-hooks';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import { scholarshipCoreAbi } from '@/constants/contractsV4';
import { getV4Addresses } from '@/lib/chain/chains';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import type { Applicant } from '@/lib/api/types';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  applicant: Applicant;
}

const KEYS = ['academic', 'income', 'recommend'] as const;
type Key = (typeof KEYS)[number];

/** Same arithmetic as ScholarshipCoreBase._setScore, so the preview matches what is stored. */
function finalScore(scores: Record<Key, number>, weights: Record<Key, number>, scoreMax: number) {
  const sum = weights.academic + weights.income + weights.recommend;
  if (sum === 0) return 0;
  const weighted = scores.academic * weights.academic + scores.income * weights.income + scores.recommend * weights.recommend;
  return Math.floor((weighted * scoreMax) / (sum * 100));
}

export function CommitteeScoreModal({ isOpen, onClose, programId, applicant }: Props) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { screeningThreshold, scoreMax } = useProtocolLimits();
  const [scores, setScores] = useState<Record<Key, number>>({ academic: 75, income: 75, recommend: 75 });
  const { submitScore, isPending, isSuccess } = useCommitteeSubmitScore();

  // The program's own weights and candidate limit are on-chain; the API does not carry them.
  const { data: program } = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: 'getProgram',
    args: [BigInt(programId)],
    query: { enabled: isOpen },
  });
  const p = program as
    | { scoreWeights: { academicWeight: number; incomeWeight: number; recommendWeight: number }; maxCandidates: number; screeningMode: number }
    | undefined;

  const weights: Record<Key, number> = {
    academic: Number(p?.scoreWeights.academicWeight ?? 1),
    income: Number(p?.scoreWeights.incomeWeight ?? 1),
    recommend: Number(p?.scoreWeights.recommendWeight ?? 1),
  };
  // The contract only takes committee scores for BY_COMMITTEE (0) programs and reverts otherwise.
  const wrongMode = p !== undefined && Number(p.screeningMode) !== 0;
  const weightSum = weights.academic + weights.income + weights.recommend;

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  const result = finalScore(scores, weights, scoreMax);
  const passes = result >= screeningThreshold;

  const handleSubmit = () => {
    submitScore({
      pid: BigInt(programId),
      applicant: applicant.wallet as `0x${string}`,
      academicScore: BigInt(scores.academic),
      incomeScore: BigInt(scores.income),
      recommendScore: BigInt(scores.recommend),
    });
  };

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t('score.title')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-white p-3">
          <WalletAvatar address={applicant.wallet} size={32} />
          <div className="min-w-0">
            <p className="font-bold font-data text-sm truncate">{shortenAddress(applicant.wallet)}</p>
            <p className="text-xs text-gray-500">Program #{programId}</p>
          </div>
        </div>

        <p className="text-sm text-gray-700">{t('score.intro')}</p>
        {wrongMode && (
          <p className="rounded-xl border-2 border-black bg-skred-light p-3 text-sm font-bold">{t('score.wrongMode')}</p>
        )}

        <div className="space-y-3">
          {KEYS.map((key) => {
            const pct = weightSum > 0 ? Math.round((weights[key] / weightSum) * 100) : 0;
            return (
              <div key={key} className="rounded-xl border-2 border-black bg-white p-3">
                <label className="flex items-baseline justify-between gap-3">
                  <span className="font-bold text-sm">
                    {t(`score.${key}` as const)}
                    <span className="ml-2 text-[11px] font-data font-normal text-gray-500">{t('score.weight', { pct })}</span>
                  </span>
                  <span className="font-data text-base font-bold text-skpurple">{scores[key]}</span>
                </label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">{t(`score.${key}Hint` as const)}</p>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={scores[key]}
                  onChange={(e) => setScores((s) => ({ ...s, [key]: Number(e.target.value) }))}
                  className="w-full accent-skpurple"
                />
                <div className="flex justify-between text-[11px] text-gray-400 mt-0.5 font-data">
                  <span>0</span>
                  <span>100</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* What these ratings add up to, and whether that clears the cut-off. */}
        <div className={`rounded-xl border-2 border-black p-3 ${passes ? 'bg-skgreen' : 'bg-skred-light'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-600">{t('score.result')}</p>
              <p className="font-data text-2xl font-bold">
                {result} <span className="text-sm font-normal text-gray-600">/ {scoreMax}</span>
              </p>
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 border-2 border-black rounded-full bg-white text-center">
              {passes ? t('score.passes') : t('score.fails')} ({screeningThreshold})
            </span>
          </div>
          <div className="relative mt-2 h-3 rounded-full border-2 border-black bg-white overflow-hidden">
            <div className="h-full bg-skpurple transition-all" style={{ width: `${Math.min(100, (result / scoreMax) * 100)}%` }} />
            <div
              className="absolute inset-y-0 w-0.5 bg-black"
              style={{ left: `${Math.min(100, (screeningThreshold / scoreMax) * 100)}%` }}
              aria-hidden
            />
          </div>
        </div>

        <details className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">
          <summary className="cursor-pointer font-bold">{t('score.ruleTitle')}</summary>
          <ul className="mt-2 list-disc ml-5 space-y-1 text-gray-700">
            <li>{t('score.rule1', { max: scoreMax })}</li>
            <li>{t('score.rule2', { threshold: screeningThreshold, limit: Number(p?.maxCandidates ?? 20) })}</li>
            <li>{t('score.rule3')}</li>
            <li>{t('score.rule4')}</li>
          </ul>
        </details>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('score.submitting') : t('score.submit')}
            variant="primary"
            className="!rounded-xl"
            onClick={handleSubmit}
            loading={isPending}
            disabled={isPending}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}
