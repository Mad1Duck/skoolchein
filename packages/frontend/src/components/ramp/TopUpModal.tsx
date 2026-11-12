import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useMintUSDC } from '@/lib/contracts/v4/hooks/treasury';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, idrToUsdc, parseIDR } from '@/util/localCurrency';
import { getRampNetwork } from '@/lib/ramp/networks';

/**
 * Which ramp backs the "Isi saldo" flow.
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
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Isi Saldo">
        <div className="space-y-4 py-4 text-center">
          <p className="text-sm text-gray-600">Fitur isi saldo otomatis belum tersedia. Segera hadir.</p>
          <NeoButton label="Tutup" variant="ghost" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  if (RAMP_PROVIDER === 'guide' && !network.buyable) {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Isi Saldo">
        <div className="space-y-4 py-4 text-center">
          <p className="text-sm text-gray-600">
            Anda sedang di jaringan <strong>{network.exchangeLabel}</strong>, yang tidak bisa diisi
            dengan uang sungguhan. Pindah ke jaringan utama di wallet Anda untuk mengisi saldo.
          </p>
          <NeoButton label="Tutup" variant="ghost" onClick={handleClose} fullWidth />
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
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Isi Saldo">
        <div className="space-y-5">
          {suggestedIdr ? (
            <p className="text-sm">
              Anda perlu menambah sekitar <span className="font-black">{formatToIDR(suggestedIdr)}</span>{' '}
              dalam USDC.
            </p>
          ) : null}

          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>Buka salah satu aplikasi di bawah dan beli <strong>USDC</strong> dengan Rupiah.</li>
            <li>
              Kirim (withdraw) USDC itu ke alamat wallet Anda di bawah, lewat jaringan{' '}
              <strong>{network.exchangeLabel}</strong>.
            </li>
            <li>Tunggu beberapa menit, lalu kembali ke sini. Saldo Anda akan terbarui.</li>
          </ol>

          <div className="bg-skyellow border-2 border-black p-3 text-xs shadow-[3px_3px_0_0_#000]">
            Pilih jaringan <strong>{network.exchangeLabel}</strong> saat menarik. Jika salah jaringan,
            dana bisa hilang dan tidak dapat dikembalikan.
          </div>

          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest mb-1.5">Alamat wallet Anda</p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all border-2 border-black p-2 text-xs bg-white">
                {address ?? 'Hubungkan wallet terlebih dulu'}
              </code>
              <NeoButton
                label={copied ? 'Tersalin' : 'Salin'}
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
            <NeoButton label="Tutup" variant="ghost" onClick={handleClose} fullWidth />
            <NeoButton
              label="Saya sudah kirim, cek saldo"
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
      <NeoModal isOpen={isOpen} onClose={handleClose} title="Saldo Bertambah">
        <div className="text-center py-8 space-y-4">
          <h2 className="font-paytone text-2xl">Isi saldo berhasil</h2>
          <p className="text-gray-600">
            Saldo Anda bertambah <span className="font-bold">{formatToIDR(idr)}</span>.
          </p>
          <NeoButton label="Lanjutkan" variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title="Isi Saldo">
      <div className="space-y-5">
        <div className="bg-skyellow border-2 border-black p-3 text-xs shadow-[3px_3px_0_0_#000]">
          <p className="font-extrabold uppercase tracking-wider text-[10px] mb-1">Mode Simulasi</p>
          <p>Tidak ada uang sungguhan yang dipakai. Saldo uji coba ditambahkan ke wallet Anda.</p>
        </div>

        <div>
          <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
            Jumlah (Rupiah)
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
            Setara sekitar {usdc.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
          </p>
        </div>

        {error && (
          <p className="text-xs font-bold text-skred">
            Gagal menambah saldo. Coba lagi, atau tutup dan ulangi.
          </p>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label="Batal" variant="ghost" onClick={handleClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? 'Memproses…' : 'Bayar (simulasi)'}
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
