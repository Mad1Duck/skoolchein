// Upgrades a live v4 deployment in place: new implementations behind the SAME proxy addresses, so every
// address in every .env stays valid and all stored data (programs, scholars, milestones, donations) is kept.
//
// Plain viem, no Hardhat: the test suite and the CLI (upgrade-v4.ts) call the same function.
import { getAddress, keccak256, toFunctionSelector, toHex, zeroAddress } from "viem";

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ROLE = (name) => keccak256(toHex(name));
export const ROLES = {
  UPGRADER: ROLE("UPGRADER_ROLE"),
  CORE: ROLE("CORE_ROLE"),
  RESOLVER: ROLE("RESOLVER_ROLE"),
};

/** Contracts that can be upgraded, and how each one is upgraded. */
const KINDS = {
  core: { artifact: "core", call: "upgradeTo", auth: "admin" }, // Core has its own upgradeTo(address)
  treasury: { artifact: "treasury", call: "upgradeToAndCall", auth: "role" },
  milestoneManager: { artifact: "milestoneManager", call: "upgradeToAndCall", auth: "admin" },
  bounty: { artifact: "bounty", call: "upgradeToAndCall", auth: "role" },
};
export const UPGRADABLE = Object.keys(KINDS);

/**
 * @param {object} o
 * @param {import("viem").PublicClient} o.publicClient
 * @param {import("viem").WalletClient} o.walletClient   must have an account
 * @param {{core:string, treasury:string, milestoneManager:string, bounty:string}} o.addresses  proxy addresses
 * @param {Record<string,{abi:any[], bytecode:string}>} o.artifacts  core, treasury, milestoneManager, bounty, coreLogic
 * @param {string[]} [o.only]  which of UPGRADABLE to upgrade (default: all)
 * @param {boolean} [o.dryRun]  only check that this account may upgrade, change nothing
 * @param {(msg:string)=>void} [o.log]
 */
export async function upgradeV4({ publicClient, walletClient, addresses, artifacts, only = UPGRADABLE, dryRun = false, log = console.log }) {
  const account = walletClient.account;
  if (!account) throw new Error("walletClient needs an account");
  const me = getAddress(account.address);

  const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });
  const send = async (address, abi, functionName, args = []) => {
    const hash = await walletClient.writeContract({ address, abi, functionName, args, account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} on ${address} reverted (${hash})`);
    log(`    tx ${functionName}  ${hash}`);
    return receipt;
  };
  const deploy = async (artifact) => {
    const hash = await walletClient.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return getAddress(receipt.contractAddress);
  };
  const implOf = async (proxy) => getAddress(`0x${(await publicClient.getStorageAt({ address: proxy, slot: IMPL_SLOT })).slice(-40)}`);
  const addr = (k) => getAddress(addresses[k]);

  // ── 1. Make sure this account may upgrade, BEFORE spending anything ──────────
  log(`Upgrader: ${me}`);
  for (const key of only) {
    const kind = KINDS[key];
    if (!kind) throw new Error(`unknown contract "${key}" (choose from ${UPGRADABLE.join(", ")})`);
    const abi = artifacts[kind.artifact].abi;
    // A proxy can only be upgraded if the code behind it contains the upgrade function. MilestoneManager was
    // first deployed without one, and nothing can add it to a proxy that is already live.
    const selector = toFunctionSelector(kind.call === "upgradeTo" ? "upgradeTo(address)" : "upgradeToAndCall(address,bytes)").slice(2);
    const currentCode = (await publicClient.getCode({ address: await implOf(addr(key)) })) ?? "0x";
    if (!currentCode.toLowerCase().includes(selector)) {
      throw new Error(
        `${key} (${addr(key)}) cannot be upgraded in place: the implementation it runs today has no upgrade function ` +
        `(it was deployed before it became upgradeable). It has to be redeployed; every later upgrade will then work.`,
      );
    }
    let allowed;
    if (kind.auth === "admin") {
      allowed = getAddress(await read(addr(key), abi, "admin")) === me;
      if (!allowed && key === "core") allowed = await read(addr(key), abi, "hasRole", [ROLES.UPGRADER, me]).catch(() => false);
    } else {
      allowed = await read(addr(key), abi, "hasRole", [ROLES.UPGRADER, me]);
    }
    if (!allowed) throw new Error(`${me} is not allowed to upgrade ${key} (${addr(key)}). Use the admin / UPGRADER_ROLE account.`);
  }

  if (dryRun) {
    for (const key of only) log(`  ${key}: ${addr(key)} currently at implementation ${await implOf(addr(key))}`);
    log("Dry run: this account may upgrade all of the above. Nothing was changed.");
    return { dryRun: true };
  }

  // ── 2. Deploy new implementations ────────────────────────────────────────────
  const before = {};
  const fresh = {};
  for (const key of only) {
    before[key] = await implOf(addr(key));
    fresh[key] = await deploy(artifacts[KINDS[key].artifact]);
    log(`  ${key}: new implementation ${fresh[key]}  (was ${before[key]})`);
  }
  // Core's logic module shares Core's storage layout, so it is redeployed whenever Core is.
  let logic = null;
  if (only.includes("core")) {
    logic = await deploy(artifacts.coreLogic);
    log(`  coreLogic: ${logic}`);
  }

  // ── 3. Point each proxy at its new implementation ────────────────────────────
  for (const key of only) {
    const kind = KINDS[key];
    const abi = artifacts[kind.artifact].abi;
    log(`  upgrading ${key} (${addr(key)})`);
    if (kind.call === "upgradeTo") await send(addr(key), abi, "upgradeTo", [fresh[key]]);
    else await send(addr(key), abi, "upgradeToAndCall", [fresh[key], "0x"]);
    const now = await implOf(addr(key));
    if (now !== fresh[key]) throw new Error(`${key} still points at ${now}, expected ${fresh[key]}`);
  }

  // ── 4. Wiring the new code needs. Each step is checked first, so a second run changes nothing. ──
  log("  wiring");
  const { core, treasury, bounty } = artifacts;
  const step = async (label, isDone, run) => {
    if (await isDone()) return log(`    ok   ${label}`);
    await run();
    if (!(await isDone())) throw new Error(`wiring did not take: ${label}`);
    log(`    done ${label}`);
  };

  if (logic) {
    await step("core.logic", async () => getAddress(await read(addr("core"), core.abi, "logic")) === logic, () =>
      send(addr("core"), core.abi, "setLogic", [logic]));
  }
  if (only.includes("treasury") || only.includes("core")) {
    await step("treasury.stakeCore", async () => getAddress(await read(addr("treasury"), treasury.abi, "stakeCore")) === addr("core"), () =>
      send(addr("treasury"), treasury.abi, "setStakeCore", [addr("core")]));
  }
  if (only.includes("treasury") || only.includes("milestoneManager")) {
    // MilestoneManager calls Treasury.disburseMilestone when a milestone is released.
    await step("treasury: CORE_ROLE for MilestoneManager", () => read(addr("treasury"), treasury.abi, "hasRole", [ROLES.CORE, addr("milestoneManager")]), () =>
      send(addr("treasury"), treasury.abi, "grantRole", [ROLES.CORE, addr("milestoneManager")]));
  }
  if (only.includes("bounty") || only.includes("milestoneManager")) {
    await step("bounty.milestone", async () => getAddress(await read(addr("bounty"), bounty.abi, "milestone")) === addr("milestoneManager"), () =>
      send(addr("bounty"), bounty.abi, "setMilestoneManager", [addr("milestoneManager")]));
  }
  if (only.includes("bounty") || only.includes("core")) {
    // Committee rulings reach Bounty.resolveDispute through Core.
    await step("bounty: RESOLVER_ROLE for Core", () => read(addr("bounty"), bounty.abi, "hasRole", [ROLES.RESOLVER, addr("core")]), () =>
      send(addr("bounty"), bounty.abi, "grantRole", [ROLES.RESOLVER, addr("core")]));
  }

  log("Upgrade complete. Proxy addresses are unchanged.");
  return { implementations: fresh, logic, previous: before };
}

export { zeroAddress };
