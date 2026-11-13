import assert from "node:assert/strict";
import { getAddress, zeroAddress } from "viem";
import {
  deploySystem, setupProgram, snapshot, revertTo, warpTo, publicClient, walletClientFor, artifact,
  parseEther, ROLE,
} from "./harness.mjs";
import { upgradeV4 } from "../../scripts/upgrade-lib.mjs";

// Upgrading in place: same proxy addresses, same data, new code, and the wiring the new code needs.
describe("v4 in-place upgrade", () => {
let sys, snap;
let core, treasury, milestones, bounty, selection;

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const implOf = async (a) => getAddress(`0x${(await publicClient.getStorageAt({ address: a, slot: IMPL_SLOT })).slice(-40)}`);

const art = {
  core: artifact("contracts/v4/core/ScholarshipCore.sol/ScholarshipCore.json"),
  coreLogic: artifact("contracts/v4/core/ScholarshipCoreLogic.sol/ScholarshipCoreLogic.json"),
  treasury: artifact("contracts/v4/finance/ScholarshipTreasury.sol/ScholarshipTreasury.json"),
  milestoneManager: artifact("contracts/v4/core/MilestoneManager.sol/MilestoneManager.json"),
  bounty: artifact("contracts/v4/core/ScholarshipBounty.sol/ScholarshipBounty.json"),
};
const addresses = () => ({
  core: core.address, treasury: treasury.address, milestoneManager: milestones.address, bounty: bounty.address,
});
const upgrade = (opts = {}, account = sys.deployer) =>
  upgradeV4({ publicClient, walletClient: walletClientFor(account), addresses: addresses(), artifacts: art, log: () => {}, ...opts });

before(async () => {
  sys = await deploySystem();
  ({ core, treasury, milestones, bounty, selection } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const stranger = () => sys.accounts[15];
const donor = () => sys.accounts[12];

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

const stateOf = async (p) => ({
  program: await sys.read(core, "getProgram", [BigInt(p.pid)]),
  scholar: await sys.read(core, "getScholar", [p.scholar, BigInt(p.pid)]),
  milestone: await sys.read(milestones, "getMilestone", [p.id]),
  balance: await sys.read(treasury, "programBalance", [BigInt(p.pid)]),
});
const json = (x) => JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));

it("keeps every address and all stored data, and the new code works on the old data", async () => {
  const p = await submitted();
  const before = await stateOf(p);
  const implsBefore = {
    core: await implOf(core.address), treasury: await implOf(treasury.address),
    milestoneManager: await implOf(milestones.address), bounty: await implOf(bounty.address),
  };

  const result = await upgrade();

  // New implementations, same proxies.
  for (const key of Object.keys(implsBefore)) {
    const proxy = addresses()[key];
    assert.notEqual(await implOf(proxy), implsBefore[key], `${key} was not upgraded`);
    assert.equal(await implOf(proxy), getAddress(result.implementations[key]));
  }
  // Nothing stored was lost or moved.
  assert.equal(json(await stateOf(p)), json(before));

  // And the upgraded contracts still do their job on that data.
  await sys.as(p.initiator).write(milestones, "approveSubmission", [p.id]);
  assert.equal((await sys.read(milestones, "getMilestone", [p.id])).status, 6); // COMPLETED
});

it("running it again changes nothing that is already in place", async () => {
  await upgrade();
  const logicBefore = await sys.read(core, "logic");
  await upgrade({ only: ["treasury", "bounty"] });
  assert.equal(getAddress(await sys.read(treasury, "stakeCore")), getAddress(core.address));
  assert.equal(getAddress(await sys.read(bounty, "milestone")), getAddress(milestones.address));
  // Core was not part of the second run, so its module is untouched.
  assert.equal(await sys.read(core, "logic"), logicBefore);
});

it("fills in wiring that a deployment from before this change does not have", async () => {
  // Make the deployment look like the old one: none of the new wiring exists.
  await sys.send(core.address, core.abi, "setLogic", [zeroAddress]);
  await sys.send(treasury.address, treasury.abi, "setStakeCore", [zeroAddress]);
  await sys.send(treasury.address, treasury.abi, "revokeRole", [ROLE.CORE, milestones.address]);
  await sys.send(bounty.address, bounty.abi, "setMilestoneManager", [zeroAddress]);
  await sys.send(bounty.address, bounty.abi, "revokeRole", [ROLE.RESOLVER, core.address]);

  await upgrade();

  assert.notEqual(await sys.read(core, "logic"), zeroAddress);
  assert.equal(getAddress(await sys.read(treasury, "stakeCore")), getAddress(core.address));
  assert.equal(await sys.read(treasury, "hasRole", [ROLE.CORE, milestones.address]), true);
  assert.equal(getAddress(await sys.read(bounty, "milestone")), getAddress(milestones.address));
  assert.equal(await sys.read(bounty, "hasRole", [ROLE.RESOLVER, core.address]), true);
});

it("can upgrade just some of the contracts", async () => {
  const coreBefore = await implOf(core.address);
  const treasuryBefore = await implOf(treasury.address);
  await upgrade({ only: ["treasury"] });
  assert.equal(await implOf(core.address), coreBefore);
  assert.notEqual(await implOf(treasury.address), treasuryBefore);
});

it("refuses, before changing anything, an account that is not allowed to upgrade", async () => {
  const before = await implOf(treasury.address);
  await assert.rejects(upgrade({}, stranger()), /not allowed to upgrade/);
  assert.equal(await implOf(treasury.address), before);
});

it("a dry run only checks authority", async () => {
  const before = await implOf(core.address);
  const result = await upgrade({ dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(await implOf(core.address), before);
  await assert.rejects(upgrade({ dryRun: true }, stranger()), /not allowed to upgrade/);
});
});
