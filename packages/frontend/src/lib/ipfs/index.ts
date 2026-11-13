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

/**
 * Load a JSON document by CID for display. Unlike fetchIPFS it THROWS on failure, so TanStack Query
 * retries and the UI can offer "try again" instead of treating a busy gateway as "empty". A CID's
 * content never changes, so a successful result is kept in localStorage for good.
 */
export async function loadIPFSJson<T = unknown>(cid: string): Promise<T | null> {
  if (!cid || /Fallback/.test(cid)) return null; // dev placeholder: points at nothing
  const key = "skc:json:" + cid;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached) as T;
  } catch { /* unavailable: fall through to the network */ }

  const res = await fetch(ipfsUrl(cid));
  if (!res.ok) throw new Error(`IPFS gateway responded ${res.status}`);
  const json = (await res.json()) as T;
  try { localStorage.setItem(key, JSON.stringify(json)); } catch { /* storage full: caching is optional */ }
  return json;
}

/** Keep a document we just wrote, so its author can read it back even if the gateway is busy. */
export function rememberIPFSJson(cid: string, json: unknown) {
  if (!cid || /Fallback/.test(cid)) return;
  try { localStorage.setItem("skc:json:" + cid, JSON.stringify(json)); } catch { /* optional */ }
}

// ── Local metadata cache ──────────────────────────────────────────────────────
// CIDs are content-addressed, so a CID's metadata can never change: cache it
// forever. This keeps program names visible when the public gateway rate-limits
// (429) and avoids refetching on every visit.

const META_CACHE_PREFIX = "skc:meta:";

function readCachedMeta(cid: string): ProgramMetadata | null {
  try {
    const raw = localStorage.getItem(META_CACHE_PREFIX + cid);
    return raw ? (JSON.parse(raw) as ProgramMetadata) : null;
  } catch {
    return null;
  }
}

/** Remember metadata for a CID. Also called at creation time, when the name is known locally. */
export function rememberProgramMeta(cid: string, meta: ProgramMetadata) {
  if (!cid || cid.startsWith("QmFallback")) return;
  try {
    localStorage.setItem(META_CACHE_PREFIX + cid, JSON.stringify(meta));
  } catch {
    /* storage full or unavailable — the cache is only an optimisation */
  }
}

/**
 * Fetch program metadata from IPFS.
 *
 * Resolves to null only when there is genuinely nothing to fetch (placeholder
 * CID). A gateway failure THROWS, so TanStack Query treats it as an error and
 * retries instead of caching "no metadata" for the rest of the session.
 */
export async function fetchProgramMeta(cid: string): Promise<ProgramMetadata | null> {
  if (!cid || cid.startsWith("QmFallback")) return null;

  let meta = readCachedMeta(cid);
  if (!meta) {
    const res = await fetch(ipfsUrl(cid));
    if (!res.ok) throw new Error(`IPFS gateway responded ${res.status}`);
    meta = (await res.json()) as ProgramMetadata;
    rememberProgramMeta(cid, meta);
  }
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

/** A document or image attached to a proof, report or defense. The bytes live on IPFS under `cid`. */
export interface EvidenceFile {
  name: string;
  type: string;
  size: number;
  cid: string;
}

/** What an evidence document stores: the written explanation plus any attached files. */
export interface EvidenceDoc {
  content?: string;
  files?: EvidenceFile[];
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const EVIDENCE_MAX_FILES = 5;
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/** Pin one file. Resolves to its CID, or throws so the caller can tell the user which file failed. */
async function pinFile(file: File): Promise<EvidenceFile> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", "evidence-file");
  form.append("name", file.name);
  const { data } = await rawApi.post<{ imageCID?: string }>("/ipfs/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  if (!data?.imageCID) throw new Error(`Upload failed for ${file.name}`);
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, cid: data.imageCID };
}

/**
 * Store an evidence document: the text and any files. Every file is pinned first, then one JSON
 * document that lists them is pinned and its CID is returned (that is what goes on-chain).
 * Throws when a file cannot be uploaded, instead of silently dropping it from the evidence.
 */
export async function uploadEvidence(input: {
  content: string;
  files?: File[];
  type: string;
  name: string;
}): Promise<{ metaCID: string; files: EvidenceFile[] }> {
  const files: EvidenceFile[] = [];
  for (const file of input.files ?? []) files.push(await pinFile(file));

  const res = await uploadToIPFS({
    meta: { content: input.content, files },
    type: input.type,
    name: input.name,
  });
  if (!res?.metaCID) throw new Error("Upload failed");
  rememberIPFSJson(res.metaCID, { content: input.content, files } satisfies EvidenceDoc);
  return { metaCID: res.metaCID, files };
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
