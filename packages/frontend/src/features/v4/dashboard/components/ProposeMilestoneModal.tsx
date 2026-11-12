import { useState, useEffect } from 'react';
import { uploadToIPFS } from '@/lib/ipfs';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useProposeMilestone } from '@/lib/contracts/write-hooks';
import { useProgram } from '@/lib/api/hooks';
import { formatTokenCompact, getTokenMeta, parseTokenAmount } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

type MilestoneKind = 1 | 2; // 1 = OPTIONAL, 2 = NEGOTIATED

export function ProposeMilestoneModal({ isOpen, onClose, programId }: Props) {
  const { t } = useT();
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

  // ── Fund budget ─────────────────────────────────────────────────────────
  // All in the program's token, kept as bigint: 18-decimal amounts exceed
  // Number's exact range, so arithmetic here must never round-trip through it.
  //
  // `totalFund` already includes donations — the indexer's DonationReceived
  // handler adds each donation's netAmount to it — so it is the true ceiling.
  // The contract rejects a milestone that exceeds what is still unallocated.
  const totalFund = BigInt(program?.totalFund ?? 0);
  const allocated = BigInt(program?.allocatedFund ?? 0);
  const spent = BigInt(program?.spentFund ?? 0);
  const available = totalFund > allocated ? totalFund - allocated : 0n;

  // parseTokenAmount throws on malformed input (stray letters, more decimals
  // than the token supports), which must not blank the whole modal.
  let requested = 0n;
  let amountInvalid = false;
  try {
    requested = parseTokenAmount(amount || '0', token);
  } catch {
    amountInvalid = true;
  }

  const remainingAfter = available - requested;
  const isOverBudget = requested > available;
  const scholarCount = program?.activeScholarCount ?? 0;
  const perScholarAfter =
    scholarCount > 0 && remainingAfter > 0n ? remainingAfter / BigInt(scholarCount) : 0n;

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
            <p className="font-bold">{t('milestone.proposeConfirmTitle')}</p>
            <p className="text-sm text-gray-600 mt-1">{t('milestone.proposeConfirmBody')}</p>
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
                In {tokenMeta.symbol} — the token backing this program.
              </p>

              {/* Budget breakdown — shows what is actually spendable and
                  whether this request fits, instead of leaving the user to
                  discover the limit through a reverted transaction. */}
              <div className="mt-3 border-2 border-black bg-white shadow-[3px_3px_0_0_#000] text-xs">
                <div className="px-3 py-2 border-b-2 border-black bg-gray-50 font-extrabold uppercase tracking-widest text-[10px]">
                  Fund Breakdown
                </div>
                <dl className="p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Total fund (incl. donations)</dt>
                    <dd className="font-data font-bold">{formatTokenCompact(totalFund, token)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Already allocated</dt>
                    <dd className="font-data">−{formatTokenCompact(allocated, token)}</dd>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <dt className="pl-3">of which paid out</dt>
                    <dd className="font-data">{formatTokenCompact(spent, token)}</dd>
                  </div>

                  <div className="flex justify-between border-t-2 border-black/10 pt-1.5">
                    <dt className="font-bold">Available now</dt>
                    <dd className="font-data font-bold">{formatTokenCompact(available, token)}</dd>
                  </div>

                  {requested > 0n && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">This request</dt>
                        <dd className="font-data">−{formatTokenCompact(requested, token)}</dd>
                      </div>
                      <div className="flex justify-between border-t-2 border-black/10 pt-1.5">
                        <dt className="font-bold">Left afterwards</dt>
                        <dd className={`font-data font-bold ${isOverBudget ? 'text-red-600' : 'text-emerald-700'}`}>
                          {isOverBudget ? '−' : ''}
                          {formatTokenCompact(isOverBudget ? -remainingAfter : remainingAfter, token)}
                        </dd>
                      </div>
                      {scholarCount > 0 && !isOverBudget && (
                        <div className="flex justify-between text-gray-500">
                          <dt>Split across {scholarCount} active scholar{scholarCount === 1 ? '' : 's'}</dt>
                          <dd className="font-data">{formatTokenCompact(perScholarAfter, token)} each</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>

                {isOverBudget && (
                  <p className="px-3 py-2 border-t-2 border-black bg-red-50 text-red-700 font-bold">
                    Over available fund by {formatTokenCompact(requested - available, token)}.
                    The proposal itself will submit, but your committee cannot approve
                    it — approval reverts with InsufficientProgramFund unless donations
                    cover the gap first. It would also use up one of your limited
                    optional-milestone slots.
                  </p>
                )}
                {amountInvalid && (
                  <p className="px-3 py-2 border-t-2 border-black bg-red-50 text-red-700 font-bold">
                    Not a valid {tokenMeta.symbol} amount (max {tokenMeta.decimals} decimal places).
                  </p>
                )}
                {!isOverBudget && !amountInvalid && available === 0n && program && (
                  <p className="px-3 py-2 border-t-2 border-black bg-skyellow-light font-bold">
                    Every {tokenMeta.symbol} in this program is already allocated. A new
                    milestone needs additional donations first.
                  </p>
                )}
              </div>
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
                label={
                  isPending ? 'Proposing…'
                  : !program ? 'Loading program…'
                  : isOverBudget ? 'Submit Anyway'
                  : 'Submit Proposal'
                }
                variant="primary"
                loading={isPending}
                // Block until the program resolves. getTokenMeta() falls back to
                // native (18 decimals) for an unknown token, so submitting early
                // would scale a USDC program's amount by 10^12.
                //
                // Over-budget is deliberately NOT blocked: proposeMilestone has
                // no fund check (only approveMilestone does), and donations can
                // arrive before the committee votes. The warning above states
                // the consequence and the label changes — the choice is the
                // scholar's, not ours to veto.
                disabled={
                  isPending ||
                  !program ||
                  !description ||
                  !amount ||
                  amountInvalid ||
                  requested === 0n
                }
                fullWidth
              />
            </div>
          </form>
        )}
      </div>
    </NeoModal>
  );
}
