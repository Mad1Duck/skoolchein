import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, expectRevert,
  parseEther, zeroAddress, Status, ROLE,
} from "./harness.mjs";

const ROLE_COMMITTEE = ROLE.COMMITTEE;

// Reports (disputes) against a scholar, in particular the ones that name a milestone.
describe("v4 bounty reports", () => {
let sys, snap;
let core, selection, milestones, bounty;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, milestones, bounty } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const reporter = () => sys.accounts[18];
const stranger = () => sys.accounts[15];
const donor = () => sys.accounts[12];

/** A program with a running winner who has handed in their first milestone. */
async function submittedMilestone(slashDist = { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 }, totalFund) {
  // By default there is no hunter share, so no deposit, and the tests do not need USDC.
  // A small `totalFund` keeps a deposit (paid in 6-decimal USDC) within what the mock can mint.
  const prog = await setupProgram(sys, {
    donations: totalFund ? [] : [{ account: donor(), amount: parseEther("10") }],
    slashDist,
    ...(totalFund ? { totalFund } : {}),
  });
  const students = await prog.openWindowAndApply();
  await sys.as(prog.initiator).write(selection, "configureProgram", [BigInt(prog.pid), 0, [10_000], [], [], []]);
  await warpTo(prog.timeline[2]);
  await sys.as(stranger()).write(selection, "resolveShortlist", [
    BigInt(prog.pid), await sys.read(selection, "rankApplicants", [BigInt(prog.pid)]), true,
  ]);
  await warpTo(prog.timeline[3]);
  await sys.as(stranger()).write(selection, "selectWinners", [
    BigInt(prog.pid), await sys.read(selection, "rankShortlist", [BigInt(prog.pid)]),
  ]);

  const scholar = students[0];
  const ids = await sys.read(milestones, "getMandatoryIds", [BigInt(prog.pid), scholar]);
  const milestoneId = ids[0];
  await sys.as(scholar).write(milestones, "submitProof", [milestoneId, "ipfs://proof"]);
  return { ...prog, scholar, milestoneId };
}

const raise = (who, p, milestoneId, type) =>
  sys.as(who).write(bounty, "raiseDispute", [BigInt(p.pid), p.scholar, milestoneId, type, "ipfs://evidence"]);
const milestoneStatus = async (id) => (await sys.read(milestones, "getMilestone", [id])).status;

const MILESTONE_FRAUD = 1;
const LIGHT_FRAUD = 0;
const FROZEN = 7; // MilestoneStatus: PROPOSED, APPROVED, REJECTED, PENDING, SUBMITTED, DISPUTED, COMPLETED, FROZEN

it("a report about a milestone is accepted and freezes that milestone", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);

  const [dispute] = [await sys.read(bounty, "disputes", [1n])];
  assert.equal(dispute[0], 1n); // id
  assert.equal((await sys.read(milestones, "getMilestone", [p.milestoneId])).status, FROZEN);
});

it("a report about the participant as a whole needs no milestone", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, 0n, LIGHT_FRAUD);
  assert.equal((await sys.read(bounty, "disputes", [1n]))[0], 1n);
  assert.notEqual(await milestoneStatus(p.milestoneId), FROZEN);
});

it("says what is wrong when the MilestoneManager was never wired, instead of reverting with no reason", async () => {
  const p = await submittedMilestone();
  await sys.as(sys.deployer).write(bounty, "setMilestoneManager", [zeroAddress]);
  await expectRevert(raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD), "MilestoneManagerNotSet");
});

it("only the admin can wire it", async () => {
  await expectRevert(sys.as(stranger()).write(bounty, "setMilestoneManager", [milestones.address]), "AccessControl");
});

it("a report cannot name a milestone that belongs to someone else", async () => {
  const p = await submittedMilestone();
  const other = p.scholar === sys.accounts[2] ? sys.accounts[3] : sys.accounts[2];
  const ids = await sys.read(milestones, "getMandatoryIds", [BigInt(p.pid), other]);
  await expectRevert(raise(reporter(), p, ids[0], MILESTONE_FRAUD), "does not belong");
});

it("one reporter can have one active report at a time", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);
  await expectRevert(raise(reporter(), p, 0n, LIGHT_FRAUD), "BHHasActiveDispute");
});

it("an upheld report freezes the scholar (Core's slash callback is reachable)", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);
  await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  // The deployer holds the resolver role in the harness, as the committee does in production.
  await sys.as(sys.deployer).write(bounty, "resolveDispute", [1n, true]);

  const scholar = await sys.read(core, "getScholar", [p.scholar, BigInt(p.pid)]);
  assert.equal(scholar.status, 2); // StudentStatus: ACTIVE, COMPLETED, FROZEN
});

it("the committee's ruling reaches the Bounty through Core", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);
  await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  // Core is the caller on this path (CommitteeGovernance -> Core -> Bounty), so it must hold the resolver role.
  await sys.send(core.address, core.abi, "grantRole", [ROLE_COMMITTEE, sys.deployer]);
  await sys.as(sys.deployer).write(core, "resolveDisputeBH", [1n]);
  const scholar = await sys.read(core, "getScholar", [p.scholar, BigInt(p.pid)]);
  assert.equal(scholar.status, 2);
});

it("a rejected report pays the reporter's whole deposit to the scholar they accused", async () => {
  const { usdc } = sys.contracts;
  const p = await submittedMilestone({ bountyHunterPercent: 50, treasuryPercent: 30, protocolPercent: 20 }, 20_000_000n);
  // The deposit is paid in USDC whatever the program's token is.
  await sys.as(reporter()).write(usdc, "mint", [reporter(), 500_000n * 10n ** 6n]);
  await sys.as(reporter()).write(usdc, "approve", [bounty.address, 500_000n * 10n ** 6n]);
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);

  const deposit = (await sys.read(bounty, "disputes", [1n]))[9];
  assert.ok(deposit > 0n, "the report needed a deposit");
  const before = await sys.read(usdc, "balanceOf", [p.scholar]);

  await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  await sys.as(sys.deployer).write(bounty, "resolveDispute", [1n, false]); // the committee rejects the report

  assert.equal((await sys.read(usdc, "balanceOf", [p.scholar])) - before, deposit, "the scholar got the whole deposit");
  assert.equal(await sys.read(usdc, "balanceOf", [bounty.address]), 0n, "nothing is left behind in the Bounty");
  assert.notEqual(await milestoneStatus(p.milestoneId), FROZEN, "the milestone is released again");
});

it("an upheld report returns the deposit to the reporter and pays nothing to the scholar", async () => {
  const { usdc } = sys.contracts;
  const p = await submittedMilestone({ bountyHunterPercent: 50, treasuryPercent: 30, protocolPercent: 20 }, 20_000_000n);
  await sys.as(reporter()).write(usdc, "mint", [reporter(), 500_000n * 10n ** 6n]);
  await sys.as(reporter()).write(usdc, "approve", [bounty.address, 500_000n * 10n ** 6n]);
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);
  const deposit = (await sys.read(bounty, "disputes", [1n]))[9];
  const scholarBefore = await sys.read(usdc, "balanceOf", [p.scholar]);

  await sys.as(p.scholar).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  await sys.as(sys.deployer).write(bounty, "resolveDispute", [1n, true]);

  assert.equal(await sys.read(usdc, "balanceOf", [p.scholar]), scholarBefore);
  assert.equal(await sys.read(usdc, "balanceOf", [reporter()]), 500_000n * 10n ** 6n, "the deposit came back");
  assert.ok(deposit > 0n);
});

it("the program is still running after a report", async () => {
  const p = await submittedMilestone();
  await raise(reporter(), p, p.milestoneId, MILESTONE_FRAUD);
  assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.ACTIVE);
});
});
