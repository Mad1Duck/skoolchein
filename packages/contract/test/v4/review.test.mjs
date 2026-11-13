import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, now, expectRevert, publicClient,
  parseEther,
} from "./harness.mjs";

// The creator's review of a submitted milestone: approve now, or send it back for a fix.
describe("v4 milestone review", () => {
let sys, snap;
let selection, milestones;

before(async () => {
  sys = await deploySystem();
  ({ selection, milestones } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const stranger = () => sys.accounts[15];
const donor = () => sys.accounts[12];
const balance = (who) => publicClient.getBalance({ address: who });

const PENDING = 3, SUBMITTED = 4, COMPLETED = 6;
const statusOf = async (id) => (await sys.read(milestones, "getMilestone", [id])).status;

/** A running program whose first winner has just submitted their first milestone. */
async function submitted() {
  const prog = await setupProgram(sys, { donations: [{ account: donor(), amount: parseEther("10") }] });
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
  const [id] = await sys.read(milestones, "getMandatoryIds", [BigInt(prog.pid), scholar]);
  await sys.as(scholar).write(milestones, "submitProof", [id, "ipfs://proof"]);
  return { ...prog, scholar, id };
}

describe("approving", () => {
  it("the creator can approve at once, and the scholar is paid in the same transaction", async () => {
    const p = await submitted();
    assert.equal(await statusOf(p.id), SUBMITTED);
    const amount = (await sys.read(milestones, "getMilestone", [p.id])).amount;

    const before = await balance(p.scholar);
    await sys.as(p.initiator).write(milestones, "approveSubmission", [p.id]);
    assert.equal(await statusOf(p.id), COMPLETED);
    assert.equal((await balance(p.scholar)) - before, amount);
  });

  it("nobody else can approve", async () => {
    const p = await submitted();
    await expectRevert(sys.as(stranger()).write(milestones, "approveSubmission", [p.id]), "NotProgramInitiator");
    await expectRevert(sys.as(p.scholar).write(milestones, "approveSubmission", [p.id]), "NotProgramInitiator");
  });

  it("only a submitted milestone can be approved", async () => {
    const p = await submitted();
    const other = (await sys.read(milestones, "getMandatoryIds", [BigInt(p.pid), p.scholar === sys.accounts[2] ? sys.accounts[3] : sys.accounts[2]]))[0];
    await expectRevert(sys.as(p.initiator).write(milestones, "approveSubmission", [other]), "WrongStatus");
  });

  it("cannot be approved twice", async () => {
    const p = await submitted();
    await sys.as(p.initiator).write(milestones, "approveSubmission", [p.id]);
    await expectRevert(sys.as(p.initiator).write(milestones, "approveSubmission", [p.id]), "WrongStatus");
  });
});

describe("sending it back for a fix", () => {
  it("returns the milestone to the scholar with the proof cleared, and counts the revision", async () => {
    const p = await submitted();
    await sys.as(p.initiator).write(milestones, "requestRevision", [p.id, "ipfs://reason"]);

    const m = await sys.read(milestones, "getMilestone", [p.id]);
    assert.equal(m.status, PENDING);
    assert.equal(m.proofCID, "");
    assert.equal(m.disputeDeadline, 0);
    assert.equal(await sys.read(milestones, "revisionCount", [p.id]), 1);
  });

  it("the scholar can submit again, which starts a fresh review period", async () => {
    const p = await submitted();
    await sys.as(p.initiator).write(milestones, "requestRevision", [p.id, "ipfs://reason"]);
    await sys.as(p.scholar).write(milestones, "submitProof", [p.id, "ipfs://fixed"]);

    const m = await sys.read(milestones, "getMilestone", [p.id]);
    assert.equal(m.status, SUBMITTED);
    assert.equal(m.proofCID, "ipfs://fixed");
    assert.ok(Number(m.disputeDeadline) > (await now()));
  });

  it("only the creator can ask for a fix", async () => {
    const p = await submitted();
    await expectRevert(sys.as(stranger()).write(milestones, "requestRevision", [p.id, "x"]), "NotProgramInitiator");
    await expectRevert(sys.as(p.scholar).write(milestones, "requestRevision", [p.id, "x"]), "NotProgramInitiator");
  });

  it("is limited to two revisions per milestone, so it cannot hold the money forever", async () => {
    const p = await submitted();
    for (let i = 0; i < 2; i++) {
      await sys.as(p.initiator).write(milestones, "requestRevision", [p.id, "ipfs://reason"]);
      await sys.as(p.scholar).write(milestones, "submitProof", [p.id, `ipfs://fix${i}`]);
    }
    await expectRevert(sys.as(p.initiator).write(milestones, "requestRevision", [p.id, "ipfs://again"]), "TooManyRevisions");
    // The creator can still approve it.
    await sys.as(p.initiator).write(milestones, "approveSubmission", [p.id]);
    assert.equal(await statusOf(p.id), COMPLETED);
  });

  it("is only possible while the review period is open", async () => {
    const p = await submitted();
    const deadline = Number((await sys.read(milestones, "getMilestone", [p.id])).disputeDeadline);
    await warpTo(deadline + 1);
    await expectRevert(sys.as(p.initiator).write(milestones, "requestRevision", [p.id, "late"]), "ReviewWindowClosed");
  });
});

describe("a creator who does nothing", () => {
  it("cannot keep the scholar from being paid: anyone can release once the review period ends", async () => {
    const p = await submitted();
    await expectRevert(sys.as(stranger()).write(milestones, "executeMilestone", [p.id]), "DisputeWindowOpen");

    const deadline = Number((await sys.read(milestones, "getMilestone", [p.id])).disputeDeadline);
    await warpTo(deadline + 1);
    const before = await balance(p.scholar);
    await sys.as(stranger()).write(milestones, "executeMilestone", [p.id]);
    assert.equal(await statusOf(p.id), COMPLETED);
    assert.ok((await balance(p.scholar)) > before);
  });
});
});
