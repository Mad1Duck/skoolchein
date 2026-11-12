import { useState } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useCommitteeSubmitScore } from '@/lib/contracts/write-hooks';
import type { Applicant } from '@/lib/api/types';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  applicant: Applicant;
}

export function CommitteeScoreModal({ isOpen, onClose, programId, applicant }: Props) {
  const { t } = useT();
  const [scores, setScores] = useState({ academic: 75, income: 75, recommend: 75 });
  const { submitScore, isPending, isSuccess } = useCommitteeSubmitScore();

  if (isSuccess) onClose();

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
      <div className="space-y-5">
        <div className="flex items-center gap-3 bg-white border-2 border-black p-3 shadow-[2px_2px_0_0_#000]">
          <WalletAvatar address={applicant.wallet} size={36} />
          <div>
            <p className="font-bold">{shortenAddress(applicant.wallet)}</p>
            <p className="text-xs text-gray-500">Program #{programId}</p>
          </div>
        </div>

        {(['academic', 'income', 'recommend'] as const).map((key) => (
          <div key={key}>
            <label className="flex justify-between text-sm font-bold mb-2">
              <span>{t(`score.${key}` as const)}</span>
              <span className="font-paytone text-skpurple">{scores[key]}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={scores[key]}
              onChange={(e) => setScores((s) => ({ ...s, [key]: Number(e.target.value) }))}
              className="w-full accent-skpurple"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>0</span>
              <span>100</span>
            </div>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('score.submitting') : t('score.submit')}
            variant="primary"
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
