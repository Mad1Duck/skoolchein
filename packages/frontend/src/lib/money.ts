import { formatTokenAmount, getTokenMeta } from '@/lib/contracts/v4/token';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';

/**
 * Format an amount in a program's OWN token (decimals come from the token, never
 * hardcoded). For USDC with a known USDC/IDR rate the result is Rupiah first —
 * "Rp 1.600.000" — which is what non-crypto users read; other tokens keep
 * "<amount> <symbol>".
 */
export function formatMoney(
  raw: string | bigint | number | null | undefined,
  token?: string | null,
  rate?: number | null,
): string {
  const meta = getTokenMeta(token);
  const n = Number(formatTokenAmount(BigInt(raw ?? 0), token));
  if (!meta.isNative && rate) return formatToIDR(usdcToIdr(n, rate));
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${meta.symbol}`;
}

/** Hook form: returns a formatter bound to the current USDC/IDR rate. */
export function useFormatMoney() {
  const { rate } = useTokenRate();
  return (raw: string | bigint | number | null | undefined, token?: string | null) =>
    formatMoney(raw, token, rate);
}
