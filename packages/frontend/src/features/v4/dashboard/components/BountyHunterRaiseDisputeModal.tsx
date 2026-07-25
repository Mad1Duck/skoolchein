import { useState, useEffect } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useRaiseDispute } from '@/lib/contracts/write-hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  dashboardData: any;
}

export function BountyHunterRaiseDisputeModal({ isOpen, onClose, dashboardData }: Props) {
  const [programId, setProgramId] = useState('');
  const [scholarAddress, setScholarAddress] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [disputeType, setDisputeType] = useState<number>(0);
  const [evidenceText, setEvidenceText] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');

  const { raiseDispute, isPending, isSuccess } = useRaiseDispute();

  useEffect(() => {
    if (isSuccess) {
      onClose();
      setStep('form');
      setEvidenceText('');
    }
  }, [isSuccess, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programId || !scholarAddress || !evidenceText) return;
    setStep('uploading');

    try {
      // Upload evidence document/link to IPFS
      const suffix = `${programId}-${scholarAddress}-${milestoneId || '0'}-${Date.now()}`;
      const res = await uploadToIPFS({ meta: { content: evidenceText }, type: 'bounty-evidence', name: suffix });
      const evidenceCID = res?.metaCID || `QmEvidence-${Date.now()}`;

      setStep('tx');
      raiseDispute(
        BigInt(programId),
        scholarAddress as `0x${string}`,
        BigInt(milestoneId || '0'),
        disputeType,
        evidenceCID
      );
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
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Raise Dispute">
      <div className="space-y-4">
        {step === 'uploading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading evidence to IPFS</p>
          </div>
        )}

        {step === 'tx' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">Confirm Transaction in Wallet</p>
            <p className="text-sm text-gray-600 mt-1">Sign to raise your dispute and stake USDC.</p>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-skyellow-light border-2 border-black rounded p-3 text-sm">
              <p className="font-bold">Bounty Hunting Rules</p>
              <ul className="list-disc ml-5 mt-1 text-gray-700 text-xs text-left">
                <li>You must stake 10% of the program's total target fund.</li>
                <li>If your dispute is valid, the student is slashed and you earn a portion of the penalty plus your stake back.</li>
                <li>If rejected, you lose your stake.</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Target Program ID <span className="text-red-500">*</span></label>
              <input
                type="number"
                required
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
                placeholder="e.g. 1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold mb-1">Target Scholar Wallet <span className="text-red-500">*</span></label>
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
              <label className="block text-sm font-bold mb-1">Dispute Severity & Type <span className="text-red-500">*</span></label>
              <select
                value={disputeType}
                onChange={(e) => setDisputeType(Number(e.target.value))}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple bg-white"
              >
                <option value={0}>Light Infraction (e.g., missed deadlines)</option>
                <option value={1}>Milestone Fraud (fake proof)</option>
                <option value={2}>Heavy Fraud (stolen funds/identity)</option>
              </select>
            </div>

            {disputeType === 1 && (
              <div>
                <label className="block text-sm font-bold mb-1">Milestone ID to Dispute <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  required
                  value={milestoneId}
                  onChange={(e) => setMilestoneId(e.target.value)}
                  className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple"
                  placeholder="e.g. 5"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold mb-1">
                Evidence Links / Explanation <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                className="w-full border-2 border-black p-2 rounded focus:outline-none focus:border-skpurple resize-none"
                placeholder="Provide clear evidence against the target scholar..."
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <NeoButton label="Cancel" variant="ghost" fullWidth onClick={handleClose} disabled={isPending} type="button" />
              <NeoButton label={isPending ? 'Raising…' : 'Stake & Dispute'} variant="danger" fullWidth loading={isPending} disabled={isPending || !programId || !scholarAddress || !evidenceText} type="submit" />
            </div>
          </form>
        )}
      </div>
    </NeoModal>
  );
}
