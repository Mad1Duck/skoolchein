import "dotenv/config";

/** Chain ids the API serves. Must be a subset of what the indexer (PONDER_CHAIN_IDS) indexes. */
const SUPPORTED_CHAIN_IDS = (process.env.SUPPORTED_CHAIN_IDS ?? process.env.PONDER_CHAIN_IDS ?? "31338")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter(Boolean);

export const env = {
  SUPPORTED_CHAIN_IDS,
  /** Chain used when a request doesn't say which one — keeps pre-multichain clients working. */
  DEFAULT_CHAIN_ID: Number(process.env.DEFAULT_CHAIN_ID ?? SUPPORTED_CHAIN_IDS[0] ?? 31338),
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PONDER_SQL_URL: process.env.PONDER_SQL_URL ?? "http://localhost:42069/sql",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? "skoolchein_dev_secret_123",
  PINATA_JWT: process.env.PINATA_JWT ?? "",
  PINATA_GATEWAY: process.env.PINATA_GATEWAY ?? "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
};
