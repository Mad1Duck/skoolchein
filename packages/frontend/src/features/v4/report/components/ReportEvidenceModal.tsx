import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { ErrorNotice } from '@/components/ErrorNotice';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoSelect } from '@/components/ui/NeoSelect';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { uploadEvidence } from '@/lib/ipfs';
import { EvidenceFilesInput } from '@/components/ui/EvidenceFilesInput';
import { useRaiseDisputeWithStake, useBountyStake } from '@/lib/contracts/v4';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { isNativeToken } from '@/lib/contracts/v4/token';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { usdcAddress } from '@/lib/chain/chains';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { shortenAddress } from '@/components/ui/WalletAvatar';
import type { Milestone, Program, Scholar } from '@/lib/api/types';
import { useT } from '@/lib/i18n';

interface Props {
  onClose: () => void;
  program: Program;
  scholar: Scholar;
  /** Set to report one milestone; leave out to report the participant as a whole. */
  milestone?: Milestone;
}

const MIN_EVIDENCE = 10;

/**
 * One report, either about the participant (their application or conduct) or about a single
 * milestone (its proof). The reporter puts down a refundable deposit, so the form states what is
 * at stake before anything is signed.
 */
export function ReportEvidenceModal({ onClose, program, scholar, milestone }: Props) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { rate } = useTokenRate();
  const { isConnected } = useAccount();

  // Milestone reports are always "milestone fraud"; a participant report is minor (0) or serious (2).
  const [participantType, setParticipantType] = useState<number>(0);
  const [evidence, setEvidence] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const { start, phase, isPending, isSuccess, error, reset } = useRaiseDisputeWithStake();

  const disputeType = milestone ? 1 : participantType;
  const { stakeRequired, potentialReward, isError: stakeUnknown } = useBountyStake(
    scholar.wallet as `0x${string}`,
    BigInt(program.pid),
  );
  const stakeUsdc = formatUnits(stakeRequired, 6);
  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(usdcAddress(chainId), stakeUsdc);
  const stakeKnown = stakeRequired > 0n && !stakeUnknown;
  const toMoney = (units: bigint) =>
    rate ? formatToIDR(usdcToIdr(Number(formatUnits(units, 6)), rate)) : `${formatUnits(units, 6)} USDC`;

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        reset();
        onClose();
      }, 2200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  // Evidence is a written explanation, files, or both; one of them has to be there.
  const hasEvidence = evidence.trim().length >= MIN_EVIDENCE || files.length > 0;
  const valid = hasEvidence && (!stakeKnown || hasEnough) && isConnected;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setStep('uploading');
    setUploadError(null);
    try {
      const name = `${program.pid}-${scholar.wallet}-${milestone?.blockchainId ?? 0}-${Date.now()}`;
      const { metaCID } = await uploadEvidence({ content: evidence.trim(), files, type: 'dispute-evidence', name });
      setStep('tx');
      start(
        [BigInt(program.pid), scholar.wallet as `0x${string}`, BigInt(milestone?.blockchainId ?? 0), disputeType, metaCID],
        stakeRequired,
      );
    } catch (err) {
      console.error(err);
      setUploadError(err instanceof Error ? err.message : t('evidence.uploadFailed'));
      setStep('form');
    }
  };

  return (
    <NeoModal
      isOpen
      onClose={onClose}
      title={milestone ? t('report.modalMilestone', { id: milestone.blockchainId }) : t('report.modalScholar')}
    >
      {isSuccess ? (
        <div className="text-center py-8 space-y-2">
          <h2 className="font-paytone text-2xl">{t('dispute.successHeading')}</h2>
          <p className="text-gray-600">{t('dispute.successBody')}</p>
        </div>
      ) : step === 'uploading' ? (
        <div className="text-center py-12">
          <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
          <p className="font-bold">{t('dispute.uploading')}</p>
        </div>
      ) : step === 'tx' ? (
        <div className="text-center py-12 space-y-2">
          <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
          <p className="font-bold">{phase === 'approving' ? t('dispute.approving') : t('dispute.confirming')}</p>
          <p className="text-sm text-gray-600">
            {phase === 'approving' ? t('dispute.approvingBody') : t('dispute.confirmingBody')}
          </p>
          {error && <ErrorNotice error={error} className="mt-4" />}
          {error && <NeoButton label={t('common.retry')} variant="danger" onClick={() => setStep('form')} />}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl border-2 border-black bg-white p-3 text-sm space-y-1">
            <p>
              <span className="text-gray-500">{t('report.target')}:</span>{' '}
              <span className="font-bold font-data">{shortenAddress(scholar.wallet)}</span> · Program #{program.pid}
            </p>
            <p className="text-xs text-gray-600">
              {milestone ? t('report.targetMilestone') : t('report.targetScholar')}
            </p>
          </div>

          {!milestone && (
            <div>
              <label className="block text-sm font-bold mb-1">{t('dispute.type')}</label>
              <NeoSelect
                value={participantType}
                onChange={setParticipantType}
                options={[
                  { value: 0, label: t('dispute.typeLight') },
                  { value: 2, label: t('dispute.typeHeavy') },
                ]}
              />
            </div>
          )}

          <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-xs space-y-1">
            <p className="font-bold text-sm">{t('dispute.rulesTitle')}</p>
            <ul className="list-disc ml-5 text-gray-700 space-y-0.5">
              <li>{stakeKnown ? t('dispute.ruleDeposit', { amount: toMoney(stakeRequired) }) : t('dispute.ruleDepositPending')}</li>
              <li>{t('dispute.ruleReward', { amount: stakeKnown ? toMoney(potentialReward) : '—' })}</li>
              <li>{t('dispute.ruleLost')}</li>
              {milestone && <li>{t('dispute.ruleDouble')}</li>}
            </ul>
            {isNativeToken(program.token) && <p className="font-bold text-skred">{t('report.nativeNote')}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold">{t('dispute.evidence')}</label>
            <textarea
              rows={5}
              className="w-full border-2 border-black p-2 rounded-lg resize-none focus:outline-none focus:border-skpurple"
              placeholder={t('dispute.evidencePlaceholder')}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
            <EvidenceFilesInput files={files} onChange={setFiles} />
            {!hasEvidence && (
              <p className="text-xs text-gray-600">{t('evidence.needOne', { n: MIN_EVIDENCE })}</p>
            )}
            {uploadError && <p className="text-xs font-bold text-skred">{uploadError}</p>}
          </div>

          {stakeKnown && !hasEnough && (
            <div className="text-xs font-bold text-skred">
              {t('dispute.shortfall', { amount: shortfallIdr !== null ? formatToIDR(shortfallIdr) : `${stakeUsdc} USDC` })}{' '}
              <button type="button" className="underline" onClick={() => setTopUpOpen(true)}>
                {t('donate.addFunds')}
              </button>
            </div>
          )}

          {!isConnected && (
            <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm space-y-2">
              <p className="font-bold">{t('report.needWallet')}</p>
              <NeoButton label="Connect Wallet" variant="connect" size="md" />
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
            <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} disabled={isPending} type="button" fullWidth />
            <NeoButton
              label={isPending ? t('dispute.reporting') : t('dispute.submit')}
              variant="danger"
              className="!rounded-xl"
              loading={isPending}
              disabled={isPending || !valid}
              type="submit"
              fullWidth
            />
          </div>
        </form>
      )}
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        suggestedIdr={shortfallIdr}
        onSuccess={() => refetchBalance()}
      />
    </NeoModal>
  );
}
