import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { ApplicantsService } from "./applicants.service";

@Controller("/v4/applicants")
@Injectable([ApplicantsService])
@ApiTags("Applicants")
export class ApplicantsController {
  constructor(private service: ApplicantsService) {}

  @Get("/")
  @ApiDoc({ summary: "List applicants", description: "Filter by wallet/status, paginated." })
  async list(c: Context) {
    const wallet = c.req.query("wallet");
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
      const data = await this.service.list({ wallet, status, limit, offset });
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch applicants", details: String(err) }, 500);
    }
  }

  @Get("/:pid/:wallet")
  @ApiDoc({ summary: "Single applicant by program id + wallet" })
  async detail(c: Context) {
    const pid = Number(c.req.param("pid"));
    const wallet = c.req.param("wallet")!;
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const applicant = await this.service.getOne(pid, wallet);
      if (!applicant) return c.json({ error: "Applicant not found" }, 404);
      return c.json({ data: applicant });
    } catch (err) {
      return c.json({ error: "Failed to fetch applicant", details: String(err) }, 500);
    }
  }
}
