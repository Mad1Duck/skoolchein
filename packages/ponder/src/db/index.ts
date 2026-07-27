// db.ts — Database connection (Drizzle + PostgreSQL)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Prefer DATABASE_URL (handles Supabase pooler username format correctly).
// Fall back to individual DB_* vars for local/Docker setups.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      host:     process.env.DB_HOST,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port:     Number(process.env.DB_PORT ?? 5432),
      ssl:      process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });

export const db = drizzle(pool, { schema });
