// Test harness for the v4 contracts: deploys the whole system on Hardhat's in-process
// network (mirroring ignition/modules/scholarship-v4.ts) and offers small helpers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";
import { createPublicClient, createWalletClient, custom, keccak256, toHex, zeroAddress, parseEther, getAddress } from "viem";
import { hardhat } from "viem/chains";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactsRoot = path.resolve(here, "../../artifacts");

export function artifact(rel) {
  return JSON.parse(readFileSync(path.join(artifactsRoot, rel), "utf8"));
}

export const ROLE = {
  CORE: "0x502d3d275257923b2bea6ea25d9631f12369fb532871f13eb85eb09dc0fb4842",
  MINTER: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
  BURNER: "0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848",
  LOCKER: "0xaf9a8bb3cbd6b84fbccefa71ff73e26e798553c6914585a84886212a46a90279",
  GOVERNANCE: "0x71840dc4906352362b0cdaf79870196c8e42acafade72d5d5a6d59291253ceb1",
  COMMITTEE: "0x794daa56950487582951e8db2fdbcbee68c2223c65641d0aa02a3afc64f9a86f",
  CONFIG_ADMIN: keccak256(toHex("CONFIG_ADMIN_ROLE")),
  SELECTION: keccak256(toHex("SELECTION_ROLE")),
};

export const Status = { CREATED: 0, APPLICATION_OPEN: 1, SCREENING: 2, VOTING: 3, ACTIVE: 4, COMPLETED: 5, CANCELLED: 6 };
export const AppStatus = { PENDING_REVIEW: 0, SHORTLISTED: 1, SCREENED_OUT: 2, LOCKED: 3 };
export { zeroAddress, parseEther };

const provider = hre.network.provider;
export const publicClient = createPublicClient({ chain: hardhat, transport: custom(provider) });
const walletFor = (account) => createWalletClient({ account, chain: hardhat, transport: custom(provider) });

// ── time ─────────────────────────────────────────────────────────────────────
export async function now() {
  return Number((await publicClient.getBlock()).timestamp);
}
export async function warpTo(ts) {
  await provider.request({ method: "evm_setNextBlockTimestamp", params: [toHex(ts)] });
  await provider.request({ method: "evm_mine", params: [] });
}

// ── snapshots: one deployment, every test starts from the same clean chain ───
export async function snapshot() {
  return provider.request({ method: "evm_snapshot", params: [] });
}
export async function revertTo(id) {
  await provider.request({ method: "evm_revert", params: [id] });
}

// ── revert assertions ────────────────────────────────────────────────────────
export async function expectRevert(promise, errorName) {
  try {
    await promise;
  } catch (e) {
    const revert = e.walk?.((x) => x?.name === "ContractFunctionRevertedError");
    const name = revert?.data?.errorName ?? "";
    const text = `${name} ${e.shortMessage ?? ""} ${e.message ?? ""}`;
    assert.ok(text.includes(errorName), `expected revert "${errorName}", got: ${text.slice(0, 400)}`);
    return;
  }
  assert.fail(`expected revert "${errorName}" but the call succeeded`);
}

// ── deployment ───────────────────────────────────────────────────────────────
async function deploy(deployer, art, args = []) {
  const hash = await walletFor(deployer).deployContract({ abi: art.abi, bytecode: art.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress;
}

async function deployProxy(deployer, implArt, initArgs) {
  const impl = await deploy(deployer, implArt);
  const proxyArt = artifact("@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json");
  const { encodeFunctionData } = await import("viem");
  const data = encodeFunctionData({ abi: implArt.abi, functionName: "initialize", args: initArgs });
  return deploy(deployer, proxyArt, [impl, data]);
}

export async function deploySystem() {
  const accounts = (await provider.request({ method: "eth_accounts" })).map((a) => getAddress(a));
  const [deployer] = accounts;

  const art = {
    usdc: artifact("contracts/v4/mocks/MockUSDC.sol/MockUSDC.json"),
    donorNFT: artifact("contracts/v4/tokens/ScholarshipNFTs.sol/DonorNFT.json"),
    studentNFT: artifact("contracts/v4/tokens/ScholarshipNFTs.sol/StudentNFT.json"),
    fraudNFT: artifact("contracts/v4/tokens/ScholarshipNFTs.sol/FraudNFT.json"),
    reputation: artifact("contracts/v4/tokens/ScholarshipReputation.sol/ScholarshipReputation.json"),
    treasury: artifact("contracts/v4/finance/ScholarshipTreasury.sol/ScholarshipTreasury.json"),
    milestones: artifact("contracts/v4/core/MilestoneManager.sol/MilestoneManager.json"),
    core: artifact("contracts/v4/core/ScholarshipCore.sol/ScholarshipCore.json"),
    admin: artifact("contracts/v4/core/ScholarshipAdmin.sol/ScholarshipAdmin.json"),
    selection: artifact("contracts/v4/core/ScholarshipSelection.sol/ScholarshipSelection.json"),
  };

  const usdc = await deploy(deployer, art.usdc);
  const donorNFT = await deploy(deployer, art.donorNFT);
  const studentNFT = await deploy(deployer, art.studentNFT);
  const fraudNFT = await deploy(deployer, art.fraudNFT);
  const reputation = await deployProxy(deployer, art.reputation, [deployer]);
  const treasury = await deployProxy(deployer, art.treasury, [deployer, usdc, deployer]);
  const milestones = await deployProxy(deployer, art.milestones, [deployer, zeroAddress, treasury]);
  const core = await deployProxy(deployer, art.core, [
    deployer, usdc, treasury, reputation, donorNFT, studentNFT, fraudNFT, milestones, zeroAddress,
  ]);
  const admin = await deployProxy(deployer, art.admin, [deployer, core]);
  const selection = await deployProxy(deployer, art.selection, [deployer, core]);

  const send = async (address, abi, functionName, args = [], value) => {
    const hash = await walletFor(deployer).writeContract({ address, abi, functionName, args, value });
    return publicClient.waitForTransactionReceipt({ hash });
  };

  // Wiring (same as ignition STEP 8 / 11 / 12, plus the new selection roles).
  await send(milestones, art.milestones.abi, "setCore", [core]);
  await send(milestones, art.milestones.abi, "setSelection", [selection]);
  await send(core, art.core.abi, "grantRole", [ROLE.GOVERNANCE, deployer]);
  await send(core, art.core.abi, "grantRole", [ROLE.GOVERNANCE, admin]);
  await send(core, art.core.abi, "grantRole", [ROLE.CONFIG_ADMIN, admin]);
  await send(core, art.core.abi, "grantRole", [ROLE.SELECTION, selection]);
  await send(core, art.core.abi, "grantRole", [ROLE.COMMITTEE, deployer]);
  await send(treasury, art.treasury.abi, "grantRole", [ROLE.CORE, core]);
  await send(reputation, art.reputation.abi, "grantRole", [ROLE.MINTER, core]);
  await send(reputation, art.reputation.abi, "grantRole", [ROLE.BURNER, core]);
  await send(reputation, art.reputation.abi, "grantRole", [ROLE.LOCKER, core]);
  await send(donorNFT, art.donorNFT.abi, "grantRole", [ROLE.MINTER, core]);
  await send(studentNFT, art.studentNFT.abi, "grantRole", [ROLE.MINTER, core]);
  // Native currency only: no ERC20 approvals needed. 0.01 ETH minimum, 0.001 ETH fee.
  await send(core, art.core.abi, "setTokenConfig", [zeroAddress, true, parseEther("0.01"), parseEther("0.001")]);
  await send(selection, art.selection.abi, "setConfig", [10_000, 3_000, 2_500]);

  // Calls that may revert with an error declared in ANOTHER contract (Core errors surfaced through
  // Selection, say) need those error definitions in the ABI so viem can name them.
  const errors = [...art.core.abi, ...art.selection.abi, ...art.admin.abi, ...art.milestones.abi].filter((x) => x.type === "error");
  const abiOf = (a) => [...a, ...errors];

  const contracts = {
    core: { address: core, abi: abiOf(art.core.abi) },
    selection: { address: selection, abi: abiOf(art.selection.abi) },
    admin: { address: admin, abi: abiOf(art.admin.abi) },
    milestones: { address: milestones, abi: abiOf(art.milestones.abi) },
  };

  const as = (account) => {
    const w = walletFor(account);
    return {
      write: async (c, functionName, args = [], value) => {
        const hash = await w.writeContract({ address: c.address, abi: c.abi, functionName, args, value });
        return publicClient.waitForTransactionReceipt({ hash });
      },
    };
  };
  const read = (c, functionName, args = []) => publicClient.readContract({ address: c.address, abi: c.abi, functionName, args });

  return { accounts, deployer, contracts, as, read, send, nextPid: 0 };
}

// ── a program, ready to run ──────────────────────────────────────────────────
const SCORE = (a) => ({ academic: a, income: a, recommend: a });

/**
 * Creates a program and has `scores.length` students apply (BY_STUDENT: they report their own
 * scores). All application-window actions are done; the clock is left at the end of the window.
 */
export async function setupProgram(sys, opts = {}) {
  const {
    scores = [100, 90, 80, 70, 65, 60, 50],
    maxCandidates = 5,
    targetWinners = 2,
    totalFund = parseEther("100"),
    initiator = sys.accounts[1],
    donations = [], // [{ account, amount }] made during the application window
  } = opts;
  const { core } = sys.contracts;
  const t = await now();
  const timeline = [t + 60, t + 600, t + 700, t + 1000];

  await sys.as(initiator).write(core, "createProgram", [
    "ipfs://program", 3, 1,
    { academicWeight: 40, incomeWeight: 40, essayWeight: 0, recommendWeight: 20, extracurricWeight: 0 },
    { bountyHunterPercent: 40, treasuryPercent: 40, protocolPercent: 20 },
    maxCandidates, targetWinners, timeline, 7 * 86400, totalFund, 0, zeroAddress, zeroAddress,
  ], totalFund);
  const pid = ++sys.nextPid; // pids are sequential from 1; sys.nextPid is reset together with the chain snapshot

  return { pid, timeline, initiator, scores, async openWindowAndApply() {
    await warpTo(timeline[0]);
    const students = [];
    for (let i = 0; i < scores.length; i++) {
      const s = sys.accounts[2 + i];
      students.push(s);
      await sys.as(s).write(core, "applyToProgram", [BigInt(pid), "p", "d", "e", "r", BigInt(scores[i]), BigInt(scores[i]), BigInt(scores[i])]);
    }
    for (const d of donations) {
      await sys.as(d.account).write(core, "donate", [BigInt(pid), d.amount, "ipfs://donor"], d.amount);
    }
    return students;
  } };
}

export { SCORE };
