import { Injectable, Singleton } from "hono-forge";
import { eq, asc, inArray } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";
import { programLookup } from "@/features/programs/program-lookup";

const { v4Milestones, v4Scholars } = ponderSchema;

@Injectable()
@Singleton()
export class MilestonesService {
  async list(opts: { scholar?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.scholar) conditions.push(eq(v4Milestones.scholarWallet, opts.scholar));
    if (opts.status) conditions.push(eq(v4Milestones.status, opts.status as any));
    const where = onChain(v4Milestones, ...conditions);

    const rows = await ponderClient.db.select().from(v4Milestones)
      .where(where)
      .orderBy(asc(v4Milestones.blockchainId))
      .limit(opts.limit)
      .offset(opts.offset);
    // Joined in code, not in SQL: see programLookup.
    const pids = [...new Set(rows.map((m) => m.pid).filter((pid): pid is number => pid !== null))];
    const [scholars, program] = await Promise.all([
      pids.length
        ? ponderClient.db.select().from(v4Scholars).where(onChain(v4Scholars, inArray(v4Scholars.pid, pids)))
        : Promise.resolve([]),
      programLookup(pids, ["pid"]),
    ]);

    return rows.map((milestone) => {
      const scholar = scholars.find((s) => s.pid === milestone.pid && s.wallet === milestone.scholarWallet);
      return {
        milestone,
        scholar: scholar
          ? { wallet: scholar.wallet, status: scholar.status, totalReceived: scholar.totalReceived }
          : null,
        program: program(milestone.pid),
      };
    });
  }

  async getByBlockchainId(blockchainId: number) {
    const [result] = await ponderClient.db.select().from(v4Milestones)
      .where(onChain(v4Milestones, eq(v4Milestones.blockchainId, blockchainId))).limit(1);
    return result ?? null;
  }
}
