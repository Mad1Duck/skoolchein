/**
 * What a creator asks of the scholar for one milestone, kept inside the plan's existing description
 * string so no contract change is needed:
 *
 *   {"v":1,"proof":true,"text":"Upload the graduation certificate (PDF)"}
 *
 * A description saved before this existed is plain text; it reads as "no proof required".
 */
export interface MilestoneSpec {
  /** The scholar must hand in evidence (text and/or files) for this milestone. */
  proof: boolean;
  /** The creator's instruction to the scholar. */
  text: string;
}

export function encodeSpec(spec: MilestoneSpec): string {
  const text = spec.text.trim();
  if (!spec.proof && !text) return '';
  return JSON.stringify({ v: 1, proof: spec.proof, text });
}

export function decodeSpec(raw: string | undefined | null): MilestoneSpec {
  const s = (raw ?? '').trim();
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s) as { v?: number; proof?: unknown; text?: unknown };
      if (j && j.v === 1) return { proof: j.proof === true, text: typeof j.text === 'string' ? j.text : '' };
    } catch {
      /* plain text that happens to start with "{" */
    }
  }
  return { proof: false, text: s };
}
