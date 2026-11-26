import { Injectable, Singleton } from "hono-forge";
import { eq, desc, asc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";
import { programLookup } from "@/features/programs/program-lookup";

const { v4Scholars, v4Milestones } = ponderSchema;

@Injectable()
@Singleton()
export class ScholarsService {
  async list(opts: { wallet?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.wallet) conditions.push(eq(v4Scholars.wallet, opts.wallet));
    if (opts.status) conditions.push(eq(v4Scholars.status, opts.status as any));
    const where = onChain(v4Scholars, ...conditions);

    const rows = await ponderClient.db.select().from(v4Scholars)
      .where(where)
      .orderBy(desc(v4Scholars.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    const program = await programLookup(
      rows.map((r) => r.pid),
      ["pid", "metadataCID", "token", "status", "initiator", "totalFund"],
    );

    return rows.map((scholar) => ({ scholar, program: program(scholar.pid) }));
  }

  async byWallet(wallet: string, pid?: number) {
    const conditions = [eq(v4Scholars.wallet, wallet)];
    if (pid !== undefined) conditions.push(eq(v4Scholars.pid, pid));

    const scholars = await ponderClient.db.select().from(v4Scholars)
      .where(onChain(v4Scholars, ...conditions))
      .orderBy(desc(v4Scholars.createdAt));

    if (scholars.length === 0) return null;
    const program = await programLookup(scholars.map((s) => s.pid), ["pid", "metadataCID", "token", "status"]);

    return Promise.all(
      scholars.map(async (scholar) => {
        const milestones = await ponderClient.db.select().from(v4Milestones)
          .where(onChain(v4Milestones, eq(v4Milestones.pid, scholar.pid), eq(v4Milestones.scholarWallet, scholar.wallet)))
          .orderBy(asc(v4Milestones.blockchainId));
        return { scholar, program: program(scholar.pid), milestones };
      })
    );
  }
}
