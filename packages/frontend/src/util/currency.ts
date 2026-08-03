export function usdToIdr(usd: number) {
  return usd * 16440.45;
}
export function formatCurrency(value: number, currency: "IDR" | "USD") {
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(value);
}

/**
 * @deprecated Hardcodes USDC's 6 decimals. Program amounts are denominated in
 * whatever token backs the program — native uses 18 — so this overstates
 * native amounts by 10^12 (a 52 ETH fund renders as 52,000,000,000,000).
 *
 * Use `formatTokenCompact(amount, token)` from `@/lib/contracts/v4/token`,
 * passing the program's `token` field. Only keep this where the value is known
 * to be USDC regardless of program (e.g. a raw USDC wallet balance).
 */
export function formatUSDC(value: bigint | number) {
  return Number(value) / 10 ** 6;
}
