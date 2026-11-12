import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveChain } from "@/lib/chain/useActiveChain";

/**
 * App-wide realtime sync.
 *
 * The indexer (Ponder) POSTs every on-chain event to the backend, which fans it
 * out over one hono-forge SSE channel ("main"). This component holds the single
 * browser connection and, on each event, marks all server/chain-backed queries
 * stale so whatever is currently on screen refetches. Individual pages need no
 * subscription code of their own — anything built on TanStack Query / wagmi is
 * live automatically.
 *
 * If the stream drops (proxy timeout, flaky network) it falls back to polling,
 * and refetches once on reconnect to catch anything missed in the gap.
 */

const SSE_URL = `${import.meta.env.VITE_BACKEND_HOST}/sse`;
const CHANNEL_EVENT = "main";
const DEBOUNCE_MS = 400;        // collapse bursts (e.g. a re-index) into one refetch
const FALLBACK_POLL_MS = 10_000;
const INDEXER_LAG_MS = 2_500;   // second refetch, after the indexer has committed its write

/** Query roots that must NOT refetch on chain events: immutable or expensive. */
const SKIP_ROOTS = new Set(["ipfs-meta", "credentials"]);

// ── Connection status (tiny external store so any component can show a badge) ──

export type RealtimeStatus = "connecting" | "live" | "offline";
let status: RealtimeStatus = "connecting";
const listeners = new Set<() => void>();
const setStatus = (s: RealtimeStatus) => {
  if (status === s) return;
  status = s;
  listeners.forEach((l) => l());
};

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => "connecting",
  );
}

// ── Manual trigger ────────────────────────────────────────────────────────────

let requestRefreshImpl: (() => void) | null = null;

/**
 * Ask for an immediate refresh of all live data. Called after the user's own
 * transaction is confirmed, so the UI reacts without waiting for the indexer's
 * event to round-trip through the backend.
 */
export function requestRealtimeRefresh() {
  requestRefreshImpl?.();
}

// ── The sync component ────────────────────────────────────────────────────────

export function RealtimeSync() {
  const queryClient = useQueryClient();
  const { chainId } = useActiveChain();

  useEffect(() => {
    let es: EventSource | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const invalidateAll = () =>
      queryClient.invalidateQueries({
        predicate: (q) => !SKIP_ROOTS.has(String(q.queryKey[0])),
      });

    const refresh = () => {
      clearTimeout(debounce);
      clearTimeout(trailing);
      debounce = setTimeout(invalidateAll, DEBOUNCE_MS);
      // The indexer broadcasts the event slightly before its database write is
      // visible to the API, so the first refetch can return the old row. A second
      // pass shortly after picks up the committed data.
      trailing = setTimeout(invalidateAll, INDEXER_LAG_MS);
    };
    requestRefreshImpl = refresh;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(refresh, FALLBACK_POLL_MS);
    };
    const stopPolling = () => {
      clearInterval(poll);
      poll = undefined;
    };

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      es = new EventSource(SSE_URL);

      es.onopen = () => {
        setStatus("live");
        stopPolling();
        refresh(); // catch up on anything missed while disconnected
      };

      es.addEventListener(CHANNEL_EVENT, (e) => {
        try {
          const payload = JSON.parse((e as MessageEvent).data) as { chainId?: number };
          // Events carry their chain; skip other chains (older events without one still apply).
          if (payload?.chainId !== undefined && payload.chainId !== chainId) return;
        } catch {
          /* unparseable payload: refresh anyway */
        }
        refresh();
      });

      es.onerror = () => {
        // Browsers retry EventSource on their own, but a proxy that kills the
        // stream can leave it in a retry loop — recreate it with a delay and poll meanwhile.
        setStatus("offline");
        startPolling();
        es?.close();
        es = null;
        clearTimeout(retry);
        retry = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      disposed = true;
      requestRefreshImpl = null;
      clearTimeout(debounce);
      clearTimeout(trailing);
      clearTimeout(retry);
      stopPolling();
      es?.close();
    };
  }, [queryClient, chainId]);

  return null;
}
