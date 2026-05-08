import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useVoteForCandidate } from '@/lib/contracts/v4';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: bigint;
  candidateAddress: `0x${string}`;
  candidateName?: string;
}

type Step = 'choose' | 'confirm' | 'voting' | 'done';

export function VoteModal({ isOpen, onClose, programId, candidateAddress, candidateName }: Props) {
  const { address } = useAccount();
  const [step, setStep] = useState<Step>('choose');
  const [useReputationMode, setUseReputationMode] = useState(false);

  const { data: repData, isLoading: loadingRep } = useReputation(address ?? '');
  const { vote, isPending, isSuccess, error, reset } = useVoteForCandidate();

  useEffect(() => {
    if (isSuccess && step === 'voting') setStep('done');
  }, [isSuccess, step]);

  const handleVote = () => {
    vote(programId, candidateAddress, useReputationMode);
    setStep('voting');
  };

  const handleClose = () => {
    setStep('choose');
    reset();
    onClose();
  };

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Vote Cast Successfully!">
        <div className="text-center py-10 space-y-4">
          <h2 className="font-paytone text-2xl">Your vote has been recorded!</h2>
          <p className="text-gray-600">
            You successfully voted for <span className="font-bold">{candidateName ?? candidateAddress}</span> using{' '}
            {useReputationMode ? 'Protocol Reputation (SREP)' : 'Donation Voting Power'}.
          </p>
          <NeoButton label="Close" variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  const donationPower = repData?.remainingVotingPower ?? '0';
  const srepBalance = repData?.repBalance ?? '0';

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Cast Your Vote">
      <div className="space-y-5">
        {step === 'choose' && (
          <>
            <div className="bg-skblue-light border-2 border-black rounded-xl p-4 text-sm">
              <p className="font-bold mb-1">Dual-Mode Participation</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                Choose how you want to support this candidate. You can use your global protocol reputation or the voting power you earned from donations.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => setUseReputationMode(false)}
                className={`p-4 border-2 border-black rounded-xl text-left transition-all ${
                  !useReputationMode ? 'shadow-neo bg-skgreen-light' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold">Mode 0: Donation Power</span>
                  {!useReputationMode && <span className="text-xs font-black">SELECTED</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">Spends your available voting power from USDC donations.</p>
                <p className="text-lg font-black mt-2">{donationPower} USDC</p>
              </button>

              <button
                onClick={() => setUseReputationMode(true)}
                className={`p-4 border-2 border-black rounded-xl text-left transition-all ${
                  useReputationMode ? 'shadow-neo bg-skblue-light' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold">Mode 1: Reputation (SREP)</span>
                  {useReputationMode && <span className="text-xs font-black">SELECTED</span>}
                </div>
                <p className="text-xs text-gray-600 mt-1">Leverage your global Soulbound Reputation. Does not spend tokens.</p>
                <p className="text-lg font-black mt-2">{srepBalance} SREP</p>
              </button>
            </div>

            {useReputationMode && repData?.isVotingLocked && (
              <div className="bg-red-50 border-2 border-red-500 rounded-xl p-3 text-xs text-red-700 flex items-center gap-2">
                <span>Your voting power is currently locked due to a pending dispute or cooldown.</span>
              </div>
            )}
          </>
        )}

        {step === 'voting' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-10 h-10 border-2 border-black bg-skblue mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">Submitting Vote</p>
            <p className="text-sm text-gray-600">
              Please confirm the transaction in your wallet to cast your vote for <strong>{candidateName ?? candidateAddress}</strong>.
            </p>
            {error && (
              <div className="bg-red-50 p-3 rounded-lg text-xs text-red-600 border border-red-200">
                Error: {error.message || 'Transaction failed'}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton
            label="Cancel"
            variant="ghost"
            onClick={handleClose}
            disabled={isPending}
            fullWidth
          />
          {step === 'choose' && (
            <NeoButton
              label={loadingRep ? 'Loading Power...' : 'Confirm Vote'}
              variant="primary"
              onClick={handleVote}
              disabled={
                loadingRep || 
                (useReputationMode ? (Number(srepBalance) === 0 || repData?.isVotingLocked) : Number(donationPower) === 0)
              }
              fullWidth
            />
          )}
          {step === 'voting' && error && (
            <NeoButton
              label="Retry"
              variant="primary"
              onClick={handleVote}
              fullWidth
            />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
