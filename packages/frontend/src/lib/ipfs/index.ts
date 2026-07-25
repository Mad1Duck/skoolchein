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
  if (!cid) return null;
  try {
    const res = await fetch(ipfsUrl(cid));
    return res.json();
  } catch {
    console.warn("[IPFS] Failed to fetch CID:", cid);
    return null;
  }
}

/** Fetch program metadata from IPFS */
export async function fetchProgramMeta(cid: string): Promise<ProgramMetadata | null> {
  return fetchIPFS<ProgramMetadata>(cid);
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
