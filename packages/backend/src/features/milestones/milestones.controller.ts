import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
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

    return { data: await this.service.list({ scholar, status, limit, offset }) };
  }

  @Get("/:blockchainId")
  @ApiDoc({ summary: "Single milestone by on-chain id" })
  async detail(c: Context) {
    const blockchainId = Number(c.req.param("blockchainId"));
    if (Number.isNaN(blockchainId)) throw HttpException.badRequest("Invalid id");

    const milestone = await this.service.getByBlockchainId(blockchainId);
    if (!milestone) throw HttpException.notFound("Milestone not found");
    return { data: milestone };
  }
}
