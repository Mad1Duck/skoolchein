import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { useResolveShortlistBatch } from '@/lib/contracts/v4/hooks/core';
import type { Applicant } from '@/lib/api/types';
import { useProgram } from '@/lib/api/hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  applicants: Applicant[];
}

export function ResolveShortlistModal({ isOpen, onClose, programId, applicants }: Props) {
  // Auto-sort by screeningScore descending, allow manual reorder via drag
  const [ranked, setRanked] = useState<Applicant[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { data: program } = useProgram(programId.toString());
  const { resolveShortlistBatch, isPending, isSuccess } = useResolveShortlistBatch();

  // Progress tracking
  // Using a fallback for blockchainProgress while the API is updated
  const blockchainProgress = program && typeof program === 'object' && 'blockchainProgress' in program
    ? (program as { blockchainProgress?: number }).blockchainProgress ?? 0
    : 0; 
  const BATCH_SIZE = 50;

  useEffect(() => {
    // Auto-sort on open
    const sorted = [...applicants].sort(
      (a, b) => Number(b.screeningScore) - Number(a.screeningScore)
    );
    setRanked(sorted);
  }, [applicants, isOpen]);

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...ranked];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setRanked(next);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleConfirm = () => {
    const wallets = ranked.map((a) => a.wallet as `0x${string}`);
    // Extract segment starting from current on-chain progress
    const segment = wallets.slice(blockchainProgress, blockchainProgress + BATCH_SIZE);
    const isLastBatch = (blockchainProgress + segment.length) >= wallets.length;

    resolveShortlistBatch(BigInt(programId), segment, isLastBatch);
  };

  const progressPercent = Math.min(100, Math.round((blockchainProgress / ranked.length) * 100)) || 0;

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={`Resolve Shortlist — Program #${programId}`}>
      <div className="space-y-4">
        <div className="bg-skyellow-light border-2 border-black p-3 text-sm shadow-[3px_3px_0_0_#000]">
          <p className="font-bold">Instructions</p>
          <p className="text-gray-700 mt-1">
            Applicants are auto-sorted by score.
            <strong> Batching:</strong> Resolution is processed in groups of {BATCH_SIZE} to save gas.
          </p>
          
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs font-bold mb-1">
              <span>Resolution Progress</span>
              <span>{blockchainProgress} / {ranked.length}</span>
            </div>
            <div className="w-full bg-white border-2 border-black h-4 overflow-hidden">
              <div 
                className="bg-skpurple h-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {ranked.map((a, idx) => (
            <div
              key={a.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 border-2 cursor-grab active:cursor-grabbing transition-all select-none ${
                dragIdx === idx ? 'border-skpurple bg-skpurple-light' : 'border-black bg-white hover:bg-gray-50'
              }`}
            >
              {/* Rank badge */}
              <div className="w-7 h-7 bg-black text-white flex items-center justify-center text-xs font-bold shrink-0 border-2 border-black">
                {idx + 1}
              </div>

              {/* Drag handle */}
              <div className="text-gray-400 shrink-0">⠿</div>

              <WalletAvatar address={a.wallet} size={28} />

              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{shortenAddress(a.wallet)}</p>
                <p className="text-xs text-gray-500">
                  Score: <span className="font-bold">{a.screeningScore}</span>
                  {' '}• Retries: {a.retryCount}
                </p>
              </div>

              <NeoBadge status={a.status} />
            </div>
          ))}

          {ranked.length === 0 && (
            <p className="text-center py-8 text-gray-500">No applicants to rank.</p>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label="Cancel" variant="ghost" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? 'Signing Batch...' : 
                   blockchainProgress === 0 ? `Confirm Shortlist (${ranked.length})` :
                   `Continue Resolution (${blockchainProgress} done)`}
            variant="primary"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending || ranked.length === 0 || blockchainProgress >= ranked.length}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}
