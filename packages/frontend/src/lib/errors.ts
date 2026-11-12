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
  // Custom contract errors appear by name in viem's message.
  if (msg.includes('mustvotebeforestaking')) return 'error.mustVote';
  if (msg.includes('confidencestakealreadyexists')) return 'error.alreadyStaked';
  if (msg.includes('insufficientvotingpower')) return 'error.noPower';
  if (msg.includes('alreadyapplied')) return 'error.alreadyApplied';
  if (msg.includes('maxretriesexceeded')) return 'error.maxRetries';
  if (msg.includes('cannotapplytoownprogram')) return 'error.ownProgram';
  if (msg.includes('invalidprogramstatus')) return 'error.notOpen';
  // ERC20 errors usually arrive as a bare selector because the contract ABI doesn't list them:
  // 0xfb8f41b2 = ERC20InsufficientAllowance, 0xe450d38c = ERC20InsufficientBalance.
  if (msg.includes('erc20insufficientallowance') || msg.includes('0xfb8f41b2')) return 'error.allowance';
  if (msg.includes('erc20insufficientbalance') || msg.includes('0xe450d38c')) return 'error.insufficient';
  if (msg.includes('tokennotsupported')) return 'error.tokenNotSupported';
  if (msg.includes('invalidcandidaterange')) return 'error.candidateRange';
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance') || msg.includes('transfer amount exceeds')) {
    return 'error.insufficient';
  }
  return 'error.generic';
}
