import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc, HttpException } from "hono-forge";
import { TokensService } from "./tokens.service";

@Controller("/v4/tokens")
@Injectable([TokensService])
@ApiTags("Tokens")
export class TokensController {
  constructor(private service: TokensService) {}

  @Get("/")
  @ApiDoc({
    summary: "List payment tokens and USD rates",
    description:
      "Mirrors ScholarshipPriceOracle. priceUsd has 8 decimals and is display-only. " +
      "Pass ?includeDeregistered=true to also return tokens that were removed.",
  })
  async list(c: Context) {
    const includeDeregistered = c.req.query("includeDeregistered") === "true";
    return { data: await this.service.list({ includeDeregistered }) };
  }

  @Get("/:token")
  @ApiDoc({ summary: "Single payment token by address (zero address = native)" })
  async detail(c: Context) {
    const token = c.req.param("token")!;
    const row = await this.service.getByAddress(token);
    if (!row) throw HttpException.notFound("Token not registered");
    return { data: row };
  }
}
