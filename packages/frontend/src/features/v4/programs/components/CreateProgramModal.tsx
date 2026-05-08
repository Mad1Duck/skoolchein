import { useState, useEffect } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';
import { useCreateProgram, useApproveUSDC } from '@/lib/contracts/write-hooks';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import type { ProgramMetadata } from '@/lib/api/types';
import { v4Addresses } from '@/constants/contractsV4';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'form' | 'upload' | 'approve' | 'create' | 'done';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export function CreateProgramModal({ isOpen, onClose }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    organization: '',
    targetWinners: 1,
    maxCandidates: 5,
    totalFund: '100',
    educationLevel: 3, // 3 = University
    screeningMode: 1,  // 1 = BY_STUDENT, 0 = BY_COMMITTEE
    maxOptionalMilestones: 0,
    committeeContract: '',
    milestoneDisputeWindowDays: 7,
    // Score weights (must sum to 100)
    academicWeight: 40,
    incomeWeight: 40,
    essayWeight: 0,
    recommendWeight: 20,
    extracurricWeight: 0,
    // Slash distribution (must sum to 100)
    bountyHunterPercent: 50,
    treasuryPercent: 30,
    protocolPercent: 20,
  });

  const { approve, isPending: isApproving, isSuccess: approved, hash: approveHash } = useApproveUSDC();
  const { create, isPending: isCreating, isSuccess: created } = useCreateProgram();
  const [metaCID, setMetaCID] = useState('');

  // Derived weight sum validation
  const weightSum = formData.academicWeight + formData.incomeWeight + formData.essayWeight + formData.recommendWeight + formData.extracurricWeight;
  const slashSum = formData.bountyHunterPercent + formData.treasuryPercent + formData.protocolPercent;

  const handleNext = async () => {
    if (step === 'form') {
      setStep('upload');
      const meta: ProgramMetadata = {
        name: formData.name,
        description: formData.description,
        organization: formData.organization,
      };
      const res = await uploadToIPFS({ meta, type: 'program' });
      const cid = res?.metaCID || 'QmFallbackTestingCID1234567890abcdefg';
      setMetaCID(cid);
      setStep('approve');
    } else if (step === 'approve') {
      approve(v4Addresses.ScholarshipCore, formData.totalFund);
    } else if (step === 'create') {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const appStart = now;
      const appEnd = now + 7n * 86400n;
      const voteStart = appEnd + 3600n;
      const voteEnd = voteStart + 7n * 86400n;
      const disputeWindowSec = BigInt(formData.milestoneDisputeWindowDays) * 86400n;

      const committeeAddr: `0x${string}` =
        formData.committeeContract && formData.committeeContract.length === 42
          ? (formData.committeeContract as `0x${string}`)
          : ZERO_ADDRESS;

      create({
        metadataCID: metaCID,
        educationLevel: formData.educationLevel,
        screeningMode: formData.screeningMode,
        weights: {
          academicWeight: formData.academicWeight,
          incomeWeight: formData.incomeWeight,
          essayWeight: formData.essayWeight,
          recommendWeight: formData.recommendWeight,
          extracurricWeight: formData.extracurricWeight,
        },
        slashDist: {
          bountyHunterPercent: formData.bountyHunterPercent,
          treasuryPercent: formData.treasuryPercent,
          protocolPercent: formData.protocolPercent,
        },
        maxCandidates: formData.maxCandidates,
        targetWinners: formData.targetWinners,
        timeline: [appStart, appEnd, voteStart, voteEnd],
        milestoneDisputeWindow: disputeWindowSec,
        totalFund: formData.totalFund,
        maxOptionalMilestones: formData.maxOptionalMilestones,
        committeeContract: committeeAddr,
      });
    }
  };

  // Advance from approve → create when receipt is confirmed.
  // We watch both `approved` (isSuccess from receipt hook) AND `approveHash + !isApproving`
  // as a fallback, because on local chains the isSuccess pulse can be missed
  // if the component re-renders at the exact same tick.
  useEffect(() => {
    if (step === 'approve' && approved) setStep('create');
  }, [approved, step]);

  useEffect(() => {
    if (step === 'approve' && approveHash && !isApproving) setStep('create');
  }, [approveHash, isApproving, step]);

  useEffect(() => {
    if (created) setStep('done');
  }, [created]);

  const handleClose = () => {
    setStep('form');
    setShowAdvanced(false);
    onClose();
  };

  // ── Helpers
  const set = (field: string, val: unknown) =>
    setFormData((p) => ({ ...p, [field]: val }));

  const eduLevels = ['Elementary', 'Junior High', 'Senior High', 'University'];

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Program Created!">
        <div className="text-center py-8 space-y-4">
          <h2 className="text-2xl font-paytone">Program is now on-chain!</h2>
          <p className="text-gray-600">Your scholarship program has been successfully created.</p>
          <NeoButton label="Close" variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Create Scholarship Program">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        {step === 'form' && (
          <>
            {/* Basic Info */}
            <div>
              <label className="block text-sm font-bold mb-1">Program Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full"
                value={formData.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {/* Education Level */}
            <div>
              <label className="block text-sm font-bold mb-1">Program For</label>
              <div className="grid grid-cols-4 gap-1">
                {eduLevels.map((label, idx) => (
                  <NeoButton
                    key={idx}
                    className={formData.educationLevel === idx ? 'bg-skpurple-hover' : ''}
                    onClick={() => set('educationLevel', idx)}
                    size="sm"
                  >
                    <p className="truncate text-xs">{label}</p>
                  </NeoButton>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Description</label>
              <textarea
                className="w-full"
                rows={2}
                value={formData.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            {/* Fund + Winners */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">Total Fund (USDC)</label>
                <input
                  type="number"
                  className="w-full"
                  value={formData.totalFund}
                  onChange={(e) => set('totalFund', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Target Winners</label>
                <input
                  type="number"
                  min={1}
                  className="w-full"
                  value={formData.targetWinners}
                  onChange={(e) => set('targetWinners', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Max Candidates</label>
                <input
                  type="number"
                  min={1}
                  className="w-full"
                  value={formData.maxCandidates}
                  onChange={(e) => set('maxCandidates', Number(e.target.value))}
                />
              </div>
            </div>

            {/* Screening Mode */}
            <div>
              <label className="block text-sm font-bold mb-1">Screening Mode</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 1, label: 'By Student', desc: 'Students self-declare scores' },
                  { value: 0, label: 'By Committee', desc: 'Committee members score applicants' },
                ].map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('screeningMode', value)}
                    className={`p-3 border-2 text-left text-sm transition-all duration-75 ${
                      formData.screeningMode === value
                        ? 'border-black bg-skpurple-light shadow-[2px_2px_0_0_#000]'
                        : 'border-gray-300 hover:border-black hover:shadow-[1px_1px_0_0_#000]'
                    }`}
                  >
                    <p className="font-bold">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Milestones */}
            <div>
              <label className="flex justify-between text-sm font-bold mb-1">
                <span>Max Optional Milestones (per scholar)</span>
                <span className="font-paytone text-skpurple">{formData.maxOptionalMilestones}</span>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                value={formData.maxOptionalMilestones}
                onChange={(e) => set('maxOptionalMilestones', Number(e.target.value))}
                className="w-full accent-skpurple"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0 (disabled)</span>
                <span>5 (max)</span>
              </div>
            </div>

            {/* Committee Contract (shown when BY_COMMITTEE or optional milestones enabled) */}
            {(formData.screeningMode === 0 || formData.maxOptionalMilestones > 0) && (
              <div>
                <label className="block text-sm font-bold mb-1">
                  Committee Contract Address{' '}
                  {formData.screeningMode === 0 && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="0x... CommitteeGovernance proxy address"
                  className="w-full font-data text-sm"
                  value={formData.committeeContract}
                  onChange={(e) => set('committeeContract', e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use <code className="bg-gray-100 px-1 rounded">{v4Addresses.CommitteeGovernance}</code> for the deployed contract.
                </p>
              </div>
            )}

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full text-sm font-bold text-skpurple flex items-center justify-between py-2 border-t-2 border-gray-100"
            >
              <span>Advanced Settings</span>
              <span>{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 bg-white border-2 border-black p-4 shadow-[3px_3px_0_0_#000]">
                {/* Milestone Dispute Window */}
                <div>
                  <label className="flex justify-between text-xs font-bold mb-1">
                    <span>Milestone Dispute Window</span>
                    <span>{formData.milestoneDisputeWindowDays} days</span>
                  </label>
                  <input
                    type="range"
                    min={7}
                    max={14}
                    value={formData.milestoneDisputeWindowDays}
                    onChange={(e) => set('milestoneDisputeWindowDays', Number(e.target.value))}
                    className="w-full accent-skpurple"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>7 days</span>
                    <span>14 days</span>
                  </div>
                </div>

                {/* Score Weights */}
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">
                    Score Weights{' '}
                    <span className={weightSum === 100 ? 'text-skgreen' : 'text-skred'}>
                      (Sum: {weightSum}/100)
                    </span>
                  </p>
                  {(
                    [
                      ['academicWeight', 'Academic'],
                      ['incomeWeight', 'Income'],
                      ['essayWeight', 'Essay'],
                      ['recommendWeight', 'Recommendation'],
                      ['extracurricWeight', 'Extracurricular'],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="flex items-center gap-2 mb-1">
                      <label className="text-xs w-32 text-gray-600">{label}</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 border-2 border-black p-1 text-xs"
                        value={formData[field]}
                        onChange={(e) => set(field, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>

                {/* Slash Distribution */}
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">
                    Slash Distribution{' '}
                    <span className={slashSum === 100 ? 'text-skgreen' : 'text-skred'}>
                      (Sum: {slashSum}/100)
                    </span>
                  </p>
                  {(
                    [
                      ['bountyHunterPercent', 'Bounty Hunter Reward'],
                      ['treasuryPercent', 'Treasury'],
                      ['protocolPercent', 'Protocol'],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="flex items-center gap-2 mb-1">
                      <label className="text-xs w-40 text-gray-600">{label}</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-16 border-2 border-black p-1 text-xs"
                        value={formData[field]}
                        onChange={(e) => set(field, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 'upload' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading Metadata to IPFS</p>
          </div>
        )}

        {step === 'approve' && (
          <div className="text-center py-12 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-pulse mb-2" />
            <p className="font-bold">Approve USDC</p>
            <p className="text-sm text-gray-600">
              Approve <strong>{formData.totalFund} USDC</strong> transfer to Treasury.
            </p>
          </div>
        )}

        {step === 'create' && (
          <div className="text-center py-12 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-2" />
            <p className="font-bold">Sign Contract Transaction</p>
            <p className="text-sm text-gray-600">Confirm in your wallet to create the program.</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white pb-1">
          <NeoButton
            label="Cancel"
            variant="ghost"
            onClick={handleClose}
            disabled={isApproving || isCreating}
          />
          {step === 'form' && (
            <NeoButton
              label="Continue"
              variant="primary"
              onClick={handleNext}
              disabled={
                !formData.name ||
                !formData.totalFund ||
                weightSum !== 100 ||
                slashSum !== 100
              }
            />
          )}
          {step === 'approve' && (
            <NeoButton
              label={isApproving ? 'Approving…' : 'Approve USDC'}
              variant="primary"
              onClick={handleNext}
              disabled={isApproving}
              loading={isApproving}
            />
          )}
          {step === 'create' && (
            <NeoButton
              label={isCreating ? 'Creating…' : 'Create Program'}
              variant="success"
              onClick={handleNext}
              disabled={isCreating}
              loading={isCreating}
            />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
