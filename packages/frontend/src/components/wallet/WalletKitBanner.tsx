import { useT } from '@/lib/i18n';
import { useWalletKitDown } from './walletKitStatus';

/** Says that part of wallet sign-in is unavailable, with a way to try again. */
export function WalletKitBanner() {
  const { t } = useT();
  if (!useWalletKitDown()) return null;

  return (
    <div role="status" className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 border-b border-amber-300 text-amber-900 text-sm text-center px-4 py-2">
      <span>{t('walletKit.down')}</span>
      <button type="button" className="font-bold underline" onClick={() => window.location.reload()}>
        {t('common.retry')}
      </button>
    </div>
  );
}
