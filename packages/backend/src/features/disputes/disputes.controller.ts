import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
import { DisputesService } from "./disputes.service";

@Controller("/v4/disputes")
@Injectable([DisputesService])
@ApiTags("Disputes")
export class DisputesController {
  constructor(private service: DisputesService) {}

  @Get("/")
  @ApiDoc({ summary: "List disputes", description: "Filter by status/bountyHunter/scholar, paginated." })
  async list(c: Context) {
    const status = c.req.query("status");
    const bountyHunter = c.req.query("bountyHunter");
    const scholar = c.req.query("scholar");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    const { data, total } = await this.service.list({ status, bountyHunter, scholar, limit, offset });
    return { data, total, limit, offset };
  }

  @Get("/:blockchainId")
  @ApiDoc({ summary: "Single dispute by on-chain id" })
  async detail(c: Context) {
    const blockchainId = Number(c.req.param("blockchainId"));
    if (Number.isNaN(blockchainId)) throw HttpException.badRequest("Invalid id");

    const dispute = await this.service.getByBlockchainId(blockchainId);
    if (!dispute) throw HttpException.notFound("Dispute not found");
    return { data: dispute };
  }
}
