import { formatUnits, parseUnits } from "viem";
import { v4Addresses } from "@/constants/contractsV4";

/**
 * Payment-token helpers.
 *
 * A program's amounts (totalFund, milestone amounts, donations, stakes) are
 * denominated in that program's `token`. The zero address is the chain's
 * native currency — matching ScholarshipTypes.NATIVE_TOKEN on-chain.
 *
 * Decimals differ per token (native 18, USDC 6), so never hardcode a decimal
 * count: route every parse/format through here using the program's token.
 */

export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000" as const;

export type TokenMeta = {
  address: `0x${string}`;
  symbol: string;
  decimals: number;
  isNative: boolean;
  /**
   * UI hint only, mirroring ScholarshipTypes' DEFAULT_*_MIN_DONATION. The
   * authoritative minimum is on-chain in `tokenConfig(token).minDonation`
   * and an admin can change it — treat this as a sensible input default,
   * not a guarantee.
   */
  minDonationHint: string;
};

const USDC_ADDRESS = (v4Addresses.MockUSDC ?? NATIVE_TOKEN) as `0x${string}`;

export const NATIVE_META: TokenMeta = {
  address: NATIVE_TOKEN,
  symbol: "ETH",
  decimals: 18,
  isNative: true,
  minDonationHint: "0.01",
};

export const USDC_META: TokenMeta = {
  address: USDC_ADDRESS,
  symbol: "USDC",
  decimals: 6,
  isNative: false,
  minDonationHint: "50",
};

/** Tokens selectable when creating a program. Must match the on-chain whitelist
 *  (ScholarshipCore.setTokenConfig) — a token missing there reverts with
 *  TokenNotSupported. */
export const SUPPORTED_TOKENS: TokenMeta[] = [USDC_META, NATIVE_META];

export function isNativeToken(token?: string | null): boolean {
  return !token || token.toLowerCase() === NATIVE_TOKEN;
}

/**
 * Resolve metadata for a token address. Unknown ERC20s fall back to 18
 * decimals, which is the ERC20 default — but they can't actually be used
 * unless whitelisted on-chain, so this is only a display safety net.
 */
export function getTokenMeta(token?: string | null): TokenMeta {
  if (isNativeToken(token)) return NATIVE_META;
  if (token!.toLowerCase() === USDC_ADDRESS.toLowerCase()) return USDC_META;
  return { address: token as `0x${string}`, symbol: "TOKEN", decimals: 18, isNative: false , minDonationHint: "0" };
}

/** Human string → on-chain bigint, using the token's own decimals. */
export function parseTokenAmount(amount: string, token?: string | null): bigint {
  return parseUnits(amount || "0", getTokenMeta(token).decimals);
}

/** On-chain bigint → human string, using the token's own decimals. */
export function formatTokenAmount(amount: bigint | string | null | undefined, token?: string | null): string {
  return formatUnits(BigInt(amount ?? 0), getTokenMeta(token).decimals);
}

/** Formatted amount with its symbol, e.g. "1.5 ETH" / "50 USDC". */
export function formatTokenWithSymbol(
  amount: bigint | string | null | undefined,
  token?: string | null,
): string {
  return `${formatTokenAmount(amount, token)} ${getTokenMeta(token).symbol}`;
}

/**
 * Value to attach to a write call. Native payments are sent as msg.value;
 * ERC20 payments send nothing and rely on a prior approve().
 */
export function nativeValueFor(amount: bigint, token?: string | null): bigint | undefined {
  return isNativeToken(token) ? amount : undefined;
}

// ── USD conversion (via ScholarshipPriceOracle) ──────────────────────────────

/**
 * Convert a token amount to a USD display string using an oracle rate.
 *
 * Kept as a pure function (rate passed in) rather than a hook so it works in
 * tables and loops without violating rules-of-hooks. Fetch rates once with
 * `useOracleTokens`/`useReadContracts`, then map them here.
 *
 * @param amount    Raw on-chain amount, in the token's own decimals.
 * @param token     Token address (zero address = native).
 * @param priceUsd  Oracle price with 8 decimals, or undefined if unpriced.
 * @returns Formatted string like "$1,234.56", or null when no rate is known —
 *          callers should render nothing rather than a misleading "$0.00".
 */
export function formatUsdValue(
  amount: bigint | string | null | undefined,
  token: string | null | undefined,
  priceUsd: bigint | null | undefined,
): string | null {
  if (priceUsd === null || priceUsd === undefined || priceUsd === 0n) return null;

  const { decimals } = getTokenMeta(token);
  // usd(8dp) = amount * price(8dp) / 10^tokenDecimals — mirrors
  // ScholarshipPriceOracle.toUsd, multiplying before dividing to keep precision.
  const usd8 = (BigInt(amount ?? 0) * priceUsd) / 10n ** BigInt(decimals);

  const asNumber = Number(formatUnits(usd8, 8));
  return `$${asNumber.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
