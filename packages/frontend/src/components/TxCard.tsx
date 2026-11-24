import { createPortal } from "react-dom";
import { useEffect } from "react";
import { dismissTx, useTx } from "@/lib/tx/txStore";
import { txLabel } from "@/lib/tx/txLabels";
import { explainError } from "@/lib/errors/explain";
import { useT } from "@/lib/i18n";

const PROGRESS = { signing: 33, confirming: 70, success: 100, error: 100 } as const;

/**
 * The one confirmation card for every transaction: what is being done, how much, the network fee,
 * and a progress bar that follows signing -> confirming -> done. Mounted once at the app root.
 */
export function TxCard() {
  const { t, lang } = useT();
  const tx = useTx();

  // A finished card closes itself; a failed one stays until the person dismisses it.
  useEffect(() => {
    if (tx?.phase !== "success") return;
    const id = setTimeout(dismissTx, 2000);
    return () => clearTimeout(id);
  }, [tx?.phase, tx?.hash]);

  if (!tx) return null;

  const failed = tx.phase === "error";
  const explained = failed ? explainError(tx.error, lang) : null;
  const rejected = explained?.kind === "rejected";
  const status =
    tx.phase === "signing" ? t("tx.signing")
    : tx.phase === "confirming" ? t("tx.confirming")
    : tx.phase === "success" ? t("tx.success")
    : rejected ? t("tx.rejected") : t("tx.failed");

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 pointer-events-none sm:inset-0 sm:items-center sm:bg-black/30 sm:pointer-events-auto">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-sm rounded-2xl border-[2.5px] border-black bg-white p-5 shadow-[6px_6px_0_0_#000] animate-[slide-up_0.2s_ease-out]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-paytone text-xl">{t("tx.title")}</h2>
          {failed && (
            <button type="button" onClick={dismissTx} aria-label={t("common.close")}
              className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-black bg-white font-bold shadow-[2px_2px_0_0_#000]">
              ×
            </button>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <p className="font-paytone text-lg leading-tight">{txLabel(tx.fn, lang)}</p>
          {tx.amount && <p className="font-paytone text-2xl text-right break-words">{tx.amount}</p>}
        </div>

        <p className="mt-2 text-sm font-bold text-gray-500">
          {t("tx.fee")} {tx.fee ?? "…"}
        </p>

        <div className="mt-3 h-4 w-full overflow-hidden rounded-full border-2 border-black bg-gray-100">
          <div
            className={`h-full border-r-2 border-black transition-all duration-500 ${failed ? (rejected ? "bg-skyellow" : "bg-skred") : "bg-skgreen"} ${tx.phase === "signing" || tx.phase === "confirming" ? "animate-pulse" : ""}`}
            style={{ width: `${PROGRESS[tx.phase]}%` }}
          />
        </div>

        <p className="mt-2 font-data text-sm font-bold">{status}</p>

        {explained && (
          <div className="mt-3 rounded-xl border-2 border-black bg-skred-light p-3 text-xs space-y-1">
            <p className="font-bold">{explained.reason}</p>
            <p className="text-gray-700">{explained.fix}</p>
          </div>
        )}
        {failed && (
          <button type="button" onClick={dismissTx}
            className="mt-3 w-full rounded-xl border-2 border-black bg-white py-2 font-bold shadow-[3px_3px_0_0_#000]">
            {t("common.close")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
