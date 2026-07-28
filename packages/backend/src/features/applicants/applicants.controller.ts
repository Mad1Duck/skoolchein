import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
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

    return { data: await this.service.list({ wallet, status, limit, offset }) };
  }

  @Get("/:pid/:wallet")
  @ApiDoc({ summary: "Single applicant by program id + wallet" })
  async detail(c: Context) {
    const pid = Number(c.req.param("pid"));
    const wallet = c.req.param("wallet")!;
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    const applicant = await this.service.getOne(pid, wallet);
    if (!applicant) throw HttpException.notFound("Applicant not found");
    return { data: applicant };
  }
}
