import { useState } from "react";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { DashboardCard } from "./DashboardCard";
import { useExecuteMilestone } from "@/lib/contracts/write-hooks";
import type { Milestone, Program } from "@/lib/api/types";
import { ProgramSettingsModal } from "../../programs/components/ProgramSettingsModal";
import { useT } from '@/lib/i18n';
import { useMilestonePlan } from '@/lib/contracts/v4/hooks/selection';
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

/**
 * Before winners are chosen there are no real milestones, only the creator's plan (saved in
 * Selection settings), which every winner will receive. Show that plan, with the amount each
 * milestone will be worth, instead of an empty state that says nothing has been set up.
 */
function PlannedMilestones({ program }: { program: Program }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { plan } = useMilestonePlan(program.pid);

  // Same split as ScholarshipSelection: one winner's portion, each share rounded down, the last takes the remainder.
  const portion = BigInt(program.totalFund || '0') / BigInt(Math.max(1, program.targetWinners));
  const saved = !!plan && plan.shareBps.length > 0;
  const shares = saved ? plan.shareBps : [10_000];
  const amounts: bigint[] = [];
  let assigned = 0n;
  shares.forEach((bps, i) => {
    if (i < shares.length - 1) {
      const a = (portion * BigInt(bps)) / 10_000n;
      amounts.push(a);
      assigned += a;
    } else {
      amounts.push(portion - assigned);
    }
  });

  return (
    <div className="rounded-2xl border-2 border-black bg-white p-4 space-y-3">
      <div>
        <p className="font-paytone text-lg">{t('plan.title')}</p>
        <p className="text-sm text-gray-600">{saved ? t('plan.hint') : t('plan.default')}</p>
      </div>
      <ol className="rounded-xl border-2 border-black divide-y divide-black/10 overflow-hidden">
        {shares.map((bps, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <span className="flex-1 min-w-0 text-sm font-bold truncate">
              {(saved && plan.descriptions[i]) || t('plan.item', { n: i + 1 })}
            </span>
            <span className="font-data text-xs text-gray-500">{bps / 100}%</span>
            <span className="font-data text-sm font-bold">{fmt(amounts[i], program.token)}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs font-bold text-gray-500">{t('plan.perWinner', { amount: fmt(portion, program.token) })}</p>
    </div>
  );
}

export function ProviderMilestonesPanel({ program, milestones, isLoading }: ProviderMilestonesPanelProps) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { executeMilestone, isPending: isExecuting } = useExecuteMilestone();
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        {/* Proposing a milestone is the scholar's action (the contract only accepts it from an active
            scholar). What the creator controls is the plan every winner receives, until screening ends. */}
        {['CREATED', 'APPLICATION_OPEN', 'SCREENING'].includes(program.status) && (
          <NeoButton
            label={t('settings.open')}
            variant="secondary"
            size="sm"
            className="!rounded-xl"
            onClick={() => setSettingsOpen(true)}
          />
        )}
      </div>

      {programMilestones.length === 0 ? (
        ['CREATED', 'APPLICATION_OPEN', 'SCREENING', 'VOTING'].includes(program.status) ? (
          <PlannedMilestones program={program} />
        ) : (
          <div className="text-center py-10 border-2 border-dashed border-black rounded-2xl bg-white/50">
            <p className="font-paytone text-lg">{t('pm.empty')}</p>
            <p className="text-sm text-gray-500">{t('pm.emptyHint')}</p>
          </div>
        )
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

      {settingsOpen && (
        <ProgramSettingsModal isOpen onClose={() => setSettingsOpen(false)} programId={program.pid} />
      )}
    </div>
  );
}
