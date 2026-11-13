/**
 * Upgrade a live v4 deployment in place (same proxy addresses, data kept).
 *
 *   bun scripts/upgrade-v4.ts --chain 31338                 upgrade core, treasury, milestoneManager, bounty
 *   bun scripts/upgrade-v4.ts --chain 31338 --only core,bounty
 *   bun scripts/upgrade-v4.ts --chain 31338 --dry-run       only check who may upgrade, change nothing
 *
 * Reads proxy addresses from ../../.deployments.env (written by sync-deployments), compiled code from
 * ./artifacts (run `bun run compile` first). The account must be the admin / hold UPGRADER_ROLE: by default
 * Hardhat's dev account #0, as in the deploy; set DEPLOYER_PRIVATE_KEY to use another one.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
// @ts-expect-error plain JS module shared with the test suite
import { upgradeV4, UPGRADABLE } from "./upgrade-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const chainId = Number(arg("chain") ?? "31338");
const only = (arg("only") ?? UPGRADABLE.join(",")).split(",").map((s: string) => s.trim()).filter(Boolean);
const dryRun = process.argv.includes("--dry-run");

const rpc = process.env.NAWASENA_RPC_URL ?? "https://rpc.nawasena-labs.com";
const account = process.env.DEPLOYER_PRIVATE_KEY
  ? privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`)
  : mnemonicToAccount("test test test test test test test test test test test junk");

// ── proxy addresses ─────────────────────────────────────────────────────────
const envFile = path.resolve(root, "../../.deployments.env");
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)="?([^"#]*)"?/))
    .filter(Boolean)
    .map((m) => [m![1], m![2].trim()]),
);
const pick = (name: string) => {
  const v = env[`${name}_${chainId}`] ?? env[name];
  if (!v) throw new Error(`${name} not found in ${envFile}`);
  return getAddress(v);
};
const addresses = {
  core: pick("CONTRACT_CORE"),
  treasury: pick("CONTRACT_TREASURY"),
  milestoneManager: pick("CONTRACT_MILESTONE_MANAGER"),
  bounty: pick("CONTRACT_BOUNTY"),
};

// ── compiled artifacts ──────────────────────────────────────────────────────
const art = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts/v4", rel), "utf8"));
const artifacts = {
  core: art("core/ScholarshipCore.sol/ScholarshipCore.json"),
  coreLogic: art("core/ScholarshipCoreLogic.sol/ScholarshipCoreLogic.json"),
  treasury: art("finance/ScholarshipTreasury.sol/ScholarshipTreasury.json"),
  milestoneManager: art("core/MilestoneManager.sol/MilestoneManager.json"),
  bounty: art("core/ScholarshipBounty.sol/ScholarshipBounty.json"),
};

const chain = defineChain({ id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ chain, transport: http(rpc), account });

console.log(`Chain ${chainId} via ${rpc}`);
console.log("Proxies:", addresses);

await upgradeV4({ publicClient, walletClient, addresses, artifacts, only, dryRun });
