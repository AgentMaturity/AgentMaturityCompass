import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * G1-19/G1-20: orgRun wrote org-simulation DiagnosticReports and neutralImporter
 * wrote heuristic reconstructions of foreign traces into the SAME runs/
 * directory that real diagnostic runs use. `amc report` reads the newest file
 * there as the agent's latest score, so a synthetic report could be presented
 * as a real measurement.
 */
describe("synthetic and imported runs stay out of the real run store", () => {
  const orgRun = readFileSync(new URL("../src/org/orgRun.ts", import.meta.url), "utf8");
  const importer = readFileSync(new URL("../src/importers/neutralImporter.ts", import.meta.url), "utf8");

  it("org simulation writes to its own directory", () => {
    expect(orgRun).toContain('"org-runs"');
    expect(orgRun).toContain('"org-reports"');
    expect(orgRun).not.toContain("join(paths.runsDir, `${input.report.runId}.json`)");
  });

  it("org simulation no longer claims perfect integrity or confidence", () => {
    expect(orgRun).not.toContain('integrityIndex: input.status === "VALID" ? 1 : 0.72');
    expect(orgRun).not.toContain("evidenceTrustCoverage: { observed: 1");
    expect(orgRun).not.toContain('confidence: role.status === "completed" ? 0.94 : 0.76');
    expect(orgRun).toContain("integrityIndex: 0");
  });

  it("org simulation flags its question scores as simulation output", () => {
    expect(orgRun).toContain('"org-simulation"');
  });

  it("imported traces write to their own directory", () => {
    expect(importer).toContain('"imported-runs"');
    expect(importer).toContain('"imported-reports"');
    expect(importer).not.toContain("join(paths.runsDir, `${plan.importId}.json`)");
  });

  it("the real run store is only written by the diagnostic runner", () => {
    // Neither module may write a DiagnosticReport into runs/ any more.
    for (const source of [orgRun, importer]) {
      expect(source).not.toMatch(/writeFileAtomic\(\s*join\(paths\.runsDir/);
    }
  });
});
