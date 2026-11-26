import { useEffect, useState } from "react";
import { NeoButton } from "@/components/ui/NeoButton";
import { FundBreakdownModal } from "@/components/FundBreakdownModal";
import { useReleaseLeftover } from "@/lib/contracts/v4/hooks/treasury";
import { useLeftoverPreview } from "@/lib/contracts/v4/hooks/distribution";
import { formatTokenCompact } from "@/lib/contracts/v4/token";
import { useT } from "@/lib/i18n";
import type { Program } from "@/lib/api/types";

/** The unspent fund of a completed program, shared among the finishers after showing who gets what. */
export function LeftoverFund({ program, balance, onReleased }: { program: Program; balance: bigint; onReleased: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const { releaseLeftover, isPending, isSuccess } = useReleaseLeftover();
  const { data, isError } = useLeftoverPreview(program.pid, open);

  useEffect(() => {
    if (!isSuccess) return;
    setOpen(false);
    onReleased();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per success, not per new callback
  }, [isSuccess]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-black bg-skpurple-light p-4">
      <p className="text-sm">{t("leftover.hint", { amount: formatTokenCompact(balance, program.token) })}</p>
      <NeoButton
        label={t("breakdown.open")}
        variant="primary"
        size="sm"
        className="!rounded-xl shrink-0"
        onClick={() => setOpen(true)}
      />

      {open && (
        <FundBreakdownModal
          title={t("leftover.breakdownTitle")}
          token={program.token}
          summary={data && [
            { label: t("fund.leftover"), amount: data.balance },
            { label: t("leftover.recipientCount", { n: data.shares.length }), amount: data.shares.reduce((sum, s) => sum + s.amount, 0n) },
          ]}
          rows={data && [
            ...data.shares.map((s) => ({ wallet: s.wallet, role: t("leftover.finisher"), amount: s.amount })),
            ...data.excluded.map((wallet) => ({ wallet, role: t("leftover.notFinisher"), amount: 0n, note: t("leftover.notFinisherNote") })),
          ]}
          isError={isError}
          confirmLabel={t("leftover.release")}
          canConfirm={!!data && data.shares.length > 0 && !data.waitingOnReport}
          isPending={isPending}
          onConfirm={() => releaseLeftover(BigInt(program.pid))}
          onClose={() => setOpen(false)}
        >
          {data?.waitingOnReport ? (
            <p className="text-sm font-bold text-skred">{t("leftover.waitingReport")}</p>
          ) : data && data.shares.length === 0 ? (
            <p className="text-sm font-bold text-skred">{t("leftover.nobody")}</p>
          ) : (
            <p className="text-sm">{t("leftover.rule")}</p>
          )}
        </FundBreakdownModal>
      )}
    </div>
  );
}
