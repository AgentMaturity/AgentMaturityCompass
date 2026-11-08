import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison (LIVE-RUNTIME-08). Both sides are hashed to equal-length digests, so the time taken
 * leaks neither the content nor the length of the secret. An empty or non-string value never matches, so an empty
 * configured secret is never met by an empty header.
 */
export function secretEquals(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== "string" || typeof expected !== "string" || provided.length === 0 || expected.length === 0) return false;
  const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(expected));
}
