import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { ProgramsService } from "./programs.service";

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

    try {
      const { data, total } = await this.service.list({ status, initiator, limit, offset, sort });
      return c.json({ data, total, limit, offset });
    } catch (err) {
      return c.json({ error: "Failed to fetch programs", details: String(err) }, 500);
    }
  }

  @Get("/:pid")
  @ApiDoc({ summary: "Single program detail with related counts" })
  async detail(c: Context) {
    const pid = Number(c.req.param("pid"));
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const program = await this.service.getByPid(pid);
      if (!program) return c.json({ error: "Program not found" }, 404);
      return c.json({ data: program });
    } catch (err) {
      return c.json({ error: "Failed to fetch program", details: String(err) }, 500);
    }
  }

  @Get("/:pid/applicants")
  @ApiDoc({ summary: "Applicants for a program" })
  async applicants(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const data = await this.service.applicantsForProgram(pid, limit, offset);
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch applicants", details: String(err) }, 500);
    }
  }

  @Get("/:pid/scholars")
  @ApiDoc({ summary: "Scholars for a program" })
  async scholars(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const data = await this.service.scholarsForProgram(pid, limit, offset);
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch scholars", details: String(err) }, 500);
    }
  }

  @Get("/:pid/milestones")
  @ApiDoc({ summary: "Milestones for a program" })
  async milestones(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const data = await this.service.milestonesForProgram(pid, limit, offset);
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch milestones", details: String(err) }, 500);
    }
  }

  @Get("/:pid/votes")
  @ApiDoc({ summary: "Votes for a program" })
  async votes(c: Context) {
    const pid = Number(c.req.param("pid"));
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const data = await this.service.votesForProgram(pid, limit, offset);
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch votes", details: String(err) }, 500);
    }
  }

  @Get("/:pid/disputes")
  @ApiDoc({ summary: "Disputes for a program" })
  async disputes(c: Context) {
    const pid = Number(c.req.param("pid"));
    if (Number.isNaN(pid)) return c.json({ error: "Invalid pid" }, 400);

    try {
      const data = await this.service.disputesForProgram(pid);
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch disputes", details: String(err) }, 500);
    }
  }
}
