import { useReadContract } from "wagmi";
import { scholarshipPriceOracleAbi, v4Addresses } from "@/constants/contractsV4";
import { parseUnits, formatUnits } from "viem";
import { useTxHook } from "./use-tx-base";

/**
 * ScholarshipPriceOracle — admin token registry + USD rates.
 *
 * The oracle is a separate contract from ScholarshipCore (Core is at the
 * EIP-170 bytecode limit). Rates are admin-set and used for DISPLAY only —
 * no fund-moving contract reads them. See ScholarshipPriceOracle.sol.
 */

/** USD prices are stored with 8 decimals, matching Chainlink USD feeds. */
export const USD_DECIMALS = 8;

/**
 * Oracle address. Undefined until the oracle is included in a deployment —
 * callers must handle that (the admin UI shows a "not deployed" notice
 * rather than issuing calls to address(0)).
 */
export const ORACLE_ADDRESS = (v4Addresses as Record<string, `0x${string}` | undefined>)
  .ScholarshipPriceOracle;

export const isOracleDeployed = Boolean(ORACLE_ADDRESS);

/** "3000.50" → 300050000000n (8 decimals). */
export function parseUsdPrice(price: string): bigint {
  return parseUnits(price || "0", USD_DECIMALS);
}

/** 300050000000n → "3000.5". */
export function formatUsdPrice(price: bigint | string | null | undefined): string {
  return formatUnits(BigInt(price ?? 0), USD_DECIMALS);
}

/** Every token address in the registry. */
export function useOracleTokens() {
  return useReadContract({
    address: ORACLE_ADDRESS,
    abi: scholarshipPriceOracleAbi,
    functionName: "getTokens",
    query: { enabled: isOracleDeployed },
  });
}

/** Registry entry: [registered, symbol, decimals, priceUsd, updatedAt]. */
export function useOracleTokenInfo(token?: `0x${string}`) {
  return useReadContract({
    address: ORACLE_ADDRESS,
    abi: scholarshipPriceOracleAbi,
    functionName: "tokens",
    args: token ? [token] : undefined,
    query: { enabled: isOracleDeployed && Boolean(token) },
  });
}

/** Staleness threshold, in seconds. */
export function useOracleMaxPriceAge() {
  return useReadContract({
    address: ORACLE_ADDRESS,
    abi: scholarshipPriceOracleAbi,
    functionName: "maxPriceAge",
    query: { enabled: isOracleDeployed },
  });
}

export function useRegisterToken() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /**
   * @param decimals The token's OWN decimals (18 native, 6 USDC) — not the
   *                 8-decimal USD price scale.
   */
  const registerToken = (token: `0x${string}`, symbol: string, decimals: number) => {
    writeContract({
      address: ORACLE_ADDRESS!,
      abi: scholarshipPriceOracleAbi,
      functionName: "registerToken",
      args: [token, symbol, decimals],
    });
  };

  return { registerToken, isPending, isSuccess, error, hash, reset };
}

export function useDeregisterToken() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  const deregisterToken = (token: `0x${string}`) => {
    writeContract({
      address: ORACLE_ADDRESS!,
      abi: scholarshipPriceOracleAbi,
      functionName: "deregisterToken",
      args: [token],
    });
  };

  return { deregisterToken, isPending, isSuccess, error, hash, reset };
}

export function useSetTokenPrice() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /** @param priceUsd Human string, e.g. "3000.50". Scaled to 8 decimals here. */
  const setPrice = (token: `0x${string}`, priceUsd: string) => {
    writeContract({
      address: ORACLE_ADDRESS!,
      abi: scholarshipPriceOracleAbi,
      functionName: "setPrice",
      args: [token, parseUsdPrice(priceUsd)],
    });
  };

  return { setPrice, isPending, isSuccess, error, hash, reset };
}

export function useSetTokenPrices() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /** Batch update — one tx for a whole rate sheet. */
  const setPrices = (entries: Array<{ token: `0x${string}`; priceUsd: string }>) => {
    writeContract({
      address: ORACLE_ADDRESS!,
      abi: scholarshipPriceOracleAbi,
      functionName: "setPrices",
      args: [
        entries.map((e) => e.token),
        entries.map((e) => parseUsdPrice(e.priceUsd)),
      ],
    });
  };

  return { setPrices, isPending, isSuccess, error, hash, reset };
}

export function useSetMaxPriceAge() {
  const { writeContract, isPending, isSuccess, error, hash, reset } = useTxHook();

  /** @param seconds Age after which a rate is reported stale. */
  const setMaxPriceAge = (seconds: number) => {
    writeContract({
      address: ORACLE_ADDRESS!,
      abi: scholarshipPriceOracleAbi,
      functionName: "setMaxPriceAge",
      args: [BigInt(seconds)],
    });
  };

  return { setMaxPriceAge, isPending, isSuccess, error, hash, reset };
}
