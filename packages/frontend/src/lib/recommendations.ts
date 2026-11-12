import { isAddress } from "viem";

/**
 * A recommendation is the recommender's own EIP-712 signature over
 *   Recommendation(uint256 pid, address student, uint8 score, uint256 deadline)
 * under ScholarshipSelection's domain. The contract checks it, so anyone can deliver it: the
 * recommender can hand the signed "code" to the applicant, who submits it and pays the gas.
 */

export const RECOMMENDATION_TYPES = {
  Recommendation: [
    { name: "pid", type: "uint256" },
    { name: "student", type: "address" },
    { name: "score", type: "uint8" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface SignedRecommendation {
  pid: number;
  student: `0x${string}`;
  recommender: `0x${string}`;
  score: number;
  /** Unix seconds; the contract rejects the signature after this. */
  deadline: number;
  signature: `0x${string}`;
}

/** Link the applicant sends to a recommender. */
export function recommendationLink(pid: number, student: string): string {
  return `${window.location.origin}/recommend/${pid}/${student}`;
}

const b64 = {
  enc: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))),
};

/** The signed recommendation as one copyable string (a prefix makes pasted junk easy to reject). */
export function encodeRecommendation(r: SignedRecommendation): string {
  return `rec1.${b64.enc(JSON.stringify(r))}`;
}

/** Parse a pasted code. Returns null for anything that is not a well-formed recommendation. */
export function decodeRecommendation(code: string): SignedRecommendation | null {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith("rec1.")) return null;
    const r = JSON.parse(b64.dec(trimmed.slice(5)));
    if (
      !Number.isInteger(r.pid) || !isAddress(r.student) || !isAddress(r.recommender) ||
      !Number.isInteger(r.score) || r.score < 0 || r.score > 100 ||
      !Number.isInteger(r.deadline) || typeof r.signature !== "string" || !r.signature.startsWith("0x")
    ) return null;
    return r as SignedRecommendation;
  } catch {
    return null;
  }
}
