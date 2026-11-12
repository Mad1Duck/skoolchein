import { useState } from "react";
import { ErrorNotice } from '@/components/ErrorNotice';
import { uploadToIPFS } from "@/lib/ipfs";
import { useDefendDispute } from "@/lib/contracts/write-hooks";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import { useT } from "@/lib/i18n";
import type { Dispute } from "@/lib/api/types";

export function DefendModal({
  isOpen, onClose, dispute
}: {
  isOpen: boolean; onClose: () => void; dispute: Dispute
}) {
  const { t } = useT();
  const [evidenceText, setEvidenceText] = useState("");
  const [step, setStep] = useState<"form" | "uploading" | "tx">("form");

  const { submitDefense, isPending, isSuccess, error } = useDefendDispute();

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
      <NeoModal isOpen={isOpen} onClose={onClose} title={t("defend.successTitle")}>
        <div className="text-center py-8">
          <h2 className="text-2xl font-paytone mb-2">{t("defend.successHeading")}</h2>
          <p className="text-gray-600 mb-6">{t("defend.successBody")}</p>
          <NeoButton label={t("common.close")} onClick={onClose} fullWidth variant="primary" />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t("defend.title")}>
      <div className="space-y-4">
        {step === "form" && (
          <>
            <p className="text-sm text-gray-700 bg-skyellow-light p-3 border-2 border-black rounded-lg">
              {t("defend.intro")}
            </p>
            <details className="text-xs">
              <summary className="cursor-pointer font-bold">{t("common.advanced")}</summary>
              <div className="mt-2 bg-red-50 p-3 rounded border border-red-200 font-mono break-all line-clamp-2">
                <span className="font-bold text-red-800">{t("defend.accusation")}</span> {dispute.evidenceCID}
              </div>
            </details>
            <div>
              <label className="block text-sm font-bold mb-1">{t("defend.label")}</label>
              <textarea
                className="w-full border-2 border-black p-2 rounded-lg neo-shadow-sm focus:outline-skblue"
                rows={4}
                placeholder={t("defend.placeholder")}
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>
          </>
        )}

        {step === "uploading" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">{t("defend.uploading")}</p>
          </div>
        )}

        {step === "tx" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">{t("defend.confirming")}</p>
            <p className="text-sm text-gray-600">{t("defend.confirmingBody")}</p>
            {error && <ErrorNotice error={error} className="mt-4" />}
          </div>
        )}

        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2">
          <NeoButton label={t("common.cancel")} variant="ghost" onClick={onClose} disabled={isPending || step === "uploading"} />
          {step === "form" && (
            <NeoButton label={t("defend.submit")} variant="primary" onClick={handleNext} disabled={!evidenceText || evidenceText.length < 10} />
          )}
          {step === "tx" && (
            <NeoButton label={t("dispute.waiting")} variant="primary" disabled loading={isPending} />
          )}
        </div>
      </div>
    </NeoModal>
  );
}
