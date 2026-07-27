import { Injectable, Singleton } from "hono-forge";
import { eq, and } from "drizzle-orm";
import { db } from "@/config/db";
import { v4ExternalLearning } from "@/db/schema";

@Injectable()
@Singleton()
export class LearningService {
  async getCourseProgress(address: string, courseId: string) {
    const [result] = await db
      .select()
      .from(v4ExternalLearning)
      .where(and(
        eq(v4ExternalLearning.address, address),
        eq(v4ExternalLearning.externalId, courseId),
      ))
      .limit(1);

    return result ?? null;
  }

  async getAllProgress(address: string) {
    return db.select().from(v4ExternalLearning).where(eq(v4ExternalLearning.address, address));
  }
}
