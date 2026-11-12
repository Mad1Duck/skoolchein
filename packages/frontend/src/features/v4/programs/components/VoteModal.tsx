import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useVoteForCandidate } from '@/lib/contracts/v4';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';
import { useT } from '@/lib/i18n';
import { friendlyErrorKey } from '@/lib/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: bigint;
  candidateAddress: `0x${string}`;
  candidateName?: string;
}

type Step = 'choose' | 'confirm' | 'voting' | 'done';

export function VoteModal({ isOpen, onClose, programId, candidateAddress, candidateName }: Props) {
  const { t } = useT();
  const { address } = useAccount();
  const [step, setStep] = useState<Step>('choose');
  const [useReputationMode, setUseReputationMode] = useState(false);
  // Once the user picks a mode themselves we stop auto-selecting one.
  const [pickedMode, setPickedMode] = useState(false);

  const { data: repData, isLoading: loadingRep } = useReputation(address ?? '');
  const { vote, isPending, isSuccess, error, reset } = useVoteForCandidate();

  const hasDonationPower = Number(repData?.remainingVotingPower ?? 0) > 0;
  const hasReputation = Number(repData?.repBalance ?? 0) > 0 && !repData?.isVotingLocked;
  const noVotingPower = !!repData && !hasDonationPower && !hasReputation;

  // Start on whichever mode the user can actually use: donation weight first,
  // reputation only when there is no donation weight left.
  useEffect(() => {
    if (pickedMode || !repData) return;
    setUseReputationMode(!hasDonationPower && hasReputation);
  }, [repData, pickedMode, hasDonationPower, hasReputation]);

  useEffect(() => {
    if (isSuccess && step === 'voting') setStep('done');
  }, [isSuccess, step]);

  const handleVote = () => {
    vote(programId, candidateAddress, useReputationMode);
    setStep('voting');
  };

  const handleClose = () => {
    setStep('choose');
    setPickedMode(false);
    reset();
    onClose();
  };

  const name = candidateName ?? candidateAddress;

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('vote.successTitle')}>
        <div className="text-center py-10 space-y-4">
          <h2 className="font-paytone text-2xl">{t('vote.successHeading')}</h2>
          <p className="text-gray-600">
            {t('vote.successBody', {
              name,
              mode: useReputationMode ? t('vote.modeReputation') : t('vote.modeDonation'),
            })}
          </p>
          <NeoButton label={t('common.close')} variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  const donationPower = repData?.remainingVotingPower ?? '0';
  const srepBalance = repData?.repBalance ?? '0';

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('vote.title')}>
      <div className="space-y-5">
        {step === 'choose' && (
          <>
            <div className="bg-skblue-light border-2 border-black p-4 text-sm shadow-[3px_3px_0_0_#000]">
              <p className="font-bold mb-1">{t('vote.introTitle')}</p>
              <p className="text-xs text-gray-700 leading-relaxed">{t('vote.introBody')}</p>
            </div>

            {noVotingPower && (
              <div className="bg-skyellow-light border-2 border-black p-3 text-xs shadow-[2px_2px_0_0_#000]">
                {t('vote.noPower')}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => {
                  setPickedMode(true);
                  setUseReputationMode(false);
                }}
                className={`p-4 border-2 border-black text-left transition-all duration-75 ${
                  !useReputationMode ? 'bg-skgreen-light shadow-[3px_3px_0_0_#000]' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold">{t('vote.optDonationTitle')}</span>
                  {!useReputationMode && <span className="text-xs font-black">{t('vote.selected')}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">{t('vote.optDonationBody')}</p>
                <p className="text-lg font-black mt-2">{donationPower} USDC</p>
              </button>

              <button
                onClick={() => {
                  setPickedMode(true);
                  setUseReputationMode(true);
                }}
                className={`p-4 border-2 border-black text-left transition-all duration-75 ${
                  useReputationMode ? 'bg-skblue-light shadow-[3px_3px_0_0_#000]' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold">{t('vote.optReputationTitle')}</span>
                  {useReputationMode && <span className="text-xs font-black">{t('vote.selected')}</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">{t('vote.optReputationBody')}</p>
                <p className="text-lg font-black mt-2">{srepBalance}</p>
              </button>
            </div>

            {useReputationMode && repData?.isVotingLocked && (
              <div className="bg-skred-light border-2 border-black p-3 text-xs text-skred flex items-center gap-2 shadow-[2px_2px_0_0_#000]">
                <span>{t('vote.locked')}</span>
              </div>
            )}
          </>
        )}

        {step === 'voting' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-10 h-10 border-2 border-black bg-skblue mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">{t('vote.submitting')}</p>
            <p className="text-sm text-gray-600">{t('vote.submittingBody', { name })}</p>
            {error && (
              <div className="bg-skred-light p-3 text-xs text-skred border-2 border-black shadow-[2px_2px_0_0_#000]">
                {t(friendlyErrorKey(error))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton
            label={t('common.cancel')}
            variant="ghost"
            onClick={handleClose}
            disabled={isPending}
            fullWidth
          />
          {step === 'choose' && (
            <NeoButton
              label={loadingRep ? t('vote.loading') : t('vote.confirm')}
              variant="primary"
              onClick={handleVote}
              disabled={
                loadingRep ||
                (useReputationMode ? Number(srepBalance) === 0 || repData?.isVotingLocked : Number(donationPower) === 0)
              }
              fullWidth
            />
          )}
          {step === 'voting' && error && (
            <NeoButton label={t('common.retry')} variant="primary" onClick={handleVote} fullWidth />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
