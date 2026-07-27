import { Injectable, Singleton } from "hono-forge";
import { db } from "@/config/db";
import { v4ExternalLearning } from "@/db/schema";

export interface UpsertProgressInput {
  address: string;
  provider: string;
  courseId: string;
  progress?: number;
  status?: string;
}

@Injectable()
@Singleton()
export class WebhooksService {
  async upsertProgress({ address, provider, courseId, progress, status }: UpsertProgressInput) {
    await db.insert(v4ExternalLearning)
      .values({
        address: address.toLowerCase(),
        provider: provider.toLowerCase(),
        externalId: courseId,
        progress: progress ?? 0,
        status: status || "IN_PROGRESS",
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: [v4ExternalLearning.address, v4ExternalLearning.provider, v4ExternalLearning.externalId],
        set: {
          progress: progress ?? 0,
          status: status || "IN_PROGRESS",
          lastUpdated: new Date(),
        },
      });
  }
}
