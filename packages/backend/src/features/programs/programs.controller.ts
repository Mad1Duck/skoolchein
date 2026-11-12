import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
import { ProgramsService } from "./programs.service";

/**
 * NOTE: handlers return plain objects, never `c.json(...)`. hono-forge's
 * route builder unconditionally wraps the returned value in `c.json(result)`,
 * so returning a Response gets double-wrapped and serializes to `{}`.
 * Non-200 responses are raised via HttpException; unexpected errors fall
 * through to the onError handler configured in main.ts.
 */
@Controller("/v4/programs")
@Injectable([ProgramsService])
@ApiTags("Programs")
export class ProgramsController {
  constructor(private service: ProgramsService) {}

  @Get("/")
  @ApiDoc({ summary: "List programs", description: "Filter by status/initiator, paginated." })
  async list(c: Context) {
    const status = c.req.query("status");
    const initiator = c.req.query("initiator");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const sort = c.req.query("sort") === "asc" ? "asc" as const : "desc" as const;

    const { data, total } = await this.service.list({ status, initiator, limit, offset, sort });
    return { data, total, limit, offset };
  }

  @Get("/:pid")
  @ApiDoc({ summary: "Single program detail with related counts" })
  async detail(c: Context) {
    const pid = Number(c.req.param("pid"));
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    const program = await this.service.getByPid(pid);
    if (!program) throw HttpException.notFound("Program not found");
    return { data: program };
  }

  @Get("/:pid/applicants")
  @ApiDoc({ summary: "Applicants for a program" })
  async applicants(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.applicantsForProgram(pid, limit, offset) };
  }

  @Get("/:pid/scholars")
  @ApiDoc({ summary: "Scholars for a program" })
  async scholars(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.scholarsForProgram(pid, limit, offset) };
  }

  @Get("/:pid/milestones")
  @ApiDoc({ summary: "Milestones for a program" })
  async milestones(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.milestonesForProgram(pid, limit, offset) };
  }

  @Get("/:pid/recommendations")
  @ApiDoc({ summary: "Verified recommendations for a program's applicants" })
  async recommendations(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 100), 200);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.recommendationsForProgram(pid, limit, offset) };
  }

  @Get("/:pid/votes")
  @ApiDoc({ summary: "Votes for a program" })
  async votes(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.votesForProgram(pid, limit, offset) };
  }

  @Get("/:pid/disputes")
  @ApiDoc({ summary: "Disputes for a program" })
  async disputes(c: Context) {
    const pid = Number(c.req.param("pid"));
    if (Number.isNaN(pid)) throw HttpException.badRequest("Invalid pid");

    return { data: await this.service.disputesForProgram(pid) };
  }
}
