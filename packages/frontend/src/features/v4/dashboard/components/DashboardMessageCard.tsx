import { DashboardCard } from "./DashboardCard";
import { NeoButton } from "@/components/ui/NeoButton";
import { useT } from "@/lib/i18n";

interface DashboardMessageCardProps {
  sender: string;
  message: string;
}

export function DashboardMessageCard({ sender, message }: DashboardMessageCardProps) {
  const { t } = useT();
  return (
    <DashboardCard className="space-y-3 relative isolate">
      <div className="flex gap-2 items-center">
        <img src="/icons/message-notification-01.svg" alt="message" className="size-5" />
        <span className="text-sm">{t("message.from")}</span>
        <span className="font-bold text-sm">
          {sender.slice(0, 7)}...{sender.slice(-4)}
        </span>
      </div>
      <div className="h-px w-full bg-black/10" />
      <p className="italic [text-wrap:pretty]">&quot;{message}&quot;</p>
      <div className="self-end flex justify-end">
        <NeoButton label={t("message.reply")} size="sm" />
      </div>
    </DashboardCard>
  );
}
