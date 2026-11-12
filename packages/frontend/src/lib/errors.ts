import type { TranslationKey } from './i18n/en';

/**
 * Map a wagmi/viem write error to a friendly translation key.
 * Raw messages ("User rejected the request", "execution reverted…") must never
 * reach the UI — show the translated text and keep the raw error in the console.
 */
export function friendlyErrorKey(error: unknown): TranslationKey {
  const msg = String((error as { message?: string } | null)?.message ?? error ?? '').toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')) {
    return 'error.rejected';
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance') || msg.includes('transfer amount exceeds')) {
    return 'error.insufficient';
  }
  return 'error.generic';
}
