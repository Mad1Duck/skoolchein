import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, expectRevert, publicClient, parseEther, zeroAddress,
} from "./harness.mjs";

// How long a penalized scholar is kept out. Light and milestone violations used to share one setting
// (two years); each now has its own duration, and a serious violation is a permanent blacklist.
describe("v4 penalties", () => {
let sys, snap;
let core, selection, milestones, bounty, admin;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, milestones, bounty, admin } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const DAY = 86400n;
const LIGHT = 0, MILESTONE = 1, HEAVY = 2;
const FROZEN = 2, BLACKLISTED = 3; // StudentStatus
const stranger = () => sys.accounts[15];
const donor = () => sys.accounts[12];

/** `count` running programs that all have the same first scholar. */
async function running(count = 1) {
  // Each program is created and applied to before the next: a window cannot open in the past.
  const programs = [];
  let students;
  for (let i = 0; i < count; i++) {
    const p = await setupProgram(sys, {
      donations: [{ account: donor(), amount: parseEther("10") }],
      slashDist: { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 },
    });
    students = await p.openWindowAndApply();
    programs.push(p);
  }
  const last = programs.at(-1).timeline;
  for (const p of programs) {
    await sys.as(p.initiator).write(selection, "configureProgram", [BigInt(p.pid), 0, [10_000], [], [], []]);
  }
  await warpTo(last[2]);
  for (const p of programs) {
    await sys.as(stranger()).write(selection, "resolveShortlist", [BigInt(p.pid), await sys.read(selection, "rankApplicants", [BigInt(p.pid)]), true]);
  }
  await warpTo(last[3]);
  for (const p of programs) {
    await sys.as(stranger()).write(selection, "selectWinners", [BigInt(p.pid), await sys.read(selection, "rankShortlist", [BigInt(p.pid)])]);
  }
  return { programs, scholar: students[0] };
}

let disputes = 0n;
beforeEach(() => { disputes = 0n; });

/** Reports the scholar in one program and upholds it. Returns the time of the ruling. */
async function penalize(program, scholar, type) {
  const id = ++disputes;
  const reporter = sys.accounts[16 + Number(id % 3n)];
  const [milestoneId] = await sys.read(milestones, "getMandatoryIds", [BigInt(program.pid), scholar]);
  await sys.as(reporter).write(bounty, "raiseDispute", [BigInt(program.pid), scholar, type === MILESTONE ? milestoneId : 0n, type, "e"]);
  await sys.as(scholar).write(bounty, "submitCounterEvidence", [id, "d"]);
  await sys.as(sys.deployer).write(bounty, "resolveDispute", [id, true]);
  return (await publicClient.getBlock()).timestamp;
}
const freezeUntil = (w) => sys.read(core, "globalFreezeUntil", [w]);
const status = (w) => sys.read(core, "globalStudentStatus", [w]);
const apply = (program, who) =>
  sys.as(who).write(core, "applyToProgram", [BigInt(program.pid), "p", "d", "e", "r", 90n, 90n, 90n]);

/** A fresh program with its application window open. */
async function openProgram() {
  const p = await setupProgram(sys, { scores: [] });
  await p.openWindowAndApply();
  return p;
}

for (const [name, type, days] of [["light", LIGHT, 180n], ["milestone", MILESTONE, 365n]]) {
  it(`a ${name} violation keeps the scholar out for ${days} days, then lets them back`, async () => {
    const { programs: [p], scholar } = await running();
    const at = await penalize(p, scholar, type);
    assert.equal(await status(scholar), FROZEN);
    assert.equal(await freezeUntil(scholar), at + days * DAY);

    await expectRevert(apply(await openProgram(), scholar), "StudentFrozen");
    await warpTo(Number(at + days * DAY) + 1);
    await apply(await openProgram(), scholar);
  });
}

it("a serious violation blacklists for good", async () => {
  const { programs: [p], scholar } = await running();
  await penalize(p, scholar, HEAVY);
  assert.equal(await status(scholar), BLACKLISTED);
  await warpTo(Number((await publicClient.getBlock()).timestamp) + 1000 * 86400);
  await expectRevert(apply(await openProgram(), scholar), "StudentBlacklisted");
});

it("a lighter ruling afterwards does not shorten a longer freeze", async () => {
  const { programs: [a, b], scholar } = await running(2);
  const at = await penalize(a, scholar, MILESTONE);
  await penalize(b, scholar, LIGHT);
  assert.equal(await freezeUntil(scholar), at + 365n * DAY);
});

it("a longer ruling afterwards extends the freeze", async () => {
  const { programs: [a, b], scholar } = await running(2);
  await penalize(a, scholar, LIGHT);
  const at = await penalize(b, scholar, MILESTONE);
  assert.equal(await freezeUntil(scholar), at + 365n * DAY);
});

it("a lighter ruling afterwards does not lift a blacklist", async () => {
  const { programs: [a, b], scholar } = await running(2);
  await penalize(a, scholar, HEAVY);
  await penalize(b, scholar, LIGHT);
  assert.equal(await status(scholar), BLACKLISTED);
});

it("uses the durations the admin has set", async () => {
  const config = await sys.read(core, "getProtocolConfig");
  await sys.as(sys.deployer).write(admin, "setProtocolConfig", [{ ...config, freezeLight: 10n * DAY }]);
  const { programs: [p], scholar } = await running();
  const at = await penalize(p, scholar, LIGHT);
  assert.equal(await freezeUntil(scholar), at + 10n * DAY);
});
});
