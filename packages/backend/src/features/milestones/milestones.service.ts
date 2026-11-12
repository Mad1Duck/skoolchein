import { Injectable, Singleton } from "hono-forge";
import { eq, and, asc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

const { v4Milestones, v4Scholars, v4Programs } = ponderSchema;

@Injectable()
@Singleton()
export class MilestonesService {
  async list(opts: { scholar?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.scholar) conditions.push(eq(v4Milestones.scholarWallet, opts.scholar));
    if (opts.status) conditions.push(eq(v4Milestones.status, opts.status as any));
    const where = onChain(v4Milestones, ...conditions);

    return ponderClient.db.select({
      milestone: v4Milestones,
      scholar: {
        wallet: v4Scholars.wallet,
        status: v4Scholars.status,
        totalReceived: v4Scholars.totalReceived,
      },
      program: {
        pid: v4Programs.pid,
      },
    })
      .from(v4Milestones)
      .leftJoin(v4Scholars, and(eq(v4Milestones.chainId, v4Scholars.chainId), eq(v4Milestones.pid, v4Scholars.pid), eq(v4Milestones.scholarWallet, v4Scholars.wallet)))
      .leftJoin(v4Programs, and(eq(v4Milestones.chainId, v4Programs.chainId), eq(v4Milestones.pid, v4Programs.pid)))
      .where(where)
      .orderBy(asc(v4Milestones.blockchainId))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getByBlockchainId(blockchainId: number) {
    const [result] = await ponderClient.db.select().from(v4Milestones)
      .where(onChain(v4Milestones, eq(v4Milestones.blockchainId, blockchainId))).limit(1);
    return result ?? null;
  }
}
