import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, now, expectRevert,
  Status, AppStatus, parseEther, zeroAddress, artifact, ROLE,
} from "./harness.mjs";

// Hooks live inside this describe: top-level hooks would run for every test file in the process.
describe("v4 selection", () => {
let sys, snap;
let core, selection, admin, milestones;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, admin, milestones } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const initiatorOf = () => sys.accounts[1];
const stranger = () => sys.accounts[15];
const donor = (i) => sys.accounts[12 + i];

const program = (pid) => sys.read(core, "getProgram", [BigInt(pid)]);
const applicant = async (pid, who) => {
  const [exists, status, score, votes] = await sys.read(core, "getApplicant", [BigInt(pid), who]);
  return { exists, status, score, votes };
};
const rankApplicants = (pid) => sys.read(selection, "rankApplicants", [BigInt(pid)]);
const rankShortlist = (pid) => sys.read(selection, "rankShortlist", [BigInt(pid)]);
const resolve = (who, pid, ranked, isLast = true) => sys.as(who).write(selection, "resolveShortlist", [BigInt(pid), ranked, isLast]);
const selectWinners = (who, pid, ranked) => sys.as(who).write(selection, "selectWinners", [BigInt(pid), ranked]);
const configure = (who, pid, weight, shares = [10_000], descs = [], providers = [], ids = []) =>
  sys.as(who).write(selection, "configureProgram", [BigInt(pid), weight, shares, descs, providers, ids]);

/** Program with 7 applicants (scores 100..50), two donors, ready at the start of the voting window. */
async function votingReady({ weight, donations, shares, ...rest } = {}) {
  const prog = await setupProgram(sys, {
    donations: donations ?? [
      { account: donor(0), amount: parseEther("10") },
      { account: donor(1), amount: parseEther("10") },
    ],
    ...rest,
  });
  const students = await prog.openWindowAndApply();
  if (weight !== undefined) await configure(initiatorOf(), prog.pid, weight, shares);
  await warpTo(prog.timeline[2]);
  await resolve(stranger(), prog.pid, await rankApplicants(prog.pid));
  return { ...prog, students };
}

describe("application window (by the clock)", () => {
  it("openApplications is refused before the window starts, and anyone may call it after", async () => {
    const prog = await setupProgram(sys);
    await expectRevert(sys.as(stranger()).write(core, "openApplications", [BigInt(prog.pid)]), "TooEarly");
    await warpTo(prog.timeline[0]);
    await sys.as(stranger()).write(core, "openApplications", [BigInt(prog.pid)]);
    assert.equal((await program(prog.pid)).status, Status.APPLICATION_OPEN);
  });

  it("donating opens the window by itself; nobody has to press 'Open Applications'", async () => {
    const prog = await setupProgram(sys);
    await warpTo(prog.timeline[0]);
    assert.equal((await program(prog.pid)).status, Status.CREATED);
    await sys.as(donor(0)).write(core, "donate", [BigInt(prog.pid), parseEther("1"), "ipfs://d"], parseEther("1"));
    assert.equal((await program(prog.pid)).status, Status.APPLICATION_OPEN);
  });

  it("applying and donating close at applicationEnd even though the stored status is still APPLICATION_OPEN", async () => {
    const prog = await setupProgram(sys);
    const [s] = await prog.openWindowAndApply();
    assert.equal((await program(prog.pid)).status, Status.APPLICATION_OPEN);
    await warpTo(prog.timeline[1] + 1);
    assert.equal((await program(prog.pid)).status, Status.APPLICATION_OPEN, "nobody called openScreening");
    await expectRevert(
      sys.as(sys.accounts[10]).write(core, "applyToProgram", [BigInt(prog.pid), "p", "d", "e", "r", 90n, 90n, 90n]),
      "InvalidProgramStatus",
    );
    await expectRevert(
      sys.as(donor(0)).write(core, "donate", [BigInt(prog.pid), parseEther("1"), "ipfs://d"], parseEther("1")),
      "InvalidProgramStatus",
    );
    assert.ok(s);
  });

  it("only the creator (or an admin) can extend a deadline through ScholarshipAdmin", async () => {
    const prog = await setupProgram(sys);
    const end = BigInt(prog.timeline[1]);
    const later = end + 50n; // must stay before votingStart (end + 100)
    await expectRevert(sys.as(stranger()).write(admin, "extendApplicationDeadline", [BigInt(prog.pid), later]), "NotInitiator");
    await sys.as(initiatorOf()).write(admin, "extendApplicationDeadline", [BigInt(prog.pid), later]);
    assert.equal(BigInt((await program(prog.pid)).applicationEnd), later);
  });
});

describe("shortlist: ranked by the system, verified on-chain", () => {
  async function applied(opts) {
    const prog = await setupProgram(sys, opts);
    const students = await prog.openWindowAndApply();
    await warpTo(prog.timeline[2]);
    return { ...prog, students };
  }

  it("a public program cannot be resolved before the voting window opens", async () => {
    const prog = await setupProgram(sys);
    await prog.openWindowAndApply();
    await warpTo(prog.timeline[1] + 1);
    await expectRevert(resolve(stranger(), prog.pid, await rankApplicants(prog.pid)), "TooEarly");
  });

  it("rankApplicants orders by score, best first", async () => {
    const prog = await applied();
    const ranked = await rankApplicants(prog.pid);
    assert.deepEqual(ranked, prog.students);
  });

  it("a stranger can resolve it; only the top maxCandidates above the threshold are shortlisted", async () => {
    const prog = await applied();
    await resolve(stranger(), prog.pid, await rankApplicants(prog.pid));
    assert.equal((await program(prog.pid)).status, Status.VOTING);
    const statuses = [];
    for (const s of prog.students) statuses.push((await applicant(prog.pid, s)).status);
    // scores 1000,900,800,700,650 shortlisted; 600 passes the threshold but is 6th of 5; 500 is below it.
    assert.deepEqual(statuses, [1, 1, 1, 1, 1, AppStatus.SCREENED_OUT, AppStatus.SCREENED_OUT]);
    assert.equal((await sys.read(core, "getShortlist", [BigInt(prog.pid)])).length, 5);
  });

  it("rejects a wrong order, so the caller cannot pick who is shortlisted", async () => {
    const prog = await applied();
    const ranked = [...(await rankApplicants(prog.pid))].reverse();
    await expectRevert(resolve(stranger(), prog.pid, ranked), "InvalidSortOrder");
  });

  it("rejects a duplicated applicant", async () => {
    const prog = await applied();
    const ranked = await rankApplicants(prog.pid);
    await expectRevert(resolve(stranger(), prog.pid, [ranked[0], ranked[0], ...ranked.slice(1)]), "InvalidSortOrder");
  });

  it("rejects padding with a non-applicant, which would hide a real applicant", async () => {
    const prog = await applied();
    const ranked = [...(await rankApplicants(prog.pid))];
    ranked[ranked.length - 1] = sys.accounts[18]; // never applied
    await expectRevert(resolve(stranger(), prog.pid, ranked), "NotAnApplicant");
  });

  it("the last batch must cover every applicant", async () => {
    const prog = await applied();
    const ranked = await rankApplicants(prog.pid);
    await expectRevert(resolve(stranger(), prog.pid, ranked.slice(0, 5), true), "ApplicantListIncomplete");
  });

  it("works in several batches, and every batch must continue the same ordering", async () => {
    const prog = await applied();
    const ranked = await rankApplicants(prog.pid);
    await resolve(stranger(), prog.pid, ranked.slice(0, 3), false);
    assert.equal((await program(prog.pid)).status, Status.SCREENING);
    await expectRevert(resolve(stranger(), prog.pid, [ranked[2], ...ranked.slice(3)], true), "AlreadyProcessed");
    await expectRevert(resolve(stranger(), prog.pid, [ranked[4], ranked[3], ...ranked.slice(5)], true), "InvalidSortOrder");
    await resolve(stranger(), prog.pid, ranked.slice(3), true);
    assert.equal((await program(prog.pid)).status, Status.VOTING);
  });

  it("breaks score ties by the lower address first", async () => {
    const prog = await applied({ scores: [80, 80, 80, 80, 80, 80, 80] });
    const ranked = await rankApplicants(prog.pid);
    const sorted = [...prog.students].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    assert.deepEqual(ranked, sorted);
    await expectRevert(resolve(stranger(), prog.pid, [...ranked].reverse()), "InvalidSortOrder");
    await resolve(stranger(), prog.pid, ranked);
  });

  it("closes the window by the clock: resolving does not need openScreening()", async () => {
    const prog = await applied();
    assert.equal((await program(prog.pid)).status, Status.APPLICATION_OPEN);
    await resolve(stranger(), prog.pid, await rankApplicants(prog.pid));
    assert.equal((await program(prog.pid)).status, Status.VOTING);
  });
});

describe("winners: screening score plus votes as a bonus", () => {
  // Shortlist after resolving (screening score): s1 1000, s2 900, s3 800, s4 700, s5 650.
  // Both donors give 9.999 ETH net. donor0 votes s3, donor1 votes s4, so each holds half the votes.
  async function voted(opts) {
    const p = await votingReady(opts);
    const [, , s3, s4] = p.students;
    await sys.as(donor(0)).write(core, "voteForCandidate", [BigInt(p.pid), s3, false]);
    await sys.as(donor(1)).write(core, "voteForCandidate", [BigInt(p.pid), s4, false]);
    await warpTo(p.timeline[3]);
    return p;
  }
  const winnersOf = async (pid) => {
    const out = [];
    for (const s of await sys.read(core, "getShortlist", [BigInt(pid)])) {
      const [sc] = await sys.read(core, "getScholar", [s, BigInt(pid)]).then((x) => [x]);
      if (sc.wallet !== zeroAddress) out.push(s);
    }
    return out;
  };

  it("at 50% weight the votes lift s3 and s4 above the higher screening scores of s1 and s2", async () => {
    const p = await voted({ weight: 5000 });
    const [s1, s2, s3, s4, s5] = p.students;
    const ranked = await rankShortlist(p.pid);
    assert.deepEqual(ranked, [s3, s4, s1, s2, s5]);

    await selectWinners(stranger(), p.pid, ranked);
    assert.equal((await program(p.pid)).status, Status.ACTIVE);
    assert.deepEqual((await winnersOf(p.pid)).sort(), [s3, s4].sort());
  });

  it("with weight 0 the votes are ignored and screening decides", async () => {
    const p = await voted({ weight: 0 });
    const [s1, s2] = p.students;
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    assert.deepEqual((await winnersOf(p.pid)).sort(), [s1, s2].sort());
  });

  it("zero votes does not block the program: it runs on screening scores alone", async () => {
    const p = await votingReady({ weight: 5000 });
    await warpTo(p.timeline[3]);
    const [s1, s2] = p.students;
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    assert.equal((await program(p.pid)).status, Status.ACTIVE);
    assert.deepEqual((await winnersOf(p.pid)).sort(), [s1, s2].sort());
  });

  it("votes below the quorum do not count toward the score", async () => {
    const p = await voted({ weight: 5000 });
    // Quorum 50%: ~20 ETH of votes against a 100 ETH fund is 20% turnout.
    await sys.send(core.address, core.abi, "grantRole", [ROLE.CONFIG_ADMIN, sys.deployer]);
    const cfg = await sys.read(core, "getProtocolConfig");
    await sys.send(core.address, core.abi, "setProtocolConfig", [{ ...cfg, quorumPercent: 50 }]);
    const [s1, s2] = p.students;
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    assert.deepEqual((await winnersOf(p.pid)).sort(), [s1, s2].sort());
  });

  it("cannot be done before voting ends", async () => {
    const p = await votingReady({ weight: 5000 });
    await expectRevert(selectWinners(stranger(), p.pid, await rankShortlist(p.pid)), "VotingNotEnded");
  });

  it("rejects an order that ignores the votes", async () => {
    const p = await voted({ weight: 5000 });
    await expectRevert(selectWinners(stranger(), p.pid, p.students.slice(0, 5)), "InvalidSortOrder");
  });

  it("rejects an incomplete ranking", async () => {
    const p = await voted({ weight: 5000 });
    const ranked = await rankShortlist(p.pid);
    await expectRevert(selectWinners(stranger(), p.pid, ranked.slice(0, 2)), "RankingIncomplete");
  });

  it("never selects more than targetWinners", async () => {
    const p = await voted({ weight: 5000 });
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    assert.equal((await winnersOf(p.pid)).length, 2);
  });

  it("caps one donor's counted votes at a share of the fund", async () => {
    // 100 ETH fund, 25% cap = 25 ETH. This donor gives 60 ETH.
    const p = await votingReady({ weight: 5000, donations: [{ account: donor(0), amount: parseEther("60") }] });
    const [s1] = p.students;
    await sys.as(donor(0)).write(core, "voteForCandidate", [BigInt(p.pid), s1, false]);
    assert.equal((await applicant(p.pid, s1)).votes, parseEther("25"));
  });

  it("only the Selection contract can change the voter cap on Core", async () => {
    await expectRevert(sys.as(stranger()).write(core, "setVoterCapBps", [100]), "MissingRole");
  });
});

describe("milestone plan applied to every winner", () => {
  const amountsOf = async (pid, scholar) => {
    const abi = milestones.abi.find((x) => x.name === "milestones");
    const idx = abi.outputs.findIndex((o) => o.name === "amount");
    const out = [];
    for (let i = 0; ; i++) {
      let id;
      try { id = await sys.read(milestones, "mandatoryIds", [BigInt(pid), scholar, BigInt(i)]); } catch { break; }
      out.push((await sys.read(milestones, "milestones", [id]))[idx]);
    }
    return out;
  };

  it("splits one winner's portion by the creator's shares, exactly", async () => {
    const p = await votingReady({ weight: 0, shares: [3_000, 7_000] });
    await warpTo(p.timeline[3]);
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    // 100 ETH / 2 winners = 50 ETH each -> 15 + 35.
    for (const w of p.students.slice(0, 2)) {
      assert.deepEqual(await amountsOf(p.pid, w), [parseEther("15"), parseEther("35")]);
    }
  });

  it("without a plan each winner gets one milestone for their whole portion", async () => {
    const p = await votingReady();
    await warpTo(p.timeline[3]);
    await selectWinners(stranger(), p.pid, await rankShortlist(p.pid));
    assert.deepEqual(await amountsOf(p.pid, p.students[0]), [parseEther("50")]);
  });

  it("validates the creator's setup", async () => {
    const prog = await setupProgram(sys);
    await prog.openWindowAndApply();
    await expectRevert(configure(stranger(), prog.pid, 3_000), "NotInitiator");
    await expectRevert(configure(initiatorOf(), prog.pid, 3_000, [5_000, 4_000]), "InvalidPlan");
    await expectRevert(configure(initiatorOf(), prog.pid, 3_000, []), "InvalidPlan");
    await expectRevert(configure(initiatorOf(), prog.pid, 3_000, [10_000], ["a", "b"]), "InvalidPlan");

    await sys.send(selection.address, selection.abi, "setConfig", [5_000, 3_000, 2_500]);
    await expectRevert(configure(initiatorOf(), prog.pid, 6_000), "VoteWeightTooHigh");
    await configure(initiatorOf(), prog.pid, 5_000);
    assert.equal(await sys.read(selection, "effectiveVoteWeightBps", [BigInt(prog.pid)]), 5_000n);
  });

  it("cannot be changed once candidates exist to vote on", async () => {
    const p = await votingReady();
    await expectRevert(configure(initiatorOf(), p.pid, 9_000), "LockedAfterScreening");
  });

  it("a creator who never chose a weight gets the admin's default, capped by the admin's max", async () => {
    const prog = await setupProgram(sys);
    assert.equal(await sys.read(selection, "effectiveVoteWeightBps", [BigInt(prog.pid)]), 3_000n);
    await sys.send(selection.address, selection.abi, "setConfig", [2_000, 1_000, 2_500]);
    assert.equal(await sys.read(selection, "effectiveVoteWeightBps", [BigInt(prog.pid)]), 1_000n);
  });

  it("only an admin can change the selection config", async () => {
    await expectRevert(sys.as(stranger()).write(selection, "setConfig", [10_000, 3_000, 2_500]), "AccessControl");
    await expectRevert(sys.send(selection.address, selection.abi, "setConfig", [5_000, 6_000, 2_500]), "InvalidConfig");
  });
});

describe("private program: the creator's own money, the creator's own choice", () => {
  async function privateReady() {
    const prog = await setupProgram(sys);
    await sys.as(initiatorOf()).write(core, "toggleOpenDonation", [BigInt(prog.pid), false]);
    const students = await prog.openWindowAndApply();
    await warpTo(prog.timeline[1] + 1);
    await resolve(initiatorOf(), prog.pid, await rankApplicants(prog.pid));
    return { ...prog, students };
  }

  it("only the creator can resolve the shortlist and pick winners", async () => {
    const prog = await setupProgram(sys);
    await sys.as(initiatorOf()).write(core, "toggleOpenDonation", [BigInt(prog.pid), false]);
    await prog.openWindowAndApply();
    await warpTo(prog.timeline[1] + 1);
    await expectRevert(resolve(stranger(), prog.pid, await rankApplicants(prog.pid)), "NotInitiator");

    await resolve(initiatorOf(), prog.pid, await rankApplicants(prog.pid));
    await expectRevert(selectWinners(stranger(), prog.pid, [prog.students?.[0] ?? sys.accounts[2]]), "NotInitiator");
  });

  it("picks freely among the shortlisted, limited to the quota", async () => {
    const p = await privateReady();
    const [s1, s2, s3, s4, , , s7] = p.students;
    await expectRevert(selectWinners(initiatorOf(), p.pid, [s1, s2, s3]), "WrongWinnerCount");
    await expectRevert(selectWinners(initiatorOf(), p.pid, []), "WrongWinnerCount");
    await expectRevert(selectWinners(initiatorOf(), p.pid, [s4, s4]), "DuplicateWinner");
    await expectRevert(selectWinners(initiatorOf(), p.pid, [s4, s7]), "CandidateNotShortlisted");

    await selectWinners(initiatorOf(), p.pid, [s4, s2]); // not the top two: it is their choice
    assert.equal((await program(p.pid)).status, Status.ACTIVE);
    assert.equal((await sys.read(core, "getScholar", [s4, BigInt(p.pid)])).wallet, s4);
    assert.equal((await sys.read(core, "getScholar", [s1, BigInt(p.pid)])).wallet, zeroAddress);
  });
});

describe("deployment constraints", () => {
  it("ScholarshipCore stays under the EIP-170 limit with room to spare", () => {
    const a = artifact("contracts/v4/core/ScholarshipCore.sol/ScholarshipCore.json");
    const size = (a.deployedBytecode.length - 2) / 2;
    assert.ok(size < 24_576, `Core is ${size} bytes`);
  });
});

  describe("conflict of interest: whoever competes for the scholarship cannot buy votes for it", () => {
    it("an applicant cannot donate to the program they applied to", async () => {
      const prog = await setupProgram(sys);
      const students = await prog.openWindowAndApply();
      await expectRevert(
        sys.as(students[0]).write(core, "donate", [BigInt(prog.pid), parseEther("1"), "ipfs://d"], parseEther("1")),
        "ApplicantCannotDonate",
      );
    });

    it("a donor cannot then apply: the rule holds whichever comes first", async () => {
      const prog = await setupProgram(sys);
      await warpTo(prog.timeline[0]);
      await sys.as(donor(0)).write(core, "donate", [BigInt(prog.pid), parseEther("1"), "ipfs://d"], parseEther("1"));
      await expectRevert(
        sys.as(donor(0)).write(core, "applyToProgram", [BigInt(prog.pid), "p", "d", "e", "r", 90n, 90n, 0n]),
        "DonorCannotApply",
      );
    });

    it("a candidate cannot vote for themselves", async () => {
      const p = await votingReady();
      await expectRevert(
        sys.as(p.students[0]).write(core, "voteForCandidate", [BigInt(p.pid), p.students[0], false]),
        "CannotVoteForSelf",
      );
    });

    it("people who are neither applicants nor donors are unaffected", async () => {
      const prog = await setupProgram(sys);
      await prog.openWindowAndApply();
      await sys.as(donor(1)).write(core, "donate", [BigInt(prog.pid), parseEther("1"), "ipfs://d"], parseEther("1"));
    });
  });
});
