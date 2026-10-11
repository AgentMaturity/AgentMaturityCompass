import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { exitCode, REASON_CODES, verifyArtifact } from "../../packages/verifier/src/index.js";
import { caseNames, DIMENSIONS, loadCase } from "./fixtures.js";

const SPEC_CASES = ["valid-attestation", "valid-external-evidence-attested", "forged-embedded-key", "unpinned-issuer", "wrong-purpose",
  "revoked-key-compromise", "revoked-superseded-earlier-claim", "distrusted-key", "stale-attestation", "stale-trust-list", "replayed",
  "contradictory", "cross-tenant", "empty", "missing-evidence", "unanchored", "backdated", "tampered", "rollback-revocation-list"];

const scratch = mkdtempSync(join(tmpdir(), "amc-verifier-conformance-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("normative fixtures, in process", () => {
  test("the corpus holds every case the spec names and a fixture for every reason code", () => {
    const names = caseNames();
    expect(names).toEqual(expect.arrayContaining(SPEC_CASES));
    const used = new Set(names.flatMap(name => Object.values(loadCase(name).expected.reasonCodes).flat()));
    expect(Object.values(REASON_CODES).flat().filter(code => !used.has(code))).toEqual([]);
  });

  test.each(caseNames())("%s", name => {
    const { bytes, options, expected } = loadCase(name);
    const report = verifyArtifact(bytes, options);
    for (const dimension of DIMENSIONS) {
      expect(report[dimension].status, dimension).toBe(expected.dimensions[dimension]);
      expect(report.reasonCodes[dimension], dimension).toEqual(expect.arrayContaining(expected.reasonCodes[dimension] ?? []));
    }
    expect(exitCode(report)).toBe(expected.exitCode);
    // Satisfaction never passes unless every other dimension passed.
    if (report.satisfaction.status === "pass") expect(DIMENSIONS.every(dimension => report[dimension].status === "pass")).toBe(true);
  });

  test("the superseded-key case passes only with a claimed-time warning", () => {
    const { bytes, options } = loadCase("revoked-superseded-earlier-claim");
    const report = verifyArtifact(bytes, options);
    expect(report.warnings.join("\n")).toMatch(/timeBasis: claimed/);
    expect(report.issuerAdmission.signatures[0]).toMatchObject({ status: "admitted", timeBasis: "claimed" });
  });
});

describe("conformance runner against the package CLI", () => {
  test("passes 100% of the cases and writes conformance-results.json", () => {
    const out = join(scratch, "conformance-results.json");
    const run = spawnSync(process.execPath, ["packages/verifier/conformance/run.mjs", "--cmd", `${process.execPath} packages/verifier/bin/amc-verify.mjs`, "--out", out],
      { encoding: "utf8", timeout: 120_000 });
    expect(run.stderr).toBe("");
    expect(run.status, run.stdout).toBe(0);
    const results = JSON.parse(readFileSync(out, "utf8")) as { suite: string; version: string; implementation: string; passed: number; failed: number; cases: unknown[] };
    expect(results).toMatchObject({ suite: "amc-verifier-fixtures", version: "v1", implementation: "amc-verify@0.1.0", failed: 0 });
    expect(results.passed).toBe(caseNames().length);
  }, 120_000);

  test("a verifier that disagrees fails the run and says where", () => {
    // A command that admits everything: prints one all-pass report whatever it is asked.
    const liar = join(scratch, "liar.mjs");
    const pass = { status: "pass" };
    const report = { integrity: pass, issuerAdmission: pass, scope: pass, freshness: pass, completeness: pass, satisfaction: pass, reasonCodes: {} };
    writeFileSync(liar, `process.stdout.write(${JSON.stringify(JSON.stringify(report))});`);
    const out = join(scratch, "liar-results.json");
    const run = spawnSync(process.execPath, ["packages/verifier/conformance/run.mjs", "--cmd", `${process.execPath} ${liar}`, "--out", out], { encoding: "utf8", timeout: 120_000 });
    expect(run.status).toBe(1);
    const results = JSON.parse(readFileSync(out, "utf8")) as { passed: number; cases: Array<{ case: string; result: string; diff: unknown }> };
    expect(results.cases.find(item => item.case === "forged-embedded-key")).toMatchObject({ result: "fail", diff: { dimensions: { issuerAdmission: { expected: "fail", actual: "pass" } } } });
    expect(results.passed).toBeLessThan(caseNames().length);
  }, 120_000);
});
