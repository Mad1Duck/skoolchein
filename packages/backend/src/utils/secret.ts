import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether `provided` is the configured shared secret. An unconfigured (empty) secret matches nothing,
 * and the comparison takes the same time however much of the value is right.
 */
export function secretMatches(provided: unknown, configured: string): boolean {
  if (!configured || typeof provided !== "string") return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(configured));
}
