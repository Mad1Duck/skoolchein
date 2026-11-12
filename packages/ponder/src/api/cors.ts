import { cors } from "hono/cors";

/**
 * CORS policy for the indexer's /graphql and /sql endpoints, driven by
 * CORS_ORIGINS (comma-separated, default "*"). Local frontends
 * (http://localhost:<port>, http://127.0.0.1:<port>) are always allowed unless
 * CORS_ALLOW_LOCALHOST=false. Same rules as packages/backend/src/config/cors.ts.
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
  allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Accept"],
  maxAge: 86400,
  credentials: false,
});
