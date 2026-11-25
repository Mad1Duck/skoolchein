import assert from "node:assert/strict";
import {
  deploySystem, setupProgram, snapshot, revertTo, expectRevert, publicClient, parseEther, zeroAddress,
} from "./harness.mjs";

// The platform's income (creation fee, donation fee, reserve) and what an admin may take out.
describe("v4 platform fees", () => {
let sys, snap;
let core, treasury;

before(async () => {
  sys = await deploySystem();
  ({ core, treasury } = sys.contracts);
  snap = await snapshot();
});

beforeEach(async () => {
  await revertTo(snap);
  snap = await snapshot();
  sys.nextPid = 0;
});

const wallet = (address) => publicClient.getBalance({ address });
const recipient = () => sys.deployer; // the harness makes the deployer the fee recipient
const read = (f, args = []) => sys.read(treasury, f, args);
const setFee = (bps) => sys.as(sys.deployer).write(treasury, "setCreationFeeBps", [bps]);
const DONATION_FEE = parseEther("0.001");

function create(fund, value) {
  return async () => {
    const t = Number((await publicClient.getBlock()).timestamp);
    return sys.as(sys.accounts[1]).write(core, "createProgram", [
      "ipfs://program", 3, 1,
      { academicWeight: 40, incomeWeight: 40, essayWeight: 0, recommendWeight: 20, extracurricWeight: 0 },
      { bountyHunterPercent: 40, treasuryPercent: 40, protocolPercent: 20 },
      5, 2, [t + 60, t + 600, t + 700, t + 1000], 7 * 86400, fund, 0, zeroAddress, zeroAddress,
    ], value);
  };
}

it("charges nothing until a fee is set", async () => {
  await create(parseEther("100"), parseEther("100"))();
  assert.equal(await read("getProgramBalance", [1n]), parseEther("100"));
});

it("takes the fee on top of the fund and sends it to the protocol", async () => {
  await setFee(300n);
  const had = await wallet(recipient());
  await create(parseEther("100"), parseEther("103"))();

  assert.equal((await wallet(recipient())) - had, parseEther("3"));
  assert.equal(await read("getProgramBalance", [1n]), parseEther("100"));
  assert.equal((await sys.read(core, "getProgram", [1n])).totalFund, parseEther("100"));
  assert.equal(await wallet(treasury.address), parseEther("100"));
});

it("refuses a program that does not include the fee", async () => {
  await setFee(300n);
  await expectRevert(create(parseEther("100"), parseEther("100"))(), "NativeValueMismatch");
});

it("caps the fee at 5% and only the admin can change it", async () => {
  await expectRevert(setFee(501n), "FeeTooHigh");
  await expectRevert(sys.as(sys.accounts[15]).write(treasury, "setCreationFeeBps", [100n]), "AccessControl");
});

it("the admin can withdraw the donation fees, and nothing that belongs to a program", async () => {
  const prog = await setupProgram(sys, { donations: [{ account: sys.accounts[12], amount: parseEther("1") }] });
  await prog.openWindowAndApply();
  assert.equal(await read("reserveBalance", [zeroAddress]), DONATION_FEE);

  const withdraw = (amount) =>
    sys.as(sys.deployer).write(treasury, "withdrawTreasuryReserve", [zeroAddress, sys.accounts[17], amount]);
  await expectRevert(withdraw(DONATION_FEE + 1n), "InsufficientReserve");
  const had = await wallet(sys.accounts[17]);
  await withdraw(DONATION_FEE);
  assert.equal((await wallet(sys.accounts[17])) - had, DONATION_FEE);
  await expectRevert(withdraw(1n), "InsufficientReserve");
  assert.equal(await wallet(treasury.address), await read("getProgramBalance", [BigInt(prog.pid)]));
});
});
