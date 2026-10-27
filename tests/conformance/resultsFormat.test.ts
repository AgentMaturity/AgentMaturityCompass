import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { conformanceResultsV1Schema } from "../../src/contracts/index.js";
import { DOUBLES, runConformance } from "./runConformance.js";

const correct = `${process.execPath} ${DOUBLES}/verifierDouble.mjs correct verify {artifact} {verifierArgs}`;

describe("conformance-results v1 (P1-32)", () => {
  test("a run's results parse as the contract and name the suite version and fixture digest", () => {
    const { raw } = runConformance("verifier", correct, ["--cases", "VER-00*", "--name", "amc-verify", "--impl-version", "0.1.0"]);
    const results = conformanceResultsV1Schema.parse(raw);
    expect(results).toMatchObject({ suiteVersion: "1.0.0", specVersion: "1.0", class: "verifier", implementation: { name: "amc-verify", version: "0.1.0" } });
    expect(results.fixtureSetDigest).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  test("conformant is false when a normative case is skipped, and the contract refuses a file that says otherwise", () => {
    const { raw, status } = runConformance("verifier", correct, ["--cases", "VER-001"]);
    const results = conformanceResultsV1Schema.parse(raw);
    expect(results.cases.filter(item => item.outcome === "skipped").length).toBeGreaterThan(0);
    expect(results.conformant).toBe(false);
    expect(status).toBe(1);
    expect(conformanceResultsV1Schema.safeParse({ ...results, conformant: true }).success).toBe(false);
  }, 120_000);

  test("the committed AMC verifier results are conformant under the current fixture set", () => {
    const committed = conformanceResultsV1Schema.parse(JSON.parse(readFileSync("spec/conformance/results/amc-verify-0.1.0.json", "utf8")));
    const { raw } = runConformance("verifier", correct, ["--cases", "VER-001"]);
    expect(committed).toMatchObject({ class: "verifier", conformant: true });
    // A fixture or manifest change makes the committed file stale; regenerate it with npm run conformance:verifier.
    expect(committed.fixtureSetDigest).toBe((raw as { fixtureSetDigest: string }).fixtureSetDigest);
  }, 120_000);
});
