import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/**
 * The upload endpoints are open (anyone applying or reporting uses them) and every call spends the
 * IPFS pinning quota, so they are capped: request size, uploads per visitor and uploads overall.
 * Counts live in memory, which is enough for the single backend instance this runs as.
 */
const WINDOW_MS = 10 * 60 * 1000;
// One report can pin 5 evidence files plus its document, and an application several texts.
const PER_VISITOR = Number(process.env.UPLOAD_LIMIT_PER_VISITOR ?? 40);
const OVERALL = Number(process.env.UPLOAD_LIMIT_OVERALL ?? 600);
// Evidence files may be 10 MB; the rest is multipart overhead.
const MAX_BODY_BYTES = 11 * 1024 * 1024;

let windowStart = 0;
let total = 0;
const perVisitor = new Map<string, number>();

/** The address the reverse proxy saw: the LAST entry, because earlier ones can be typed by the caller. */
function visitorOf(forwardedFor: string | undefined): string {
  return forwardedFor?.split(",").pop()?.trim() || "unknown";
}

export const uploadRateLimit: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST") return next();

  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    total = 0;
    perVisitor.clear();
  }

  const visitor = visitorOf(c.req.header("x-forwarded-for"));
  const used = perVisitor.get(visitor) ?? 0;
  if (used >= PER_VISITOR || total >= OVERALL) {
    c.header("Retry-After", String(Math.ceil((windowStart + WINDOW_MS - now) / 1000)));
    return c.json({ success: false, error: { code: "TOO_MANY_REQUESTS", message: "Too many uploads. Try again in a few minutes." } }, 429);
  }
  perVisitor.set(visitor, used + 1);
  total += 1;
  return next();
};

export const uploadBodyLimit: MiddlewareHandler = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "The upload is too large." } }, 413),
});
