import { useState } from "react";
import { formatUnits } from "viem";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { DashboardCard } from "./DashboardCard";
import { useExecuteMilestone } from "@/lib/contracts/write-hooks";
import type { Milestone, Program } from "@/lib/api/types";
import { ProposeMilestoneModal } from "./ProposeMilestoneModal";

interface ProviderMilestonesPanelProps {
  program: Program | undefined;
  milestones: Milestone[];
  isLoading: boolean;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-skyellow text-black",
    SUBMITTED: "bg-skpurple text-white",
    COMPLETED: "bg-skgreen text-black",
    FROZEN: "bg-skred text-white",
    DISPUTED: "bg-skorange text-black",
    PROPOSED: "bg-skpurple-light text-black",
    REJECTED: "bg-gray-300 text-black",
  };
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black ${
        colors[status] ?? "bg-gray-100 text-black"
      }`}
    >
      {status}
    </span>
  );
}

export function ProviderMilestonesPanel({ program, milestones, isLoading }: ProviderMilestonesPanelProps) {
  const { executeMilestone, isPending: isExecuting } = useExecuteMilestone();
  const [proposeOpen, setProposeOpen] = useState(false);

  if (isLoading || !program) {
    return (
      <DashboardCard>
        <NeoSkeleton lines={4} />
      </DashboardCard>
    );
  }

  const programMilestones = milestones.filter((m) => m.pid === program.pid);

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-paytone text-xl">Program #{program.pid} Milestones</h3>
          <p className="text-sm text-gray-600">
            Review submitted proofs and execute payouts when the dispute window is clear.
          </p>
        </div>
        <NeoButton
          label="+ Propose Milestone"
          variant="secondary"
          size="sm"
          onClick={() => setProposeOpen(true)}
        />
      </div>

      {programMilestones.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-black rounded-2xl bg-white/50">
          <p className="font-paytone text-lg">No Milestones Yet</p>
          <p className="text-sm text-gray-500">Propose the first milestone for this program.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programMilestones.map((m) => {
            const disputeDeadline = m.disputeDeadline ? new Date(m.disputeDeadline).getTime() : null;
            const canExecute =
              m.status === "SUBMITTED" && disputeDeadline !== null && disputeDeadline < Date.now();

            return (
              <DashboardCard key={m.blockchainId} className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="grow space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">#{m.blockchainId}</span>
                    <StatusPill status={m.status} />
                    <span className="text-xs font-bold uppercase px-1.5 py-0.5 border border-black rounded bg-white">
                      {m.kind}
                    </span>
                  </div>
                  <p className="text-sm font-data break-all line-clamp-1" title={m.proofCID}>
                    Proof: {m.proofCID}
                  </p>
                  <p className="font-bold text-skgreen">
                    ${formatUnits(BigInt(m.amount), 6)} USDC
                  </p>
                </div>
                {canExecute && (
                  <NeoButton
                    label={isExecuting ? "Executing…" : "Execute Payout"}
                    variant="success"
                    size="sm"
                    loading={isExecuting}
                    disabled={isExecuting}
                    onClick={() => executeMilestone(BigInt(m.blockchainId))}
                  />
                )}
                {m.status === "SUBMITTED" && !canExecute && (
                  <span className="text-xs font-bold text-gray-500">Dispute window open</span>
                )}
              </DashboardCard>
            );
          })}
        </div>
      )}

      {proposeOpen && program && (
        <ProposeMilestoneModal
          isOpen
          onClose={() => setProposeOpen(false)}
          programId={program.pid}
        />
      )}
    </div>
  );
}
