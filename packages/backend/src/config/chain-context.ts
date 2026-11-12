import { AsyncLocalStorage } from "node:async_hooks";
import type { MiddlewareHandler } from "hono";
import { HttpException } from "hono-forge";
import { and, eq, type SQL } from "@ponder/client";
import { env } from "@/config/env";

/**
 * Per-request chain scoping for Ponder-indexed (multichain) data.
 *
 * On-chain ids (pid, blockchainId, ...) are only unique within one chain, so
 * every Ponder query MUST be filtered by chainId. The chain is resolved once per
 * request by `chainMiddleware` (from `?chainId=` or the `x-chain-id` header,
 * falling back to DEFAULT_CHAIN_ID) and read back with `currentChainId()`.
 *
 * Always build a `.where(...)` on a Ponder table through `onChain(table, ...)`
 * so a query can't forget the chain filter.
 */
const storage = new AsyncLocalStorage<{ chainId: number }>();

export function currentChainId(): number {
  const store = storage.getStore();
  if (!store) throw new Error("currentChainId() called outside a chain-scoped request");
  return store.chainId;
}

export const chainMiddleware: MiddlewareHandler = async (c, next) => {
  const raw = c.req.query("chainId") ?? c.req.header("x-chain-id");
  const chainId = raw === undefined || raw === "" ? env.DEFAULT_CHAIN_ID : Number(raw);

  if (!Number.isInteger(chainId) || !env.SUPPORTED_CHAIN_IDS.includes(chainId)) {
    throw HttpException.badRequest(
      `Unsupported chainId "${raw}". Supported: ${env.SUPPORTED_CHAIN_IDS.join(", ")}`,
    );
  }

  return storage.run({ chainId }, () => next());
};

/** `chainId = <current>` AND every given condition (undefined conditions are ignored). */
export function onChain<T extends { chainId: any }>(table: T, ...conditions: Array<SQL | undefined>): SQL {
  const parts = conditions.filter((c): c is SQL => c !== undefined);
  return and(eq(table.chainId, currentChainId()), ...parts)!;
}
