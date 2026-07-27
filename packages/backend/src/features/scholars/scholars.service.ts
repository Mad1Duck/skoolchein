import { Injectable, Singleton } from "hono-forge";
import { eq, and, desc, asc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const { v4Scholars, v4Programs, v4Milestones } = ponderSchema;

@Injectable()
@Singleton()
export class ScholarsService {
  async list(opts: { wallet?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.wallet) conditions.push(eq(v4Scholars.wallet, opts.wallet));
    if (opts.status) conditions.push(eq(v4Scholars.status, opts.status as any));
    const where = conditions.length ? and(...conditions) : undefined;

    return ponderClient.db.select({
      scholar: v4Scholars,
      program: {
        pid: v4Programs.pid,
        metadataCID: v4Programs.metadataCID,
        status: v4Programs.status,
        initiator: v4Programs.initiator,
        totalFund: v4Programs.totalFund,
      },
    })
      .from(v4Scholars)
      .leftJoin(v4Programs, eq(v4Scholars.pid, v4Programs.pid))
      .where(where)
      .orderBy(desc(v4Scholars.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async byWallet(wallet: string, pid?: number) {
    const conditions = [eq(v4Scholars.wallet, wallet)];
    if (pid !== undefined) conditions.push(eq(v4Scholars.pid, pid));

    const scholars = await ponderClient.db.select({
      scholar: v4Scholars,
      program: {
        pid: v4Programs.pid,
        metadataCID: v4Programs.metadataCID,
        status: v4Programs.status,
      },
    })
      .from(v4Scholars)
      .leftJoin(v4Programs, eq(v4Scholars.pid, v4Programs.pid))
      .where(and(...conditions))
      .orderBy(desc(v4Scholars.createdAt));

    if (scholars.length === 0) return null;

    return Promise.all(
      scholars.map(async (s) => {
        const milestones = await ponderClient.db.select().from(v4Milestones)
          .where(and(eq(v4Milestones.pid, s.scholar.pid), eq(v4Milestones.scholarWallet, s.scholar.wallet)))
          .orderBy(asc(v4Milestones.blockchainId));
        return { ...s, milestones };
      })
    );
  }
}
