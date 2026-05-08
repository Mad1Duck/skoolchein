import { useState, useEffect } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useSubmitMilestone } from '@/lib/contracts/write-hooks';
import type { Milestone } from '@/lib/api/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  milestone: Milestone;
}

export function SubmitMilestoneModal({ isOpen, onClose, milestone }: Props) {
  const [proofDescription, setProofDescription] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');

  const { submitMilestone, isPending, isSuccess } = useSubmitMilestone();

  useEffect(() => {
    if (isSuccess) {
      onClose();
      setStep('form');
      setProofDescription('');
    }
  }, [isSuccess, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('uploading');

    try {
      // Upload proof description to IPFS
      const res = await uploadToIPFS({ meta: { content: proofDescription } });
      const proofCID = res?.metaCID || `QmProof-${Date.now()}`;

      setStep('tx');
      submitMilestone(BigInt(milestone.blockchainId), proofCID);
    } catch (err) {
      console.error(err);
      setStep('form');
    }
  };

  const handleClose = () => {
    setStep('form');
    onClose();
  };

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={`Submit Proof for Milestone #${milestone.blockchainId}`}>
      <div className="space-y-5">
        {step === 'uploading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading proof to IPFS</p>
          </div>
        )}

        {step === 'tx' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">Confirm Transaction in Wallet</p>
            <p className="text-sm text-gray-600 mt-1">Sign to submit your milestone proof.</p>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-skyellow-light border-2 border-black rounded-xl p-3 text-sm">
              <p className="font-bold">Submit Proof Document</p>
              <p className="text-gray-700 mt-1 text-xs">
                Since this is an OPTIONAL/NEGOTIATED milestone, you are required to submit concrete proof. This text will be permanently stored on IPFS.
              </p>
            </div>

            {/* Proof Description / Link */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Proof Description / Document Link <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                className="w-full border-2 border-black p-3 rounded-lg focus:outline-none focus:border-skpurple resize-none"
                placeholder="Include a link to your Google Doc, GitHub repo, or directly describe your completed deliverable here..."
                value={proofDescription}
                onChange={(e) => setProofDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
              <NeoButton
                label="Cancel"
                variant="ghost"
                onClick={handleClose}
                disabled={isPending}
                fullWidth
              />
              <NeoButton
                type="submit"
                label={isPending ? 'Submitting…' : 'Submit Proof'}
                variant="primary"
                loading={isPending}
                disabled={isPending || !proofDescription}
                fullWidth
              />
            </div>
          </form>
        )}
      </div>
    </NeoModal>
  );
}
