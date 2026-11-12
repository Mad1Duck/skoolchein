import { useT } from '@/lib/i18n';

interface Props {
  /** Already-translated step labels, in order. */
  labels: string[];
  /** Index of the step being edited. */
  current: number;
  /** Steps the user has completed and may jump back to. */
  onJump: (index: number) => void;
}

/**
 * Compact step indicator for the application wizard. Completed steps are
 * clickable so people can go back and fix an answer without losing the rest.
 */
export function ApplyStepper({ labels, current, onJump }: Props) {
  const { t } = useT();

  return (
    <nav aria-label={t('apply.title')} className="mb-6">
      <ol className="flex items-center gap-2">
        {labels.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex items-center gap-2 min-w-0 flex-1 last:flex-none">
              <button
                type="button"
                disabled={!done}
                onClick={() => onJump(i)}
                aria-current={active ? 'step' : undefined}
                className="flex items-center gap-2 min-w-0 disabled:cursor-default"
              >
                <span
                  className={`flex items-center justify-center size-8 shrink-0 border-2 border-black text-sm font-extrabold shadow-[2px_2px_0_0_#000] ${
                    done ? 'bg-skgreen' : active ? 'bg-skpurple text-white' : 'bg-white text-gray-500'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {/* Only the active label shows on small screens to keep the row from wrapping. */}
                <span
                  className={`text-xs md:text-sm font-bold truncate ${
                    active ? 'inline text-black' : 'hidden md:inline text-gray-600'
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < labels.length - 1 && (
                <span
                  aria-hidden
                  className={`h-0.5 flex-1 min-w-3 ${i < current ? 'bg-black' : 'bg-black/20'}`}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs font-bold uppercase tracking-widest text-black/60">
        {t('apply.stepOf', { n: current + 1, total: labels.length })}
      </p>
    </nav>
  );
}
