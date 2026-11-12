import { useReadContract } from "wagmi";
import { scholarshipPriceOracleAbi } from "@/constants/contractsV4";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { getV4Addresses, getActiveChainId } from "@/lib/chain/chains";
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
 * Oracle address on the given chain. Undefined until the oracle is included in
 * that chain's deployment — callers must handle that (the admin UI shows a
 * "not deployed" notice rather than issuing calls to address(0)).
 */
export const oracleAddressFor = (chainId: number) => getV4Addresses(chainId).ScholarshipPriceOracle;

/** Oracle on the active chain, resolved at call time (event handlers). */
export const oracleAddress = () => oracleAddressFor(getActiveChainId());

/** Render-time: active chain, its oracle address, and whether it is deployed. */
export function useOracle() {
  const { chainId } = useActiveChain();
  const address = oracleAddressFor(chainId);
  return { chainId, address, isDeployed: Boolean(address) };
}

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
  const { chainId, address, isDeployed } = useOracle();
  return useReadContract({
    chainId,
    address,
    abi: scholarshipPriceOracleAbi,
    functionName: "getTokens",
    query: { enabled: isDeployed },
  });
}

/** Registry entry: [registered, symbol, decimals, priceUsd, updatedAt]. */
export function useOracleTokenInfo(token?: `0x${string}`) {
  const { chainId, address, isDeployed } = useOracle();
  return useReadContract({
    chainId,
    address,
    abi: scholarshipPriceOracleAbi,
    functionName: "tokens",
    args: token ? [token] : undefined,
    query: { enabled: isDeployed && Boolean(token) },
  });
}

/** Staleness threshold, in seconds. */
export function useOracleMaxPriceAge() {
  const { chainId, address, isDeployed } = useOracle();
  return useReadContract({
    chainId,
    address,
    abi: scholarshipPriceOracleAbi,
    functionName: "maxPriceAge",
    query: { enabled: isDeployed },
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
      address: oracleAddress()!,
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
      address: oracleAddress()!,
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
      address: oracleAddress()!,
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
      address: oracleAddress()!,
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
      address: oracleAddress()!,
      abi: scholarshipPriceOracleAbi,
      functionName: "setMaxPriceAge",
      args: [BigInt(seconds)],
    });
  };

  return { setMaxPriceAge, isPending, isSuccess, error, hash, reset };
}
