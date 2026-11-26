import { Injectable, Singleton } from "hono-forge";
import { eq, ilike, desc, count } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";
import { programLookup } from "@/features/programs/program-lookup";
import { withDefenseDeadline } from "./defense";

const { v4Disputes } = ponderSchema;

@Injectable()
@Singleton()
export class DisputesService {
  async list(opts: { status?: string; bountyHunter?: string; scholar?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.status) conditions.push(eq(v4Disputes.status, opts.status as any));
    if (opts.bountyHunter) conditions.push(ilike(v4Disputes.bountyHunter, opts.bountyHunter));
    if (opts.scholar) conditions.push(ilike(v4Disputes.scholarAddress, opts.scholar));
    const where = onChain(v4Disputes, ...conditions);

    const [rows, [total]] = await Promise.all([
      ponderClient.db.select().from(v4Disputes)
        .where(where)
        .orderBy(desc(v4Disputes.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      ponderClient.db.select({ value: count() }).from(v4Disputes).where(where),
    ]);
    const program = await programLookup(rows.map((d) => d.pid), ["pid", "metadataCID", "token", "status"]);

    return {
      data: rows.map((d) => ({ dispute: withDefenseDeadline(d), program: program(d.pid) })),
      total: Number(total?.value ?? 0),
    };
  }

  async getByBlockchainId(blockchainId: number) {
    const [dispute] = await ponderClient.db.select().from(v4Disputes)
      .where(onChain(v4Disputes, eq(v4Disputes.blockchainId, blockchainId)))
      .limit(1);
    if (!dispute) return null;
    const program = await programLookup([dispute.pid], ["pid", "metadataCID", "token", "status"]);

    return { dispute: withDefenseDeadline(dispute), program: program(dispute.pid) };
  }
}
