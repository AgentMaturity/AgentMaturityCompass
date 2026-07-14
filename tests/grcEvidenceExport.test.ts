import { describe, expect, test } from "vitest";
import { buildGrcEvidenceManifest, grcManifestToSarif, type GrcReportInput } from "../src/exports/grcEvidenceExport.js";

const readyReport: GrcReportInput = {
  agentId: "agent-a", runId: "run-1", ts: 1_700_000_000_000,
  status: "VALID", verificationPassed: true, integrityIndex: 0.82,
  evidenceCoverage: 0.9, overallLevel: 4.2, layers: [], evidenceReadiness: "READY"
};

describe("GRC evidence export", () => {
  test("READY high-maturity run passes controls and is claim-eligible", () => {
    const m = buildGrcEvidenceManifest("SOC2", readyReport);
    expect(m.schemaVersion).toBe("amc.grc-evidence.v1");
    expect(m.claimEligible).toBe(true);
    expect(m.controls.length).toBeGreaterThanOrEqual(3);
    expect(m.controls.every((c) => c.status === "PASS")).toBe(true);
    expect(m.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(m.disclaimer).toMatch(/not legal certification/i);
  });

  test("non-READY evidence marks every control NOT_READY and not claim-eligible", () => {
    const m = buildGrcEvidenceManifest("EU_AI_ACT", { ...readyReport, evidenceReadiness: "INSUFFICIENT_EVIDENCE" });
    expect(m.claimEligible).toBe(false);
    expect(m.controls.every((c) => c.status === "NOT_READY")).toBe(true);
  });

  test("all four frameworks produce mapped controls deterministically", () => {
    for (const fw of ["SOC2", "NIST_AI_RMF", "ISO_42001", "EU_AI_ACT"] as const) {
      const a = buildGrcEvidenceManifest(fw, readyReport);
      const b = buildGrcEvidenceManifest(fw, readyReport);
      expect(a.manifestHash).toBe(b.manifestHash);
      expect(a.controls.length).toBeGreaterThan(0);
    }
  });

  test("SARIF export surfaces only non-passing controls as findings", () => {
    const failing = buildGrcEvidenceManifest("ISO_42001", { ...readyReport, verificationPassed: false, status: "INVALID", evidenceCoverage: 0.1, overallLevel: 1 });
    const sarif = grcManifestToSarif(failing) as { runs: Array<{ results: unknown[] }> };
    expect(sarif.runs[0]!.results.length).toBeGreaterThan(0);
    const clean = grcManifestToSarif(buildGrcEvidenceManifest("ISO_42001", readyReport)) as { runs: Array<{ results: unknown[] }> };
    expect(clean.runs[0]!.results.length).toBe(0);
  });
});
