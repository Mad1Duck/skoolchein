import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { useDisputes } from "@/lib/api/hooks";
import { useTriggerAutoGuilty } from "@/lib/contracts/write-hooks";
import { formatTokenWithSymbol } from "@/lib/contracts/v4/token";
import { usdcAddress } from "@/lib/chain/chains";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { toDate } from "@/lib/time";
import { statusLabel } from "@/lib/i18n/status";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { EvidenceView } from "@/components/ui/EvidenceView";
import { useVotingClock } from "@/features/v4/vote/useVotingClock";
import { DefendModal } from "../components/DefendModal";
import type { Dispute } from "@/lib/api/types";
import { useT } from "@/lib/i18n";

type Tab = "active" | "against" | "mine" | "resolved";

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Every report in one place: what was reported, the evidence, the scholar's defense, and what each
 * person can do next. Raising a report happens on /report; this page is for following them up,
 * defending against one, and settling those whose defense window ran out.
 */
export function DisputesPage() {
  const { t } = useT();
  const { address } = useAccount();
  const { data, isLoading } = useDisputes();
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
  const needsMe = against.filter((d) => d.status === "ACTIVE" && !d.counterEvidenceCID);

  const tabs: Array<{ key: Tab; label: string; items: Dispute[]; tone: string }> = [
    { key: "active", label: t("disputes.tabActive"), items: active, tone: "bg-skred text-white" },
    { key: "against", label: t("disputes.tabAgainst"), items: against, tone: "bg-skyellow" },
    { key: "mine", label: t("disputes.tabMine"), items: mine, tone: "bg-skcyan" },
    { key: "resolved", label: t("disputes.tabResolved"), items: resolved, tone: "bg-gray-200" },
  ];
  const shown = tabs.find((x) => x.key === tab)?.items ?? [];

  return (
    <main className="min-h-screen bg-skyellow relative isolate">
      <div
        className="absolute top-0 right-0 left-0 h-[42vh] bg-skred"
        style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)" }}
      />
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-10">
        <header className="pt-8 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-paytone text-4xl md:text-6xl mb-3 text-white drop-shadow-[4px_4px_0_#000]">{t("disputes.title")}</h1>
            <p className="text-black/80 text-lg md:text-xl max-w-2xl font-medium">{t("disputes.lead")}</p>
          </div>
          <Link to="/report">
            <NeoButton label={t("disputes.newReport")} variant="danger" size="lg" />
          </Link>
        </header>

        {needsMe.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-black bg-skyellow-light p-4 shadow-[4px_4px_0_0_#000]">
            <p className="font-bold">{t("disputes.needsYou", { n: needsMe.length })}</p>
            <p className="text-sm text-gray-700">{t("disputes.needsYouBody")}</p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((x) => (
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
            <p className="font-paytone text-xl mb-1">{t("disputes.emptyTitle")}</p>
            <p className="text-sm text-gray-500">{!address && (tab === "against" || tab === "mine") ? t("disputes.connect") : t("disputes.emptyBody")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {shown.map((d) => (
              <DisputeCard key={d.blockchainId} dispute={d} me={address} onDefend={() => setDefending(d)} />
            ))}
          </div>
        )}
      </div>

      {defending && <DefendModal isOpen onClose={() => setDefending(null)} dispute={defending} />}
    </main>
  );
}

function DisputeCard({ dispute: d, me, onDefend }: { dispute: Dispute; me?: string; onDefend: () => void }) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { triggerAutoGuilty, isPending } = useTriggerAutoGuilty();
  const clock = useVotingClock(d.defenseDeadline);

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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-skred-light px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold font-data">#{d.blockchainId}</span>
          <span className="rounded-full border-2 border-black bg-skred px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
            {statusLabel(t, d.disputeType)}
          </span>
        </div>
        <span className={`rounded-full border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${tone}`}>
          {statusLabel(t, d.status)}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Fact label={t("disputes.program")}>
            {d.pid !== null ? (
              <Link to="/programs/$id" params={{ id: String(d.pid) }} className="font-bold underline">#{d.pid}</Link>
            ) : "—"}
          </Fact>
          <Fact label={t("disputes.about")}>
            {d.milestoneId ? t("report.aboutMilestone", { id: d.milestoneId }) : t("report.aboutScholar")}
          </Fact>
          <Fact label={t("disputes.scholar")}>
            <CopyableText value={d.scholarAddress} display={truncateMiddle(d.scholarAddress, 6, 4)} />
            {iAmScholar && <span className="ml-1 text-[10px] font-extrabold uppercase">({t("appl.you")})</span>}
          </Fact>
          <Fact label={t("disputes.reporter")}>
            <CopyableText value={d.bountyHunter} display={truncateMiddle(d.bountyHunter, 6, 4)} />
            {iAmReporter && <span className="ml-1 text-[10px] font-extrabold uppercase">({t("appl.you")})</span>}
          </Fact>
          <Fact label={t("disputes.deposit")}>
            <span className="font-data">{formatTokenWithSymbol(d.stake, usdcAddress(chainId))}</span>
          </Fact>
          <Fact label={t("disputes.reward")}>
            <span className="font-data font-bold">{formatTokenWithSymbol(d.potentialReward, d.token)}</span>
          </Fact>
        </dl>

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
              <p className="font-bold">{t("disputes.withCommittee")}</p>
            ) : windowClosed ? (
              <p className="font-bold">{t("disputes.windowClosed")}</p>
            ) : (
              <p>
                <span className="font-bold">{t("disputes.defenseLeft")}:</span>{" "}
                <span className="font-data">{clock.text ?? "—"}</span>
              </p>
            )}
          </div>
        )}

        {isActive && !defended && (
          iAmScholar && !windowClosed ? (
            <NeoButton label={t("disputes.defend")} variant="primary" className="!rounded-xl" fullWidth onClick={onDefend} />
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
            <NeoButton label={t("disputes.awaiting")} variant="ghost" className="!rounded-xl" fullWidth disabled />
          )
        )}
      </div>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</dt>
      <dd className="mt-0.5 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
