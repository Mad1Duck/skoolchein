import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const chainId = process.argv.find((a) => /^\d+$/.test(a)) ?? "31337";
const CHAIN_DIR = path.join(ROOT, "ignition", "deployments", `chain-${chainId}`);

if (fs.existsSync(CHAIN_DIR)) {
  fs.rmSync(CHAIN_DIR, { recursive: true, force: true });
  console.log(`Cleaned old deployment state: chain-${chainId}`);
} else {
  console.log(`No prior deployment state for chain-${chainId}`);
}
