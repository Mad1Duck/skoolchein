import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { NeoModal } from "@/components/ui/NeoModal";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { formatTokenWithSymbol } from "@/lib/contracts/v4/token";
import { useT } from "@/lib/i18n";

export interface BreakdownRow {
  wallet: string;
  /** Why this wallet is in the list, e.g. "Donor". */
  role: string;
  amount: bigint;
  note?: string;
}

interface Props {
  title: string;
  token: string | undefined;
  /** undefined while the figures are loading. */
  summary?: { label: string; amount: bigint }[];
  rows?: BreakdownRow[];
  /** Explanations and warnings shown under the list. */
  children?: ReactNode;
  isError: boolean;
  confirmLabel: string;
  canConfirm: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Shows where money will go, then asks for confirmation. */
export function FundBreakdownModal({
  title, token, summary, rows, children, isError, confirmLabel, canConfirm, isPending, onConfirm, onClose,
}: Props) {
  const { t } = useT();
  const { address } = useAccount();
  const me = address?.toLowerCase();
  // Exact figures, not compact ones: parts must add up on screen.
  const money = (raw: bigint) => formatTokenWithSymbol(raw, token as `0x${string}` | undefined);

  return (
    <NeoModal isOpen onClose={onClose} title={title}>
      <div className="space-y-4">
        {isError ? (
          <p className="text-sm font-bold text-skred">{t("breakdown.error")}</p>
        ) : !summary || !rows ? (
          <NeoSkeleton lines={4} />
        ) : (
          <>
            <dl className="rounded-xl border-2 border-black bg-skbw p-3 space-y-1">
              {summary.map((line) => (
                <div key={line.label} className="flex justify-between gap-3 text-sm">
                  <dt>{line.label}</dt>
                  <dd className="font-data font-bold text-right [overflow-wrap:anywhere]">{money(line.amount)}</dd>
                </div>
              ))}
            </dl>

            {rows.length > 0 && (
              <ul className="rounded-xl border-2 border-black divide-y-2 divide-black/10">
                {rows.map((row) => (
                  <li key={`${row.role}:${row.wallet}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                    <WalletAvatar address={row.wallet} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">
                        {row.role}
                        {row.wallet.toLowerCase() === me && ` · ${t("breakdown.you")}`}
                      </p>
                      <CopyableText value={row.wallet} display={truncateMiddle(row.wallet, 8, 6)} />
                      {row.note && <p className="text-xs text-gray-600">{row.note}</p>}
                    </div>
                    <p className="font-data text-sm font-bold ml-auto">{money(row.amount)}</p>
                  </li>
                ))}
              </ul>
            )}

            {children}
            <p className="text-xs text-gray-500">{t("breakdown.asOfNow")}</p>
          </>
        )}

        <div className="flex justify-end gap-3">
          <NeoButton label={t("common.cancel")} variant="secondary" size="sm" className="!rounded-xl" onClick={onClose} />
          <NeoButton
            label={isPending ? t("common.processing") : confirmLabel}
            variant="primary"
            size="sm"
            className="!rounded-xl"
            loading={isPending}
            disabled={isPending || !canConfirm}
            onClick={onConfirm}
          />
        </div>
      </div>
    </NeoModal>
  );
}
