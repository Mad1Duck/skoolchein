/**
 * Watches the indexer and tells someone when the data stops moving.
 *
 * The indexer stops on any failed event instead of skipping it, so a bad event shows up as an indexer
 * that keeps restarting while the app quietly serves old data. This notices that from the outside:
 *
 *   down     the indexer does not answer
 *   syncing  it answers but has not finished catching up (/ready is 503)
 *   stalled  the chain has newer blocks and the indexed block has not moved for a while
 */

export type IndexerState = "ok" | "syncing" | "stalled" | "down";

export interface ChainProgress {
  chainId: number;
  indexedBlock: number | null;
  /** null when no RPC is configured for the chain, or it did not answer. */
  headBlock: number | null;
}

export interface IndexerReport {
  state: IndexerState;
  chains: ChainProgress[];
  /** When the current trouble started; null while healthy. */
  since: string | null;
  checkedAt: string;
}

export interface IndexerMonitorOptions {
  /** Indexer root URL, without /sql. */
  baseUrl: string;
  chainIds: number[];
  rpcUrl: (chainId: number) => string | undefined;
  notify: (message: string) => Promise<void>;
  /** How long the trouble has to last before the first alert. Rides out restarts and deploys. */
  alertAfterMs?: number;
  /** How long the indexed block may stand still while the chain is ahead. */
  stallAfterMs?: number;
  remindEveryMs?: number;
  /** Healthy checks in a row before it counts as recovered: a crash loop is briefly healthy. */
  recoverAfterChecks?: number;
  now?: () => number;
  fetchFn?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 4_000;

export function createIndexerMonitor(options: IndexerMonitorOptions) {
  const {
    baseUrl, chainIds, rpcUrl, notify,
    alertAfterMs = 5 * 60_000,
    stallAfterMs = 3 * 60_000,
    remindEveryMs = 60 * 60_000,
    recoverAfterChecks = 10,
    now = Date.now,
    fetchFn = fetch,
  } = options;

  const progress = new Map<number, { block: number; movedAt: number }>();
  let troubleSince: number | null = null;
  let alertedAt: number | null = null;
  let healthyStreak = 0;
  let latest: IndexerReport | null = null;
  let running: Promise<IndexerReport> | null = null;

  const request = (url: string, init?: RequestInit) =>
    fetchFn(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  async function headBlock(chainId: number): Promise<number | null> {
    const url = rpcUrl(chainId);
    if (!url) return null;
    try {
      const res = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      const block = Number(((await res.json()) as { result?: string }).result);
      return Number.isFinite(block) ? block : null;
    } catch {
      return null;
    }
  }

  async function probe(): Promise<{ state: IndexerState; chains: ChainProgress[] }> {
    let ready: boolean;
    let status: Record<string, { id: number; block?: { number: number } }>;
    try {
      ready = (await request(`${baseUrl}/ready`)).ok;
      const res = await request(`${baseUrl}/status`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      status = (await res.json()) as typeof status;
    } catch {
      return { state: "down", chains: [] };
    }

    let stalled = false;
    let missing = false;
    const chains = await Promise.all(chainIds.map(async (chainId): Promise<ChainProgress> => {
      const indexed = Object.values(status).find((s) => s.id === chainId)?.block?.number ?? null;
      const head = await headBlock(chainId);
      if (indexed === null) {
        missing = true;
        return { chainId, indexedBlock: null, headBlock: head };
      }
      const seen = progress.get(chainId);
      // Caught up counts as moving: a quiet chain is not a stalled indexer.
      if (!seen || seen.block !== indexed || head === null || head <= indexed) {
        progress.set(chainId, { block: indexed, movedAt: now() });
      } else if (now() - seen.movedAt >= stallAfterMs) {
        stalled = true;
      }
      return { chainId, indexedBlock: indexed, headBlock: head };
    }));

    const state: IndexerState = !ready || missing ? "syncing" : stalled ? "stalled" : "ok";
    return { state, chains };
  }

  const describe = (report: IndexerReport) =>
    report.chains
      .map((c) => `chain ${c.chainId}: indexed ${c.indexedBlock ?? "-"} of ${c.headBlock ?? "?"}`)
      .join("; ") || "no answer";

  async function runCheck(): Promise<IndexerReport> {
    const { state, chains } = await probe();
    const time = now();

    if (state === "ok") {
      healthyStreak += 1;
    } else {
      healthyStreak = 0;
      troubleSince ??= time;
    }

    const report: IndexerReport = {
      state,
      chains,
      since: state === "ok" || troubleSince === null ? null : new Date(troubleSince).toISOString(),
      checkedAt: new Date(time).toISOString(),
    };
    latest = report;

    if (troubleSince === null) return report;

    if (state !== "ok") {
      const lasted = time - troubleSince;
      if (lasted >= alertAfterMs && (alertedAt === null || time - alertedAt >= remindEveryMs)) {
        alertedAt = time;
        await notify(
          `Indexer ${state} for ${Math.round(lasted / 60_000)} min, the app may show old data. ` +
          `${describe(report)}. Check: docker compose logs scholarship-ponder`,
        );
      }
    } else if (healthyStreak >= recoverAfterChecks) {
      if (alertedAt !== null) await notify(`Indexer recovered. ${describe(report)}`);
      troubleSince = null;
      alertedAt = null;
    }
    return report;
  }

  /** One check at a time; callers arriving during a check share its result. */
  function check(): Promise<IndexerReport> {
    running ??= runCheck().finally(() => { running = null; });
    return running;
  }

  return { check, latest: () => latest };
}
