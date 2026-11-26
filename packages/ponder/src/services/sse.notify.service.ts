import { logger } from "@/utils/logger";

/**
 * Best-effort real-time push to packages/backend's SSE broadcaster.
 *
 * Ponder no longer hosts the SSE endpoint itself (moved to packages/backend
 * per the backend split) — event handlers now notify backend over HTTP
 * instead of calling an in-process broadcaster directly. Failures here must
 * never break indexing, so every error is swallowed and logged.
 */
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3103";

/** Shared with the backend (WEBHOOK_SECRET). The example value only works outside production. */
const SECRET =
  process.env.WEBHOOK_SECRET || (process.env.NODE_ENV === "production" ? "" : "skoolchein_dev_secret_123");

export const sendSseToAll = async (channel: string, data: unknown) => {
  try {
    const res = await fetch(`${BACKEND_INTERNAL_URL}/sse/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      // Event args are bigint, which JSON cannot encode: without this the update was never sent.
      body: JSON.stringify({ channel, data }, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) logger.warn({ status: res.status }, "sendSseToAll: backend refused the broadcast");
  } catch (err) {
    logger.warn({ err }, "sendSseToAll: failed to reach backend SSE broadcaster");
  }
};
