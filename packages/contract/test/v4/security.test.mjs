import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, recommend, snapshot, revertTo, warpTo, expectRevert, publicClient, parseEther, zeroAddress, Status,
} from "./harness.mjs";

// Ways money or rankings could be taken, found by review before going to production.
describe("v4 security", () => {
let sys, snap;
let core, selection, milestones, bounty, committee, treasury;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, milestones, bounty, committee, treasury } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const reporter = () => sys.accounts[18];
const stranger = () => sys.accounts[15];
const clock = async () => Number((await publicClient.getBlock()).timestamp);
const later = async () => warpTo((await clock()) + 8 * 86400);
const wallet = (address) => publicClient.getBalance({ address });
const NONE = "0x" + "0".repeat(64);
const PENDING = 3, SUBMITTED = 4, COMPLETED = 6, FROZEN = 7, PROPOSED = 0;
const milestone = (id) => sys.read(milestones, "getMilestone", [id]);
const scholarOf = (p, w) => sys.read(core, "getScholar", [w, BigInt(p.pid)]);

/** A running program whose first winner has two milestones of half their portion each. */
async function running(opts = {}) {
  const prog = await setupProgram(sys, { slashDist: { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 }, ...opts });
  const students = await prog.openWindowAndApply();
  await sys.as(prog.initiator).write(selection, "configureProgram", [BigInt(prog.pid), 0, [5_000, 5_000], [], [], []]);
  await warpTo(prog.timeline[2]);
  await sys.as(stranger()).write(selection, "resolveShortlist", [BigInt(prog.pid), await sys.read(selection, "rankApplicants", [BigInt(prog.pid)]), true]);
  await warpTo(prog.timeline[3]);
  await sys.as(stranger()).write(selection, "selectWinners", [BigInt(prog.pid), await sys.read(selection, "rankShortlist", [BigInt(prog.pid)])]);
  const scholar = students[0];
  const ids = await sys.read(milestones, "getMandatoryIds", [BigInt(prog.pid), scholar]);
  return { ...prog, scholar, ids };
}
const report = (p, id, value) =>
  sys.as(reporter()).write(bounty, "raiseDispute", [BigInt(p.pid), p.scholar, id, id ? 1 : 0, "e"], value);
const rule = async (p, upheld, disputeId = 1n) => {
  await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [disputeId, "d"]);
  await sys.as(p.initiator).write(committee, "resolveDisputeAsCreator", [disputeId, BigInt(p.pid), upheld]);
};

it("a paid milestone cannot be reported, so it cannot be paid twice", async () => {
  const p = await running();
  await sys.as(p.scholar).write(milestones, "submitProof", [p.ids[0], "proof"]);
  await later();
  await sys.as(stranger()).write(milestones, "executeMilestone", [p.ids[0]]);
  await expectRevert(report(p, p.ids[0]), "reverted");
  assert.equal((await milestone(p.ids[0])).status, COMPLETED);
});

it("a rejected report leaves unfinished work unfinished", async () => {
  const p = await running();
  await report(p, p.ids[1]);
  assert.equal((await milestone(p.ids[1])).status, FROZEN);
  await rule(p, false);
  assert.equal((await milestone(p.ids[1])).status, PENDING);
  await later();
  await expectRevert(sys.as(stranger()).write(milestones, "executeMilestone", [p.ids[1]]), "reverted");
  assert.equal((await scholarOf(p, p.scholar)).totalReceived, 0n);
});

it("a rejected report returns handed-in work to review", async () => {
  const p = await running();
  await sys.as(p.scholar).write(milestones, "submitProof", [p.ids[0], "proof"]);
  await report(p, p.ids[0]);
  await rule(p, false);
  assert.equal((await milestone(p.ids[0])).status, SUBMITTED);
});

describe("native-currency reports", () => {
  const split = { bountyHunterPercent: 40, treasuryPercent: 40, protocolPercent: 20 };

  it("takes the deposit in the program's own currency, refunds the excess and pays it to a wrongly accused scholar", async () => {
    const p = await running({ slashDist: split });
    const [stake] = await sys.read(bounty, "calculateStake", [p.scholar, BigInt(p.pid)]);
    assert.ok(stake > 0n);
    await expectRevert(report(p, 0n, stake - 1n), "reverted");
    await report(p, 0n, stake * 3n);
    assert.equal(await wallet(bounty.address), stake);

    await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "d"]);
    const had = await wallet(p.scholar);
    await sys.as(p.initiator).write(committee, "resolveDisputeAsCreator", [1n, BigInt(p.pid), false]);
    assert.equal((await wallet(p.scholar)) - had, stake);
    assert.equal(await wallet(bounty.address), 0n);
  });

  it("returns the deposit with the reward when the report is upheld", async () => {
    const p = await running({ slashDist: split });
    const [stake, reward] = await sys.read(bounty, "calculateStake", [p.scholar, BigInt(p.pid)]);
    await report(p, 0n, stake);
    await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "d"]);
    const had = await wallet(reporter());
    await sys.as(p.initiator).write(committee, "resolveDisputeAsCreator", [1n, BigInt(p.pid), true]);
    assert.equal((await wallet(reporter())) - had, stake + reward);
  });

  it("an admin has no way to sweep deposits", () => {
    assert.ok(!bounty.abi.some((x) => x.name === "withdrawForfeitedStakes"));
  });
});

/** A public program with room for optional milestones, run up to its winners. */
async function withCommittee({ targetWinners = 2, applicants = 5, mode = 1 } = {}) {
  const t = await clock();
  const initiator = sys.accounts[1];
  const pid = BigInt(++sys.nextPid);
  await sys.as(initiator).write(core, "createProgram", ["p", 3, mode,
    { academicWeight: 40, incomeWeight: 40, essayWeight: 0, recommendWeight: 20, extracurricWeight: 0 },
    { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 }, 5, targetWinners, [t + 60, t + 600, t + 700, t + 1000],
    7 * 86400, parseEther("90"), 1, committee.address, zeroAddress], parseEther("90"));
  await warpTo(t + 60);
  const students = [];
  for (let i = 0; i < applicants; i++) {
    const s = sys.accounts[2 + i];
    students.push(s);
    await sys.as(s).write(core, "applyToProgram", [pid, "p", "d", "e", "r", 100n, 100n, 0n]);
  }
  const select = async () => {
    await warpTo(t + 700);
    await sys.as(stranger()).write(selection, "resolveShortlist", [pid, await sys.read(selection, "rankApplicants", [pid]), true]);
    await warpTo(t + 1000);
    await sys.as(stranger()).write(selection, "selectWinners", [pid, await sys.read(selection, "rankShortlist", [pid])]);
  };
  return { pid, initiator, students, select };
}
const propose = async (p, scholar, amount) => {
  await sys.as(scholar).write(milestones, "proposeMilestone", [p.pid, 1, amount, "x", NONE, NONE]);
  return (await sys.read(milestones, "getOptionalIds", [p.pid, scholar]))[0];
};
const member = () => sys.accounts[17];
const join = (p, who = member()) => sys.as(p.initiator).write(committee, "addCommitteeMember", [p.pid, who]);

it("a committee cannot decide another program's milestone", async () => {
  const victim = await withCommittee({ targetWinners: 3, applicants: 2 });
  await victim.select();
  const id = await propose(victim, victim.students[0], parseEther("1"));
  const other = await withCommittee();
  await join(other, sys.accounts[16]);
  await expectRevert(sys.as(sys.accounts[16]).write(committee, "voteOnMilestone", [id, other.pid, true]), "MilestoneNotInProgram");
  assert.equal((await milestone(id)).status, PROPOSED);
});

it("an optional milestone cannot use money reserved for winners", async () => {
  const p = await withCommittee();
  await p.select();
  await join(p);
  const id = await propose(p, p.students[0], 1n);
  await expectRevert(sys.as(member()).write(committee, "voteOnMilestone", [id, p.pid, true]), "reverted");
});

it("an optional milestone can use an unclaimed portion, and being paid for it does not shrink the penalty", async () => {
  const p = await withCommittee({ targetWinners: 3, applicants: 2 });
  await p.select();
  await join(p);
  const scholar = p.students[0];
  const id = await propose(p, scholar, parseEther("30"));
  await sys.as(member()).write(committee, "voteOnMilestone", [id, p.pid, true]);
  await sys.as(scholar).write(milestones, "submitProof", [id, "proof"]);
  await later();
  await sys.as(stranger()).write(milestones, "executeMilestone", [id]);

  await sys.as(reporter()).write(bounty, "raiseDispute", [p.pid, scholar, 0n, 0, "e"]);
  const before = await sys.read(treasury, "getProgramBalance", [p.pid]);
  await sys.as(scholar).write(bounty, "concede", [1n]);
  assert.equal(before - (await sys.read(treasury, "getProgramBalance", [p.pid])), parseEther("30")); // their whole unpaid portion
});

describe("committee scoring", () => {
  const score = (p, who, applicant, v) =>
    sys.as(who).write(committee, "submitScore", [p.pid, applicant, v, v, v]);
  const total = async (p, applicant) => (await sys.read(core, "getApplicant", [p.pid, applicant]))[2];

  it("uses the average of the members, not whoever scored last", async () => {
    const p = await withCommittee({ mode: 0 });
    const [a, b, c] = [sys.accounts[15], sys.accounts[16], sys.accounts[17]];
    for (const m of [a, b, c]) await join(p, m);
    const who = p.students[0];
    await score(p, a, who, 100n);
    await score(p, b, who, 80n);
    assert.equal(await total(p, who), 900);
    await score(p, c, who, 0n);
    assert.equal(await total(p, who), 600);
  });

  it("closes once shortlisting has happened", async () => {
    const p = await withCommittee({ mode: 0 });
    await join(p);
    for (const s of p.students) await score(p, member(), s, 90n);
    await p.select();
    await expectRevert(score(p, member(), p.students[4], 100n), "ScoringClosed");
  });

  it("a member who is removed and added again counts once", async () => {
    const p = await withCommittee({ mode: 0 });
    await join(p);
    await sys.as(p.initiator).write(committee, "removeCommitteeMember", [p.pid, member()]);
    await join(p);
    assert.equal((await sys.read(committee, "getCommitteeMembers", [p.pid])).length, 1);
  });
});

describe("shortlisting in batches", () => {
  const resolve = (p, list, isLast) => sys.as(stranger()).write(selection, "resolveShortlist", [BigInt(p.pid), list, isLast]);
  async function ready() {
    const prog = await setupProgram(sys);
    const students = await prog.openWindowAndApply();
    await warpTo(prog.timeline[2]);
    const ranked = await sys.read(selection, "rankApplicants", [BigInt(prog.pid)]);
    return { ...prog, students, ranked };
  }

  it("cannot jump over an applicant and leave the program stuck", async () => {
    const p = await ready();
    await expectRevert(resolve(p, [p.ranked[1]], false), "ApplicantSkipped");
    await expectRevert(resolve(p, [p.ranked[0], p.ranked[2]], false), "ApplicantSkipped");
    await expectRevert(resolve(p, [p.ranked.at(-1)], false), "ApplicantSkipped");
  });

  it("still finishes over several batches taken in order", async () => {
    const p = await ready();
    await resolve(p, p.ranked.slice(0, 3), false);
    await resolve(p, [], false);
    await resolve(p, p.ranked.slice(3, 5), false);
    await resolve(p, p.ranked.slice(5), true);
    assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.VOTING);
  });

  it("takes no more recommendations once it has begun", async () => {
    const prog = await setupProgram(sys, { autoRecommend: false });
    const students = await prog.openWindowAndApply();
    await warpTo(prog.timeline[2]);
    const ranked = await sys.read(selection, "rankApplicants", [BigInt(prog.pid)]);
    await resolve(prog, ranked.slice(0, 2), false);
    await expectRevert(
      recommend(sys, { pid: prog.pid, student: students.at(-1), recommender: sys.accounts[19], score: 100 }),
      "ScoringClosed",
    );
    await resolve(prog, ranked.slice(2), true);
  });
});

describe("public or private", () => {
  const toggle = (p, open) => sys.as(p.initiator).write(core, "toggleOpenDonation", [BigInt(p.pid), open]);
  const isOpen = async (p) => (await sys.read(core, "getProgram", [BigInt(p.pid)])).openDonation;

  it("can be chosen while nobody has donated", async () => {
    const p = await setupProgram(sys);
    await toggle(p, false);
    assert.equal(await isOpen(p), false);
    await toggle(p, true);
    assert.equal(await isOpen(p), true);
  });

  it("cannot be changed after a donation, so donors' money is never the creator's to hand out", async () => {
    const p = await setupProgram(sys, { donations: [{ account: stranger(), amount: parseEther("5") }] });
    await p.openWindowAndApply();
    await expectRevert(toggle(p, false), "PublicSettingLocked");
  });

  it("cannot be changed once applications have closed", async () => {
    const p = await setupProgram(sys);
    await p.openWindowAndApply();
    await warpTo(p.timeline[1]);
    await expectRevert(toggle(p, false), "PublicSettingLocked");
  });

  it("is the creator's setting only", async () => {
    const p = await setupProgram(sys);
    await expectRevert(sys.as(stranger()).write(core, "toggleOpenDonation", [BigInt(p.pid), false]), "OnlyInitiator");
  });
});

describe("every recipient penalized", () => {
  const penalize = async (p, scholar, disputeId) => {
    await sys.as(reporter()).write(bounty, "raiseDispute", [p.pid, scholar, 0n, 0, "e"]);
    await sys.as(scholar).write(bounty, "concede", [disputeId]);
  };
  const statusOf = async (p) => (await sys.read(core, "getProgram", [p.pid])).status;
  const held = (p) => sys.read(treasury, "getProgramBalance", [p.pid]);

  it("ends the program as cancelled and returns the unused fund to the creator", async () => {
    const p = await withCommittee({ targetWinners: 3, applicants: 2 });
    await p.select();
    await penalize(p, p.students[0], 1n);
    assert.equal(await statusOf(p), Status.ACTIVE);
    await expectRevert(sys.as(stranger()).write(treasury, "settleCancelledProgram", [p.pid]), "ProgramNotCancelled");
    await penalize(p, p.students[1], 2n);
    assert.equal(await statusOf(p), Status.CANCELLED);

    assert.equal(await held(p), parseEther("30")); // the portion no winner took
    const before = await wallet(p.initiator);
    await sys.as(stranger()).write(treasury, "settleCancelledProgram", [p.pid]);
    assert.equal((await wallet(p.initiator)) - before, parseEther("30"));
    assert.equal(await held(p), 0n);
    await expectRevert(sys.as(stranger()).write(treasury, "settleCancelledProgram", [p.pid]), "NothingToWithdraw");
  });

  it("returns donations to the donors before anything goes to the creator", async () => {
    const donor = sys.accounts[16];
    const prog = await setupProgram(sys, { scores: [100, 90], targetWinners: 3, totalFund: parseEther("90"),
      donations: [{ account: donor, amount: parseEther("30.001") }], slashDist: { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 } });
    const students = await prog.openWindowAndApply();
    const p = { ...prog, pid: BigInt(prog.pid) };
    await warpTo(p.timeline[2]);
    await sys.as(stranger()).write(selection, "resolveShortlist", [p.pid, await sys.read(selection, "rankApplicants", [p.pid]), true]);
    await warpTo(p.timeline[3]);
    await sys.as(stranger()).write(selection, "selectWinners", [p.pid, await sys.read(selection, "rankShortlist", [p.pid])]);
    await penalize(p, students[0], 1n);
    await penalize(p, students[1], 2n);

    const left = await held(p); // one untaken portion: 120 / 3
    assert.equal(left, parseEther("40"));
    const [hadDonor, hadCreator] = [await wallet(donor), await wallet(p.initiator)];
    await sys.as(stranger()).write(treasury, "settleCancelledProgram", [p.pid]);
    assert.equal((await wallet(donor)) - hadDonor, parseEther("30"));
    assert.equal((await wallet(p.initiator)) - hadCreator, parseEther("10"));
  });

  it("still completes when at least one recipient finished", async () => {
    const p = await withCommittee({ targetWinners: 2, applicants: 2 });
    await p.select();
    const [first, second] = p.students;
    const [id] = await sys.read(milestones, "getMandatoryIds", [p.pid, first]);
    await sys.as(first).write(milestones, "submitProof", [id, "proof"]);
    await later();
    await sys.as(stranger()).write(milestones, "executeMilestone", [id]);
    await penalize(p, second, 1n);
    assert.equal(await statusOf(p), Status.COMPLETED);
  });
});

it("cancelling is not blocked by a donor that refuses the money", async () => {
  // A contract with no receive function stands in for the donor: the MockUSDC contract.
  const refuser = sys.contracts.usdc.address;
  await sys.as(sys.deployer).write(treasury, "grantRole", ["0x502d3d275257923b2bea6ea25d9631f12369fb532871f13eb85eb09dc0fb4842", sys.deployer]);
  const prog = await setupProgram(sys);
  await prog.openWindowAndApply();
  const pid = BigInt(prog.pid);
  const { walletClientFor } = await import("./harness.mjs");
  const hash = await walletClientFor(sys.deployer).sendTransaction({ to: treasury.address, value: parseEther("2") });
  await publicClient.waitForTransactionReceipt({ hash });
  await sys.as(sys.deployer).write(treasury, "recordDonation", [pid, refuser, parseEther("2")]);

  await sys.as(prog.initiator).write(core, "cancelProgram", [pid]);
  assert.equal((await sys.read(core, "getProgram", [pid])).status, Status.CANCELLED);
  assert.equal(await sys.read(treasury, "owed", [zeroAddress, refuser]), parseEther("2"));
});
});
