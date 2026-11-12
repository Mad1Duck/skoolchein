import { appStateInjection } from "@/hooks/inject/app-state";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { NeoButton } from "../ui/NeoButton";
import { useT } from "@/lib/i18n";

function WaitWallet() {
  const { t } = useT();
  return (
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 border-2 border-black bg-skyellow mx-auto animate-pulse" />
      <h2 className="font-paytone text-xl">{t("loading.waitTitle")}</h2>
      <p className="text-sm text-gray-600">{t("loading.waitBody")}</p>
    </div>
  );
}

function WaitConfirmation() {
  const { t } = useT();
  return (
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 border-2 border-black bg-skpurple mx-auto animate-pulse" />
      <h2 className="font-paytone text-xl">{t("loading.processTitle")}</h2>
      <p className="text-sm text-gray-600">{t("loading.processBody")}</p>
      <div className="w-full h-3 border-2 border-black bg-gray-100">
        <div className="h-full bg-skyellow animate-pulse" />
      </div>
    </div>
  );
}

function Success() {
  const { t } = useT();
  const { loading: { loading, setLoading } } = appStateInjection.use();
  return (
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 border-2 border-black bg-skgreen mx-auto" />
      <h2 className="font-paytone text-xl text-black">{t("loading.successTitle")}</h2>
      <p className="text-sm text-gray-600">{loading.message ?? t("loading.successDefault")}</p>
      <NeoButton label={t("common.close")} variant="secondary" size="sm" onClick={() => setLoading({ type: "none" })} />
    </div>
  );
}

function Error() {
  const { t } = useT();
  const { loading: { loading, setLoading } } = appStateInjection.use();
  return (
    <div className="space-y-4 text-center">
      <div className="w-12 h-12 border-2 border-black bg-skred mx-auto" />
      <h2 className="font-paytone text-xl text-black">{t("loading.errorTitle")}</h2>
      <p className="text-sm text-gray-600">{loading.message ?? t("loading.errorDefault")}</p>
      <NeoButton label={t("common.close")} variant="secondary" size="sm" onClick={() => setLoading({ type: "none" })} />
    </div>
  );
}

export function LoadingState() {
  const { loading: { loading } } = appStateInjection.use();
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (loading.type !== "none" && !shouldRender) {
      setShouldRender(true);
      requestAnimationFrame(() => setIsVisible(true));
    }
    if (loading.type === "none" && shouldRender) {
      setIsVisible(false);
      const t = setTimeout(() => setShouldRender(false), 100);
      return () => clearTimeout(t);
    }
  }, [loading.type, shouldRender]);

  if (!shouldRender) return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-100 ${isVisible ? "opacity-100" : "opacity-0"}`}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 bg-white border-2 border-black shadow-[4px_4px_0_0_#000] rounded-md p-6 w-full max-w-sm mx-4">
        {loading.type === "proccessing" ? <WaitWallet />
          : loading.type === "confirmation" ? <WaitConfirmation />
          : loading.type === "success" ? <Success />
          : <Error />}
      </div>
    </div>,
    document.body
  );
}
