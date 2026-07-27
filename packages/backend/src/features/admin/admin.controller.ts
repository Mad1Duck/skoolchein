import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { AdminService } from "./admin.service";

@Controller("/v4/admin")
@Injectable([AdminService])
@ApiTags("Admin")
export class AdminController {
  constructor(private service: AdminService) {}

  @Get("/")
  @ApiDoc({ summary: "Admin overview", description: "Aggregate counts across the entire protocol." })
  async overview(c: Context) {
    try {
      const data = await this.service.overview();
      return c.json({ data });
    } catch (err) {
      return c.json({ error: "Failed to fetch admin overview", details: String(err) }, 500);
    }
  }
}
