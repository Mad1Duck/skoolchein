/**
 * ponder.schema.ts
 *
 * Ponder's built-in schema file. Our actual schema lives in src/db/schema.ts
 * using Drizzle ORM for full control over migrations and types.
 *
 * NOTE: We keep a minimal placeholder table here because an empty schema
 * can trigger a Ponder v0.11 crash recovery bug that emits malformed SQL
 * ("syntax error at or near ')'"). This table lives in Ponder's internal
 * schema (`skoolcein`) and does not conflict with Drizzle tables in `public`.
 */

import { onchainTable } from "ponder";

export const schemaPlaceholder = onchainTable("schema_placeholder", (t) => ({
  id: t.text().primaryKey(),
}));
