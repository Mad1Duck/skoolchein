import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { DashboardService } from "./dashboard.service";

@Controller("/v4/dashboard")
@Injectable([DashboardService])
@ApiTags("Dashboard")
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get("/:wallet")
  @ApiDoc({ summary: "Aggregated dashboard data for a wallet" })
  async detail(c: Context) {
    const wallet = c.req.param("wallet")!;
    return { data: await this.service.forWallet(wallet) };
  }
}
