/**
 * Which deployed contracts differ from the code in this checkout? Read only: no key, no transaction.
 *
 *   bun run status-v4-nawasena
 *   bun scripts/status-v4.mjs --chain 31338
 *
 * Reads proxy addresses from ../../.deployments.env, like upgrade-v4.ts. Compiled code comes from
 * ./artifacts, so compile first (the npm script does).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, parseAbi } from "viem";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const chainId = Number(arg("chain") ?? "31338");
const rpc = process.env.NAWASENA_RPC_URL ?? "https://rpc.nawasena-labs.com";
const client = createPublicClient({ transport: http(rpc) });

const actual = await client.getChainId();
if (actual !== chainId) throw new Error(`${rpc} is chain ${actual}, not ${chainId}. Set NAWASENA_RPC_URL.`);

const env = Object.fromEntries(
  fs.readFileSync(path.resolve(root, "../../.deployments.env"), "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)="?([^"#]*)"?/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);

/** name → [env key, compiled file, upgrade-v4.ts --only value] */
const CONTRACTS = {
  Core: ["CONTRACT_CORE", "core/ScholarshipCore", "core"],
  Treasury: ["CONTRACT_TREASURY", "finance/ScholarshipTreasury", "treasury"],
  MilestoneManager: ["CONTRACT_MILESTONE_MANAGER", "core/MilestoneManager", "milestoneManager"],
  Bounty: ["CONTRACT_BOUNTY", "core/ScholarshipBounty", "bounty"],
  Selection: ["CONTRACT_SELECTION", "core/ScholarshipSelection", "selection"],
  CommitteeGovernance: ["CONTRACT_COMMITTEE", "governance/CommitteeGovernance", "committee"],
};
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ZERO = "0".repeat(40);

// Ignore the trailing compiler metadata (it changes with comments) and the contract's own address,
// an immutable filled in at deployment.
const normal = (code, self) => {
  const hex = code.slice(2).toLowerCase();
  const metadata = (parseInt(hex.slice(-4), 16) + 2) * 2;
  return hex.slice(0, -metadata).replaceAll(self.slice(2).toLowerCase(), ZERO);
};
const compiled = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts/v4", `${file}.sol`, `${path.basename(file)}.json`), "utf8")).deployedBytecode;
const matches = async (address, file) =>
  normal((await client.getCode({ address })) ?? "0x", address) === normal(compiled(file), `0x${ZERO}`);

const outdated = new Set();
const report = (name, address, same) =>
  console.log(`  ${name.padEnd(20)} ${address}  ${same ? "up to date" : "DIFFERENT from this code"}`);

console.log(`Chain ${chainId} via ${rpc}\n`);
let core;
for (const [name, [key, file, only]] of Object.entries(CONTRACTS)) {
  const value = env[`${key}_${chainId}`] ?? env[key];
  if (!value) {
    console.log(`  ${name.padEnd(20)} ${key} not found in .deployments.env`);
    continue;
  }
  const proxy = getAddress(value);
  if (name === "Core") core = proxy;
  const slot = await client.getStorageAt({ address: proxy, slot: IMPL_SLOT });
  const implementation = getAddress(`0x${slot.slice(-40)}`);
  const same = await matches(implementation, file);
  report(name, implementation, same);
  if (!same) outdated.add(only);
}
if (core) {
  // Core's logic module is not a proxy; Core stores its address. It is redeployed together with Core.
  const logic = await client.readContract({ address: core, abi: parseAbi(["function logic() view returns (address)"]), functionName: "logic" });
  const same = await matches(logic, "core/ScholarshipCoreLogic");
  report("CoreLogic", logic, same);
  if (!same) outdated.add("core");
}

console.log(
  outdated.size
    ? `\nTo bring the chain up to date:\n  bun scripts/upgrade-v4.ts --chain ${chainId} --only ${[...outdated].join(",")}`
    : "\nEverything deployed matches this code.",
);
