import { useAccount, useBalance } from "wagmi";
import { parseUnits } from "viem";
import { getTokenMeta, isNativeToken } from "../token";
import { useTokenRate } from "@/context/token-rate-context";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { usdcToIdr } from "@/util/localCurrency";

/**
 * Connected wallet's balance in a program's payment token, plus whether it
 * covers `amount` (human string, e.g. "50").
 *
 * `shortfallIdr` is only set for non-native tokens (USDC), since the only rate
 * the app knows is USDC/IDR. It is the amount a top-up must cover.
 */
export function useTokenBalance(token?: string | null, amount?: string) {
  const { address } = useAccount();
  const { rate } = useTokenRate();
  const { chainId } = useActiveChain();
  const meta = getTokenMeta(token);

  const { data, isLoading, refetch } = useBalance({
    chainId,
    address,
    token: isNativeToken(token) ? undefined : meta.address,
    query: { enabled: !!address },
  });

  const balance = data?.value ?? 0n;

  let required = 0n;
  try {
    required = amount ? parseUnits(amount, meta.decimals) : 0n;
  } catch {
    required = 0n;
  }

  const hasEnough = !address || isLoading || balance >= required;
  const shortfall = hasEnough ? 0n : required - balance;
  const shortfallUnits = Number(shortfall) / 10 ** meta.decimals;
  const shortfallIdr =
    !meta.isNative && rate && shortfall > 0n ? usdcToIdr(shortfallUnits, rate) : null;

  return { balance, isLoading, hasEnough, shortfall, shortfallIdr, refetch };
}
