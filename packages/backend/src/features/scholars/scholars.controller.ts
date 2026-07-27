import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { ScholarsService } from "./scholars.service";

@Controller("/v4/scholars")
@Injectable([ScholarsService])
@ApiTags("Scholars")
export class ScholarsController {
  constructor(private service: ScholarsService) {}

  @Get("/")
  @ApiDoc({ summary: "List scholars", description: "Filter by wallet/status, paginated." })
  async list(c: Context) {
    const wallet = c.req.query("wallet");
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    try {
      const data = await this.service.list({ wallet, status, limit, offset });
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch scholars", details: String(err) }, 500);
    }
  }

  @Get("/:wallet")
  @ApiDoc({ summary: "Scholar detail with milestones" })
  async detail(c: Context) {
    const wallet = c.req.param("wallet")!;
    const programId = c.req.query("programId");
    const pid = programId !== undefined ? Number(programId) : undefined;

    try {
      const scholars = await this.service.byWallet(wallet, Number.isNaN(pid) ? undefined : pid);
      if (!scholars) return c.json({ error: "Scholar not found" }, 404);
      return c.json({ data: scholars });
    } catch (err) {
      return c.json({ error: "Failed to fetch scholar", details: String(err) }, 500);
    }
  }
}
