import { useState } from "react";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { DashboardCard } from "./DashboardCard";
import { useExecuteMilestone } from "@/lib/contracts/write-hooks";
import type { Milestone, Program } from "@/lib/api/types";
import { ProposeMilestoneModal } from "./ProposeMilestoneModal";
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { useFormatMoney } from '@/lib/money';

interface ProviderMilestonesPanelProps {
  program: Program | undefined;
  milestones: Milestone[];
  isLoading: boolean;
}

function StatusPill({ status }: { status: string }) {
  const { t } = useT();
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
      {statusLabel(t, status)}
    </span>
  );
}

export function ProviderMilestonesPanel({ program, milestones, isLoading }: ProviderMilestonesPanelProps) {
  const { t } = useT();
  const fmt = useFormatMoney();
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
          <h3 className="font-paytone text-xl">{t('pm.title', { id: program.pid })}</h3>
          <p className="text-sm text-gray-600">
            {t('pm.hint')}
          </p>
        </div>
        <NeoButton
          label={t('panel.propose')}
          variant="secondary"
          size="sm"
          onClick={() => setProposeOpen(true)}
        />
      </div>

      {programMilestones.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-black rounded-2xl bg-white/50">
          <p className="font-paytone text-lg">{t('pm.empty')}</p>
          <p className="text-sm text-gray-500">{t('pm.emptyHint')}</p>
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
                      {statusLabel(t, m.kind)}
                    </span>
                  </div>
                  <p className="text-sm font-data break-all line-clamp-1" title={m.proofCID}>
                    {t('pm.proof', { cid: m.proofCID })}
                  </p>
                  <p className="font-bold text-skgreen">
                    {fmt(m.amount, m.token)}
                  </p>
                </div>
                {canExecute && (
                  <NeoButton
                    label={isExecuting ? t('panel.executing') : t('pm.release')}
                    variant="success"
                    size="sm"
                    loading={isExecuting}
                    disabled={isExecuting}
                    onClick={() => executeMilestone(BigInt(m.blockchainId))}
                  />
                )}
                {m.status === "SUBMITTED" && !canExecute && (
                  <span className="text-xs font-bold text-gray-500">{t('pm.windowOpen')}</span>
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
