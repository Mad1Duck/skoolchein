import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
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

    if (!address) throw HttpException.badRequest("Address is required");

    if (courseId) {
      const result = await this.service.getCourseProgress(address, courseId);
      // Never-started is a valid zero state rather than a 404.
      return result ?? { progress: 0, status: "NOT_STARTED" };
    }

    return this.service.getAllProgress(address);
  }
}
