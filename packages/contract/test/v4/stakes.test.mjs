import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, expectRevert, publicClient,
  Status, parseEther, zeroAddress, ROLE,
} from "./harness.mjs";

// Confidence stakes: how a supporter's deposit comes back, and where the bonus is paid from.
describe("v4 confidence stakes", () => {
let sys, snap;
let core, selection, admin, treasury;

before(async () => {
  sys = await deploySystem();
  ({ core, selection, admin, treasury } = sys.contracts);
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
const balance = (who) => publicClient.getBalance({ address: who });
const ETH = parseEther;

const rankApplicants = (pid) => sys.read(selection, "rankApplicants", [BigInt(pid)]);
const rankShortlist = (pid) => sys.read(selection, "rankShortlist", [BigInt(pid)]);
const stake = (pid, voter) => sys.read(treasury, "confidenceStakes", [BigInt(pid), voter]);
const pool = (pid) => sys.read(treasury, "bonusPool", [BigInt(pid)]);
const claim = (who, pid, voter) => sys.as(who).write(treasury, "claimConfidenceStake", [BigInt(pid), voter]);

/** Voting window open; donor 0 has voted for the 3rd-ranked student (s3) and put `amount` behind them. */
async function staked(amount = ETH("4")) {
  const prog = await setupProgram(sys, { donations: [{ account: donor(0), amount: ETH("10") }] });
  const students = await prog.openWindowAndApply();
  // Vote weight 0: the top two screening scores win, so s3 (third) loses. Must be set before screening is resolved.
  await sys.as(initiatorOf()).write(selection, "configureProgram", [BigInt(prog.pid), 0, [10_000], [], [], []]);
  await warpTo(prog.timeline[2]);
  await sys.as(stranger()).write(selection, "resolveShortlist", [BigInt(prog.pid), await rankApplicants(prog.pid), true]);
  const s3 = students[2];
  await sys.as(donor(0)).write(core, "voteForCandidate", [BigInt(prog.pid), s3, false]);
  await sys.as(donor(0)).write(core, "placeConfidenceStake", [BigInt(prog.pid), s3, amount], amount);
  return { ...prog, students, s3, amount };
}

/** Voting is over and the winners are chosen. */
async function winnersChosen(p) {
  await warpTo(p.timeline[3]);
  await sys.as(stranger()).write(selection, "selectWinners", [BigInt(p.pid), await rankShortlist(p.pid)]);
}

describe("settling a stake after the vote", () => {
  it("holds the deposit while voting is still going on", async () => {
    const p = await staked();
    assert.equal(await stake(p.pid, donor(0)), p.amount);
    await expectRevert(claim(stranger(), p.pid, donor(0)), "StakeNotSettled");
    const [settled] = await sys.read(treasury, "stakeStatus", [BigInt(p.pid), donor(0)]);
    assert.equal(settled, false);
  });

  it("returns the whole deposit when the supported candidate was not chosen", async () => {
    const p = await staked();
    await winnersChosen(p);
    assert.equal((await sys.read(core, "getProgram", [BigInt(p.pid)])).status, Status.ACTIVE);

    const before = await balance(donor(0));
    await claim(stranger(), p.pid, donor(0)); // anyone may trigger it, the money still goes to the donor
    assert.equal((await balance(donor(0))) - before, p.amount);
    assert.equal(await stake(p.pid, donor(0)), 0n);
    assert.equal(await pool(p.pid), 0n, "a lost vote is not penalized");
  });

  it("cannot be claimed twice", async () => {
    const p = await staked();
    await winnersChosen(p);
    await claim(stranger(), p.pid, donor(0));
    await expectRevert(claim(stranger(), p.pid, donor(0)), "NothingToRefund");
  });

  it("returns the whole deposit when the program is cancelled", async () => {
    const p = await staked();
    await sys.as(initiatorOf()).write(core, "cancelProgram", [BigInt(p.pid)]);
    const before = await balance(donor(0));
    await claim(stranger(), p.pid, donor(0));
    assert.equal((await balance(donor(0))) - before, p.amount);
  });
});

describe("the bonus pool", () => {
  // The Core-driven resolver is kept for compatibility; calling it directly (as Core would) exercises
  // the success and penalty paths without having to play a scholar through every milestone.
  async function asCore() {
    await sys.send(treasury.address, treasury.abi, "grantRole", [ROLE.CORE, sys.deployer]);
  }
  const resolve = (pid, voter, ok) => sys.send(treasury.address, treasury.abi, "resolveConfidenceStake", [BigInt(pid), voter, ok]);

  it("starts empty, so a successful scholar's supporter gets no bonus yet", async () => {
    const p = await staked(ETH("4"));
    await asCore();
    const before = await balance(donor(0));
    await resolve(p.pid, donor(0), true);
    assert.equal((await balance(donor(0))) - before, ETH("4"));
  });

  it("anyone can fund it, and the bonus (20%) is paid from it", async () => {
    const p = await staked(ETH("4"));
    await sys.as(stranger()).write(treasury, "fundBonusPool", [BigInt(p.pid), ETH("5")], ETH("5"));
    assert.equal(await pool(p.pid), ETH("5"));

    await asCore();
    const before = await balance(donor(0));
    await resolve(p.pid, donor(0), true);
    assert.equal((await balance(donor(0))) - before, ETH("4") + ETH("0.8"));
    assert.equal(await pool(p.pid), ETH("5") - ETH("0.8"));
  });

  it("never pays more bonus than the pool holds", async () => {
    const p = await staked(ETH("4"));
    await sys.as(stranger()).write(treasury, "fundBonusPool", [BigInt(p.pid), ETH("0.3")], ETH("0.3"));
    await asCore();
    const before = await balance(donor(0));
    await resolve(p.pid, donor(0), true);
    assert.equal((await balance(donor(0))) - before, ETH("4") + ETH("0.3"));
    assert.equal(await pool(p.pid), 0n);
  });

  it("the penalty on a failed scholar (50%) goes into the pool instead of staying idle", async () => {
    const p = await staked(ETH("4"));
    await asCore();
    const before = await balance(donor(0));
    await resolve(p.pid, donor(0), false);
    assert.equal((await balance(donor(0))) - before, ETH("2"));
    assert.equal(await pool(p.pid), ETH("2"));
  });

  it("uses the admin's rates, not fixed ones", async () => {
    const p = await staked(ETH("4"));
    const cfg = await sys.read(core, "getProtocolConfig");
    await sys.as(sys.deployer).write(admin, "setProtocolConfig", [{ ...cfg, confidenceSlashPct: 25, confidenceBonusPct: 10 }]);

    await sys.as(stranger()).write(treasury, "fundBonusPool", [BigInt(p.pid), ETH("5")], ETH("5"));
    await asCore();
    const before = await balance(donor(0));
    await resolve(p.pid, donor(0), true);
    assert.equal((await balance(donor(0))) - before, ETH("4") + ETH("0.4")); // 10%, not 20%
  });

  it("rejects funding a program that does not exist, and an empty amount", async () => {
    await expectRevert(sys.as(stranger()).write(treasury, "fundBonusPool", [99n, ETH("1")], ETH("1")), "UnknownProgram");
    const p = await staked();
    await expectRevert(sys.as(stranger()).write(treasury, "fundBonusPool", [BigInt(p.pid), 0n], 0n), "NothingToWithdraw");
  });

  it("the Core resolver stays closed to everyone else", async () => {
    const p = await staked();
    await expectRevert(sys.as(stranger()).write(treasury, "resolveConfidenceStake", [BigInt(p.pid), donor(0), true]), "AccessControl");
  });
});

describe("setup", () => {
  it("stakes cannot be settled until the Treasury knows ScholarshipCore", async () => {
    const p = await staked();
    await sys.as(sys.deployer).write(treasury, "setStakeCore", [zeroAddress]);
    await expectRevert(claim(stranger(), p.pid, donor(0)), "StakeCoreNotSet");
  });

  it("only the admin can set it", async () => {
    await expectRevert(sys.as(stranger()).write(treasury, "setStakeCore", [core.address]), "AccessControl");
  });
});
});
