import { useState, useEffect } from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { scholarshipCoreAbi } from '@/constants/contractsV4';
import { useActiveChain, useV4Addresses } from '@/lib/chain/useActiveChain';
import { useUpdateProtocolConfig } from '@/lib/contracts/write-hooks';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';

export function AdminProtocolConfig() {
  const v4Addresses = useV4Addresses();
  const { chainId } = useActiveChain();
  const { data: config, isLoading, refetch } = useReadContract({
    chainId,
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: 'getProtocolConfig',
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

  if (isLoading || !formData) return <div className="p-8 text-center font-bold">Loading Protocol Matrix...</div>;

  const handleChange = (field: string, value: bigint | number) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleSave = () => {
    updateProtocolConfig(formData as Record<string, bigint | number>);
  };

  const renderInput = (label: string, field: string, type: 'number' | 'duration' | 'usdc', help?: string) => {
    const value = formData[field];
    const valueNum = typeof value === 'bigint' ? Number(value) : (typeof value === 'number' ? value : 0);

    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold uppercase text-gray-500">{label}</label>
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
          {type === 'duration' && <span className="text-xs font-bold bg-white px-2 py-1 border-2 border-black shadow-[2px_2px_0_0_#000]">SEC</span>}
        </div>
        {help && <p className="text-[10px] text-gray-400 italic">{help}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-black text-white p-4 border-2 border-black shadow-[4px_4px_0_0_#fff]">
        <div>
          <h2 className="text-2xl font-black">Contract Parameters</h2>
          <p className="text-xs opacity-70">Modify core protocol constants. Use with caution.</p>
        </div>
        <NeoButton 
          label={isPending ? "Saving..." : "Apply Changes"} 
          variant="success" 
          onClick={handleSave}
          loading={isPending}
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Donation Settings */}
        <ConfigSection title="Donation & Fees">
          {renderInput("Min Donation", "minDonation", "usdc")}
          {renderInput("Protocol Fee", "transactionFee", "usdc", "Flat fee per donation")}
        </ConfigSection>

        {/* Program Mechanics */}
        <ConfigSection title="Program Mechanics">
          {renderInput("Min Candidates", "minCandidates", "number")}
          {renderInput("Max Candidates", "maxCandidates", "number")}
          {renderInput("Max Retries", "maxRetry", "number", "Application attempts")}
        </ConfigSection>

        {/* Bounty Hunter / Dispute */}
        <ConfigSection title="Bounty Hunter & Disputes">
          {renderInput("Defense Window", "defenseWindow", "duration", "Counter-evidence time")}
          {renderInput("BH Stake %", "bhStakePercent", "number", "Percentage of program balance")}
          <div className="grid grid-cols-2 gap-2">
            {renderInput("Cooldown (Normal)", "bhCooldownNormal", "duration")}
            {renderInput("Cooldown (Flagged)", "bhCooldownFlagged", "duration")}
          </div>
        </ConfigSection>

        {/* Frozen Durations */}
        <ConfigSection title="Freeze Durations">
          {renderInput("Freeze Light", "freezeLight", "duration")}
          {renderInput("Freeze Milestone", "freezeMilestone", "duration")}
          {renderInput("Freeze Heavy", "freezeHeavy", "duration")}
        </ConfigSection>

        {/* Scoring & Governance */}
        <ConfigSection title="Scoring & Quorum">
          {renderInput("Max Raw Score", "scoreMax", "number")}
          {renderInput("Shortlist Threshold", "screeningThreshold", "number")}
          {renderInput("Quorum %", "quorumPercent", "number", "Min turnout to select winners")}
        </ConfigSection>

        {/* Confidence Stakes */}
        <ConfigSection title="Confidence Stakes">
          {renderInput("Slash %", "confidenceSlashPct", "number")}
          {renderInput("Bonus %", "confidenceBonusPct", "number")}
        </ConfigSection>

        {/* Limits */}
        <ConfigSection title="Protocol Limits">
          {renderInput("Max Committee", "maxCommitteeMembers", "number")}
          {renderInput("Max Mandatory Milestones", "maxMandatoryMilestones", "number")}
          {renderInput("Max Optional Milestones", "maxOptionalMilestones", "number")}
          {renderInput("Optional Approval Window", "optionalApprovalWindow", "duration")}
          {renderInput("Max Refund Batch", "maxPushRefundDonors", "number", "Gas safety limit")}
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
