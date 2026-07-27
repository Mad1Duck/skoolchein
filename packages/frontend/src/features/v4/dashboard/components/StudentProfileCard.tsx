import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "./DashboardCard";
import { NeoButton } from "@/components/ui/NeoButton";
import type { Program, Scholar } from "@/lib/api/types";
import { formatCurrency, formatUSDC } from "@/util/currency";
import { fetchProgramMeta } from "@/lib/ipfs";

interface StudentProfileCardProps {
  scholar: Scholar | undefined;
  program: Partial<Program> | null | undefined;
  isLoading: boolean;
  onNext: () => void;
}

export function StudentProfileCard({ scholar, program, isLoading, onNext }: StudentProfileCardProps) {
  const { data: meta } = useQuery({
    queryKey: ["ipfs-meta", program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID!),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });
  const profileImage = `https://api.dicebear.com/9.x/thumbs/svg?seed=${scholar?.wallet ?? "student"}`;
  const creatorImage = `https://api.dicebear.com/9.x/thumbs/svg?seed=${program?.initiator ?? "creator"}`;
  const name = scholar ? `Scholar #${scholar.pid}` : "No Name";
  const totalReceived = scholar ? formatUSDC(BigInt(scholar.totalReceived)) : 0;
  const programTitle = meta?.name ?? (program?.pid ? `Program #${program.pid}` : "No Program");

  return (
    <DashboardCard className="space-y-4 relative isolate min-w-[20rem]">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/80 rounded-2xl">
          <div className="animate-spin h-10 w-10 border-4 border-black border-t-transparent rounded-full" />
        </div>
      )}
      <div className={`space-y-4 transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}>
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="bg-skpink border border-black w-max px-2 py-0.5 text-black rounded-full text-xs font-bold">
              Student
            </div>
            <h1 className="font-paytone text-2xl capitalize">Hi, {name}!</h1>
          </div>
          <NeoButton
            onClick={onNext}
            variant="secondary"
            size="sm"
            className="!p-2 !rounded-2xl !w-10 !h-10"
            aria-label="Next scholarship"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </NeoButton>
        </div>
        <p className="text-sm font-medium">Let’s get you one step closer to your dreams.</p>

        <img
          src={profileImage}
          className="size-32 rounded-3xl mx-auto border-4 border-black"
          alt={name}
        />

        <div className="space-y-3">
          <p className="text-sm font-medium">Active Scholarship:</p>
          <div>
            <h2 className="text-xl font-bold">{programTitle}</h2>
          </div>
          <div className="flex items-center gap-2">
            <img className="size-5 rounded-full" src={creatorImage} alt="creator" />
            <h3 className="text-sm font-semibold">
              {program?.initiator ? `${program.initiator.slice(0, 7)}...${program.initiator.slice(-4)}` : "0x0"}
            </h3>
          </div>
          <p className="text-sm font-medium">Total Fund Received:</p>
          <div className="flex items-center gap-2">
            <img
              className="size-4"
              src="https://assets.coingecko.com/coins/images/6319/standard/usdc.png?1696506694"
              alt="usdc"
            />
            <p className="font-bold">{formatCurrency(totalReceived, "USD")}</p>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}
