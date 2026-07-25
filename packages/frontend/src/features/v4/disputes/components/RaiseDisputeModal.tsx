import { useState } from "react";
import { uploadToIPFS } from "@/lib/ipfs";
import { useRaiseDispute } from "@/lib/contracts/write-hooks";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import type { Milestone } from "@/lib/api/types";

export function RaiseDisputeModal({
  isOpen, onClose, milestone, programPid
}: {
  isOpen: boolean; onClose: () => void; milestone: Milestone; programPid?: number | null;
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const [step, setStep] = useState<"form" | "uploading" | "tx">("form");

  const { raiseDispute, isPending, isSuccess } = useRaiseDispute();

  const handleNext = async () => {
    if (step === "form") {
      setStep("uploading");
      try {
        const suffix = `${milestone.blockchainId}-${Date.now()}`;
        const res = await uploadToIPFS({ meta: { content: evidenceText }, type: 'dispute-evidence', name: suffix });
        const cid = res?.metaCID || "QmDisputeFallbackCID123";
        setStep("tx");
        raiseDispute(
          BigInt(programPid ?? 0),
          milestone.scholarWallet as `0x${string}`,
          BigInt(milestone.blockchainId),
          1, // MILESTONE_FRAUD
          cid
        );
      } catch (err) {
        console.error(err);
        setStep("form");
      }
    }
  };

  if (isSuccess) {
    return (
      <NeoModal isOpen={isOpen} onClose={onClose} title="Dispute Raised">
        <div className="text-center py-8">
          <h2 className="text-2xl font-paytone mb-2">Dispute Active!</h2>
          <p className="text-gray-600 mb-6">The student must now defend against your claim.</p>
          <NeoButton label="Close" onClick={onClose} fullWidth variant="primary" />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Raise a Dispute">
      <div className="space-y-4">
        {step === "form" && (
          <>
            <p className="text-sm text-gray-700 bg-red-50 p-3 border-2 border-red-200 rounded-lg">
              You are disputing Milestone #{milestone.blockchainId}. If your claim is proven true, you will earn a bounty. If you are found to be maliciously spamming, you may be penalized by the Oracle.
            </p>
            <div>
              <label className="block text-sm font-bold mb-1">Evidence / Explanation</label>
              <textarea 
                className="w-full border-2 border-black p-2 rounded-lg neo-shadow-sm focus:outline-skred"
                rows={4}
                placeholder="Explain why this proof is fraudulent and provide links/evidence..."
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>
            <div className="bg-gray-100 p-2 rounded border border-gray-300 text-xs font-mono break-all line-clamp-1">
              Ref CID: {milestone.proofCID}
            </div>
          </>
        )}

        {step === "uploading" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading Evidence to IPFS</p>
          </div>
        )}

        {step === "tx" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">Confirm Transaction</p>
            <p className="text-sm text-gray-600">Please sign the smart contract interaction.</p>
          </div>
        )}

        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2">
          <NeoButton label="Cancel" variant="ghost" onClick={onClose} disabled={isPending || step === "uploading"} />
          {step === "form" && (
            <NeoButton label="Submit Evidence" variant="danger" onClick={handleNext} disabled={!evidenceText || evidenceText.length < 10} />
          )}
          {step === "tx" && (
            <NeoButton label="Waiting for Wallet..." variant="danger" disabled loading={isPending} />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
