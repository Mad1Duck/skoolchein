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

export const sendSseToAll = async (channel: string, data: unknown) => {
  try {
    await fetch(`${BACKEND_INTERNAL_URL}/internal/sse/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, data }),
    });
  } catch (err) {
    logger.warn({ err }, "sendSseToAll: failed to reach backend SSE broadcaster");
  }
};
