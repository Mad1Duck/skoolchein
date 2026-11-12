import { NeoSelect } from "@/components/ui/NeoSelect";
import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useSelectWinners } from '@/lib/contracts/write-hooks';
import type { Applicant } from '@/lib/api/types';
import { useProgram } from '@/lib/api/hooks';
import { getTokenMeta, parseTokenAmount } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';

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
  const { t } = useT();
  const { selectWinners, isPending, isSuccess } = useSelectWinners();

  // Milestone amounts are denominated in the program's token, which determines
  // the decimals they scale by (native 18, USDC 6).
  const { data: program } = useProgram(String(programId));
  const token = program?.token;
  const tokenMeta = getTokenMeta(token);

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
      w.milestones.map((m) => parseTokenAmount(m.amount || '0', token))
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
    <NeoModal isOpen={isOpen} onClose={onClose} title={t('winners.title', { id: programId })}>
      <div className="space-y-4">
        <div className="flex justify-between items-center bg-skblue-light border-2 border-black p-3 text-sm shadow-[3px_3px_0_0_#000]">
          <span className="font-bold">{t('winners.total', { symbol: tokenMeta.symbol })}</span>
          <span className="font-paytone text-lg text-skblue">{totalFundNeeded.toLocaleString('en-US', { maximumFractionDigits: 4 })} {tokenMeta.symbol}</span>
        </div>

        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
          {winners.map((w, wi) => (
            <div key={w.applicant.wallet} className="border-2 border-black overflow-hidden shadow-[3px_3px_0_0_#000]">
              {/* Winner header */}
              <div className="bg-skpink-light px-4 py-3 flex items-center gap-3 border-b-2 border-black">
                <div className="w-6 h-6 bg-skpink text-white flex items-center justify-center text-xs font-bold shrink-0 border-2 border-black">
                  {wi + 1}
                </div>
                <WalletAvatar address={w.applicant.wallet} size={24} />
                <span className="font-bold text-sm">{shortenAddress(w.applicant.wallet)}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {t('winners.score', { score: w.applicant.totalScore || '—' })}
                </span>
              </div>

              {/* Milestones */}
              <div className="p-4 space-y-3">
                <p className="text-xs font-bold uppercase text-gray-500">{t('winners.mandatory')}</p>
                {w.milestones.map((m, mi) => (
                  <div key={mi} className="flex gap-2 items-start">
                    <div className="flex-shrink-0 w-6 h-6 bg-gray-200 border-2 border-black flex items-center justify-center text-xs mt-2">
                      {mi + 1}
                    </div>
                    <div className="grid grid-cols-4 gap-2 flex-1">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.amount')}</label>
                        <input
                          type="number"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.amount}
                          onChange={(e) => updateMilestone(wi, mi, 'amount', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.description')}</label>
                        <input
                          type="text"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.description}
                          onChange={(e) => updateMilestone(wi, mi, 'description', e.target.value)}
                          placeholder={t('winners.descriptionPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.platform')}</label>
                        <NeoSelect
                          size="sm"
                          value={m.provider}
                          onChange={(v) => updateMilestone(wi, mi, 'provider', v)}
                          options={[
                            { value: '', label: t('winners.manual') },
                            { value: 'hackquest', label: 'HackQuest' },
                            { value: 'udemy', label: 'Udemy' },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.externalId')}</label>
                        <input
                          type="text"
                          className="w-full border-2 border-black rounded p-1.5 text-xs focus:outline-none focus:border-skblue"
                          value={m.externalId}
                          onChange={(e) => updateMilestone(wi, mi, 'externalId', e.target.value)}
                          placeholder={t('winners.externalIdPlaceholder')}
                          disabled={!m.provider}
                        />
                      </div>
                    </div>
                    {w.milestones.length > 1 && (
                      <button
                        onClick={() => removeMilestone(wi, mi)}
                        className="mt-2 text-red-500 hover:text-red-700 text-lg leading-none"
                        title={t('winners.remove')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <NeoButton
                  label={t('winners.add')}
                  variant="ghost"
                  size="sm"
                  onClick={() => addMilestone(wi)}
                />
              </div>
            </div>
          ))}

          {winners.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>{t('winners.empty')}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('winners.selecting') : !program ? t('winners.loadingProgram') : t('winners.confirm', { count: winners.length })}
            variant="success"
            onClick={handleConfirm}
            loading={isPending}
            // Wait for the program: getTokenMeta() treats an unknown token as
            // native (18 decimals), so confirming early would scale a USDC
            // program's milestone amounts by 10^12.
            disabled={isPending || !program || winners.length === 0}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}
