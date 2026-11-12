import { en, type TranslationKey } from './en';

/** Translate an on-chain status/kind/type enum (e.g. BH_WON) to plain language; unknown values fall back to a readable form. */
export function statusLabel(
  t: (key: TranslationKey) => string,
  status?: string | null,
): string {
  if (!status) return '—';
  const key = `status.${status}`;
  return key in en ? t(key as TranslationKey) : status.replace(/_/g, ' ');
}
