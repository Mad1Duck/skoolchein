import { useState, useEffect } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useProposeMilestone } from '@/lib/contracts/write-hooks';
import { useProgram } from '@/lib/api/hooks';
import { getTokenMeta, parseTokenAmount } from '@/lib/contracts/v4/token';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

type MilestoneKind = 1 | 2; // 1 = OPTIONAL, 2 = NEGOTIATED

export function ProposeMilestoneModal({ isOpen, onClose, programId }: Props) {
  const [kind, setKind] = useState<MilestoneKind>(1);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [externalId, setExternalId] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'tx'>('form');

  const { proposeMilestone, isPending, isSuccess } = useProposeMilestone();

  // The amount is denominated in the PROGRAM'S token, which decides the
  // decimals used to scale it (native 18, USDC 6). Resolved here rather than
  // taken as a prop so the two call sites can't pass a stale or missing value.
  const { data: program } = useProgram(String(programId));
  const token = program?.token;
  const tokenMeta = getTokenMeta(token);

  useEffect(() => {
    if (isSuccess) {
      onClose();
      setStep('form');
      setDescription('');
      setAmount('');
    }
  }, [isSuccess, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('uploading');

    try {
      // Upload description to IPFS
      const suffix = `${programId}-${Date.now()}`;
      const res = await uploadToIPFS({ meta: { content: description }, type: 'milestone-propose', name: suffix });
      const descCID = res?.metaCID || `QmDesc-${Date.now()}`;

      setStep('tx');
      proposeMilestone(
        BigInt(programId),
        kind,
        parseTokenAmount(amount, token),
        descCID,
        provider,
        externalId
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
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Propose Optional Milestone">
      <div className="space-y-5">
        {step === 'uploading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading description to IPFS</p>
          </div>
        )}

        {step === 'tx' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">Confirm Transaction in Wallet</p>
            <p className="text-sm text-gray-600 mt-1">Sign to submit your milestone proposal.</p>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-skyellow-light border-2 border-black p-3 text-sm shadow-[3px_3px_0_0_#000]">
              <p className="font-bold">How Optional Milestones Work</p>
              <p className="text-gray-700 mt-1 text-xs">
                Propose a custom deliverable for additional funding. Your committee will vote to approve or reject it.
                Approved milestones follow the same proof + dispute window flow as mandatory milestones.
              </p>
            </div>

            {/* Milestone Kind */}
            <div>
              <label className="block text-sm font-bold mb-2">Milestone Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind(1)}
                  className={`p-3 border-2 text-sm font-bold transition-all duration-75 ${
                    kind === 1 ? 'border-skpurple bg-skpurple-light' : 'border-black bg-white hover:bg-gray-50'
                  }`}
                >
                  OPTIONAL
                  <p className="text-xs font-normal text-gray-600 mt-0.5">Extra deliverable proposed by scholar</p>
                </button>
                <button
                  type="button"
                  onClick={() => setKind(2)}
                  className={`p-3 border-2 text-sm font-bold transition-all duration-75 ${
                    kind === 2 ? 'border-skblue bg-skblue-light' : 'border-black bg-white hover:bg-gray-50'
                  }`}
                >
                  NEGOTIATED
                  <p className="text-xs font-normal text-gray-600 mt-0.5">Co-designed with program initiator</p>
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Requested Amount ({tokenMeta.symbol}) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                // A whole-number step suits USDC but not an 18-decimal native
                // token, where realistic amounts are fractional.
                min="0"
                step={tokenMeta.isNative ? '0.001' : '1'}
                required
                className="w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={tokenMeta.isNative ? '0.5' : '50'}
              />
              <p className="text-xs text-gray-500 mt-1">
                In {tokenMeta.symbol} — the token backing this program. Must not exceed the
                program's remaining unallocated fund.
              </p>
            </div>

            {/* Platform Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold mb-1">Platform</label>
                <select
                  className="w-full bg-white h-[50px]"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="">Manual / Other</option>
                  <option value="hackquest">HackQuest</option>
                  <option value="udemy">Udemy</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">External ID</label>
                <input
                  type="text"
                  className="w-full"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  placeholder="e.g. HQ-ADV-01"
                  disabled={!provider}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-bold mb-1">
                Deliverable Description <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                className="w-full resize-none"
                placeholder="Describe what you will deliver and how it benefits your scholarship goals…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                label={isPending ? 'Proposing…' : !program ? 'Loading program…' : 'Submit Proposal'}
                variant="primary"
                loading={isPending}
                // Block until the program resolves. getTokenMeta() falls back to
                // native (18 decimals) for an unknown token, so submitting early
                // would scale a USDC program's amount by 10^12.
                disabled={isPending || !program || !description || !amount}
                fullWidth
              />
            </div>
          </form>
        )}
      </div>
    </NeoModal>
  );
}
