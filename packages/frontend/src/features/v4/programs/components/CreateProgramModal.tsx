import { useState, useEffect } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { uploadToIPFS, rememberProgramMeta } from '@/lib/ipfs';
import { useCreateProgram, useApproveUSDC } from '@/lib/contracts/write-hooks';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import type { ProgramMetadata } from '@/lib/api/types';
import { useActiveChain, useV4Addresses } from '@/lib/chain/useActiveChain';
import { NATIVE_TOKEN, getSupportedTokens, getTokenMeta } from '@/lib/contracts/v4/token';
import { needsApproval } from '@/lib/contracts/write-hooks';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'form' | 'upload' | 'approve' | 'create' | 'done';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export function CreateProgramModal({ isOpen, onClose }: Props) {
  const { t } = useT();
  const v4Addresses = useV4Addresses();
  const { chainId } = useActiveChain();
  const { rate } = useTokenRate();
  const [step, setStep] = useState<Step>('form');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    organization: '',
    targetWinners: 1,
    maxCandidates: 5,
    totalFund: "100",
    token: NATIVE_TOKEN as string,
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

  const { approve, isPending: isApproving, isSuccess: approved, hash: approveHash, error: approveError } = useApproveUSDC();
  const { create, isPending: isCreating, isSuccess: created, error: createError } = useCreateProgram();
  const [metaCID, setMetaCID] = useState('');

  const tokenMeta = getTokenMeta(formData.token);
  const limits = useProtocolLimits();
  const candidatesOk = formData.maxCandidates >= limits.minCandidates && formData.maxCandidates <= limits.maxCandidates;
  const winnersOk = formData.targetWinners >= 1 && formData.targetWinners <= formData.maxCandidates;
  // The creator funds the program from their own wallet, so check it can cover the fund first.
  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(formData.token, formData.totalFund);
  const fundIdr =
    !tokenMeta.isNative && rate && Number(formData.totalFund) > 0
      ? formatToIDR(usdcToIdr(Number(formData.totalFund), rate))
      : null;

  // Derived weight sum validation
  const weightSum = formData.academicWeight + formData.incomeWeight + formData.essayWeight + formData.recommendWeight + formData.extracurricWeight;
  const slashSum = formData.bountyHunterPercent + formData.treasuryPercent + formData.protocolPercent;

  const needsCommittee = formData.screeningMode === 0 || formData.maxOptionalMilestones > 0;

  const handleNext = async () => {
    if (step === 'form') {
      setStep('upload');
      const meta: ProgramMetadata = {
        name: formData.name,
        description: formData.description,
        organization: formData.organization,
      };
      const slug = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'program';
      const res = await uploadToIPFS({ meta, type: 'program', name: `${slug}-${Date.now()}` });
      const cid = res?.metaCID || 'QmFallbackTestingCID1234567890abcdefg';
      // The creator's own browser always knows the program name — remember it so
      // it shows even if the IPFS gateway is unreachable later.
      rememberProgramMeta(cid, meta);
      setMetaCID(cid);
      // Native funding needs no ERC20 approval — skip straight to create.
      setStep(needsApproval(formData.token) ? "approve" : "create");
    } else if (step === 'approve') {
      approve(v4Addresses.ScholarshipCore, formData.totalFund);
    } else if (step === 'create') {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const appStart = now;
      const appEnd = now + 7n * 86400n;
      const voteStart = appEnd + 3600n;
      const voteEnd = voteStart + 7n * 86400n;
      const disputeWindowSec = BigInt(formData.milestoneDisputeWindowDays) * 86400n;

      // A custom committee wins; otherwise a program that needs one uses the deployed default,
      // so creators never have to paste a contract address.
      const committeeAddr: `0x${string}` =
        formData.committeeContract && formData.committeeContract.length === 42
          ? (formData.committeeContract as `0x${string}`)
          : needsCommittee
            ? v4Addresses.CommitteeGovernance
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
        token: formData.token as `0x${string}`,
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

  const eduLevels = [
    t('create.edu.elementary'),
    t('create.edu.junior'),
    t('create.edu.senior'),
    t('create.edu.university'),
  ];

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('create.successTitle')}>
        <div className="text-center py-8 space-y-4">
          <h2 className="text-2xl font-paytone">{t('create.successHeading')}</h2>
          <p className="text-gray-600">{t('create.successBody')}</p>
          <NeoButton label={t('common.close')} variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('create.title')}>
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        {step === 'form' && (
          <>
            {/* Basic Info */}
            <div>
              <label className="block text-sm font-bold mb-1">{t('create.name')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                className="w-full"
                value={formData.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>

            {/* Education Level */}
            <div>
              <label className="block text-sm font-bold mb-1">{t('create.for')}</label>
              <div className="grid grid-cols-4 gap-2">
                {eduLevels.map((label, idx) => (
                  <NeoButton
                    key={idx}
                    fullWidth
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
              <label className="block text-sm font-bold mb-1">{t('create.description')}</label>
              <textarea
                className="w-full"
                rows={2}
                value={formData.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            {/* Currency — determines decimals and whether funding is sent
                as msg.value (native) or needs an ERC20 approve first. */}
            <div>
              <label className="block text-xs font-bold mb-1">{t('create.currency')}</label>
              <div className="flex gap-2">
                {getSupportedTokens(chainId).map((tok) => (
                  <button
                    key={tok.address}
                    type="button"
                    onClick={() => set('token', tok.address)}
                    className={`flex-1 border-2 border-black p-2 text-sm font-bold shadow-[2px_2px_0_0_#000] transition-colors ${
                      formData.token.toLowerCase() === tok.address.toLowerCase()
                        ? 'bg-skgreen'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {tok.symbol}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('create.currencyHint')}</p>
            </div>

            {/* Fund + Winners */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">
                  {t('create.totalFund', { symbol: tokenMeta.symbol })}
                </label>
                <input
                  type="number"
                  step="any"
                  className="w-full"
                  value={formData.totalFund}
                  onChange={(e) => set('totalFund', e.target.value)}
                />
                {fundIdr && (
                  <p className="text-xs font-bold mt-1">{t('create.fundApprox', { amount: fundIdr })}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">{t('create.targetWinners')}</label>
                <input
                  type="number"
                  min={1}
                  max={formData.maxCandidates}
                  aria-invalid={!winnersOk}
                  className={`w-full ${winnersOk ? '' : '!border-skred'}`}
                  value={formData.targetWinners}
                  onChange={(e) => set('targetWinners', Number(e.target.value))}
                />
                {!winnersOk && <p className="text-[11px] font-bold text-skred mt-1">{t('create.winnersRange')}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">{t('create.maxCandidates')}</label>
                <input
                  type="number"
                  min={limits.minCandidates}
                  max={limits.maxCandidates}
                  aria-invalid={!candidatesOk}
                  className={`w-full ${candidatesOk ? '' : '!border-skred'}`}
                  value={formData.maxCandidates}
                  onChange={(e) => set('maxCandidates', Number(e.target.value))}
                />
                <p className={`text-[11px] mt-1 ${candidatesOk ? 'text-gray-500' : 'font-bold text-skred'}`}>
                  {t('create.candidatesRange', { min: limits.minCandidates, max: limits.maxCandidates })}
                </p>
              </div>
            </div>

            {!hasEnough && (
              <p className="text-xs font-bold text-skred">
                {t('create.shortfall', {
                  amount: shortfallIdr !== null ? formatToIDR(shortfallIdr) : `${formData.totalFund} ${tokenMeta.symbol}`,
                })}{' '}
                {!tokenMeta.isNative && (
                  <button type="button" className="underline" onClick={() => setTopUpOpen(true)}>
                    {t('donate.addFunds')}
                  </button>
                )}
              </p>
            )}

            {/* Scoring method */}
            <div>
              <label className="block text-sm font-bold mb-1">{t('create.scoring')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 1, label: t('create.byStudent'), desc: t('create.byStudentDesc') },
                  { value: 0, label: t('create.byCommittee'), desc: t('create.byCommitteeDesc') },
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
                <span>{t('create.optionalMilestones')}</span>
                <span className="font-paytone text-skpurple">{formData.maxOptionalMilestones}</span>
              </label>
              <input
                type="range"
                min={0}
                max={limits.maxOptional}
                value={formData.maxOptionalMilestones}
                onChange={(e) => set('maxOptionalMilestones', Number(e.target.value))}
                className="w-full accent-skpurple"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>{t('create.disabled')}</span>
                <span>{t('create.max')}</span>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full text-sm font-bold text-skpurple flex items-center justify-between py-2 border-t-2 border-gray-100"
            >
              <span>{t('create.advanced')}</span>
              <span>{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 bg-white border-2 border-black p-4 shadow-[3px_3px_0_0_#000]">
                {/* Committee override (only relevant when a committee is needed) */}
                {needsCommittee && (
                  <div>
                    <label className="block text-xs font-bold mb-1">{t('create.committeeAddress')}</label>
                    <input
                      type="text"
                      placeholder={t('create.committeePlaceholder')}
                      className="w-full font-data text-sm"
                      value={formData.committeeContract}
                      onChange={(e) => set('committeeContract', e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t('create.committeeHint', { address: v4Addresses.CommitteeGovernance })}
                    </p>
                  </div>
                )}

                {/* Milestone review window */}
                <div>
                  <label className="flex justify-between text-xs font-bold mb-1">
                    <span>{t('create.disputeWindow')}</span>
                    <span>{t('create.days', { n: formData.milestoneDisputeWindowDays })}</span>
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
                    <span>{t('create.days', { n: 7 })}</span>
                    <span>{t('create.days', { n: 14 })}</span>
                  </div>
                </div>

                {/* Score Weights */}
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">
                    {t('create.scoreWeights')}{' '}
                    <span className={weightSum === 100 ? 'text-skgreen' : 'text-skred'}>
                      {t('create.sum', { sum: weightSum })}
                    </span>
                  </p>
                  {(
                    [
                      ['academicWeight', t('create.w.academic')],
                      ['incomeWeight', t('create.w.income')],
                      ['essayWeight', t('create.w.essay')],
                      ['recommendWeight', t('create.w.recommend')],
                      ['extracurricWeight', t('create.w.extracurric')],
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

                {/* Penalty split */}
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500 mb-2">
                    {t('create.penaltySplit')}{' '}
                    <span className={slashSum === 100 ? 'text-skgreen' : 'text-skred'}>
                      {t('create.sum', { sum: slashSum })}
                    </span>
                  </p>
                  {(
                    [
                      ['bountyHunterPercent', t('create.p.reporter')],
                      ['treasuryPercent', t('create.p.reserve')],
                      ['protocolPercent', t('create.p.platform')],
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
            <p className="font-bold">{t('create.uploading')}</p>
          </div>
        )}

        {step === 'approve' && (
          <div className="text-center py-12 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-pulse mb-2" />
            <p className="font-bold">{t('create.approving')}</p>
            <p className="text-sm text-gray-600">
              {t('create.approvingBody', { amount: formData.totalFund, symbol: tokenMeta.symbol })}
            </p>
          </div>
        )}

        {step === 'create' && (
          <div className="text-center py-12 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-2" />
            <p className="font-bold">{t('create.confirming')}</p>
            <p className="text-sm text-gray-600">{t('create.confirmingBody')}</p>
          </div>
        )}

        {/* Wallet/contract failures (e.g. missing USDC allowance or balance) used to be silent. */}
        {(step === 'approve' || step === 'create') && (step === 'approve' ? approveError : createError) && (
          <ErrorNotice
            error={step === 'approve' ? approveError : createError}
            ctx={{ min: limits.minCandidates, max: limits.maxCandidates, maxOptional: limits.maxOptional, maxCandidates: formData.maxCandidates }}
          />
        )}

        {/* Footer */}
        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white pb-1">
          <NeoButton
            label={t('common.cancel')}
            variant="ghost"
            onClick={handleClose}
            disabled={isApproving || isCreating}
          />
          {step === 'form' && (
            <NeoButton
              label={t('common.continue')}
              variant="primary"
              onClick={handleNext}
              disabled={
                !formData.name ||
                !formData.totalFund ||
                weightSum !== 100 ||
                slashSum !== 100 ||
                !candidatesOk ||
                !winnersOk ||
                !hasEnough
              }
            />
          )}
          {step === 'approve' && (
            <NeoButton
              label={isApproving ? t('create.approvingBtn') : t('create.approveBtn')}
              variant="primary"
              onClick={handleNext}
              disabled={isApproving}
              loading={isApproving}
            />
          )}
          {step === 'create' && (
            <NeoButton
              label={isCreating ? t('create.creatingBtn') : t('create.createBtn')}
              variant="success"
              onClick={handleNext}
              disabled={isCreating}
              loading={isCreating}
            />
          )}
        </div>
      </div>
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        suggestedIdr={shortfallIdr}
        onSuccess={() => refetchBalance()}
      />
    </NeoModal>
  );
}
