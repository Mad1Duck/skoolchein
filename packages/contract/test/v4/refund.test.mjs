import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, expectRevert, publicClient, walletClientFor,
  parseEther, zeroAddress, Status, ROLE,
} from "./harness.mjs";

// Money that leaves a program without being a milestone payment: refunds on cancellation, and the
// unspent fund of a completed program.
describe("v4 treasury refunds and leftover fund", () => {
let sys, snap;
let core, selection, milestones, bounty, treasury;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, milestones, bounty, treasury } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const stranger = () => sys.accounts[15];
const reporter = () => sys.accounts[18];
const donorA = () => sys.accounts[12];
const donorB = () => sys.accounts[13];
const wallet = (address) => publicClient.getBalance({ address });
const programBalance = (pid) => sys.read(treasury, "getProgramBalance", [BigInt(pid)]);
const FEE = parseEther("0.001"); // taken from every donation

const donations = () => [
  { account: donorA(), amount: parseEther("1") },
  { account: donorB(), amount: parseEther("3") },
];

async function openProgram() {
  const prog = await setupProgram(sys, { donations: donations() });
  await prog.openWindowAndApply();
  return prog;
}

it("a donor cannot take anything out of a running program", async () => {
  const p = await openProgram();
  const before = await programBalance(p.pid);
  await expectRevert(
    sys.as(donorA()).write(treasury, "claimRefund", [BigInt(p.pid), donorA()]),
    "ProgramNotCancelled",
  );
  assert.equal(await programBalance(p.pid), before);
});

it("cancelling returns each donation to its donor and the rest to the creator", async () => {
  const p = await openProgram();
  const [a, b, creator] = [await wallet(donorA()), await wallet(donorB()), await wallet(p.initiator)];

  const receipt = await sys.as(p.initiator).write(core, "cancelProgram", [BigInt(p.pid)]);
  const gas = receipt.gasUsed * receipt.effectiveGasPrice;

  assert.equal((await wallet(donorA())) - a, parseEther("1") - FEE);
  assert.equal((await wallet(donorB())) - b, parseEther("3") - FEE);
  assert.equal((await wallet(p.initiator)) - creator + gas, parseEther("100"));
  assert.equal(await programBalance(p.pid), 0n);
  await expectRevert(sys.as(stranger()).write(treasury, "claimRefund", [BigInt(p.pid), donorA()]), "NothingToRefund");
});

it("with more donors than can be paid at once, cancelling still works and donors collect themselves", async () => {
  await sys.as(sys.deployer).write(treasury, "setMaxPushRefundDonors", [1]);
  const p = await openProgram();
  const [a, b] = [await wallet(donorA()), await wallet(donorB())];

  await sys.as(p.initiator).write(core, "cancelProgram", [BigInt(p.pid)]);
  assert.equal(await programBalance(p.pid), parseEther("4") - 2n * FEE); // only the donations are left

  for (const d of [donorB(), donorA()]) {
    await sys.as(stranger()).write(treasury, "claimRefund", [BigInt(p.pid), d]);
  }
  assert.equal((await wallet(donorA())) - a, parseEther("1") - FEE);
  assert.equal((await wallet(donorB())) - b, parseEther("3") - FEE);
  assert.equal(await programBalance(p.pid), 0n);
  await expectRevert(sys.as(stranger()).write(treasury, "claimRefund", [BigInt(p.pid), donorA()]), "NothingToRefund");
});

/** The winners (two unless fewer candidates apply), each with one milestone handed in. */
async function runningProgram(opts = {}) {
  const prog = await setupProgram(sys, {
    ...opts,
    donations: [{ account: donorA(), amount: parseEther("1") }],
    slashDist: { bountyHunterPercent: 0, treasuryPercent: 80, protocolPercent: 20 },
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
  const winners = [];
  for (const s of students) {
    const ids = await sys.read(milestones, "getMandatoryIds", [BigInt(prog.pid), s]);
    if (ids.length) {
      await sys.as(s).write(milestones, "submitProof", [ids[0], "ipfs://proof"]);
      winners.push({ wallet: s, milestoneId: ids[0] });
    }
  }
  assert.equal(winners.length, Math.min(opts.targetWinners ?? 2, opts.scores?.length ?? 2));

  // Money no milestone covers, as left behind by donations made before they counted toward the fund.
  const extra = parseEther("5") + 1n;
  await sys.as(sys.deployer).write(treasury, "grantRole", [ROLE.CORE, sys.deployer]);
  const hash = await walletClientFor(sys.deployer).sendTransaction({ to: treasury.address, value: extra });
  await publicClient.waitForTransactionReceipt({ hash });
  await sys.as(sys.deployer).write(treasury, "depositProgramFund", [BigInt(prog.pid), extra, zeroAddress]);

  return { ...prog, winners, extra };
}

async function payAll(p) {
  await warpTo(Number((await publicClient.getBlock()).timestamp) + 8 * 86400);
  for (const w of p.winners) await sys.as(stranger()).write(milestones, "executeMilestone", [w.milestoneId]);
  assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.COMPLETED);
}

const release = (p) => sys.as(stranger()).write(treasury, "releaseLeftover", [BigInt(p.pid)]);

it("the leftover of a completed program is shared by the scholars who finished it", async () => {
  const p = await runningProgram();
  await expectRevert(release(p), "ProgramNotCompleted");
  await payAll(p);

  const left = await programBalance(p.pid);
  assert.equal(left, p.extra);
  const before = await Promise.all(p.winners.map((w) => wallet(w.wallet)));
  await release(p);
  const gained = await Promise.all(p.winners.map(async (w, i) => (await wallet(w.wallet)) - before[i]));

  assert.equal(gained[0] + gained[1], left);
  for (const [i, w] of p.winners.entries()) {
    assert.equal(await sys.read(treasury, "leftoverReceived", [BigInt(p.pid), w.wallet]), gained[i]);
  }
  assert.ok(gained[0] - gained[1] <= 1n && gained[1] - gained[0] <= 1n);
  assert.equal(await programBalance(p.pid), 0n);
  await expectRevert(release(p), "NothingToWithdraw");
});

it("a program with fewer winners than its quota still completes, and the unclaimed portions are shared", async () => {
  const p = await runningProgram({ targetWinners: 3, scores: [100, 90] });
  await payAll(p);

  const left = await programBalance(p.pid);
  assert.ok(left > parseEther("33")); // the third winner's portion was never allocated
  await release(p);
  assert.equal(await programBalance(p.pid), 0n);
});

it("a program is not complete while one of its winners still has work left", async () => {
  const p = await runningProgram();
  await warpTo(Number((await publicClient.getBlock()).timestamp) + 8 * 86400);
  await sys.as(stranger()).write(milestones, "executeMilestone", [p.winners[0].milestoneId]);
  assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.ACTIVE);
  await expectRevert(release(p), "ProgramNotCompleted");
});

const uphold = async (p, winner, id = 1n) => {
  await sys.as(winner.wallet).write(bounty, "submitCounterEvidence", [id, "ipfs://defense"]);
  await sys.as(p.initiator).write(sys.contracts.committee, "resolveDisputeAsCreator", [id, BigInt(p.pid), true]);
};
const report = (p, winner) =>
  sys.as(reporter()).write(bounty, "raiseDispute", [BigInt(p.pid), winner.wallet, 0n, 0, "ipfs://evidence"]);
const pay = async (w) => {
  await warpTo(Number((await publicClient.getBlock()).timestamp) + 8 * 86400);
  await sys.as(stranger()).write(milestones, "executeMilestone", [w.milestoneId]);
};
const programStatus = async (p) => (await sys.read(core, "getProgram", [BigInt(p.pid)])).status;

it("an upheld report takes only the guilty scholar's portion, and the others are still paid", async () => {
  const p = await runningProgram();
  const [guilty, honest] = p.winners;
  const { totalFund, targetWinners } = await sys.read(core, "getProgram", [BigInt(p.pid)]);
  const portion = totalFund / BigInt(targetWinners);
  const before = await programBalance(p.pid);

  await report(p, guilty);
  await uphold(p, guilty);
  assert.equal(before - (await programBalance(p.pid)), portion);
  assert.equal(await programStatus(p), Status.ACTIVE); // the other scholar is still working

  const had = await wallet(honest.wallet);
  await pay(honest);
  assert.equal((await wallet(honest.wallet)) - had, portion);
  assert.equal(await programStatus(p), Status.COMPLETED);

  await release(p);
  assert.equal(await sys.read(treasury, "leftoverReceived", [BigInt(p.pid), honest.wallet]), before - 2n * portion);
  assert.equal(await sys.read(treasury, "leftoverReceived", [BigInt(p.pid), guilty.wallet]), 0n);
});

it("penalizing the last scholar still working completes the program", async () => {
  const p = await runningProgram();
  const [honest, guilty] = p.winners;
  await report(p, guilty);
  await pay(honest);
  assert.equal(await programStatus(p), Status.ACTIVE);
  await sys.as(guilty.wallet).write(bounty, "concede", [1n]);
  assert.equal(await programStatus(p), Status.COMPLETED);
});

it("a report upheld after the scholar was paid in full takes nothing from the others", async () => {
  const p = await runningProgram();
  const [guilty] = p.winners;
  await report(p, guilty);
  await sys.as(guilty.wallet).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  await pay(guilty);
  const before = await programBalance(p.pid);
  await sys.as(p.initiator).write(sys.contracts.committee, "resolveDisputeAsCreator", [1n, BigInt(p.pid), true]);
  assert.equal(await programBalance(p.pid), before);
});

it("the leftover waits while a report against a scholar is open", async () => {
  const p = await runningProgram();
  await sys.as(reporter()).write(bounty, "raiseDispute", [BigInt(p.pid), p.winners[0].wallet, 0n, 0, "ipfs://evidence"]);
  // Answered inside the 7-day defense window, which ends before the milestones can be paid out here.
  await sys.as(p.winners[0].wallet).write(bounty, "submitCounterEvidence", [1n, "ipfs://defense"]);
  await payAll(p);
  await expectRevert(release(p), "ReportStillOpen");

  await sys.as(p.initiator).write(sys.contracts.committee, "resolveDisputeAsCreator", [1n, BigInt(p.pid), false]);
  await release(p);
  assert.equal(await programBalance(p.pid), 0n);
});
});
