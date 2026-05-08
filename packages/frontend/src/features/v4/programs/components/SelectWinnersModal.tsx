import { useState, useEffect } from 'react';
import { parseUnits } from 'viem';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useSelectWinners } from '@/lib/contracts/write-hooks';
import type { Applicant } from '@/lib/api/types';

interface MilestoneConfig {
  amount: string;
  description: string;
  provider: string;   // e.g. 'hackquest', 'udemy'
  externalId: string; // e.g. 'course_123'
}

interface WinnerConfig {
  applicant: Applicant;
  milestones: MilestoneConfig[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  shortlisted: Applicant[];
  targetWinners: number;
}

const DEFAULT_MILESTONE: MilestoneConfig = { 
  amount: '10', 
  description: '',
  provider: '',
  externalId: ''
};

export function SelectWinnersModal({ isOpen, onClose, programId, shortlisted, targetWinners }: Props) {
  const { selectWinners, isPending, isSuccess } = useSelectWinners();

  // Sort by voteScore desc, pick up to targetWinners
  const [winners, setWinners] = useState<WinnerConfig[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const sorted = [...shortlisted]
      .filter((a) => a.status === 'SHORTLISTED')
      .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
      .slice(0, targetWinners);

    setWinners(
      sorted.map((a) => ({
        applicant: a,
        milestones: [{ ...DEFAULT_MILESTONE }],
      }))
    );
  }, [isOpen, shortlisted, targetWinners]);

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  const addMilestone = (wi: number) => {
    setWinners((prev) => {
      const next = [...prev];
      next[wi] = { ...next[wi], milestones: [...next[wi].milestones, { ...DEFAULT_MILESTONE }] };
      return next;
    });
  };

  const removeMilestone = (wi: number, mi: number) => {
    setWinners((prev) => {
      const next = [...prev];
      const ms = [...next[wi].milestones];
      ms.splice(mi, 1);
      next[wi] = { ...next[wi], milestones: ms };
      return next;
    });
  };

  const updateMilestone = (wi: number, mi: number, field: keyof MilestoneConfig, value: string) => {
    setWinners((prev) => {
      const next = [...prev];
      const ms = [...next[wi].milestones];
      ms[mi] = { ...ms[mi], [field]: value };
      next[wi] = { ...next[wi], milestones: ms };
      return next;
    });
  };

  const handleConfirm = () => {
    const ranked = winners.map((w) => w.applicant.wallet as `0x${string}`);
    const amounts = winners.map((w) =>
      w.milestones.map((m) => parseUnits(m.amount || '0', 6))
    );
    const descs = winners.map((w) => w.milestones.map((m) => m.description));
    const providers = winners.map((w) => w.milestones.map((m) => m.provider));
    const externalIds = winners.map((w) => w.milestones.map((m) => m.externalId));
    
    selectWinners(BigInt(programId), ranked, amounts, descs, providers, externalIds);
  };

  const totalFundNeeded = winners.reduce(
    (acc, w) => acc + w.milestones.reduce((a, m) => a + Number(m.amount || 0), 0),
    0
  );

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={`Select Winners — Program #${programId}`}>
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-skblue-light border-2 border-black p-3 rounded-xl text-sm">
          <span className="font-bold">Total USDC to Allocate:</span>
          <span className="font-paytone text-lg text-skblue">${totalFundNeeded.toFixed(2)} USDC</span>
        </div>

        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {winners.map((w, wi) => (
            <div key={w.applicant.id} className="border-2 border-black rounded-xl overflow-hidden">
              {/* Winner header */}
              <div className="bg-skpink-light px-4 py-3 flex items-center gap-3 border-b-2 border-black">
                <div className="w-6 h-6 rounded-full bg-skpink text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {wi + 1}
                </div>
                <WalletAvatar address={w.applicant.wallet} size={24} />
                <span className="font-bold text-sm">{shortenAddress(w.applicant.wallet)}</span>
                <span className="ml-auto text-xs text-gray-500">
                  Score: {w.applicant.totalScore || '—'}
                </span>
              </div>

              {/* Milestones */}
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase text-gray-500">Mandatory Milestones</p>
                {w.milestones.map((m, mi) => (
                  <div key={mi} className="flex gap-2 items-start">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 border border-black flex items-center justify-center text-xs mt-2">
                      {mi + 1}
                    </div>
                    <div className="grid grid-cols-4 gap-2 flex-1">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Amount</label>
                        <input
                          type="number"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.amount}
                          onChange={(e) => updateMilestone(wi, mi, 'amount', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Description</label>
                        <input
                          type="text"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.description}
                          onChange={(e) => updateMilestone(wi, mi, 'description', e.target.value)}
                          placeholder="e.g. Intro Course"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Platform</label>
                        <select
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue h-[34px]"
                          value={m.provider}
                          onChange={(e) => updateMilestone(wi, mi, 'provider', e.target.value)}
                        >
                          <option value="">Manual</option>
                          <option value="hackquest">HackQuest</option>
                          <option value="udemy">Udemy</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">External ID</label>
                        <input
                          type="text"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.externalId}
                          onChange={(e) => updateMilestone(wi, mi, 'externalId', e.target.value)}
                          placeholder="e.g. HQ-101"
                          disabled={!m.provider}
                        />
                      </div>
                    </div>
                    {w.milestones.length > 1 && (
                      <button
                        onClick={() => removeMilestone(wi, mi)}
                        className="mt-2 text-red-500 hover:text-red-700 text-lg leading-none"
                        title="Remove milestone"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <NeoButton
                  label="+ Add Milestone"
                  variant="ghost"
                  size="sm"
                  onClick={() => addMilestone(wi)}
                />
              </div>
            </div>
          ))}

          {winners.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No shortlisted candidates to select.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label="Cancel" variant="ghost" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? 'Selecting…' : `Confirm ${winners.length} Winner(s)`}
            variant="success"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending || winners.length === 0}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}
