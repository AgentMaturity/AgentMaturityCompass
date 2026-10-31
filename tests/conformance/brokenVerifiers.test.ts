import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DOUBLES, outcomeOf, runConformance, verifierCaseId } from "./runConformance.js";

const double = (mode: string) => `${process.execPath} ${DOUBLES}/verifierDouble.mjs ${mode} verify {artifact} {verifierArgs}`;

describe("verifier class (P1-32)", () => {
  test("the manifest has one normative case per P1-06 fixture, mirroring each fixture's own normative flag", () => {
    const manifest = JSON.parse(readFileSync("spec/conformance/v1/verifier.json", "utf8")) as { cases: Array<{ id: string; name: string; normative: boolean; fixture: string }> };
    const fixtures = readdirSync("spec/fixtures/v1").filter(name => existsSync(join("spec/fixtures/v1", name, "expected.json"))).sort();
    expect(manifest.cases.map(item => item.name).sort()).toEqual(fixtures);
    for (const item of manifest.cases) {
      expect(item.fixture).toBe(`spec/fixtures/v1/${item.name}/`);
      expect(item.normative).toBe((JSON.parse(readFileSync(join(item.fixture, "expected.json"), "utf8")) as { normative: boolean }).normative);
    }
  });

  test("a correct verifier passes every case and is conformant", () => {
    const { status, results } = runConformance("verifier", double("correct"));
    expect(results?.cases.filter(item => item.outcome !== "pass")).toEqual([]);
    expect(results).toMatchObject({ conformant: true });
    expect(results!.summary.normativePassed).toBe(results!.summary.normativeTotal);
    expect(status).toBe(0);
  }, 300_000);

  // Each broken double must lose a named normative case, and the run must not be conformant.
  test.each([
    ["trust-embedded-key", "forged-embedded-key", "fail"],
    ["ignore-revocation", "revoked-key-compromise", "fail"],
    ["ignore-as-of", "stale-attestation", "fail"],
    ["ignore-as-of", "key-expired", "fail"],
    ["merge-results", "empty", "fail"],
    ["crash-on-empty", "empty", "error"]
  ])("%s fails %s (%s)", (mode, fixture, outcome) => {
    const { status, results } = runConformance("verifier", double(mode));
    expect(outcomeOf(results, verifierCaseId(fixture))).toBe(outcome);
    expect(results?.conformant).toBe(false);
    expect(status).toBe(1);
  }, 300_000);
});
