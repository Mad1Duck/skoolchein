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

    const rep = await this.service.getByAddress(address);

    // An address with no REP yet is a valid zero state, not a 404.
    if (!rep) {
      return {
        data: {
          address,
          repBalance: "0",
          totalMinted: "0",
          totalBurned: "0",
          remainingVotingPower: "0",
          votingLockedUntil: null,
          isVotingLocked: false,
        },
      };
    }

    const isVotingLocked = rep.votingLockedUntil
      ? new Date(rep.votingLockedUntil) > new Date()
      : false;

    return { data: { ...rep, isVotingLocked } };
  }
}
