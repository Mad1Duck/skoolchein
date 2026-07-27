import { Injectable, Singleton } from "hono-forge";
import { eq, and, desc, count } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const { v4Disputes, v4Programs } = ponderSchema;

@Injectable()
@Singleton()
export class DisputesService {
  async list(opts: { status?: string; bountyHunter?: string; scholar?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.status) conditions.push(eq(v4Disputes.status, opts.status as any));
    if (opts.bountyHunter) conditions.push(eq(v4Disputes.bountyHunter, opts.bountyHunter));
    if (opts.scholar) conditions.push(eq(v4Disputes.scholarAddress, opts.scholar));
    const where = conditions.length ? and(...conditions) : undefined;

    const [data, [total]] = await Promise.all([
      ponderClient.db.select({
        dispute: v4Disputes,
        program: {
          pid: v4Programs.pid,
          metadataCID: v4Programs.metadataCID,
          status: v4Programs.status,
        },
      })
        .from(v4Disputes)
        .leftJoin(v4Programs, eq(v4Disputes.pid, v4Programs.pid))
        .where(where)
        .orderBy(desc(v4Disputes.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      ponderClient.db.select({ value: count() }).from(v4Disputes).where(where),
    ]);

    return { data, total: Number(total?.value ?? 0) };
  }

  async getByBlockchainId(blockchainId: number) {
    const [result] = await ponderClient.db.select({
      dispute: v4Disputes,
      program: {
        pid: v4Programs.pid,
        metadataCID: v4Programs.metadataCID,
        status: v4Programs.status,
      },
    })
      .from(v4Disputes)
      .leftJoin(v4Programs, eq(v4Disputes.pid, v4Programs.pid))
      .where(eq(v4Disputes.blockchainId, blockchainId))
      .limit(1);

    return result ?? null;
  }
}
