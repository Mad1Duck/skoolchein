import { useEffect } from "react";
import { NeoButton } from "@/components/ui/NeoButton";
import { useOwedPayments, useWithdrawOwed, type OwedPayment } from "@/lib/contracts/v4/hooks/treasury";
import { formatTokenCompact } from "@/lib/contracts/v4/token";
import { useT } from "@/lib/i18n";

/** Money the contracts could not deliver to this wallet. Hidden when there is none. */
export function OwedPayments({ account }: { account: `0x${string}` }) {
  const { t } = useT();
  const { payments, refetch } = useOwedPayments(account);

  if (payments.length === 0) return null;

  return (
    <div className="mb-8 space-y-3 rounded-2xl border-2 border-black bg-white p-5 shadow-[3px_3px_0_0_#000]">
      <div>
        <p className="font-paytone text-lg">{t("owed.title")}</p>
        <p className="text-sm text-gray-600">{t("owed.hint")}</p>
      </div>
      {payments.map((payment) => (
        <OwedRow key={`${payment.source}-${payment.token}`} payment={payment} account={account} onDone={refetch} />
      ))}
    </div>
  );
}

function OwedRow({ payment, account, onDone }: { payment: OwedPayment; account: `0x${string}`; onDone: () => void }) {
  const { t } = useT();
  const { withdraw, isPending, isSuccess } = useWithdrawOwed();

  useEffect(() => {
    if (isSuccess) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per success, not per new callback
  }, [isSuccess]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border-2 border-black bg-skyellow-light p-3">
      <div>
        <p className="font-data font-bold">{formatTokenCompact(payment.amount, payment.token)}</p>
        <p className="text-xs text-gray-600">
          {t(payment.source === "ScholarshipTreasury" ? "owed.fromTreasury" : "owed.fromReports")}
        </p>
      </div>
      <NeoButton
        label={isPending ? t("common.processing") : t("owed.withdraw")}
        variant="primary"
        size="sm"
        className="!rounded-xl shrink-0"
        loading={isPending}
        disabled={isPending}
        onClick={() => withdraw(payment.source, payment.token, account)}
      />
    </div>
  );
}
