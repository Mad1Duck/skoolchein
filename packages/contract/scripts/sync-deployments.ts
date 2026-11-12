import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");           // packages/contract
const MONO_ROOT = path.resolve(ROOT, "../..");             // repo root

// ── CLI args ────────────────────────────────────────────────────────────────
const abiOnly = process.argv.includes("--abi-only") || !process.argv[2];
const chainId = process.argv.find(a => /^\d+$/.test(a)) ?? "31337";
const CHAIN_DIR = path.join(ROOT, "ignition", "deployments", `chain-${chainId}`);

// ── Output dirs ─────────────────────────────────────────────────────────────
const PONDER_ABI_DIR = path.resolve(MONO_ROOT, "packages/ponder/abis/v4");
const PONDER_ENV = path.resolve(MONO_ROOT, "packages/ponder/.env");
const ROOT_ENV = path.resolve(MONO_ROOT, ".env");
// Machine-readable fragment of every deployed address, always written so CI
// can consume it without re-deriving the contract list by hand.
const DEPLOYMENTS_ENV = path.resolve(MONO_ROOT, ".deployments.env");
const FE_CONSTANTS = path.resolve(MONO_ROOT, "packages/frontend/src/constants");
// Per-chain deployment registry (committed). One file per chain id so syncing a
// new chain never overwrites another chain's addresses.
const DEPLOYMENTS_DIR = path.resolve(ROOT, "deployments");
// Chain whose unsuffixed env keys / `v4Addresses` export stay backward compatible.
const LEGACY_CHAIN_ID = "31338";
const DEFAULT_CHAIN_ID = process.env.DEFAULT_CHAIN_ID ?? LEGACY_CHAIN_ID;

// ── Contract map: Ignition key → short name ──────────────────────────────────
const CONTRACT_MAP: Record<string, string> = {
  "ScholarshipV4#ScholarshipCore": "ScholarshipCore",
  "ScholarshipV4#ScholarshipTreasury": "ScholarshipTreasury",
  "ScholarshipV4#ScholarshipBounty": "ScholarshipBounty",
  "ScholarshipV4#ScholarshipReputation": "ScholarshipReputation",
  "ScholarshipV4#CommitteeGovernance": "CommitteeGovernance",
  "ScholarshipV4#MilestoneManager": "MilestoneManager",
  "ScholarshipV4#ScholarshipAdmin": "ScholarshipAdmin",
  "ScholarshipV4#ScholarshipPriceOracle": "ScholarshipPriceOracle",
  "ScholarshipV4#MockUSDC": "MockUSDC",
  "ScholarshipV4#FraudNFT": "FraudNFT",
};

// Short name → env key (for ponder .env)
const ENV_KEY_MAP: Record<string, string> = {
  ScholarshipCore: "CONTRACT_CORE",
  ScholarshipTreasury: "CONTRACT_TREASURY",
  ScholarshipBounty: "CONTRACT_BOUNTY",
  ScholarshipReputation: "CONTRACT_REPUTATION",
  CommitteeGovernance: "CONTRACT_COMMITTEE",
  MilestoneManager: "CONTRACT_MILESTONE_MANAGER",
  ScholarshipAdmin: "CONTRACT_ADMIN",
  ScholarshipPriceOracle: "CONTRACT_PRICE_ORACLE",
  MockUSDC: "CONTRACT_USDC",
  FraudNFT: "CONTRACT_FRAUD_NFT",
};

// ════════════════════════════════════════════════════════════════════════════
// STEP 1 — Read deployed_addresses.json (skipped in ABI-only mode)
// ════════════════════════════════════════════════════════════════════════════

let v4Addresses: Record<string, string> = {};

if (!abiOnly) {
  const addressFile = path.join(CHAIN_DIR, "deployed_addresses.json");
  if (!fs.existsSync(addressFile)) {
    console.error(`❌  No deployment found at:\n    ${addressFile}`);
    console.error(`    Run "npm run deploy-v4" first, or use --abi-only to sync ABIs only.`);
    process.exit(1);
  }

  const allAddresses = JSON.parse(fs.readFileSync(addressFile, "utf8"));
  console.log(`\n📋  Reading deployment from chain-${chainId}:`);

  for (const [key, address] of Object.entries(allAddresses)) {
    if (CONTRACT_MAP[key]) {
      const name = CONTRACT_MAP[key];
      v4Addresses[name] = address as string;
      console.log(`    ✅  ${name.padEnd(26)} ${address}`);
    }
  }

  if (Object.keys(v4Addresses).length === 0) {
    console.error("❌  No ScholarshipV4 contracts found in deployment.");
    console.error("    Make sure you ran: npm run deploy-v4");
    process.exit(1);
  }
} else {
  console.log(`\n📋  ABI-only mode — skipping address resolution`);
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 2 — Resolve ABIs from artifacts
// ════════════════════════════════════════════════════════════════════════════

const ARTIFACT_ROOT = path.join(ROOT, "artifacts", "contracts", "v4");

function findArtifact(contractName: string): string | null {
  function walk(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full);
        if (found) return found;
      } else if (entry.name === `${contractName}.json`) {
        return full;
      }
    }
    return null;
  }
  return walk(ARTIFACT_ROOT);
}

const abis: Record<string, any> = {};
for (const name of [...new Set(Object.values(CONTRACT_MAP))]) {
  const artifactPath = findArtifact(name);
  if (!artifactPath) {
    console.warn(`    ⚠️   ABI not found for ${name} — skipping`);
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  abis[name] = artifact.abi;
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 3 — Write to packages/ponder/abis/v4/
// ════════════════════════════════════════════════════════════════════════════

console.log(`\n📦  Writing ABIs → packages/ponder/abis/v4/`);
fs.mkdirSync(PONDER_ABI_DIR, { recursive: true });

for (const [name, abi] of Object.entries(abis)) {
  const varName = name.charAt(0).toLowerCase() + name.slice(1) + "Abi";
  const fileName = path.join(PONDER_ABI_DIR, `${name}.ts`);
  const content = `// Auto-generated by sync-deployments.ts — do not edit manually\n` +
    `export const ${varName} = ${JSON.stringify(abi, null, 2)} as const;\n`;
  fs.writeFileSync(fileName, content);
  console.log(`    ✅  ${name}.ts`);
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 4 — Update packages/ponder/.env (skipped in ABI-only mode)
// ════════════════════════════════════════════════════════════════════════════

if (!abiOnly) {
  console.log(`\n🔧  Updating packages/ponder/.env`);

  let envContent = fs.existsSync(PONDER_ENV) ? fs.readFileSync(PONDER_ENV, "utf8") : "";

  // Get start block from journal
  let startBlock = "0";
  const journalPath = path.join(CHAIN_DIR, "journal.jsonl");
  if (fs.existsSync(journalPath)) {
    const lines = fs.readFileSync(journalPath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry?.type === "deployment_execution_state_initialize" || entry?.blockNumber) {
          const bn = entry.blockNumber ?? entry?.result?.blockNumber;
          if (bn && Number(bn) > 0) { startBlock = String(Number(bn)); break; }
        }
      } catch { /* skip malformed lines */ }
    }
  }

  function upsertEnvVar(content: string, key: string, value: string): string {
    const regex = new RegExp(`^(${key}=).*$`, "m");
    if (regex.test(content)) return content.replace(regex, `${key}="${value}"`);
    const sectionMarker = "# V4 CONTRACT ADDRESSES";
    if (content.includes(sectionMarker)) {
      return content.replace(new RegExp(`(${sectionMarker}[^\n]*\n)`), `$1${key}="${value}"\n`);
    }
    return content + `\n${key}="${value}"\n`;
  }

  // Chain-scoped keys (CONTRACT_CORE_<chainId>) are always written; the
  // unsuffixed legacy keys only for the legacy chain, so syncing another chain
  // never overwrites nawasena's addresses.
  const isLegacyChain = chainId === LEGACY_CHAIN_ID;
  for (const [name, address] of Object.entries(v4Addresses)) {
    const envKey = ENV_KEY_MAP[name];
    if (!envKey) continue;
    envContent = upsertEnvVar(envContent, `${envKey}_${chainId}`, address);
    if (isLegacyChain) envContent = upsertEnvVar(envContent, envKey, address);
    console.log(`    ✅  ${envKey}_${chainId}=${address}`);
  }

  envContent = upsertEnvVar(envContent, `START_BLOCK_${chainId}`, startBlock);
  if (isLegacyChain) envContent = upsertEnvVar(envContent, "START_BLOCK", startBlock);
  console.log(`    ✅  START_BLOCK_${chainId}=${startBlock}`);

  fs.writeFileSync(PONDER_ENV, envContent);

  // Persist this chain's deployment in the per-chain registry.
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DEPLOYMENTS_DIR, `${chainId}.json`),
    JSON.stringify({ chainId: Number(chainId), startBlock: Number(startBlock), addresses: v4Addresses, syncedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`    ✅  deployments/${chainId}.json`);

  // Also write to root .env so docker-compose uses the same addresses
  if (fs.existsSync(ROOT_ENV)) {
    console.log(`\n🔧  Updating root .env (docker-compose source of truth)`);
    let rootEnvContent = fs.readFileSync(ROOT_ENV, "utf8");
    for (const [name, address] of Object.entries(v4Addresses)) {
      const envKey = ENV_KEY_MAP[name];
      if (!envKey) continue;
      rootEnvContent = upsertEnvVar(rootEnvContent, `${envKey}_${chainId}`, address);
      if (isLegacyChain) rootEnvContent = upsertEnvVar(rootEnvContent, envKey, address);
      console.log(`    ✅  ${envKey}_${chainId}=${address}`);
    }
    rootEnvContent = upsertEnvVar(rootEnvContent, `START_BLOCK_${chainId}`, startBlock);
    if (isLegacyChain) rootEnvContent = upsertEnvVar(rootEnvContent, "START_BLOCK", startBlock);
    console.log(`    ✅  START_BLOCK_${chainId}=${startBlock}`);
    fs.writeFileSync(ROOT_ENV, rootEnvContent);
  }

  // Always emit a standalone env fragment with every deployed address.
  //
  // The root .env update above is conditional on that file already existing,
  // which it never does in CI (.env is gitignored). Without this, deploy
  // workflows had to re-derive addresses with a hardcoded contract list —
  // and any contract missing from that list (e.g. CONTRACT_PRICE_ORACLE)
  // silently reached the runner unset, breaking services at startup.
  // Consumers can just `cat` this file.
  const fragmentLines = [
    `# Generated by sync-deployments.ts — chain ${chainId}`,
    ...Object.entries(v4Addresses)
      .map(([name, address]) => {
        const envKey = ENV_KEY_MAP[name];
        if (!envKey) return null;
        const scoped = `${envKey}_${chainId}="${address}"`;
        return isLegacyChain ? `${envKey}="${address}"\n${scoped}` : scoped;
      })
      .filter((line): line is string => line !== null),
    ...(isLegacyChain ? [`START_BLOCK="${startBlock}"`] : []),
    `START_BLOCK_${chainId}="${startBlock}"`,
    "",
  ];
  fs.writeFileSync(DEPLOYMENTS_ENV, fragmentLines.join("\n"));
  console.log(`\n📄  Wrote address fragment → ${path.relative(MONO_ROOT, DEPLOYMENTS_ENV)}`);
} else {
  console.log(`\n🔧  Skipping ponder .env update (ABI-only mode)`);
}

// ════════════════════════════════════════════════════════════════════════════
// STEP 5 — Write to packages/frontend/src/constants/contractsV4.ts
// ════════════════════════════════════════════════════════════════════════════

console.log(`\n🎨  Writing → packages/frontend/src/constants/contractsV4.ts`);
fs.mkdirSync(FE_CONSTANTS, { recursive: true });

// Read every chain in the registry so syncing one chain never drops another.
const registry: Record<string, Record<string, string>> = {};
if (fs.existsSync(DEPLOYMENTS_DIR)) {
  for (const f of fs.readdirSync(DEPLOYMENTS_DIR).filter((f) => /^\d+\.json$/.test(f))) {
    const d = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, f), "utf8"));
    registry[String(d.chainId)] = d.addresses ?? {};
  }
}
const toAddressBlock = (addrs: Record<string, string>, indent: string) =>
  Object.entries(addrs)
    .map(([name, addr]) => `${indent}${name}: "${addr}" as \`0x\${string}\`,`)
    .join("\n");
const defaultAddresses = registry[DEFAULT_CHAIN_ID] ?? {};
const addressLines = Object.keys(defaultAddresses).length > 0
  ? toAddressBlock(defaultAddresses, "  ")
  : "  // Addresses will be populated after deployment (npm run deploy-v4)";
const deploymentsBlock = Object.entries(registry)
  .map(([id, addrs]) => `  ${id}: {\n${toAddressBlock(addrs, "    ")}\n  },`)
  .join("\n");

const abiExports = Object.entries(abis)
  .map(([name, abi]) => {
    const varName = name.charAt(0).toLowerCase() + name.slice(1) + "Abi";
    return `export const ${varName} = ${JSON.stringify(abi, null, 2)} as const;`;
  })
  .join("\n\n");

const feContent = `/**
 * contractsV4.ts
 * Auto-generated by sync-deployments.ts — do not edit manually.
 * Default chain: ${DEFAULT_CHAIN_ID} | Last sync: chain ${chainId} | ${new Date().toISOString()}
 */

// ── Deployed Addresses ────────────────────────────────────────────────────────

// Per-chain addresses. Prefer this over \`v4Addresses\` in new code.
export const v4Deployments = {
${deploymentsBlock}
} as const;

// Addresses of the default chain (${DEFAULT_CHAIN_ID}); kept for backward compatibility.
export const v4Addresses = {
${addressLines}
} as const;

export const v4ChainId = ${DEFAULT_CHAIN_ID};

// ── ABIs ──────────────────────────────────────────────────────────────────────

${abiExports}
`;

fs.writeFileSync(path.join(FE_CONSTANTS, "contractsV4.ts"), feContent);
console.log(`    ✅  contractsV4.ts`);

// ════════════════════════════════════════════════════════════════════════════
// DONE
// ════════════════════════════════════════════════════════════════════════════

const syncedItems = [
  "Ponder ABIs  → packages/ponder/abis/v4/",
  "Frontend     → packages/frontend/src/constants/contractsV4.ts",
];
if (!abiOnly) {
  syncedItems.unshift("Ponder .env  → packages/ponder/.env");
  if (fs.existsSync(ROOT_ENV)) syncedItems.push("Root .env    → .env (docker-compose)");
}

console.log(`
✨  Sync complete!${abiOnly ? " (ABI-only)" : ""}

${syncedItems.map(s => `   ${s}`).join("\n")}

Next steps:
   1. cd packages/ponder && bun run dev
   2. cd packages/frontend && bun run dev
   3. docker compose up -d --build  (if using docker-compose with root .env)
`);
