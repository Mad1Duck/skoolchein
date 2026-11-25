import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { NeoButton } from "@/components/ui/NeoButton";
import { useAccount } from "wagmi";
import { useDashboard, useDisputes } from "@/lib/api/hooks";
import { useTriggerAutoGuilty } from "@/lib/contracts/write-hooks";
import { formatTokenWithSymbol } from "@/lib/contracts/v4/token";
import { usdcAddress } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { toDate } from "@/lib/time";
import { statusLabel } from "@/lib/i18n/status";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { EvidenceView } from "@/components/ui/EvidenceView";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { useProgramLabel } from "@/lib/api/useProgramLabel";
import { useVotingClock } from "@/features/v4/vote/useVotingClock";
import { DefendModal } from "./DefendModal";
import type { Dispute } from "@/lib/api/types";
import { useT } from "@/lib/i18n";

type Tab = "active" | "program" | "against" | "mine" | "resolved";

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Every report in one place: what was reported, the evidence, the scholar's defense, and what each
 * person can do next. Raising a report happens on /report; this page is for following them up,
 * defending against one, and settling those whose defense window ran out.
 */
export function ReportsBoard() {
  const { t } = useT();
  const { address } = useAccount();
  const { data, isLoading } = useDisputes();
  // Reports in the programs this wallet created or sits on the committee of (the creator's and the committee's view).
  const { data: dashboard } = useDashboard(address ?? "");
  const [tab, setTab] = useState<Tab>("active");
  const [defending, setDefending] = useState<Dispute | null>(null);

  // Only the `dispute` part of each row: the joined `program` part is not reliable.
  const all = (data?.data ?? [])
    .map((x) => x.dispute)
    .sort((a, b) => (toDate(b.raisedAt ?? b.createdAt)?.getTime() ?? 0) - (toDate(a.raisedAt ?? a.createdAt)?.getTime() ?? 0));

  const active = all.filter((d) => d.status === "ACTIVE");
  const against = all.filter((d) => same(d.scholarAddress, address));
  const mine = all.filter((d) => same(d.bountyHunter, address));
  const resolved = all.filter((d) => d.status !== "ACTIVE");
  const programPids = new Set((dashboard?.programDisputes ?? []).map((d) => d.blockchainId));
  const inMyPrograms = all.filter((d) => programPids.has(d.blockchainId));
  const needsMe = against.filter((d) => d.status === "ACTIVE" && !d.counterEvidenceCID);

  const tabs: Array<{ key: Tab; label: string; items: Dispute[]; tone: string }> = [
    { key: "active", label: t("reports.tabActive"), items: active, tone: "bg-skred text-white" },
    { key: "program", label: t("reports.tabProgram"), items: inMyPrograms, tone: "bg-skgreen" },
    { key: "against", label: t("reports.tabAgainst"), items: against, tone: "bg-skyellow" },
    { key: "mine", label: t("reports.tabMine"), items: mine, tone: "bg-skcyan" },
    { key: "resolved", label: t("reports.tabResolved"), items: resolved, tone: "bg-gray-200" },
  ];
  const visibleTabs = tabs.filter((x) => x.key === "active" || x.key === "resolved" || x.items.length > 0 || x.key === tab);
  const shown = tabs.find((x) => x.key === tab)?.items ?? [];

  return (
    <>
      {needsMe.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-black bg-skyellow-light p-4 shadow-[4px_4px_0_0_#000]">
          <p className="font-bold">{t("reports.needsYou", { n: needsMe.length })}</p>
          <p className="text-sm text-gray-700">{t("reports.needsYouBody")}</p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {visibleTabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            aria-pressed={tab === x.key}
            className={`rounded-xl border-2 border-black px-4 py-2 text-sm font-extrabold uppercase tracking-wider transition-all ${
              tab === x.key ? `${x.tone} shadow-none translate-x-[2px] translate-y-[2px]` : "bg-white shadow-[3px_3px_0_0_#000] hover:-translate-y-0.5"
            }`}
          >
            {x.label} <span className="ml-1 font-data opacity-70">{x.items.length}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <NeoSkeleton lines={6} />
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border-2 border-black bg-white p-12 text-center shadow-[4px_4px_0_0_#000]">
          <p className="font-paytone text-xl mb-1">{t("reports.emptyTitle")}</p>
          <p className="text-sm text-gray-500">{t("reports.emptyBody")}</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((d) => (
            <ReportCard key={d.blockchainId} dispute={d} me={address} onDefend={() => setDefending(d)} />
          ))}
        </div>
      )}

      {defending && <DefendModal isOpen onClose={() => setDefending(null)} dispute={defending} />}
    </>
  );
}

function ReportCard({ dispute: d, me, onDefend }: { dispute: Dispute; me?: string; onDefend: () => void }) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { triggerAutoGuilty, isPending } = useTriggerAutoGuilty();
  const clock = useVotingClock(d.defenseDeadline);
  const { name } = useProgramLabel(d.pid ?? 0);

  const isActive = d.status === "ACTIVE";
  const iAmScholar = same(d.scholarAddress, me);
  const iAmReporter = same(d.bountyHunter, me);
  const defended = !!d.counterEvidenceCID;
  const windowClosed = d.defenseDeadline !== null && clock.ended;

  const tone = isActive
    ? "bg-skyellow"
    : d.status === "BH_WON" || d.status === "AUTO_GUILTY" || d.status === "STUDENT_CONCEDED"
      ? "bg-skgreen"
      : "bg-gray-200";

  return (
    <article className={`rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#000] ${iAmScholar && isActive && !defended ? "ring-4 ring-skyellow" : ""}`}>
      {/* Which program, what kind of report, and where it stands */}
      <div className="border-b-2 border-black bg-skred-light px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-paytone text-lg leading-tight">{name}</p>
            <p className="text-[11px] font-bold text-gray-600">
              {t("report.cardNo", { id: d.blockchainId })}
              {d.raisedAt ? ` · ${new Date(d.raisedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border-2 border-black px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${tone}`}>
            {statusLabel(t, d.status)}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full border-2 border-black bg-skred px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
            {statusLabel(t, d.disputeType)}
          </span>
          <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
            {d.milestoneId ? t("report.aboutMilestone", { id: d.milestoneId }) : t("report.aboutScholar")}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* Reporter -> accused */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Party label={t("reports.reporter")} address={d.bountyHunter} you={iAmReporter} />
          <span aria-hidden className="text-lg font-bold">→</span>
          <Party label={t("reports.scholar")} address={d.scholarAddress} you={iAmScholar} />
        </div>

        {/* The money */}
        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border-2 border-black bg-white p-2.5">
            <dt className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t("reports.deposit")}</dt>
            <dd className="mt-0.5 font-data text-sm font-bold">{formatTokenWithSymbol(d.stake, usdcAddress(chainId))}</dd>
          </div>
          <div className="rounded-xl border-2 border-black bg-skyellow-light p-2.5">
            <dt className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t("reports.reward")}</dt>
            <dd className="mt-0.5 font-data text-sm font-bold">{formatTokenWithSymbol(d.potentialReward, d.token)}</dd>
          </div>
        </dl>
        {d.pid !== null && (
          <Link to="/programs/$id" params={{ id: String(d.pid) }} className="inline-block text-xs font-bold underline">
            {t("report.openProgram")}
          </Link>
        )}

        <details className="rounded-xl border-2 border-black bg-white p-3">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-skred">{t("evidence.report")}</summary>
          <div className="mt-2"><EvidenceView cid={d.evidenceCID} /></div>
        </details>
        <details className="rounded-xl border-2 border-black bg-white p-3" open={defended && !isActive}>
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider">{t("evidence.defense")}</summary>
          <div className="mt-2"><EvidenceView cid={d.counterEvidenceCID} empty={t("evidence.noDefense")} /></div>
        </details>

        {isActive && (
          <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">
            {defended ? (
              <p className="font-bold">{t("reports.withCommittee")}</p>
            ) : windowClosed ? (
              <p className="font-bold">{t("reports.windowClosed")}</p>
            ) : (
              <p>
                <span className="font-bold">{t("reports.defenseLeft")}:</span>{" "}
                <span className="font-data">{clock.text ?? "—"}</span>
              </p>
            )}
          </div>
        )}

        {isActive && !defended && (
          iAmScholar && !windowClosed ? (
            <NeoButton label={t("reports.defend")} variant="primary" className="!rounded-xl" fullWidth onClick={onDefend} />
          ) : windowClosed ? (
            <NeoButton
              label={isPending ? t("panel.triggering") : t("panel.autoGuilty")}
              variant="danger"
              className="!rounded-xl"
              fullWidth
              loading={isPending}
              disabled={isPending}
              onClick={() => triggerAutoGuilty(BigInt(d.blockchainId))}
            />
          ) : (
            <NeoButton label={t("reports.awaiting")} variant="ghost" className="!rounded-xl" fullWidth disabled />
          )
        )}
      </div>
    </article>
  );
}

function Party({ label, address, you }: { label: string; address: string; you: boolean }) {
  const { t } = useT();
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border-2 border-black bg-white p-2">
      <WalletAvatar address={address} size={32} />
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}{you ? ` · ${t("appl.you")}` : ""}</p>
        <CopyableText value={address} display={truncateMiddle(address, 6, 4)} />
      </div>
    </div>
  );
}

