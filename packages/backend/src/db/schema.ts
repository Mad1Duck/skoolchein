import { pgTable, varchar, integer, timestamp, unique, uuid } from "drizzle-orm/pg-core";

/**
 * Backend-owned Drizzle schema (public schema, managed by drizzle-kit).
 *
 * Only genuinely off-chain tables belong here — anything written by a chain
 * event handler lives in packages/ponder/ponder.schema.ts instead, since
 * Ponder self-manages migrations for its own onchain tables. Duplicating an
 * onchain table here would recreate the dual-migration-owner bug this split
 * was meant to fix.
 */

/** Tracks progress from 3rd party platforms (HackQuest/Udemy) via webhooks — not chain-sourced */
export const v4ExternalLearning = pgTable("v4_external_learning", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: varchar("address", { length: 42 }).notNull(),
  provider: varchar("provider", { length: 66 }).notNull(), // hex bytes32
  externalId: varchar("external_id", { length: 66 }).notNull(), // hex bytes32
  progress: integer("progress").default(0),
  status: varchar("status", { length: 20 }).default("IN_PROGRESS"), // "COMPLETED", "FAILED"
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqProg: unique().on(t.address, t.provider, t.externalId),
}));
