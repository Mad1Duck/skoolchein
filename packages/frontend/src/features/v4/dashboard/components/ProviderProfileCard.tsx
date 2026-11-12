import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./DashboardCard";
import type { Program } from "@/lib/api/types";
import { formatTokenCompact } from "@/lib/contracts/v4/token";
import { fetchProgramMeta } from "@/lib/ipfs";
import { useT } from '@/lib/i18n';

interface ProviderProfileCardProps {
  program: Program | undefined;
  isLoading: boolean;
}

export function ProviderProfileCard({ program, isLoading }: ProviderProfileCardProps) {
  const { t } = useT();
  const { address } = useAccount();
  const { data: meta } = useQuery({
    queryKey: ["ipfs-meta", program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });

  const image = `https://api.dicebear.com/9.x/thumbs/svg?seed=${address ?? "provider"}`;
  // Denominated in the program's own token — never a hardcoded 6 decimals.
  const totalFund = program ? formatTokenCompact(program.totalFund, program.token) : "—";
  const title = meta?.name ?? (program ? `Program #${program.pid}` : "No Program");
  const description = meta?.description ?? "";

  return (
    <DashboardCard className="space-y-4 relative isolate w-full min-w-0">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/80 rounded-2xl">
          <div className="animate-spin h-10 w-10 border-4 border-black border-t-transparent rounded-full" />
        </div>
      )}
      <div className={`space-y-4 transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}>
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-2 min-w-0">
            <div className="bg-skgreen font-bold text-xs w-max px-2 py-1 text-black rounded-full border border-black">
              {t('dash.programTag')}
            </div>
            <h1 className="font-paytone text-2xl flex items-center gap-2 min-w-0">
              <img className="size-6 rounded-full shrink-0" src={image} alt="creator" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
            </h1>
            <p className="text-sm text-gray-700 line-clamp-2 [overflow-wrap:anywhere]">
              {description || t('dash.impact')}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold leading-snug [overflow-wrap:anywhere]">
            {program ? title : t('dash.createFirst')}
          </h2>
          <div className="flex items-center gap-2">
            <img className="size-5 rounded-full" src={image} alt="creator" />
            <h3 className="text-sm font-semibold">
              {address ? `${address.slice(0, 7)}...${address.slice(-4)}` : "0x0"}
            </h3>
          </div>
          <div className="h-px bg-black/10" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('dash.totalFund')}</p>
            <div className="flex items-center gap-2">
              <img
                className="size-4"
                src="https://assets.coingecko.com/coins/images/6319/standard/usdc.png?1696506694"
                alt="usdc"
              />
              <p className="font-bold">{totalFund}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
