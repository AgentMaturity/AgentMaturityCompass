import { describe, expect, test } from "vitest";
import type { DiagnosticReportClaimInput } from "../src/claims/eligibility/index.js";
import { buildGrcEvidenceManifest, grcManifestToSarif } from "../src/exports/grcEvidenceExport.js";

const NOW = 1_700_000_100_000;
const readyRun: DiagnosticReportClaimInput = {
  agentId: "agent-a", runId: "run-1", windowEndTs: 1_700_000_000_000,
  status: "VALID", verificationPassed: true, trustBoundaryViolated: false, trustBoundaryMessage: null,
  integrityIndex: 0.82, trustLabel: "HIGH TRUST", evidenceCoverage: 1,
  evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
  layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: 4.2, confidenceWeightedFinalLevel: 4.2 }],
  contradictionCount: 0
};

interface Sarif {
  runs: Array<{
    tool: { driver: { rules: Array<{ id: string }> } };
    results: Array<{ ruleId: string; level: string; message: { text: string } }>;
  }>;
}

describe("GRC evidence export (schema v2)", () => {
  test("emits schema v2 with the run claim, labelled signals and the disclaimer", () => {
    const m = buildGrcEvidenceManifest("SOC2", readyRun, { sealVerified: true, now: NOW });
    expect(m.schemaVersion).toBe("amc.grc-evidence.v2");
    expect(m.generatedAt).toBe(NOW);
    expect(m.controls.map((c) => c.controlId)).toEqual(["CC7.2", "CC7.3", "CC8.1"]);
    expect(m.run.signals.map((s) => s.name)).toEqual(["verification", "evidenceCoverage", "maturityLevel", "evidenceReadiness"]);
    expect(m.run.signals.every((s) => s.label === "Observed")).toBe(true);
    expect(m.run.signals.find((s) => s.name === "maturityLevel")?.value).toBe(4.2);
    expect(m.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(m.disclaimer).toMatch(/not a compliance determination/i);
    expect(m.disclaimer).toMatch(/experimental and not expert-reviewed/i);
  });

  test("identical input and now give an identical manifestHash", () => {
    for (const fw of ["SOC2", "NIST_AI_RMF", "ISO_42001", "EU_AI_ACT"] as const) {
      const a = buildGrcEvidenceManifest(fw, readyRun, { sealVerified: true, now: NOW });
      const b = buildGrcEvidenceManifest(fw, readyRun, { sealVerified: true, now: NOW });
      expect(a.manifestHash).toBe(b.manifestHash);
      expect(buildGrcEvidenceManifest(fw, readyRun, { sealVerified: true, now: NOW + 1 }).manifestHash).not.toBe(a.manifestHash);
    }
  });

  test("every SARIF rule id starts with AMC-GRC- and no message names a control", () => {
    const failing = buildGrcEvidenceManifest("ISO_42001", {
      ...readyRun, status: "INVALID", verificationPassed: false, evidenceCoverage: 0.1
    }, { sealVerified: false, now: NOW });
    const sarif = grcManifestToSarif(failing) as Sarif;
    const run = sarif.runs[0]!;
    expect(run.results.map((r) => [r.ruleId, r.level])).toEqual([
      ["AMC-GRC-RUN-UNVERIFIED", "error"],
      ["AMC-GRC-EVIDENCE-NOT-READY", "warning"],
      ["AMC-GRC-LOW-COVERAGE", "note"]
    ]);
    for (const id of [...run.tool.driver.rules.map((r) => r.id), ...run.results.map((r) => r.ruleId)]) {
      expect(id).toMatch(/^AMC-GRC-/);
    }
    for (const result of run.results) {
      for (const control of failing.controls) expect(result.message.text).not.toContain(control.controlId);
      expect(result.message.text).not.toMatch(/PASS|PARTIAL|FAIL|not evaluated/i);
    }
  });

  test("a sealed, READY, full-coverage run gives no SARIF error", () => {
    const sarif = grcManifestToSarif(buildGrcEvidenceManifest("ISO_42001", readyRun, { sealVerified: true, now: NOW })) as Sarif;
    expect(sarif.runs[0]!.results.filter((r) => r.level === "error")).toEqual([]);
    expect(sarif.runs[0]!.results).toEqual([]);
  });
});
