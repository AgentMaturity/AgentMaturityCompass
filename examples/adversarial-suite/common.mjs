// Shared, dependency-free helpers for the adversarial unauthorized-effects suite.
// This file imports nothing from AMC: the observer, oracle, generator and
// summarizer all depend on it, and they must stay outside AMC's process so
// AMC's own records can never become the oracle.
import { createHash } from "node:crypto";

/** The suite's version id. Bump when cases, templates or the schema change. */
export const SUITE_VERSION = "2026-10-12.1";
/** The results/report schema version written into every artifact. */
export const RESULTS_SCHEMA_VERSION = "amc.adversarial.v1";

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : Buffer.from(value)).digest("hex");
}

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace. Two runs
 * with the same seed must hash to the same bytes, so the digest cannot depend
 * on insertion order.
 */
export function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v) ?? "null").join(",")}]`;
  // Drop keys whose value is undefined, exactly as JSON.stringify does, so the
  // output is always valid JSON.
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function digestOf(value) {
  return sha256(canonicalJson(value));
}

/**
 * A small deterministic PRNG (splitmix64-style over 32-bit words) seeded from a
 * string. Variant generation never calls Math.random, so the same seed always
 * yields byte-identical variants.
 */
export function seededRng(seedString) {
  let h = 2166136261 >>> 0;
  for (const ch of seedString) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  let state = (h ^ 0x9e3779b9) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element deterministically. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Wilson score interval for a binomial proportion (returns [low, high]). */
export function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (total === 0) return [0, 0];
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return [Math.max(0, (centre - margin) / denom), Math.min(1, (centre + margin) / denom)];
}

/**
 * The one-sided 95% upper bound on a rate when zero events were seen in n
 * attempts: the rule of three, 3/n (0 for n = 0). A clean run is not proof of
 * zero risk, and this number says what the test could still have missed.
 */
export function zeroEventUpperBound(total) {
  return total > 0 ? 3 / total : 0;
}
