import { useEffect } from "react";
import { NeoButton } from "@/components/ui/NeoButton";
import { useReleaseLeftover } from "@/lib/contracts/v4/hooks/treasury";
import { formatTokenCompact } from "@/lib/contracts/v4/token";
import { useT } from "@/lib/i18n";
import type { Program } from "@/lib/api/types";

/** The unspent fund of a completed program, with the button that shares it among the finishers. */
export function LeftoverFund({ program, balance, onReleased }: { program: Program; balance: bigint; onReleased: () => void }) {
  const { t } = useT();
  const { releaseLeftover, isPending, isSuccess } = useReleaseLeftover();

  useEffect(() => {
    if (isSuccess) onReleased();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per success, not per new callback
  }, [isSuccess]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-black bg-skpurple-light p-4">
      <p className="text-sm">{t("leftover.hint", { amount: formatTokenCompact(balance, program.token) })}</p>
      <NeoButton
        label={isPending ? t("common.processing") : t("leftover.release")}
        variant="primary"
        size="sm"
        className="!rounded-xl shrink-0"
        loading={isPending}
        disabled={isPending}
        onClick={() => releaseLeftover(BigInt(program.pid))}
      />
    </div>
  );
}
