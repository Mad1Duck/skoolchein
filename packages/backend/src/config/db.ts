// db.ts — Backend's own database connection (Drizzle + PostgreSQL, public schema)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";

// DATABASE_URL here is backend's own connection string (resolved from
// BACKEND_DATABASE_URL, falling back to the shared DATABASE_URL, at the
// docker-compose/env level — see root .env.example section 4). There is no
// individual DB_HOST/DB_USER/DB_NAME fallback: those vars are scoped to
// Ponder's database (section 3), and silently falling back to them here
// would connect backend to the wrong database.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for packages/backend (see .env.example section 2).");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
