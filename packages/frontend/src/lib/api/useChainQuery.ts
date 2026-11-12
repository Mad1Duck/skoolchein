import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { setActiveChainId } from "@/lib/chain/chains";

/**
 * `useQuery` scoped to the active chain.
 *
 * - The chain id is appended to the query key, so data for chain A never serves
 *   chain B and a chain switch refetches. It is appended (not prepended) so
 *   prefix invalidation like `invalidateQueries({ queryKey: ["programs"] })`
 *   keeps matching.
 * - The chain is pinned right before the query function runs, so the axios
 *   interceptor in ./client attaches the matching `chainId` to the request.
 */
export function useChainQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const { chainId } = useActiveChain();
  const { queryKey, queryFn } = options;

  return useQuery({
    ...options,
    queryKey: [...(queryKey as readonly unknown[]), chainId] as unknown as TQueryKey,
    queryFn:
      typeof queryFn === "function"
        ? (ctx) => {
            setActiveChainId(chainId);
            return (queryFn as (c: typeof ctx) => unknown)(ctx) as Promise<TQueryFnData>;
          }
        : queryFn,
  });
}
