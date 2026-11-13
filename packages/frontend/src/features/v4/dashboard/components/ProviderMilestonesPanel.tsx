import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { DashboardCard } from "./DashboardCard";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { EvidenceView } from "@/components/ui/EvidenceView";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { useProgramMilestones } from "@/lib/api/hooks";
import { useExecuteMilestone } from "@/lib/contracts/write-hooks";
import { useApproveSubmission } from "@/lib/contracts/v4";
import { RequestRevisionModal } from "./RequestRevisionModal";
import type { Milestone, Program } from "@/lib/api/types";
import { ProgramSettingsModal } from "../../programs/components/ProgramSettingsModal";
import { useVotingClock } from "@/features/v4/vote/useVotingClock";
import { useT } from '@/lib/i18n';
import { useMilestonePlan } from '@/lib/contracts/v4/hooks/selection';
import { statusLabel } from '@/lib/i18n/status';
import { useFormatMoney } from '@/lib/money';
import { toDate } from "@/lib/time";

interface ProviderMilestonesPanelProps {
  program: Program | undefined;
  isLoading: boolean;
}

const PILL: Record<string, string> = {
  PENDING: "bg-skyellow text-black",
  SUBMITTED: "bg-skpurple text-white",
  COMPLETED: "bg-skgreen text-black",
  FROZEN: "bg-skred text-white",
  DISPUTED: "bg-skorange text-black",
  PROPOSED: "bg-skpurple-light text-black",
  REJECTED: "bg-gray-300 text-black",
};

function StatusPill({ status }: { status: string }) {
  const { t } = useT();
  return (
    <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black rounded-full ${PILL[status] ?? "bg-gray-100 text-black"}`}>
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

export function ProviderMilestonesPanel({ program, isLoading }: ProviderMilestonesPanelProps) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The milestones of the creator's PROGRAM. They used to come from the dashboard payload, which only
  // lists milestones where the viewer is the scholar, so a creator never saw a single one.
  const { data: programMilestones = [], isLoading: loadingMilestones } = useProgramMilestones(program ? String(program.pid) : '');

  if (isLoading || loadingMilestones || !program) {
    return (
      <DashboardCard>
        <NeoSkeleton lines={4} />
      </DashboardCard>
    );
  }

  // Group by scholar, in the order they appear.
  const groups = new Map<string, Milestone[]>();
  for (const m of programMilestones) {
    const key = (m.scholarWallet ?? "").toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  const count = (s: string) => programMilestones.filter((m) => m.status === s).length;
  const released = programMilestones
    .filter((m) => m.status === "COMPLETED")
    .reduce((sum, m) => sum + BigInt(m.amount || "0"), 0n);

  return (
    <div className="space-y-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-paytone text-xl">{t('pm.title', { id: program.pid })}</h3>
          <p className="text-sm text-gray-600">{t('pm.hint')}</p>
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
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label={t('pm.statWaiting')} value={String(count("PENDING"))} tone="bg-skyellow" />
            <Tile label={t('pm.statReview')} value={String(count("SUBMITTED"))} tone="bg-skpurple-light" />
            <Tile label={t('pm.statDone')} value={String(count("COMPLETED"))} tone="bg-skgreen" />
            <Tile label={t('pm.statReleased')} value={fmt(released, program.token)} tone="bg-white" />
          </div>

          <p className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">{t('pm.rule')}</p>

          <div className="space-y-5">
            {[...groups.entries()].map(([wallet, items]) => (
              <ScholarGroup key={wallet} wallet={wallet} milestones={items} program={program} />
            ))}
          </div>
        </>
      )}

      {settingsOpen && (
        <ProgramSettingsModal isOpen onClose={() => setSettingsOpen(false)} programId={program.pid} />
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`${tone} rounded-xl border-2 border-black p-3`}>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-600">{label}</p>
      <p className="font-data text-lg font-bold mt-1 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function ScholarGroup({ wallet, milestones, program }: { wallet: string; milestones: Milestone[]; program: Program }) {
  const { t } = useT();
  const done = milestones.filter((m) => m.status === "COMPLETED").length;

  return (
    <section className="rounded-2xl border-2 border-black bg-white shadow-[3px_3px_0_0_#000]">
      <header className="flex flex-wrap items-center gap-3 border-b-2 border-black bg-skbw/60 px-4 py-3 rounded-t-[14px]">
        <WalletAvatar address={wallet} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('pm.scholar')}</p>
          <CopyableText value={wallet} display={truncateMiddle(wallet, 8, 6)} />
        </div>
        <div className="w-40">
          <div className="flex justify-between text-[11px] font-bold">
            <span>{t('report.progress')}</span>
            <span className="font-data">{done} / {milestones.length}</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-black bg-gray-200">
            <div className="h-full bg-skpurple" style={{ width: `${(done / Math.max(1, milestones.length)) * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="divide-y-2 divide-black/10">
        {milestones.map((m) => (
          <MilestoneRowCard key={m.blockchainId} milestone={m} program={program} />
        ))}
      </div>
    </section>
  );
}

function MilestoneRowCard({ milestone: m, program }: { milestone: Milestone; program: Program }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { executeMilestone, isPending } = useExecuteMilestone();
  const { approve, isPending: approving } = useApproveSubmission();
  const [revising, setRevising] = useState(false);
  const clock = useVotingClock(m.disputeDeadline, m.submittedAt);

  const submitted = m.status === "SUBMITTED";
  const canRelease = submitted && clock.ended;
  const completedAt = toDate(m.completedAt);
  const submittedAt = toDate(m.submittedAt);

  return (
    <article className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">{m.blockchainId}</span>
        <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
          {statusLabel(t, m.kind)}
        </span>
        <StatusPill status={m.status} />
        <span className="ml-auto font-data text-base font-bold">{fmt(m.amount, m.token ?? program.token)}</span>
      </div>

      {m.status === "PENDING" && (
        <p className="text-sm text-gray-600">{(m.revisionCount ?? 0) > 0 ? t('pm.sentBack') : t('pm.notSubmitted')}</p>
      )}

      {submitted && (
        <div className="space-y-2 rounded-xl border-2 border-black bg-skpurple-light p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold">
              {clock.ended ? t('pm.reviewOver') : t('pm.reviewLeft')}
              {!clock.ended && <span className="ml-2 font-data">{clock.text}</span>}
            </span>
            {submittedAt && <span className="text-xs text-gray-600">{t('pm.submittedOn', { date: submittedAt.toLocaleString() })}</span>}
          </div>
          {clock.progress !== null && (
            <div className="h-2.5 w-full overflow-hidden rounded-full border-2 border-black bg-white">
              <div className="h-full bg-skpurple transition-all duration-1000" style={{ width: `${clock.progress * 100}%` }} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {/* Review is the creator's call. Approving releases the money right now; asking for a fix sends it
                back (only while the review period is open). Doing nothing also pays: it releases on its own. */}
            {!canRelease && (
              <>
                <NeoButton
                  label={approving ? t('pm.approving') : t('pm.approve')}
                  variant="success"
                  size="sm"
                  className="!rounded-xl"
                  loading={approving}
                  disabled={approving}
                  onClick={() => approve(BigInt(m.blockchainId))}
                />
                {(m.revisionCount ?? 0) < 2 && (
                  <NeoButton
                    label={t('pm.requestFix')}
                    variant="danger"
                    size="sm"
                    className="!rounded-xl"
                    onClick={() => setRevising(true)}
                  />
                )}
              </>
            )}
            {canRelease && (
              <NeoButton
                label={isPending ? t('panel.executing') : t('pm.release')}
                variant="success"
                size="sm"
                className="!rounded-xl"
                loading={isPending}
                disabled={isPending}
                onClick={() => executeMilestone(BigInt(m.blockchainId))}
              />
            )}
          </div>
        </div>
      )}

      {(m.revisionCount ?? 0) > 0 && (
        <p className="text-xs font-bold text-gray-600">{t('pm.revisions', { n: m.revisionCount ?? 0 })}</p>
      )}
      {revising && <RequestRevisionModal milestone={m} onClose={() => setRevising(false)} />}

      {m.status === "COMPLETED" && completedAt && (
        <p className="text-sm text-gray-600">{t('pm.releasedOn', { date: completedAt.toLocaleString() })}</p>
      )}

      {(m.status === "FROZEN" || m.status === "DISPUTED") && (
        <p className="text-sm">
          <span className="font-bold text-skred">{t('pm.frozen')}</span>{" "}
          <Link to="/disputes" className="underline font-bold">{t('pm.seeReport')}</Link>
        </p>
      )}

      {m.proofCID && m.status !== "PENDING" && (
        <details className="rounded-xl border-2 border-black bg-white p-3 text-sm">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider">{t('pm.viewProof')}</summary>
          <div className="mt-2">
            {/^AUTO_VERIFIED/.test(m.proofCID) ? <p>{t('report.proofAuto')}</p> : <EvidenceView cid={m.proofCID} empty={t('report.proofNone')} />}
          </div>
        </details>
      )}
    </article>
  );
}
