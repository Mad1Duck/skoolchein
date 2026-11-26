import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { scholarshipCoreAbi, scholarshipTreasuryAbi } from '@/constants/contractsV4';
import { useActiveChain, useV4Addresses } from '@/lib/chain/useActiveChain';
import { useUpdateProtocolConfig } from '@/lib/contracts/write-hooks';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/en';

/**
 * Settings the contracts do NOT read from this configuration. They are shown, not edited: saving a new
 * number would change nothing. The values are the constants in ScholarshipTypes.sol; keep them in step
 * with the contracts. `null` means no contract applies such a limit at all.
 */
const READ_ONLY: Record<string, { fixed: number | null; note: TranslationKey }> = {
  defenseWindow: { fixed: 7 * 86400, note: 'admin.cfg.fixed' },
  bhStakePercent: { fixed: 10, note: 'admin.cfg.fixed' },
  bhCooldownNormal: { fixed: 30 * 86400, note: 'admin.cfg.fixed' },
  bhCooldownFlagged: { fixed: 90 * 86400, note: 'admin.cfg.fixed' },
  maxCommitteeMembers: { fixed: 15, note: 'admin.cfg.fixed' },
  // _slashScholar uses `freezeHeavy` for light and milestone cases alike; these two are never read.
  freezeLight: { fixed: null, note: 'admin.cfg.freezeUnused' },
  freezeMilestone: { fixed: null, note: 'admin.cfg.freezeUnused' },
  optionalApprovalWindow: { fixed: null, note: 'admin.cfg.noLimit' },
  // The Treasury has its own setting; its current value is read below.
  maxPushRefundDonors: { fixed: null, note: 'admin.cfg.refundElsewhere' },
};

export function AdminProtocolConfig() {
  const { t } = useT();
  const v4Addresses = useV4Addresses();
  const { chainId } = useActiveChain();
  const { data: config, isLoading, refetch } = useReadContract({
    chainId,
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: 'getProtocolConfig',
  });

  const { data: refundBatch } = useReadContract({
    chainId,
    address: v4Addresses.ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: 'maxPushRefundDonors',
  });

  const { updateProtocolConfig, isPending, isSuccess } = useUpdateProtocolConfig();
  const [formData, setFormData] = useState<Record<string, bigint | number> | null>(null);

  useEffect(() => {
    if (config) {
      setFormData(config as Record<string, bigint | number>);
    }
  }, [config]);

  useEffect(() => {
    if (isSuccess) {
      refetch();
    }
  }, [isSuccess, refetch]);

  if (isLoading || !formData) return <div className="p-8 text-center font-bold">{t('admin.cfg.loading')}</div>;

  const handleChange = (field: string, value: bigint | number) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSave = () => {
    updateProtocolConfig(formData as Record<string, bigint | number>);
  };

  const renderInput = (label: TranslationKey, field: string, type: 'number' | 'duration' | 'usdc', help?: TranslationKey) => {
    const readOnly = READ_ONLY[field];
    if (readOnly) {
      const fixed = field === 'maxPushRefundDonors' && refundBatch !== undefined ? Number(refundBatch) : readOnly.fixed;
      return (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase text-gray-500">{t(label)}</p>
          <p className="rounded-lg border-2 border-dashed border-gray-400 bg-gray-50 px-3 py-2 font-data text-sm font-bold text-gray-700">
            {fixed === null ? '—' : type === 'duration' ? t('admin.cfg.days', { n: fixed / 86400 }) : fixed}
          </p>
          {help && <p className="text-[10px] text-gray-400 italic">{t(help)}</p>}
          <p className="text-[10px] font-bold text-gray-600">{t(readOnly.note)}</p>
        </div>
      );
    }

    const value = formData[field];
    const valueNum = typeof value === 'bigint' ? Number(value) : (typeof value === 'number' ? value : 0);

    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold uppercase text-gray-500">{t(label)}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="flex-1 font-data"
            value={type === 'usdc' ? formatUnits(BigInt(value ?? 0), 6) : valueNum.toString()}
            onChange={(e) => {
              const raw = e.target.value;
              const newVal = type === 'usdc' ? parseUnits(raw, 6) : Number(raw);
              handleChange(field, newVal);
            }}
          />
          {type === 'usdc' && <span className="text-xs font-bold bg-white px-2 py-1 border-2 border-black shadow-[2px_2px_0_0_#000]">USDC</span>}
          {type === 'duration' && <span className="text-xs font-bold bg-white px-2 py-1 border-2 border-black shadow-[2px_2px_0_0_#000]">{t('admin.cfg.seconds')}</span>}
        </div>
        {help && <p className="text-[10px] text-gray-400 italic">{t(help)}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-black text-white p-4 border-2 border-black shadow-[4px_4px_0_0_#fff]">
        <div>
          <h2 className="text-2xl font-black">{t('admin.cfg.title')}</h2>
          <p className="text-xs opacity-70">{t('admin.cfg.subtitle')}</p>
        </div>
        <NeoButton 
          label={isPending ? t('common.processing') : t('admin.apply')} 
          variant="success" 
          onClick={handleSave}
          loading={isPending}
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Donation Settings */}
        <ConfigSection title={t('admin.cfg.sec.donation')}>
          {renderInput("admin.cfg.minDonation", "minDonation", "usdc")}
          {renderInput("admin.cfg.transactionFee", "transactionFee", "usdc", "admin.cfg.feeHelp")}
        </ConfigSection>

        {/* Program Mechanics */}
        <ConfigSection title={t('admin.cfg.sec.program')}>
          {renderInput("admin.cfg.minCandidates", "minCandidates", "number")}
          {renderInput("admin.cfg.maxCandidates", "maxCandidates", "number")}
          {renderInput("admin.cfg.maxRetry", "maxRetry", "number", "admin.cfg.retryHelp")}
        </ConfigSection>

        {/* Bounty Hunter / Dispute */}
        <ConfigSection title={t('admin.cfg.sec.reports')}>
          {renderInput("admin.cfg.defenseWindow", "defenseWindow", "duration", "admin.cfg.defenseHelp")}
          {renderInput("admin.cfg.bhStakePercent", "bhStakePercent", "number", "admin.cfg.stakeHelp")}
          <div className="space-y-3">
            {renderInput("admin.cfg.bhCooldownNormal", "bhCooldownNormal", "duration")}
            {renderInput("admin.cfg.bhCooldownFlagged", "bhCooldownFlagged", "duration")}
          </div>
        </ConfigSection>

        {/* Frozen Durations */}
        <ConfigSection title={t('admin.cfg.sec.freeze')}>
          {renderInput("admin.cfg.freezeLight", "freezeLight", "duration")}
          {renderInput("admin.cfg.freezeMilestone", "freezeMilestone", "duration")}
          {renderInput("admin.cfg.freezeHeavy", "freezeHeavy", "duration", "admin.cfg.freezeHelp")}
        </ConfigSection>

        {/* Scoring & Governance */}
        <ConfigSection title={t('admin.cfg.sec.scoring')}>
          {renderInput("admin.cfg.scoreMax", "scoreMax", "number")}
          {renderInput("admin.cfg.screeningThreshold", "screeningThreshold", "number")}
          {renderInput("admin.cfg.quorumPercent", "quorumPercent", "number", "admin.cfg.quorumHelp")}
        </ConfigSection>

        {/* Confidence Stakes */}
        <ConfigSection title={t('admin.cfg.sec.backing')}>
          {renderInput("admin.cfg.confidenceSlashPct", "confidenceSlashPct", "number")}
          {renderInput("admin.cfg.confidenceBonusPct", "confidenceBonusPct", "number")}
        </ConfigSection>

        {/* Limits */}
        <ConfigSection title={t('admin.cfg.sec.limits')}>
          {renderInput("admin.cfg.maxCommitteeMembers", "maxCommitteeMembers", "number")}
          {renderInput("admin.cfg.maxMandatoryMilestones", "maxMandatoryMilestones", "number")}
          {renderInput("admin.cfg.maxOptionalMilestones", "maxOptionalMilestones", "number")}
          {renderInput("admin.cfg.optionalApprovalWindow", "optionalApprovalWindow", "duration")}
          {renderInput("admin.cfg.maxPushRefundDonors", "maxPushRefundDonors", "number", "admin.cfg.refundHelp")}
        </ConfigSection>
      </div>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <NeoCard hoverable={false} className="h-full border-2 border-black">
      <NeoCardBody className="space-y-4">
        <h3 className="font-paytone text-lg border-b-2 border-black pb-2">{title}</h3>
        <div className="space-y-3">
          {children}
        </div>
      </NeoCardBody>
    </NeoCard>
  );
}
