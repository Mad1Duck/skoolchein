import { useState } from "react";
import { DashboardCard } from "./DashboardCard";
import { NeoButton } from "@/components/ui/NeoButton";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { useOwnedCredentials, useWatchNft, type OwnedCredential } from "@/lib/contracts/v4/hooks/credentials";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/en";

const TONE: Record<OwnedCredential["kind"], string> = {
  student: "bg-skcyan",
  donor: "bg-skgreen",
  fraud: "bg-skred text-white",
};

/** Credential badges the connected wallet owns, each with an "Add to wallet" button. */
export function WalletBadges() {
  const { t } = useT();
  const { data, isLoading } = useOwnedCredentials();
  const watch = useWatchNft();
  // key = contract:tokenId → status
  const [state, setState] = useState<Record<string, "added" | "failed" | "pending">>({});

  if (isLoading) return <NeoSkeleton lines={2} />;
  if (!data || data.length === 0) return null;

  const add = async (c: OwnedCredential) => {
    const key = `${c.contract}:${c.tokenId}`;
    setState((s) => ({ ...s, [key]: "pending" }));
    try {
      const ok = await watch(c.contract, c.tokenId);
      setState((s) => {
        const next = { ...s };
        if (ok) next[key] = "added";
        else delete next[key]; // user dismissed the wallet prompt
        return next;
      });
    } catch {
      setState((s) => ({ ...s, [key]: "failed" }));
    }
  };

  return (
    <section className="mt-8">
      <h3 className="font-paytone text-2xl mb-3 border-l-8 border-skgreen pl-4 leading-none">
        {t("badges.walletTitle")}
      </h3>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.map((c) => {
          const key = `${c.contract}:${c.tokenId}`;
          const status = state[key];
          return (
            <DashboardCard key={key} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-paytone text-lg">{t(`badges.kind.${c.kind}` as TranslationKey)}</h4>
                  <p className="text-xs font-data text-gray-500">
                    {c.symbol} · #{c.tokenId.toString()}
                  </p>
                </div>
                <span className={`${TONE[c.kind]} text-[10px] font-extrabold uppercase px-2 py-1 border border-black rounded`}>
                  {c.symbol}
                </span>
              </div>

              <dl className="rounded-xl border-2 border-black divide-y divide-black/10 text-sm bg-white">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{t("badges.contract")}</dt>
                  <dd><CopyableText value={c.contract} display={truncateMiddle(c.contract, 8, 6)} /></dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{t("badges.tokenId")}</dt>
                  <dd><CopyableText value={c.tokenId.toString()} /></dd>
                </div>
              </dl>

              <NeoButton
                label={status === "added" ? t("badges.added") : t("badges.addToWallet")}
                variant={status === "added" ? "secondary" : "primary"}
                size="sm"
                fullWidth
                className="!rounded-xl"
                loading={status === "pending"}
                disabled={status === "pending" || status === "added"}
                onClick={() => add(c)}
              />
              {status === "failed" && <p className="text-xs font-bold text-skred">{t("badges.addFailed")}</p>}
            </DashboardCard>
          );
        })}
      </div>
    </section>
  );
}
