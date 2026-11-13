import { useEffect, useState } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { EvidenceFilesInput } from '@/components/ui/EvidenceFilesInput';
import { ErrorNotice } from '@/components/ErrorNotice';
import { uploadEvidence } from '@/lib/ipfs';
import { useRequestRevision } from '@/lib/contracts/v4';
import type { Milestone } from '@/lib/api/types';
import { useT } from '@/lib/i18n';

const MAX_REVISIONS = 2;

/**
 * Send a submitted milestone back to the scholar to fix. The reason is stored on IPFS and shown to the
 * scholar; it can be written, a file (a marked-up document, a screenshot), or both.
 */
export function RequestRevisionModal({ milestone, onClose }: { milestone: Milestone; onClose: () => void }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { requestRevision, isPending, isSuccess, error, reset } = useRequestRevision();

  const used = milestone.revisionCount ?? 0;
  const left = Math.max(0, MAX_REVISIONS - used);

  useEffect(() => {
    if (isSuccess) {
      reset();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const valid = reason.trim().length >= 10 || files.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setStep('uploading');
    setUploadError(null);
    try {
      const { metaCID } = await uploadEvidence({
        content: reason.trim(),
        files,
        type: 'milestone-revision',
        name: `${milestone.blockchainId}-${Date.now()}`,
      });
      setStep('tx');
      requestRevision(BigInt(milestone.blockchainId), metaCID);
    } catch (err) {
      console.error(err);
      setUploadError(err instanceof Error ? err.message : t('evidence.uploadFailed'));
      setStep('form');
    }
  };

  return (
    <NeoModal isOpen onClose={onClose} title={t('revision.title', { id: milestone.blockchainId })}>
      {step === 'uploading' ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
          <p className="font-bold">{t('dispute.uploading')}</p>
        </div>
      ) : step === 'tx' ? (
        <div className="text-center py-12 space-y-2">
          <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
          <p className="font-bold">{t('revision.confirming')}</p>
          {error && <ErrorNotice error={error} className="mt-4" />}
          {error && <NeoButton label={t('common.retry')} variant="primary" onClick={() => setStep('form')} />}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm space-y-1">
            <p className="font-bold">{t('revision.rulesTitle')}</p>
            <ul className="list-disc ml-5 text-xs text-gray-700 space-y-0.5">
              <li>{t('revision.rule1')}</li>
              <li>{t('revision.rule2', { left })}</li>
              <li>{t('revision.rule3')}</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold">{t('revision.reason')}</label>
            <textarea
              rows={5}
              className="w-full border-2 border-black p-2 rounded-lg resize-none focus:outline-none focus:border-skpurple"
              placeholder={t('revision.placeholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <EvidenceFilesInput files={files} onChange={setFiles} />
            {!valid && <p className="text-xs text-gray-600">{t('evidence.needOne', { n: 10 })}</p>}
            {uploadError && <p className="text-xs font-bold text-skred">{uploadError}</p>}
          </div>

          <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
            <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} type="button" fullWidth />
            <NeoButton
              label={isPending ? t('revision.sending') : t('revision.send')}
              variant="danger"
              className="!rounded-xl"
              type="submit"
              loading={isPending}
              disabled={isPending || !valid || left === 0}
              fullWidth
            />
          </div>
        </form>
      )}
    </NeoModal>
  );
}
