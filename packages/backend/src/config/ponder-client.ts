import { createClient } from "@ponder/client";
import * as ponderSchema from "../../../ponder/ponder.schema";

/**
 * Reads Ponder-indexed onchain data over SQL-over-HTTP. Ponder is the only
 * writer/migration-owner for these tables — backend never connects to them
 * directly over Postgres.
 */
export const ponderClient = createClient(
  process.env.PONDER_SQL_URL ?? "http://localhost:42069/sql",
  { schema: ponderSchema },
);

export { ponderSchema };
