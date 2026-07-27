import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { LearningService } from "./learning.service";

@Controller("/v4/learning")
@Injectable([LearningService])
@ApiTags("Learning")
export class LearningController {
  constructor(private service: LearningService) {}

  /**
   * GET /v4/learning/progress?address=0x...&courseId=...
   * Fetches the external learning progress for a student.
   */
  @Get("/progress")
  @ApiDoc({ summary: "Get external learning progress for a wallet" })
  async progress(c: Context) {
    const address = c.req.query("address")?.toLowerCase();
    const courseId = c.req.query("courseId");

    if (!address) {
      return c.json({ error: "Address is required" }, 400);
    }

    try {
      if (courseId) {
        const result = await this.service.getCourseProgress(address, courseId);
        return c.json(result ?? { progress: 0, status: "NOT_STARTED" });
      } else {
        const results = await this.service.getAllProgress(address);
        return c.json(results);
      }
    } catch (error) {
      console.error("[API] Error fetching external progress:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}
