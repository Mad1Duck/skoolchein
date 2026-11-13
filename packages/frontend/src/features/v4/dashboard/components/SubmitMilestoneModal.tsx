import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { uploadEvidence } from '@/lib/ipfs';
import { EvidenceFilesInput } from '@/components/ui/EvidenceFilesInput';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useSubmitMilestone } from '@/lib/contracts/write-hooks';
import { scholarshipCoreAbi } from '@/constants/contractsV4';
import { getV4Addresses } from '@/lib/chain/chains';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { useFormatMoney } from '@/lib/money';
import { statusLabel } from '@/lib/i18n/status';
import type { Milestone } from '@/lib/api/types';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  milestone: Milestone;
}

/**
 * Hand in a milestone. Shows what it is worth, what exactly is being submitted (a document, or
 * nothing at all for a milestone that asks for no proof), and what happens after: the review
 * period, then the release of the money.
 */
export function SubmitMilestoneModal({ isOpen, onClose, milestone }: Props) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { chainId } = useActiveChain();
  const [proofDescription, setProofDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');

  const { submitMilestone, isPending, isSuccess } = useSubmitMilestone();

  // The review period is the program's own setting and only exists on-chain.
  const { data: program } = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: 'getProgram',
    args: [BigInt(milestone.pid ?? 0)],
    query: { enabled: isOpen && milestone.pid !== null },
  });
  const windowSec = Number((program as { milestoneDisputeWindow?: bigint | number } | undefined)?.milestoneDisputeWindow ?? 0);
  const windowText =
    windowSec <= 0
      ? null
      : windowSec >= 86400
        ? t('submit.durDays', { n: Math.round(windowSec / 86400) })
        : t('submit.durHours', { n: Math.max(1, Math.round(windowSec / 3600)) });

  const needsProof = milestone.kind !== 'MANDATORY' || milestone.requiresProof;

  useEffect(() => {
    if (isSuccess) {
      onClose();
      setStep('form');
      setProofDescription('');
      setFiles([]);
    }
  }, [isSuccess, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!needsProof) {
      setStep('tx');
      submitMilestone(BigInt(milestone.blockchainId), 'NO_PROOF_REQUIRED');
      return;
    }

    setStep('uploading');
    setUploadError(null);
    try {
      const suffix = `${milestone.blockchainId}-${Date.now()}`;
      const { metaCID } = await uploadEvidence({ content: proofDescription.trim(), files, type: 'milestone-proof', name: suffix });

      setStep('tx');
      submitMilestone(BigInt(milestone.blockchainId), metaCID);
    } catch (err) {
      console.error(err);
      setUploadError(err instanceof Error ? err.message : t('evidence.uploadFailed'));
      setStep('form');
    }
  };

  const handleClose = () => {
    setStep('form');
    onClose();
  };

  const amount = fmt(milestone.amount, milestone.token);

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('submit.title', { id: milestone.blockchainId })}>
      <div className="space-y-4">
        {step === 'uploading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">{t('submit.uploading')}</p>
          </div>
        )}

        {step === 'tx' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">{t('milestone.proofConfirmTitle')}</p>
            <p className="text-sm text-gray-600 mt-1">{t('milestone.proofConfirmBody')}</p>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Info label={t('submit.milestone')} value={`#${milestone.blockchainId}`} />
              <Info label={t('submit.kind')} value={statusLabel(t, milestone.kind)} />
              <Info label={t('submit.amount')} value={amount} />
            </div>

            <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm space-y-2">
              <p className="font-bold">{t('submit.what')}</p>
              {needsProof ? (
                <p className="text-gray-700 text-xs">{t('submit.proofHelp')}</p>
              ) : (
                <p className="text-gray-700 text-xs">{t('submit.noProof')}</p>
              )}
            </div>

            {needsProof && (
              <div className="space-y-2">
                <label className="block text-sm font-bold">
                  {t('submit.proofLabel')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  className="w-full resize-none"
                  placeholder={t('submit.proofPlaceholder')}
                  value={proofDescription}
                  onChange={(e) => setProofDescription(e.target.value)}
                />
                <EvidenceFilesInput files={files} onChange={setFiles} />
                {uploadError && <p className="text-xs font-bold text-skred">{uploadError}</p>}
              </div>
            )}

            <div className="rounded-xl border-2 border-black bg-white p-3 text-sm">
              <p className="font-bold mb-1">{t('submit.next')}</p>
              <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-700">
                <li>{t('submit.n1')}</li>
                <li>{windowText ? t('submit.n2', { window: windowText }) : t('submit.n2none')}</li>
                <li>{t('submit.n3', { amount })}</li>
                <li>{t('submit.n4')}</li>
              </ol>
            </div>

            <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
              <NeoButton
                label={t('common.cancel')}
                variant="ghost"
                className="!rounded-xl"
                onClick={handleClose}
                disabled={isPending}
                fullWidth
              />
              <NeoButton
                type="submit"
                label={isPending ? t('submit.submitting') : t('submit.confirm')}
                variant="primary"
                className="!rounded-xl"
                loading={isPending}
                disabled={isPending || (needsProof && !proofDescription.trim() && files.length === 0)}
                fullWidth
              />
            </div>
          </form>
        )}
      </div>
    </NeoModal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-black bg-white p-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-data text-sm font-bold mt-0.5 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
