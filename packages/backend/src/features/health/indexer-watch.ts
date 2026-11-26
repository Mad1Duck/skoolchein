import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { createIndexerMonitor } from "./indexer-monitor";

const CHECK_EVERY_MS = 30_000;

/** Nawasena (31338) may use the unsuffixed name, like the indexer's config. */
function rpcUrl(chainId: number): string | undefined {
  return process.env[`PONDER_RPC_URL_${chainId}`] || (chainId === 31338 ? process.env.PONDER_RPC_URL : undefined);
}

/** Always logs; also posts to ALERT_WEBHOOK_URL when set. */
async function notify(message: string) {
  logger.error({ alert: true }, message);
  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    const res = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is read by Slack and Telegram, `content` by Discord.
      body: JSON.stringify({ text: `[Skoolcein] ${message}`, content: `[Skoolcein] ${message}` }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) logger.warn({ status: res.status }, "alert webhook refused the message");
  } catch (err) {
    // The URL usually contains a token: log the failure without it.
    logger.warn({ reason: (err as Error).name }, "alert webhook unreachable");
  }
}

export const indexerMonitor = createIndexerMonitor({
  baseUrl: env.PONDER_SQL_URL.replace(/\/sql\/?$/, ""),
  chainIds: env.SUPPORTED_CHAIN_IDS,
  rpcUrl,
  notify,
});

export function startIndexerWatch() {
  // `bun --hot` re-runs this module; keep a single timer.
  const holder = globalThis as { indexerWatch?: ReturnType<typeof setInterval> };
  clearInterval(holder.indexerWatch);
  const tick = () => indexerMonitor.check().catch((err) => logger.error({ err }, "indexer check failed"));
  holder.indexerWatch = setInterval(tick, CHECK_EVERY_MS);
  void tick();
}
