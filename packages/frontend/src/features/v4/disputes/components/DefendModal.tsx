import { useState } from "react";
import { uploadToIPFS } from "@/lib/ipfs";
import { useDefendDispute } from "@/lib/contracts/write-hooks";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import type { Dispute } from "@/lib/api/types";

export function DefendModal({ 
  isOpen, onClose, dispute 
}: { 
  isOpen: boolean; onClose: () => void; dispute: Dispute 
}) {
  const [evidenceText, setEvidenceText] = useState("");
  const [step, setStep] = useState<"form" | "uploading" | "tx">("form");

  const { submitDefense, isPending, isSuccess } = useDefendDispute();

  const handleNext = async () => {
    if (step === "form") {
      setStep("uploading");
      try {
        const suffix = `${dispute.blockchainId}-${Date.now()}`;
        const res = await uploadToIPFS({ meta: { content: evidenceText }, type: 'dispute-defense', name: suffix });
        const cid = res?.metaCID || "QmDefenseFallbackCID123";
        setStep("tx");
        submitDefense(BigInt(dispute.blockchainId), cid);
      } catch (err) {
        console.error(err);
        setStep("form");
      }
    }
  };

  if (isSuccess) {
    return (
      <NeoModal isOpen={isOpen} onClose={onClose} title="Defense Submitted">
        <div className="text-center py-8">
          <h2 className="text-2xl font-paytone mb-2">Defense Active!</h2>
          <p className="text-gray-600 mb-6">Your defense has been recorded on-chain. The Oracle will review.</p>
          <NeoButton label="Close" onClick={onClose} fullWidth variant="primary" />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Defend Dispute">
      <div className="space-y-4">
        {step === "form" && (
          <>
            <p className="text-sm text-gray-700 bg-skyellow-light p-3 border-2 border-black rounded-lg">
              A Bounty Hunter has disputed your milestone proof. Defend your case clearly here. If you concede or fail to respond before the deadline, you will lose the dispute.
            </p>
            <div className="bg-red-50 p-3 rounded border border-red-200 text-sm font-mono break-all line-clamp-2">
              <span className="font-bold text-red-800">Accusation Evidence:</span> {dispute.evidenceCID}
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Your Defense / Counter-Evidence</label>
              <textarea 
                className="w-full border-2 border-black p-2 rounded-lg neo-shadow-sm focus:outline-skblue"
                rows={4}
                placeholder="Explain why your proof is valid and refute the claim..."
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>
          </>
        )}

        {step === "uploading" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">Uploading Defense to IPFS</p>
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
            <NeoButton label="Submit Defense" variant="primary" onClick={handleNext} disabled={!evidenceText || evidenceText.length < 10} />
          )}
          {step === "tx" && (
            <NeoButton label="Waiting for Wallet..." variant="primary" disabled loading={isPending} />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
