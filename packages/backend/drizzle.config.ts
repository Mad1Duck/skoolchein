import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// DATABASE_URL here is backend's own connection string (resolved from
// BACKEND_DATABASE_URL, falling back to the shared DATABASE_URL — see root
// .env.example section 4). No individual DB_HOST/DB_USER/DB_NAME fallback:
// those vars are scoped to Ponder's database (section 3), and silently
// falling back to them here would run migrations against the wrong database.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for packages/backend (see .env.example section 2).");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  migrations: {
    // Backend's own off-chain tables live in the default `public` schema.
    // Ponder owns a separate schema (DATABASE_SCHEMA, default `skoolcein`)
    // for onchain tables and self-manages migrations there — no overlap.
    schema: "public",
  },
});
