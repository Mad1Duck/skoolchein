// db.ts — Backend's own database connection (Drizzle + PostgreSQL, public schema)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

// DATABASE_URL here is backend's own database (see root .env.example
// section 3 — Ponder uses DATABASE_INDEXER_URL instead). There is no
// individual DB_HOST/DB_USER/DB_NAME fallback on purpose: those vars are
// scoped to Ponder's database, and silently falling back to them here
// would connect backend to the wrong database.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for packages/backend (see .env.example section 3).");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  // Bounded so an unreachable Postgres fails fast instead of hanging on the
  // OS TCP timeout (~2min) — that would stall /health past the container
  // healthcheck's timeout and mark the service unhealthy.
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });
