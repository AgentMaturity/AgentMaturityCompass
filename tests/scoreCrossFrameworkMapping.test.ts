import { describe, expect, test } from "vitest";
import { generateFrameworkReport, listSupportedFrameworks } from "../src/score/crossFrameworkMapping.js";

describe("score crossFrameworkMapping", () => {
  test("listSupportedFrameworks returns all expected framework entries", () => {
    const supported = listSupportedFrameworks();
    expect(supported).toHaveLength(5);
    expect(supported.map((s) => s.framework)).toEqual([
      "NIST_AI_RMF",
      "ISO_42001",
      "EU_AI_ACT",
      "SOC2_TYPE2",
      "GDPR"
    ]);
  });

  test("framework metadata includes non-zero control counts and descriptions", () => {
    const supported = listSupportedFrameworks();
    for (const row of supported) {
      expect(row.controlCount).toBeGreaterThan(0);
      expect(row.description.length).toBeGreaterThan(8);
    }
  });

  test("SOC2 framework uses built-in fallback report behavior", () => {
    const report = generateFrameworkReport("SOC2_TYPE2", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(80);
    expect(report.coveredControls).toEqual(["existing-amc-modules"]);
    expect(report.certificationReadiness).toBe(true);
  });

  test("GDPR framework uses built-in fallback report behavior", () => {
    const report = generateFrameworkReport("GDPR", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(80);
    expect(report.automatedControls).toEqual(["existing-amc-modules"]);
    expect(report.certificationReadiness).toBe(true);
  });

  test("NIST report with no evidence has zero coverage and all controls as gaps", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", { passedQIDs: [], activeModules: [] });
    expect(report.coveragePercent).toBe(0);
    expect(report.coveredControls).toHaveLength(0);
    expect(report.gapControls.length).toBe(12);
    expect(report.certificationReadiness).toBe(false);
  });

  test("NIST coverage can be satisfied by AMC question IDs", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: ["AMC-1.2"],
      activeModules: []
    });
    expect(report.coveredControls).toEqual(["GOVERN-1.2"]);
    expect(report.automatedControls).toEqual(["GOVERN-1.2"]);
  });

  test("NIST coverage can also be satisfied by active modules", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: [],
      activeModules: ["watch"]
    });
    expect(report.coveredControls).toContain("MEASURE-2.5");
  });

  test("NIST non-automatable controls are placed in manualControls", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: ["AMC-3.4"],
      activeModules: []
    });
    expect(report.coveredControls).toContain("MEASURE-2.8");
    expect(report.manualControls).toContain("MEASURE-2.8");
    expect(report.automatedControls).not.toContain("MEASURE-2.8");
  });

  test("coveragePercent uses rounded integer percent", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: ["AMC-1.2"], // 1/12 controls
      activeModules: []
    });
    expect(report.coveragePercent).toBe(8);
  });

  test("NIST readiness becomes true when coverage threshold is fully met", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: [
        "AMC-1.1",
        "AMC-1.2",
        "AMC-1.3",
        "AMC-1.4",
        "AMC-1.5",
        "AMC-1.6",
        "AMC-2.1",
        "AMC-2.2",
        "AMC-3.1",
        "AMC-3.2",
        "AMC-3.4",
        "AMC-4.1",
        "AMC-4.2",
        "AMC-4.3",
        "AMC-4.5"
      ],
      activeModules: []
    });
    expect(report.coveragePercent).toBeGreaterThanOrEqual(80);
    expect(report.gapControls.length).toBeLessThanOrEqual(2);
    expect(report.certificationReadiness).toBe(true);
  });

  test("NIST readiness stays false for low coverage", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: ["AMC-1.2", "AMC-1.4"],
      activeModules: []
    });
    expect(report.coveragePercent).toBeLessThan(80);
    expect(report.certificationReadiness).toBe(false);
  });

  test("EU AI Act manual controls include EU-61 when AMC-2.1 is covered", () => {
    const report = generateFrameworkReport("EU_AI_ACT", {
      passedQIDs: ["AMC-2.1"],
      activeModules: []
    });
    expect(report.coveredControls).toContain("EU-61");
    expect(report.manualControls).toContain("EU-61");
  });

  test("ISO 42001 manual controls include ISO-8.4 when AMC-3.1 is covered", () => {
    const report = generateFrameworkReport("ISO_42001", {
      passedQIDs: ["AMC-3.1"],
      activeModules: []
    });
    expect(report.coveredControls).toContain("ISO-8.4");
    expect(report.manualControls).toContain("ISO-8.4");
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
      "GDPR"
    ];
    for (const framework of frameworks) {
      const report = generateFrameworkReport(framework, { passedQIDs: [], activeModules: [] });
      expect(report.auditArtifacts.length).toBeGreaterThan(0);
    }
  });

  test("duplicate QIDs in input do not duplicate control IDs in output", () => {
    const report = generateFrameworkReport("NIST_AI_RMF", {
      passedQIDs: ["AMC-1.2", "AMC-1.2", "AMC-1.2"],
      activeModules: []
    });
    expect(new Set(report.coveredControls).size).toBe(report.coveredControls.length);
  });

  test("control coverage uses OR logic between QIDs and modules", () => {
    const report = generateFrameworkReport("EU_AI_ACT", {
      passedQIDs: [],
      activeModules: ["ledger"]
    });
    expect(report.coveredControls).toContain("EU-12");
  });
});
