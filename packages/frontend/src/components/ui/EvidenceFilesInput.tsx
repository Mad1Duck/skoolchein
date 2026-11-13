import { useRef, useState } from 'react';
import { EVIDENCE_MAX_BYTES, EVIDENCE_MAX_FILES, formatBytes } from '@/lib/ipfs';
import { useT } from '@/lib/i18n';

const ACCEPT = 'image/*,.pdf,.doc,.docx,.txt,.zip';

/**
 * Pick documents or images to attach as evidence. Files are only held here; they are uploaded when
 * the form is submitted. Rejects what is too big or too many on the spot, with the reason.
 */
export function EvidenceFilesInput({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const add = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    const issues: string[] = [];
    for (const f of Array.from(picked)) {
      if (next.length >= EVIDENCE_MAX_FILES) {
        issues.push(t('evidence.tooMany', { n: EVIDENCE_MAX_FILES }));
        break;
      }
      if (f.size > EVIDENCE_MAX_BYTES) {
        issues.push(t('evidence.tooBig', { name: f.name, mb: EVIDENCE_MAX_BYTES / 1024 / 1024 }));
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setProblem(issues.length ? issues[0] : null);
    onChange(next);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => add(e.target.files)}
        disabled={disabled}
      />
      <button
        type="button"
        disabled={disabled || files.length >= EVIDENCE_MAX_FILES}
        onClick={() => input.current?.click()}
        className="w-full rounded-xl border-2 border-dashed border-black bg-white px-3 py-3 text-sm font-bold hover:bg-skbw disabled:opacity-50"
      >
        📎 {t('evidence.attach')}
        <span className="block text-[11px] font-normal text-gray-500">
          {t('evidence.limits', { n: EVIDENCE_MAX_FILES, mb: EVIDENCE_MAX_BYTES / 1024 / 1024 })}
        </span>
      </button>

      {problem && <p className="text-xs font-bold text-skred">{problem}</p>}

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-2 rounded-lg border-2 border-black bg-white px-2 py-1.5 text-xs">
              <span className="min-w-0 truncate font-bold" title={f.name}>{f.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-data text-gray-500">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  aria-label={t('evidence.remove', { name: f.name })}
                  disabled={disabled}
                  onClick={() => onChange(files.filter((x) => x !== f))}
                  className="font-extrabold hover:text-skred"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
