import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { usePlaceConfidenceStake } from '@/lib/contracts/v4';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: bigint;
  scholarAddress: `0x${string}`;
  scholarName?: string;
}

type Step = 'form' | 'staking' | 'done';

export function ConfidenceStakeModal({ isOpen, onClose, programId, scholarAddress, scholarName }: Props) {
  const { address } = useAccount();
  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('10');

  const { data: repData } = useReputation(address ?? '');
  const { stake, isPending, isSuccess, error, reset } = usePlaceConfidenceStake();

  useEffect(() => {
    if (isSuccess && step === 'staking') setStep('done');
  }, [isSuccess, step]);

  const handleStake = () => {
    stake(programId, scholarAddress, amount);
    setStep('staking');
  };

  const handleClose = () => {
    setStep('form');
    reset();
    onClose();
  };

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Stake Successful!">
        <div className="text-center py-10 space-y-4">
          <h2 className="font-paytone text-2xl">Confidence Stake Placed!</h2>
          <p className="text-gray-600">
            You successfully staked <span className="font-bold">{amount} USDC</span> on{' '}
            <span className="font-bold">{scholarName ?? scholarAddress}</span>.
          </p>
          <NeoButton label="Close" variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  const donationPower = repData?.remainingVotingPower ?? '0';

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Stake Confidence">
      <div className="space-y-5">
        {step === 'form' && (
          <>
            <div className="bg-skpurple-light border-2 border-black p-4 text-sm shadow-[3px_3px_0_0_#000]">
              <p className="font-bold mb-1">Stake and Earn</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                Staking confidence on a scholar allows you to earn a share of protocol fees if they successfully complete their program.
              </p>
            </div>

            <div className="bg-white border-2 border-dashed border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
              <span className="text-xs font-bold text-gray-500 uppercase">Available Power</span>
              <span className="font-black">{donationPower} USDC</span>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">
                Stake Amount (USDC)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full border-2 border-black p-4 font-black text-xl shadow-[3px_3px_0_0_#000]"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-2">Maximum confidence stake is limited by your donation amount.</p>
            </div>
          </>
        )}

        {step === 'staking' && (
          <div className="text-center py-10 space-y-4">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">Staking Confidence</p>
            <p className="text-sm text-gray-600">
              Confirm the transaction to stake <strong>{amount} USDC</strong> on <strong>{scholarName ?? scholarAddress}</strong>.
            </p>
            {error && (
              <div className="bg-skred-light p-3 text-xs text-skred border-2 border-black shadow-[2px_2px_0_0_#000]">
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
          {step === 'form' && (
            <NeoButton
              label={isPending ? 'Staking...' : 'Place Stake'}
              variant="primary"
              onClick={handleStake}
              disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(donationPower)}
              fullWidth
            />
          )}
          {step === 'staking' && error && (
            <NeoButton
              label="Retry"
              variant="primary"
              onClick={handleStake}
              fullWidth
            />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
