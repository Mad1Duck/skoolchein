import { Injectable, Singleton } from "hono-forge";
import { count, countDistinct } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

const { v4Programs, v4Applicants, v4Scholars, v4Milestones, v4Disputes } = ponderSchema;

@Injectable()
@Singleton()
export class AdminService {
  async overview() {
    const [[programs], [applicants], [scholars], [milestones], [disputes], [creators]] = await Promise.all([
      ponderClient.db.select({ value: count() }).from(v4Programs).where(onChain(v4Programs)),
      ponderClient.db.select({ value: count() }).from(v4Applicants).where(onChain(v4Applicants)),
      ponderClient.db.select({ value: count() }).from(v4Scholars).where(onChain(v4Scholars)),
      ponderClient.db.select({ value: count() }).from(v4Milestones).where(onChain(v4Milestones)),
      ponderClient.db.select({ value: count() }).from(v4Disputes).where(onChain(v4Disputes)),
      ponderClient.db.select({ value: countDistinct(v4Programs.initiator) }).from(v4Programs).where(onChain(v4Programs)),
    ]);

    return {
      totalPrograms: Number(programs?.value ?? 0),
      totalApplicants: Number(applicants?.value ?? 0),
      totalScholars: Number(scholars?.value ?? 0),
      totalMilestones: Number(milestones?.value ?? 0),
      totalDisputes: Number(disputes?.value ?? 0),
      totalCreators: Number(creators?.value ?? 0),
    };
  }
}
