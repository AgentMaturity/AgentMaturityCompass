/**
 * One trust-weight table (vault lane, 2026-11-16): src/score/trustWeights.ts holds the only tier -> number table, and
 * the modules that used to keep their own (claim confidence, community governance, meta-confidence) read it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { TRUST_WEIGHTS } from "../src/score/trustWeights.js";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("trust weights", () => {
  test("no source file other than trustWeights.ts writes its own tier weight numbers", () => {
    const table = /\b(?:SELF_REPORTED|ATTESTED|OBSERVED|selfReported|attested|observed)\s*(?::|\*)\s*\d+\.\d+\s*[,)+}]/; // decimal weights, not zeroed counters
    const offenders = sources("src").filter(path => !path.endsWith(join("score", "trustWeights.ts")))
      .filter(path => /claimConfidence|communityGovernance|metaConfidence/.test(path) && table.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
    for (const path of ["src/claims/claimConfidence.ts", "src/org/communityGovernance.ts", "src/diagnostic/metaConfidence.ts"]) {
      expect(readFileSync(path, "utf8")).toContain('from "../score/trustWeights.js"');
    }
  });

  test("the table says what it does: observed above attested above self-reported, and no weight applied to a level", () => {
    expect(TRUST_WEIGHTS.OBSERVED).toBeGreaterThan(TRUST_WEIGHTS.ATTESTED);
    expect(TRUST_WEIGHTS.ATTESTED).toBeGreaterThan(TRUST_WEIGHTS.SELF_REPORTED);
    expect(readFileSync("src/score/trustWeights.ts", "utf8")).toMatch(/No trust weight is applied to a maturity level/);
  });
});
