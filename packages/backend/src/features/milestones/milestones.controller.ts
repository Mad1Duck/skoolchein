import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { MilestonesService } from "./milestones.service";

@Controller("/v4/milestones")
@Injectable([MilestonesService])
@ApiTags("Milestones")
export class MilestonesController {
  constructor(private service: MilestonesService) {}

  @Get("/")
  @ApiDoc({ summary: "List milestones", description: "Filter by scholar wallet/status, paginated." })
  async list(c: Context) {
    const scholar = c.req.query("scholar");
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
      const data = await this.service.list({ scholar, status, limit, offset });
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch milestones", details: String(err) }, 500);
    }
  }

  @Get("/:blockchainId")
  @ApiDoc({ summary: "Single milestone by on-chain id" })
  async detail(c: Context) {
    const blockchainId = Number(c.req.param("blockchainId"));
    if (Number.isNaN(blockchainId)) return c.json({ error: "Invalid id" }, 400);

    try {
      const milestone = await this.service.getByBlockchainId(blockchainId);
      if (!milestone) return c.json({ error: "Milestone not found" }, 404);
      return c.json({ data: milestone });
    } catch (err) {
      return c.json({ error: "Failed to fetch milestone", details: String(err) }, 500);
    }
  }
}
