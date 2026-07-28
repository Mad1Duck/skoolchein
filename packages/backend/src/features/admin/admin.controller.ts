import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { AdminService } from "./admin.service";

@Controller("/v4/admin")
@Injectable([AdminService])
@ApiTags("Admin")
export class AdminController {
  constructor(private service: AdminService) {}

  @Get("/")
  @ApiDoc({ summary: "Admin overview", description: "Aggregate counts across the entire protocol." })
  async overview() {
    return { data: await this.service.overview() };
  }
}
