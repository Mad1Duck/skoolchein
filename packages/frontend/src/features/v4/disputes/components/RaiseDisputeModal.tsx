import { useState } from "react";
import { formatUnits } from "viem";
import { uploadToIPFS } from "@/lib/ipfs";
import { useRaiseDisputeWithStake, useBountyStake } from "@/lib/contracts/v4";
import { useTokenBalance } from "@/lib/contracts/v4/hooks/balance";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { usdcAddress } from "@/lib/chain/chains";
import { useTokenRate } from "@/context/token-rate-context";
import { formatToIDR, usdcToIdr } from "@/util/localCurrency";
import { TopUpModal } from "@/components/ramp/TopUpModal";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import { useT } from "@/lib/i18n";
import { friendlyErrorKey } from "@/lib/errors";
import type { Milestone } from "@/lib/api/types";

export function RaiseDisputeModal({
  isOpen, onClose, milestone, programPid
}: {
  isOpen: boolean; onClose: () => void; milestone: Milestone; programPid?: number | null;
}) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { rate } = useTokenRate();
  const [evidenceText, setEvidenceText] = useState("");
  const [step, setStep] = useState<"form" | "uploading" | "tx">("form");
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { start, phase, isPending, isSuccess, error } = useRaiseDisputeWithStake();

  const scholar = milestone.scholarWallet as `0x${string}` | undefined;
  const { stakeRequired, isError: stakeUnknown } = useBountyStake(
    scholar,
    programPid != null ? BigInt(programPid) : undefined,
  );
  const stakeUsdc = formatUnits(stakeRequired, 6);
  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(usdcAddress(chainId), stakeUsdc);
  const stakeKnown = stakeRequired > 0n && !stakeUnknown;
  const stakeText = rate
    ? formatToIDR(usdcToIdr(Number(stakeUsdc), rate))
    : `${stakeUsdc} USDC`;

  const handleNext = async () => {
    if (step !== "form" || !scholar) return;
    setStep("uploading");
    try {
      const suffix = `${milestone.blockchainId}-${Date.now()}`;
      const res = await uploadToIPFS({ meta: { content: evidenceText }, type: 'dispute-evidence', name: suffix });
      const cid = res?.metaCID || "QmDisputeFallbackCID123";
      setStep("tx");
      start(
        [
          BigInt(programPid ?? 0),
          scholar,
          BigInt(milestone.blockchainId),
          1, // MILESTONE_FRAUD
          cid,
        ],
        stakeRequired,
      );
    } catch (err) {
      console.error(err);
      setStep("form");
    }
  };

  if (isSuccess) {
    return (
      <NeoModal isOpen={isOpen} onClose={onClose} title={t("dispute.successTitle")}>
        <div className="text-center py-8">
          <h2 className="text-2xl font-paytone mb-2">{t("dispute.successHeading")}</h2>
          <p className="text-gray-600 mb-6">{t("dispute.successBody")}</p>
          <NeoButton label={t("common.close")} onClick={onClose} fullWidth variant="primary" />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t("dispute.title")}>
      <div className="space-y-4">
        {step === "form" && (
          <>
            <p className="text-sm text-gray-700 bg-red-50 p-3 border-2 border-red-200 rounded-lg">
              {t("dispute.milestoneIntro", { id: milestone.blockchainId })}
            </p>
            {stakeKnown && (
              <p className="text-sm font-bold">{t("dispute.depositLine", { amount: stakeText })}</p>
            )}
            <div>
              <label className="block text-sm font-bold mb-1">{t("dispute.evidence")}</label>
              <textarea
                className="w-full border-2 border-black p-2 rounded-lg neo-shadow-sm focus:outline-skred"
                rows={4}
                placeholder={t("dispute.evidencePlaceholder")}
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
              />
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer font-bold">{t("common.advanced")}</summary>
              <div className="mt-2 bg-gray-100 p-2 rounded border border-gray-300 font-mono break-all line-clamp-1">
                {t("dispute.proofRef", { cid: milestone.proofCID })}
              </div>
            </details>
            {stakeKnown && !hasEnough && (
              <div className="text-xs font-bold text-skred">
                {t("dispute.shortfall", { amount: shortfallIdr !== null ? formatToIDR(shortfallIdr) : `${stakeUsdc} USDC` })}{" "}
                <button type="button" className="underline" onClick={() => setTopUpOpen(true)}>
                  {t("donate.addFunds")}
                </button>
              </div>
            )}
          </>
        )}

        {step === "uploading" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-spin mb-4" />
            <p className="font-bold">{t("dispute.uploading")}</p>
          </div>
        )}

        {step === "tx" && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4" />
            <p className="font-bold">
              {phase === "approving" ? t("dispute.approving") : t("dispute.confirming")}
            </p>
            <p className="text-sm text-gray-600">
              {phase === "approving" ? t("dispute.approvingBody") : t("dispute.confirmingBody")}
            </p>
            {error && (
              <div className="bg-skred-light p-3 mt-4 text-xs text-skred border-2 border-black shadow-[2px_2px_0_0_#000]">
                {t(friendlyErrorKey(error))}
              </div>
            )}
          </div>
        )}

        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2">
          <NeoButton label={t("common.cancel")} variant="ghost" onClick={onClose} disabled={isPending || step === "uploading"} />
          {step === "form" && (
            <NeoButton
              label={t("dispute.submitEvidence")}
              variant="danger"
              onClick={handleNext}
              disabled={!evidenceText || evidenceText.length < 10 || !scholar || !hasEnough}
            />
          )}
          {step === "tx" && (
            <NeoButton label={t("dispute.waiting")} variant="danger" disabled loading={isPending} />
          )}
        </div>
      </div>
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        suggestedIdr={shortfallIdr}
        onSuccess={() => refetchBalance()}
      />
    </NeoModal>
  );
}
