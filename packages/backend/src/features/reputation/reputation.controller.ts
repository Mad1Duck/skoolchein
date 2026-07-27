import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { ReputationService } from "./reputation.service";

@Controller("/v4/reputation")
@Injectable([ReputationService])
@ApiTags("Reputation")
export class ReputationController {
  constructor(private service: ReputationService) {}

  @Get("/:address")
  @ApiDoc({ summary: "Get REP (Soulbound Token) balance for an address" })
  async detail(c: Context) {
    const address = c.req.param("address")!.toLowerCase();

    try {
      const rep = await this.service.getByAddress(address);

      if (!rep) {
        return c.json({
          data: {
            address,
            repBalance: "0",
            totalMinted: "0",
            totalBurned: "0",
            remainingVotingPower: "0",
            votingLockedUntil: null,
            isVotingLocked: false,
          },
        });
      }

      const isVotingLocked = rep.votingLockedUntil
        ? new Date(rep.votingLockedUntil) > new Date()
        : false;

      return c.json({ data: { ...rep, isVotingLocked } });
    } catch (err) {
      return c.json({ error: "Failed to fetch reputation", details: String(err) }, 500);
    }
  }
}
