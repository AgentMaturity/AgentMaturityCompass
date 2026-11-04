import { describe, expect, test } from "vitest";
import { generateFrameworkReport, listSupportedFrameworks } from "../src/score/crossFrameworkMapping.js";

describe("score crossFrameworkMapping", () => {
  test("listSupportedFrameworks returns all expected framework entries", () => {
    const supported = listSupportedFrameworks();
    expect(supported).toHaveLength(10);
    expect(supported.map((s) => s.framework)).toEqual([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2_TYPE2",
      "GDPR",
      "FORESIGHT_SAFETY",
      "AGENTIC_4C",
      "MITRE_ATLAS",
      "OWASP_API_TOP10",
      "PBSAI"
    ]);
  });

  test("framework metadata includes non-zero control counts and descriptions", () => {
    const supported = listSupportedFrameworks();
    for (const row of supported) {
      expect(row.controlCount).toBeGreaterThan(0);
      expect(row.description.length).toBeGreaterThan(8);
    }
  });

  test("SOC2 framework has article-level controls and zero coverage with no evidence", () => {
    const report = generateFrameworkReport("SOC2_TYPE2", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.coveredControls).toHaveLength(0);
    expect(report.gapControls.length).toBe(10);
    expect(report.targetMet).toBe(false);
  });

  test("GDPR framework has article-level controls and zero coverage with no evidence", () => {
    const report = generateFrameworkReport("GDPR", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.coveredControls).toHaveLength(0);
    expect(report.gapControls.length).toBe(17);
    expect(report.targetMet).toBe(false);
  });

  test("MITRE ATLAS has technique-level controls and zero coverage with no evidence", () => {
    const report = generateFrameworkReport("MITRE_ATLAS", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.gapControls.length).toBe(15);
    expect(report.targetMet).toBe(false);
  });

  test("OWASP API Top 10 has all 10 controls and zero coverage with no evidence", () => {
    const report = generateFrameworkReport("OWASP_API_TOP10", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.gapControls.length).toBe(10);
    expect(report.targetMet).toBe(false);
  });

  test("NIST report with no evidence has zero coverage and all controls as gaps", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.coveredControls).toHaveLength(0);
    expect(report.gapControls.length).toBe(12);
    expect(report.targetMet).toBe(false);
  });

  // P1-53: the tests below used to assert that a passed question or an active module covers a control, that coverage
  // counts toward a target, and that covered controls split into automated and manual. That encoded the wrong behaviour:
  // neither is evidence a control is met. Every control is now not_evaluated whatever the input.
  test.each([
    ["GDPR", ["AMC-1.7"], []],
    ["MITRE_ATLAS", ["AMC-3.3.1"], []],
    ["OWASP_API_TOP10", ["AMC-1.5"], []],
    ["NIST_AI_RMF", ["AMC-1.2", "AMC-1.2"], ["watch"]],
    ["NIST_AI_RMF", ["AMC-1.1", "AMC-1.2", "AMC-1.3", "AMC-1.4", "AMC-1.5", "AMC-1.6", "AMC-2.1", "AMC-2.2", "AMC-3.1", "AMC-3.2",
      "AMC-3.4", "AMC-3.4.1", "AMC-4.1", "AMC-4.2", "AMC-4.3", "AMC-4.5"], []],
    ["EU_AI_ACT", ["AMC-2.11"], ["ledger"]],
    ["ISO_42001", ["AMC-2.12"], []]
  ] as const)("%s ignores passed questions %j and active modules %j", (framework, passedQIDs, activeModules) => {
    const report = generateFrameworkReport(framework, { passedQIDs: [...passedQIDs], activeModules: [...activeModules] });
    expect(report.coveragePercent).toBe(0);
    expect(report.coveredControls).toEqual([]);
    expect(report.automatedControls).toEqual([]);
    expect(report.manualControls).toEqual([]);
    expect(report.targetMet).toBe(false);
    expect(report.controls.every((c) => c.status === "not_evaluated")).toBe(true);
    expect(report.gapControls).toHaveLength(report.controls.length);
  });

  test("P0-24 ATLAS ids stay listed: AML.T0051 prompt injection and AML.T0054 jailbreak, never AML.T0048", () => {
    const ids = generateFrameworkReport("MITRE_ATLAS", { passedQIDs: [], activeModules: [] }).controls.map((c) => c.id);
    expect(ids).toContain("AML.T0051");
    expect(ids).toContain("AML.T0054");
    expect(ids).not.toContain("AML.T0048");
  });

  test("gap control entries include both control id and control name", () => {
    const report = generateFrameworkReport("ISO_42001", { passedQIDs: [], activeModules: [] });
    expect(report.gapControls.length).toBeGreaterThan(0);
    expect(report.gapControls[0]).toMatch(/^ISO-\d+\.\d+ \(.+\)$/);
  });

  test("auditArtifacts are populated for every framework report", () => {
    const frameworks: Array<Parameters<typeof generateFrameworkReport>[0]> = [
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2_TYPE2",
      "GDPR",
      "FORESIGHT_SAFETY",
      "AGENTIC_4C",
      "MITRE_ATLAS",
      "OWASP_API_TOP10"
    ];
    for (const framework of frameworks) {
      const report = generateFrameworkReport(framework, { passedQIDs: [], activeModules: [] });
      expect(report.auditArtifacts.length).toBeGreaterThan(0);
    }
  });

});
