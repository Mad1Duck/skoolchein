import "dotenv/config";

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  PONDER_SQL_URL: process.env.PONDER_SQL_URL ?? "http://localhost:42069/sql",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ?? "skoolchein_dev_secret_123",
  PINATA_JWT: process.env.PINATA_JWT ?? "",
  PINATA_GATEWAY: process.env.PINATA_GATEWAY ?? "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
};
