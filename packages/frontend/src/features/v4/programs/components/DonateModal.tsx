import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useApproveUSDC, useDonate } from '@/lib/contracts/write-hooks';
import { v4Addresses } from '@/constants/contractsV4';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  programName?: string;
}

type Step = 'form' | 'approve' | 'donate' | 'done';

export function DonateModal({ isOpen, onClose, programId, programName }: Props) {
  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('10');
  const [nftUri, setNftUri] = useState('ipfs://QmDonorNFT');

  const { approve, isPending: isApproving, isSuccess: approved } = useApproveUSDC();
  const { donate, isPending: isDonating, isSuccess: donated } = useDonate();

  // Step progression
  useEffect(() => {
    if (approved && step === 'approve') setStep('donate');
  }, [approved, step]);

  useEffect(() => {
    if (donated && step === 'donate') setStep('done');
  }, [donated, step]);

  const handleAction = () => {
    if (step === 'form') {
      setStep('approve');
      approve(v4Addresses.ScholarshipCore, amount);
    } else if (step === 'donate') {
      donate(BigInt(programId), amount, nftUri);
    }
  };

  const handleClose = () => {
    setStep('form');
    setAmount('10');
    onClose();
  };

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Donation Successful!">
        <div className="text-center py-10 space-y-4">
          <h2 className="font-paytone text-2xl">Thank you for your contribution!</h2>
          <p className="text-gray-600">
            You donated <span className="font-bold">{amount} USDC</span> to{' '}
            {programName ?? `Program #${programId}`}. A Donor NFT has been minted to your wallet.
          </p>
          <NeoButton label="Close" variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Donate to Program">
      <div className="space-y-5">
        {step === 'form' && (
          <>
            <div className="bg-skgreen-light border-2 border-black p-4 text-sm shadow-[3px_3px_0_0_#000]">
              <p className="font-extrabold uppercase tracking-wider text-[10px] mb-2">How Donations Work</p>
              <ul className="text-gray-700 space-y-1 text-xs list-disc list-inside">
                <li>Your donation gives you <strong>voting power</strong> equal to the net amount</li>
                <li>A 1 USDC fee is deducted from all donations</li>
                <li>You'll receive a <strong>Donor NFT</strong> as proof of contribution</li>
                <li>Place a confidence stake on your chosen scholar to earn bonus yield</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
                Donation Amount (USDC) <span className="text-skred">*</span>
              </label>
              <input
                type="number"
                min="2"
                step="1"
                className="w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 2 USDC (1 USDC fee applied)</p>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">NFT Metadata URI</label>
              <input
                type="text"
                className="w-full font-data text-sm"
                value={nftUri}
                onChange={(e) => setNftUri(e.target.value)}
                placeholder="ipfs://Qm..."
              />
              <p className="text-xs text-gray-500 mt-1">IPFS URI for your Donor NFT metadata</p>
            </div>
          </>
        )}

        {step === 'approve' && (
          <div className="text-center py-10 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">Approving USDC</p>
            <p className="text-sm text-gray-600">
              Approving <strong>{amount} USDC</strong> for transfer. Please confirm in your wallet.
            </p>
          </div>
        )}

        {step === 'donate' && (
          <div className="text-center py-10 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skgreen mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">Confirm Donation</p>
            <p className="text-sm text-gray-600">
              Sign the transaction to donate <strong>{amount} USDC</strong> and receive your Donor NFT.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton
            label="Cancel"
            variant="ghost"
            onClick={handleClose}
            disabled={isApproving || isDonating}
            fullWidth
          />
          {step === 'form' && (
            <NeoButton
              label="Continue"
              variant="success"
              onClick={handleAction}
              disabled={!amount || Number(amount) < 2}
              fullWidth
            />
          )}
          {step === 'donate' && (
            <NeoButton
              label={isDonating ? 'Donating…' : 'Donate Now'}
              variant="success"
              onClick={handleAction}
              loading={isDonating}
              disabled={isDonating}
              fullWidth
            />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
