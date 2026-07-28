import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { VotesService } from "./votes.service";

@Controller("/v4/votes")
@Injectable([VotesService])
@ApiTags("Votes")
export class VotesController {
  constructor(private service: VotesService) {}

  @Get("/")
  @ApiDoc({ summary: "List votes", description: "Filter by voter/candidate, paginated." })
  async list(c: Context) {
    const voter = c.req.query("voter");
    const candidate = c.req.query("candidate");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    return { data: await this.service.list({ voter, candidate, limit, offset }) };
  }

  @Get("/stakes")
  @ApiDoc({ summary: "List confidence stakes", description: "Filter by voter/resolved, paginated." })
  async stakes(c: Context) {
    const voter = c.req.query("voter");
    const resolved = c.req.query("resolved");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    return {
      data: await this.service.listStakes({
        voter,
        resolved: resolved !== undefined ? resolved === "true" : undefined,
        limit,
        offset,
      }),
    };
  }
}
