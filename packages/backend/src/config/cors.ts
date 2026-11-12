import { cors } from "hono/cors";

/**
 * CORS policy, driven by CORS_ORIGINS (comma-separated, default "*").
 *
 *   CORS_ORIGINS="*"                                  any origin (default, previous behaviour)
 *   CORS_ORIGINS="https://skoolcein.nawasena-labs.com" only these origins
 *
 * Local frontends (http://localhost:<port>, http://127.0.0.1:<port>) are always
 * allowed so `bun run dev` works against a deployed API; set CORS_ALLOW_LOCALHOST=false
 * to turn that off in a locked-down deployment.
 */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const allowed = (process.env.CORS_ORIGINS ?? "*")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowLocalhost = process.env.CORS_ALLOW_LOCALHOST !== "false";
const wildcard = allowed.includes("*");

export const corsMiddleware = cors({
  origin: (origin) => {
    if (wildcard) return "*";
    if (!origin) return null;
    if (allowed.includes(origin)) return origin;
    if (allowLocalhost && LOCALHOST.test(origin)) return origin;
    return null;
  },
  allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // x-chain-id selects the chain for /v4 routes (see chain-context.ts).
  allowHeaders: ["Content-Type", "Authorization", "Accept", "x-chain-id"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
  credentials: false,
});
