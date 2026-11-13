import { toEpochSec, toLocalInput } from '@/lib/time';
import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useExtendApplicationDeadline, useExtendVotingDeadline } from '@/lib/contracts/write-hooks';
import type { Program } from '@/lib/api/types';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  program: Program;
}

export function ExtendDeadlineModal({ isOpen, onClose, program }: Props) {
  const { t } = useT();
  const isAppOpen = program.status === 'APPLICATION_OPEN';
  const isVoting = program.status === 'VOTING';
  
  const currentEnd = toEpochSec(isAppOpen ? program.applicationEnd : program.votingEnd) ?? 0;
  
  // Helper to ensure timestamp is in milliseconds (API vs Contract mix)
  const ensureMs = (ts: number) => {
    if (!ts) return 0;
    // If > 10^11, it's already in ms (e.g. 1712400000000)
    return ts > 100000000000 ? ts : ts * 1000;
  };

  // Start with default next day
  const [newEndStr, setNewEndStr] = useState(() => {
    if (!currentEnd) return '';
    return toLocalInput(ensureMs(currentEnd) + 86400000);
  });

  const { extendApplicationDeadline, isPending: appPending, isSuccess: appSuccess } = useExtendApplicationDeadline();
  const { extendVotingDeadline, isPending: votePending, isSuccess: voteSuccess } = useExtendVotingDeadline();

  useEffect(() => {
    if (appSuccess || voteSuccess) {
      onClose();
    }
  }, [appSuccess, voteSuccess, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEndStr) return;
    
    // Convert to seconds timestamp
    const newEndTimestamp = Math.floor(new Date(newEndStr).getTime() / 1000);
    
    if (isAppOpen) {
      extendApplicationDeadline(BigInt(program.pid), BigInt(newEndTimestamp));
    } else if (isVoting) {
      extendVotingDeadline(BigInt(program.pid), BigInt(newEndTimestamp));
    }
  };

  const isPending = appPending || votePending;
  const oldDate = new Date(ensureMs(currentEnd)).toLocaleString();

  if (!isAppOpen && !isVoting) {
    return (
      <NeoModal isOpen={isOpen} onClose={onClose} title={t('extend.cannotTitle')}>
        <p className="p-4 text-center text-gray-500">{t('extend.cannotBody')}</p>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={isAppOpen ? t('extend.titleApp') : t('extend.titleVote')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-skyellow-light border-2 border-black rounded p-3 text-sm">
          <p className="font-bold">{t('extend.policy')}</p>
          <ul className="list-disc ml-5 mt-1 text-gray-700">
            <li>{t('extend.p1')}</li>
            <li>{t('extend.p2')}</li>
            <li>{t('extend.p3')}</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">{t('extend.current')}</label>
          <input
            type="text"
            disabled
            value={oldDate}
            className="w-full border-2 border-gray-300 bg-gray-100 p-2 rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">{t('extend.new')} <span className="text-red-500">*</span></label>
          <input
            type="datetime-local"
            required
            min={toLocalInput(ensureMs(currentEnd) + 60000)}
            value={newEndStr}
            onChange={(e) => setNewEndStr(e.target.value)}
            className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
          />
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-200">
          <NeoButton label={t('common.cancel')} variant="ghost" fullWidth onClick={onClose} disabled={isPending} type="button" />
          <NeoButton label={isPending ? t('extend.extending') : t('common.confirm')} variant="primary" fullWidth loading={isPending} disabled={isPending || !newEndStr} type="submit" />
        </div>
      </form>
    </NeoModal>
  );
}
