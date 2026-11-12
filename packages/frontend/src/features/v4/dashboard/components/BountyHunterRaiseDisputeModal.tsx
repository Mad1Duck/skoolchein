import { useState, useEffect } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { formatUnits, isAddress } from 'viem';
import { uploadToIPFS } from '@/lib/ipfs';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useRaiseDisputeWithStake, useBountyStake } from '@/lib/contracts/v4';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { usdcAddress } from '@/lib/chain/chains';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function BountyHunterRaiseDisputeModal({ isOpen, onClose }: Props) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { rate } = useTokenRate();

  const [programId, setProgramId] = useState('');
  const [scholarAddress, setScholarAddress] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [disputeType, setDisputeType] = useState<number>(0);
  const [evidenceText, setEvidenceText] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { start, phase, isPending, isSuccess, error, reset } = useRaiseDisputeWithStake();

  const scholarValid = isAddress(scholarAddress);
  const pidValid = programId !== '' && Number.isInteger(Number(programId)) && Number(programId) >= 0;
  const { stakeRequired, potentialReward, isError: stakeUnknown } = useBountyStake(
    scholarValid ? (scholarAddress as `0x${string}`) : undefined,
    pidValid ? BigInt(programId) : undefined,
  );

  // The deposit is always USDC. Check the wallet can cover it before starting.
  const usdcToken = usdcAddress(chainId);
  const stakeUsdc = formatUnits(stakeRequired, 6);
  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(usdcToken, stakeUsdc);

  const toIdr = (units: bigint) => (rate ? formatToIDR(usdcToIdr(Number(formatUnits(units, 6)), rate)) : `${formatUnits(units, 6)} USDC`);
  const stakeKnown = stakeRequired > 0n && !stakeUnknown;

  useEffect(() => {
    if (isSuccess) {
      handleClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const handleClose = () => {
    setStep('form');
    setEvidenceText('');
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pidValid || !scholarValid || !evidenceText || !hasEnough) return;
    setStep('uploading');

    try {
      // Upload evidence document/link to IPFS
      const suffix = `${programId}-${scholarAddress}-${milestoneId || '0'}-${Date.now()}`;
      const res = await uploadToIPFS({ meta: { content: evidenceText }, type: 'bounty-evidence', name: suffix });
      const evidenceCID = res?.metaCID || `QmEvidence-${Date.now()}`;

      setStep('tx');
      start(
        [
          BigInt(programId),
          scholarAddress as `0x${string}`,
          BigInt(milestoneId || '0'),
          disputeType,
          evidenceCID,
        ],
        stakeRequired,
      );
    } catch (err) {
      console.error(err);
      setStep('form');
    }
  };

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('dispute.title')}>
      <div className="space-y-4">
        {step === 'uploading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">{t('dispute.uploading')}</p>
          </div>
        )}

        {step === 'tx' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">
              {phase === 'approving' ? t('dispute.approving') : t('dispute.confirming')}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {phase === 'approving' ? t('dispute.approvingBody') : t('dispute.confirmingBody')}
            </p>
            {error && <ErrorNotice error={error} className="mt-4" />}
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-skyellow-light border-2 border-black rounded p-3 text-sm">
              <p className="font-bold">{t('dispute.rulesTitle')}</p>
              <ul className="list-disc ml-5 mt-1 text-gray-700 text-xs text-left">
                <li>
                  {stakeKnown
                    ? t('dispute.ruleDeposit', { amount: toIdr(stakeRequired) })
                    : t('dispute.ruleDepositPending')}
                </li>
                <li>
                  {t('dispute.ruleReward', { amount: stakeKnown ? toIdr(potentialReward) : '—' })}
                </li>
                <li>{t('dispute.ruleLost')}</li>
                <li>{t('dispute.ruleDouble')}</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">{t('dispute.programId')} <span className="text-red-500">*</span></label>
              <input
                type="number"
                required
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">{t('dispute.scholar')} <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={scholarAddress}
                onChange={(e) => setScholarAddress(e.target.value)}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
                placeholder="0x..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">{t('dispute.type')} <span className="text-red-500">*</span></label>
              <select
                value={disputeType}
                onChange={(e) => setDisputeType(Number(e.target.value))}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple bg-white"
              >
                <option value={0}>{t('dispute.typeLight')}</option>
                <option value={1}>{t('dispute.typeFraud')}</option>
                <option value={2}>{t('dispute.typeHeavy')}</option>
              </select>
            </div>

            {disputeType === 1 && (
              <div>
                <label className="block text-sm font-bold mb-1">{t('dispute.milestoneId')} <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  required
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
                  placeholder="5"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold mb-1">
                {t('dispute.evidence')} <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple resize-none"
                placeholder={t('dispute.evidencePlaceholder')}
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>

            {stakeKnown && !hasEnough && (
              <div className="text-xs font-bold text-skred">
                {t('dispute.shortfall', { amount: shortfallIdr !== null ? formatToIDR(shortfallIdr) : `${stakeUsdc} USDC` })}{' '}
                <button type="button" className="underline" onClick={() => setTopUpOpen(true)}>
                  {t('donate.addFunds')}
                </button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <NeoButton label={t('common.cancel')} variant="ghost" fullWidth onClick={handleClose} disabled={isPending} type="button" />
              <NeoButton
                label={isPending ? t('dispute.reporting') : t('dispute.submit')}
                variant="danger"
                fullWidth
                loading={isPending}
                disabled={isPending || !pidValid || !scholarValid || !evidenceText || !hasEnough}
                type="submit"
              />
            </div>
          </form>
        )}
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
