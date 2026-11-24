import type { Program, ProgramStatus } from "@/lib/api/types";
import { useVotingClock } from "@/features/v4/vote/useVotingClock";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/en";

const PHASES = [
  { key: "CREATED", icon: "⚙️" },
  { key: "APPLICATION_OPEN", icon: "📝" },
  { key: "SCREENING", icon: "🔍" },
  { key: "VOTING", icon: "🗳️" },
  { key: "ACTIVE", icon: "🎓" },
  { key: "COMPLETED", icon: "✅" },
] as const;

const statusOrder: Record<string, number> = {
  CREATED: 0, APPLICATION_OPEN: 1, SCREENING: 2,
  VOTING: 3, ACTIVE: 4, COMPLETED: 5, CANCELLED: -1,
};

type Window = Pick<Program, "applicationStart" | "applicationEnd" | "votingStart" | "votingEnd">;

/** The next moment that matters in each stage, and what to call it. */
function nextMoment(status: ProgramStatus, w?: Window): { at: string | null | undefined; key: "applyOpens" | "applyEnds" | "votingOpens" | "votingEnds" } | null {
  if (!w) return null;
  switch (status) {
    case "CREATED": return { at: w.applicationStart, key: "applyOpens" };
    case "APPLICATION_OPEN": return { at: w.applicationEnd, key: "applyEnds" };
    case "SCREENING": return { at: w.votingStart, key: "votingOpens" };
    case "VOTING": return { at: w.votingEnd, key: "votingEnds" };
    default: return null;
  }
}

export function PhaseTimeline({
  currentStatus,
  window: w,
  className = "",
}: {
  currentStatus: ProgramStatus;
  /** The program's dates; when given, the current stage shows a live countdown. */
  window?: Window;
  className?: string;
}) {
  const { t } = useT();
  const moment = nextMoment(currentStatus, w);
  const clock = useVotingClock(moment?.at ?? null);
  const currentIndex = statusOrder[currentStatus] ?? 0;
  const isCancelled = currentStatus === "CANCELLED";

  return (
    <div className={className}>
      <div className="flex items-center w-full gap-0">
        {PHASES.map((phase, i) => {
          const isComplete = !isCancelled && i < currentIndex;
          const isCurrent = !isCancelled && i === currentIndex;
          const isFuture = i > currentIndex || isCancelled;

          return (
            <div key={phase.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle */}
              <div
                className="flex flex-col items-center gap-1"
                title={t(`phase.${phase.key}.desc` as TranslationKey)}
              >
                <div
                  className={`
                    w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-lg
                    transition-all duration-300
                    ${isComplete ? "bg-skgreen shadow-[2px_2px_0_0_rgba(0,0,0)]" : ""}
                    ${isCurrent ? "bg-skyellow shadow-[3px_3px_0_0_rgba(0,0,0)] scale-110 animate-pulse-glow" : ""}
                    ${isFuture ? "bg-gray-100" : ""}
                    ${isCancelled ? "bg-skred-light opacity-50" : ""}
                  `}
                >
                  {isComplete ? "✓" : phase.icon}
                </div>
                <span className={`text-xs font-bold whitespace-nowrap ${isCurrent ? "text-skpurple" : "text-gray-500"}`}>
                  {t(`phase.${phase.key}.label` as TranslationKey)}
                </span>
              </div>

              {/* Connector line */}
              {i < PHASES.length - 1 && (
                <div
                  className={`
                    flex-1 h-0.5 mx-1 mt-[-1.25rem]
                    transition-all duration-300
                    ${isComplete ? "bg-skgreen-dark" : "bg-gray-300"}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* What is happening in the current stage, in plain words. */}
      <p className="mt-4 rounded-xl border-2 border-black bg-white px-3 py-2 text-sm">
        <span className="font-bold">{t(`phase.${currentStatus}.label` as TranslationKey)}: </span>
        {t(`phase.${currentStatus}.desc` as TranslationKey)}
      </p>

      {/* Live countdown to the next moment of this stage. */}
      {moment && clock.text !== null && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-black bg-skyellow-light px-3 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-gray-600">
            {t(`phase.clock.${moment.key}` as TranslationKey)}
          </span>
          {clock.ended ? (
            <span className="text-sm font-bold">{t(`phase.clock.${moment.key}.over` as TranslationKey)}</span>
          ) : (
            <span className="font-data text-lg font-bold tabular-nums">{clock.text}</span>
          )}
        </div>
      )}
    </div>
  );
}
