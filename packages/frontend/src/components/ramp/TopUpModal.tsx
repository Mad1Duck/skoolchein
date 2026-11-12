import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useMintUSDC } from '@/lib/contracts/v4/hooks/treasury';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, idrToUsdc, parseIDR } from '@/util/localCurrency';
import { getRampNetwork } from '@/lib/ramp/networks';
import { useT } from '@/lib/i18n';

/**
 * Which ramp backs the "Add funds" flow.
 *  - "mock":   dev only. Mints MockUSDC to the connected wallet (no real money).
 *  - "guide":  step-by-step "buy USDC at an Indonesian exchange, send it to your wallet".
 *              No integration or KYB needed; the default for production until a
 *              real on-ramp widget (Transak etc.) is wired in.
 *  - "transak": reserved for the real widget. Not wired yet — see docs/crypto-invisible-ux.id.md.
 */
export const RAMP_PROVIDER = (import.meta.env.VITE_RAMP_PROVIDER ?? 'guide') as 'mock' | 'guide' | 'transak';

const EXCHANGES = [
  { name: 'Pintu', url: 'https://pintu.co.id' },
  { name: 'Indodax', url: 'https://indodax.com' },
  { name: 'Tokocrypto', url: 'https://www.tokocrypto.com' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Suggested top-up in IDR (e.g. the shortfall). Rounded up to the nearest Rp 1.000. */
  suggestedIdr?: number | null;
  /** Called once the new balance has landed so the caller can re-check it. */
  onSuccess?: () => void;
}

export function TopUpModal({ isOpen, onClose, suggestedIdr, onSuccess }: Props) {
  const { t, tr } = useT();
  const { address, chain } = useAccount();
  const network = getRampNetwork(chain?.id, chain?.name);
  const { rate } = useTokenRate();
  const effectiveRate = rate ?? 16000;

  const [idrInput, setIdrInput] = useState('');
  const [copied, setCopied] = useState(false);
  const { mint, isPending, isSuccess, error, reset } = useMintUSDC();

  // Seed the field each time the modal opens with the amount that's missing.
  useEffect(() => {
    if (isOpen) {
      setIdrInput(suggestedIdr ? String(Math.ceil(suggestedIdr / 1000) * 1000) : '100000');
    }
  }, [isOpen, suggestedIdr]);

  useEffect(() => {
    if (isSuccess) onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const idr = parseIDR(idrInput);
  const usdc = idrToUsdc(idr, effectiveRate);

  const handleClose = () => {
    setCopied(false);
    reset();
    onClose();
  };

  const handlePay = () => {
    if (!address || RAMP_PROVIDER !== 'mock' || usdc <= 0) return;
    mint(address, usdc.toFixed(6));
  };

  if (RAMP_PROVIDER === 'transak') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('topup.title')}>
        <div className="space-y-4 py-4 text-center">
          <p className="text-sm text-gray-600">{t('topup.unavailable')}</p>
          <NeoButton label={t('common.close')} variant="ghost" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  if (RAMP_PROVIDER === 'guide' && !network.buyable) {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('topup.title')}>
        <div className="space-y-4 py-4 text-center">
          <p className="text-sm text-gray-600">{tr('topup.wrongNetwork', { network: network.exchangeLabel })}</p>
          <NeoButton label={t('common.close')} variant="ghost" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  if (RAMP_PROVIDER === 'guide') {
    const copyAddress = () => {
      if (!address) return;
      navigator.clipboard?.writeText(address).then(
        () => setCopied(true),
        () => undefined,
      );
    };

    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('topup.title')}>
        <div className="space-y-5">
          {suggestedIdr ? (
            <p className="text-sm font-bold">{t('topup.need', { amount: formatToIDR(suggestedIdr) })}</p>
          ) : null}

          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>{tr('topup.step1')}</li>
            <li>{tr('topup.step2', { network: network.exchangeLabel })}</li>
            <li>{tr('topup.step3')}</li>
          </ol>

          <div className="bg-skyellow border-2 border-black p-3 text-xs shadow-[3px_3px_0_0_#000]">
            {tr('topup.networkWarning', { network: network.exchangeLabel })}
          </div>

          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest mb-1.5">{t('topup.yourAddress')}</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all border-2 border-black p-2 text-xs bg-white">
                {address ?? t('topup.connectFirst')}
              </code>
              <NeoButton
                label={copied ? t('topup.copied') : t('topup.copy')}
                variant="primary"
                onClick={copyAddress}
                disabled={!address}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXCHANGES.map((ex) => (
              <a
                key={ex.name}
                href={ex.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-2 border-black px-3 py-1.5 text-xs font-bold shadow-[2px_2px_0_0_#000]"
              >
                {ex.name}
              </a>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
            <NeoButton label={t('common.close')} variant="ghost" onClick={handleClose} fullWidth />
            <NeoButton
              label={t('topup.sentCheck')}
              variant="success"
              onClick={() => onSuccess?.()}
              fullWidth
            />
          </div>
        </div>
      </NeoModal>
    );
  }

  if (isSuccess) {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('topup.successTitle')}>
        <div className="text-center py-8 space-y-4">
          <h2 className="font-paytone text-2xl">{t('topup.successHeading')}</h2>
          <p className="text-gray-600">{t('topup.successBody', { amount: formatToIDR(idr) })}</p>
          <NeoButton label={t('common.continue')} variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('topup.title')}>
      <div className="space-y-5">
        <div className="bg-skyellow border-2 border-black p-3 text-xs shadow-[3px_3px_0_0_#000]">
          <p className="font-extrabold uppercase tracking-wider text-[10px] mb-1">{t('topup.mockBanner')}</p>
          <p>{t('topup.mockBody')}</p>
        </div>

        <div>
          <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
            {t('topup.amountLabel')}
          </label>
          <input
            type="text"
            inputMode="numeric"
            className="w-full"
            value={idrInput ? formatToIDR(idr) : ''}
            onChange={(e) => setIdrInput(e.target.value)}
            placeholder="Rp 100.000"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('topup.equivalent', { amount: usdc.toLocaleString('en-US', { maximumFractionDigits: 2 }) })}
          </p>
        </div>

        {error && <p className="text-xs font-bold text-skred">{t('topup.failed')}</p>}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" onClick={handleClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('common.processing') : t('topup.pay')}
            variant="success"
            onClick={handlePay}
            loading={isPending}
            disabled={isPending || !address || usdc <= 0}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}
