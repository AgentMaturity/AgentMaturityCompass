import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TRUST_WEIGHTS, EVIDENCE_KIND_WEIGHTS, evidenceDecay, EVIDENCE_HALF_LIFE_MS } from "../src/score/trustWeights.js";
import { TRUST_WEIGHTS as INGESTION_WEIGHTS } from "../src/score/evidenceIngestion.js";

/**
 * G8-16: three tables described the same concept with different numbers.
 * SELF_REPORTED was 0.5 in score/evidenceIngestion and 0.4 in score/formalSpec
 * and score/modelDrift, so identical evidence scored differently depending on
 * which path processed it. The published methodology states 0.4.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("evidence trust weights", () => {
  it("every consumer reads the same table", () => {
    expect(INGESTION_WEIGHTS).toBe(TRUST_WEIGHTS);
  });

  it("matches the published methodology", () => {
    expect(TRUST_WEIGHTS.OBSERVED).toBe(1.0);
    expect(TRUST_WEIGHTS.ATTESTED).toBe(0.8);
    // The value the README and whitepaper state.
    expect(TRUST_WEIGHTS.SELF_REPORTED).toBe(0.4);
  });

  it("orders tiers by how much corroboration each carries", () => {
    expect(TRUST_WEIGHTS.OBSERVED_HARDENED).toBeGreaterThan(TRUST_WEIGHTS.OBSERVED);
    expect(TRUST_WEIGHTS.OBSERVED).toBeGreaterThan(TRUST_WEIGHTS.ATTESTED);
    expect(TRUST_WEIGHTS.ATTESTED).toBeGreaterThan(TRUST_WEIGHTS.SELF_REPORTED);
    expect(TRUST_WEIGHTS.SELF_REPORTED).toBeGreaterThan(TRUST_WEIGHTS.UNVERIFIED);
  });

  it("keeps the lowercase kind weights in step with the tiers", () => {
    expect(EVIDENCE_KIND_WEIGHTS.observed).toBe(TRUST_WEIGHTS.OBSERVED);
    expect(EVIDENCE_KIND_WEIGHTS.attested).toBe(TRUST_WEIGHTS.ATTESTED);
    expect(EVIDENCE_KIND_WEIGHTS.self_reported).toBe(TRUST_WEIGHTS.SELF_REPORTED);
  });

  it("decays evidence on the documented 90-day half-life", () => {
    expect(evidenceDecay(0)).toBe(1);
    // One half-life should halve the weight.
    expect(evidenceDecay(EVIDENCE_HALF_LIFE_MS)).toBeCloseTo(0.5, 3);
    expect(evidenceDecay(EVIDENCE_HALF_LIFE_MS * 2)).toBeCloseTo(0.25, 3);
  });

  it("no scorer hardcodes its own weights any more", () => {
    for (const file of ["formalSpec.ts", "modelDrift.ts", "evidenceIngestion.ts"]) {
      const src = readFileSync(join(repoRoot, "src/score", file), "utf8");
      expect(src, file).toContain("trustWeights.js");
      // The literal that diverged.
      expect(src, file).not.toMatch(/SELF_REPORTED:\s*0\.5/);
    }
  });
});
