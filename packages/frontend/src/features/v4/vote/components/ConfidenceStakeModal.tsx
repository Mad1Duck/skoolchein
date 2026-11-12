import { useState, useEffect } from "react";
import { usePlaceConfidenceStake, useApproveUSDC } from "@/lib/contracts/write-hooks";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import { useV4Addresses } from '@/lib/chain/useActiveChain';
import { getTokenMeta } from "@/lib/contracts/v4/token";
import { needsApproval } from "@/lib/contracts/write-hooks";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  candidateWallet: string;
  /** Program payment token (`program.token`). Zero address = native. */
  token?: `0x${string}`;
}

export function ConfidenceStakeModal({ isOpen, onClose, programId, candidateWallet, token }: Props) {
  const v4Addresses = useV4Addresses();
  const tokenMeta = getTokenMeta(token);
  // Native stakes carry msg.value; approving the zero address would revert.
  const requiresApproval = needsApproval(token);
  const [amount, setAmount] = useState(tokenMeta.minDonationHint);
  const [step, setStep] = useState<"form" | "approve" | "stake">("form");

  const { approve, isPending: isApproving, isSuccess: approved } = useApproveUSDC();
  const { stake, isPending: isStaking, isSuccess: staked } = usePlaceConfidenceStake();

  const handleNext = () => {
    if (step === "form") {
      if (requiresApproval) {
        setStep("approve");
        approve(v4Addresses.ScholarshipCore, amount);
      } else {
        setStep("stake");
        stake(BigInt(programId), candidateWallet as `0x${string}`, amount, token);
      }
    } else if (step === "approve") {
      setStep("stake");
      stake(BigInt(programId), candidateWallet as `0x${string}`, amount, token);
    }
  };

  useEffect(() => {
    if (approved && step === "approve") {
      setStep("stake");
    }
  }, [approved, step]);

  if (staked) {
    return (
      <NeoModal isOpen={isOpen} onClose={onClose} title="Stake Confirmed">
        <div className="text-center py-8">
          <h2 className="text-2xl font-paytone mb-2">Confidence Staked!</h2>
          <p className="text-gray-600 mb-6">You've successfully backed this candidate.</p>
          <NeoButton label="Close" onClick={onClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Stake Confidence">
      <div className="space-y-4">
        {step === "form" && (
          <>
            <p className="text-sm text-gray-700 bg-skyellow-light p-3 border-2 border-black rounded-lg">
              Staking confidence allows you to earn bonus yield if this candidate successfully completes their scholarship milestones. If they behave maliciously and are slashed, you lose a portion of your stake.
            </p>
            <div>
              <label className="block text-sm font-bold mb-1">Stake Amount ({tokenMeta.symbol})</label>
              <input 
                type="number" 
                min="1"
                className="w-full border-2 border-black p-2 rounded-lg neo-shadow-sm focus:outline-skpurple"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="text-xs text-gray-500 font-mono">
              Candidate: {candidateWallet.slice(0, 8)}...{candidateWallet.slice(-6)}
            </div>
          </>
        )}

        {step === "approve" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-pulse mb-4" />
            <p className="font-bold">Approve {tokenMeta.symbol}</p>
            <p className="text-sm text-gray-600">Please approve the transfer of {amount} {tokenMeta.symbol}.</p>
          </div>
        )}

        {step === "stake" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">Confirm Stake On-chain</p>
            <p className="text-sm text-gray-600">Please sign the staking transaction.</p>
          </div>
        )}

        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2">
          <NeoButton label="Cancel" variant="ghost" onClick={onClose} disabled={isApproving || isStaking} />
          {step === "form" && (
            <NeoButton label="Continue" variant="primary" onClick={handleNext} disabled={!amount} />
          )}
          {step === "approve" && (
            <NeoButton label={isApproving ? "Approving..." : "Approve"} variant="primary" onClick={handleNext} disabled={isApproving} loading={isApproving} />
          )}
          {step === "stake" && (
            <NeoButton label={isStaking ? "Staking..." : "Stake"} variant="success" onClick={handleNext} disabled={isStaking} loading={isStaking} />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
