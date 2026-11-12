import { useMemo } from 'react';
import { useT } from '@/lib/i18n';
import { explainError } from '@/lib/errors/explain';

/**
 * Shows WHY a transaction failed and WHAT to change, instead of a generic message.
 * Pass `ctx` for values the contract does not echo back (form inputs, limits).
 */
export function ErrorNotice({
  error,
  ctx,
  className = '',
}: {
  error: unknown;
  ctx?: Record<string, string | number | bigint>;
  className?: string;
}) {
  const { t, lang } = useT();
  const info = useMemo(() => explainError(error, lang, ctx), [error, lang, ctx]);
  if (!error) return null;
  const soft = info.kind === 'rejected';

  return (
    <div
      role="alert"
      className={`border-2 border-black p-3 text-xs shadow-[2px_2px_0_0_#000] ${soft ? 'bg-gray-100 text-gray-700' : 'bg-skred-light text-skred'} ${className}`}
    >
      <p className="font-bold">{soft ? t('error.rejectedTitle') : t('error.title')}</p>
      <p className="mt-1">{info.reason}</p>
      <p className="mt-1 font-bold text-black">
        {t('error.howToFix')} <span className="font-normal">{info.fix}</span>
      </p>
      {!soft && (
        <details className="mt-2 text-[11px] text-gray-600">
          <summary className="cursor-pointer select-none">{t('error.technical')}</summary>
          <p className="mt-1 break-all font-mono">
            {info.name ? `${info.name}: ` : ''}
            {info.technical}
          </p>
        </details>
      )}
    </div>
  );
}
