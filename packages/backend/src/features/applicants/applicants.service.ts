import { Injectable, Singleton } from "hono-forge";
import { eq, desc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";
import { programLookup } from "@/features/programs/program-lookup";

const { v4Applicants } = ponderSchema;

@Injectable()
@Singleton()
export class ApplicantsService {
  async list(opts: { wallet?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.wallet) conditions.push(eq(v4Applicants.wallet, opts.wallet));
    if (opts.status) conditions.push(eq(v4Applicants.status, opts.status as any));
    const where = onChain(v4Applicants, ...conditions);

    const rows = await ponderClient.db.select().from(v4Applicants)
      .where(where)
      .orderBy(desc(v4Applicants.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    const program = await programLookup(
      rows.map((r) => r.pid),
      ["pid", "metadataCID", "token", "status", "initiator", "totalFund"],
    );

    return rows.map((applicant) => ({ applicant, program: program(applicant.pid) }));
  }

  async getOne(pid: number, wallet: string) {
    const [applicant] = await ponderClient.db.select().from(v4Applicants)
      .where(onChain(v4Applicants, eq(v4Applicants.pid, pid), eq(v4Applicants.wallet, wallet)))
      .limit(1);
    if (!applicant) return null;
    const program = await programLookup([pid], ["pid", "metadataCID", "token", "status"]);

    return { applicant, program: program(pid) };
  }
}
