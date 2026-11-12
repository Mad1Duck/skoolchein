import { rawApi } from "../api/client";
import type { ProgramMetadata, ApplicantProfile } from "../api/types";

const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs";

/** Resolve an IPFS CID to a gateway URL */
export function ipfsUrl(cid: string): string {
  if (!cid) return "";
  const clean = cid.replace("ipfs://", "").replace(/^\/ipfs\//, "");
  return `${IPFS_GATEWAY}/${clean}`;
}

/** Fetch JSON from IPFS via CID */
export async function fetchIPFS<T = unknown>(cid: string): Promise<T | null> {
  // The create form falls back to a placeholder CID when the upload fails; it
  // points at nothing, so don't spend a gateway request on it.
  if (!cid || cid.startsWith("QmFallback")) return null;
  try {
    const res = await fetch(ipfsUrl(cid));
    // A rate-limited gateway answers 429 with an HTML challenge page — treat that
    // as "no metadata" instead of failing inside res.json().
    if (!res.ok) throw new Error(`gateway responded ${res.status}`);
    return await res.json();
  } catch {
    console.warn("[IPFS] Failed to fetch CID:", cid);
    return null;
  }
}

/** Fetch program metadata from IPFS */
export async function fetchProgramMeta(cid: string): Promise<ProgramMetadata | null> {
  const meta = await fetchIPFS<ProgramMetadata>(cid);
  if (!meta) return null;
  // The stored name keeps the backend's naming prefix ("skoolchein_program_My Program").
  // That is for storage only — display just what the creator typed.
  return meta.name ? { ...meta, name: stripNamePrefix(meta.name) } : meta;
}

/** "skoolchein_program_My Program" → "My Program". Names without the prefix pass through. */
export function stripNamePrefix(name: string): string {
  return name.replace(/^skoolchein_[a-z0-9]+_/i, "");
}

/** Fetch applicant profile from IPFS */
export async function fetchApplicantProfile(cid: string): Promise<ApplicantProfile | null> {
  return fetchIPFS<ApplicantProfile>(cid);
}

/** Upload data to IPFS via the Ponder backend proxy */
export async function uploadToIPFS(payload: {
  meta: unknown;
  type?: string;
  name?: string;
}): Promise<{ metaCID: string } | null> {
  try {
    const { data } = await rawApi.post("/ipfs/upload", payload);
    return data;
  } catch {
    console.error("[IPFS] Upload failed");
    return null;
  }
}
