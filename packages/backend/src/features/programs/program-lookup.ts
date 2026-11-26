import { inArray } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

const { v4Programs } = ponderSchema;

type ProgramRow = typeof v4Programs.$inferSelect;

/**
 * The programs behind a list of rows, to attach to them in code instead of with a SQL join.
 *
 * Do NOT join tables through `ponderClient`: it rebuilds each result row from an object keyed by column
 * name, so two tables with a column of the same name (chain_id, pid, status, token, ...) overwrite each
 * other and every later value shifts into the wrong field, without any error.
 *
 * Returns a lookup that gives only the requested fields, or null when the program is not found.
 */
export async function programLookup<K extends keyof ProgramRow>(
  pids: ReadonlyArray<number | null>,
  fields: readonly K[],
): Promise<(pid: number | null) => Pick<ProgramRow, K> | null> {
  const wanted = [...new Set(pids.filter((pid): pid is number => pid !== null))];
  const rows = wanted.length
    ? await ponderClient.db.select().from(v4Programs).where(onChain(v4Programs, inArray(v4Programs.pid, wanted)))
    : [];
  const byPid = new Map(rows.map((row) => [row.pid, row]));

  return (pid) => {
    const row = pid === null ? undefined : byPid.get(pid);
    if (!row) return null;
    return Object.fromEntries(fields.map((field) => [field, row[field]])) as Pick<ProgramRow, K>;
  };
}
