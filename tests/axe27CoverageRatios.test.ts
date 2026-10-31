import { describe, expect, test } from "vitest";
import { generateFixPlan } from "../src/product/fixGenerator.js";
import { mapTracesToEvidence } from "../src/diagnostic/autoAnswer/traceEvidenceMapper.js";
import { RegulatoryMonitor, type RegulatoryChange } from "../src/compliance/regulatoryAutomation.js";
import { analyzeMCPSecurityResilience, computeNetResilientPerformance } from "../src/assurance/packs/mcpSecurityResiliencePack.js";
import { scoreMcpCompliance, type MCPCapabilityDeclaration } from "../src/score/mcpCompliance.js";
import { ratioOrNull, weightedMean } from "../src/utils/ratio.js";

const noMcpCapabilities: MCPCapabilityDeclaration = {
  supportsMcpProtocol: false, declaresToolManifest: false, toolsHaveInputSchemas: false,
  toolsHaveDescriptions: false, declaresResources: false, resourcesHaveUris: false,
  declaresPrompts: false, supportsSampling: false, supportsStdio: false, supportsHttp: false,
  validatesInputs: false, limitsCapabilities: false, supportsOauth: false,
  emitsReceiptsOnToolCall: false, supportsPolicyGates: false, hasAuditLog: false,
};

describe("AXE-27 missing coverage", () => {
  test("no gaps cannot claim measured fix coverage", () => {
    expect(generateFixPlan([], [])).toMatchObject({ coverage: null, outcome: "not_evaluated", sampleSize: 0 });
  });
  test("no tool calls cannot claim tool reliability", () => {
    expect(mapTracesToEvidence([]).metrics).toMatchObject({ toolSuccessRate: null, metricOutcomes: { toolSuccessRate: "not_evaluated" } });
  });
  test("no impacted controls cannot claim full regulatory coverage", () => {
    const change: RegulatoryChange = { id: "empty", framework: "test", changeType: "guidance_update", title: "empty", description: "empty", effectiveDate: 1, publishedDate: 1, impactedControls: [], source: "manual", sourceType: "manual", severity: "low", jurisdictions: [], humanReviewed: true, contentHash: "empty" };
    expect(new RegulatoryMonitor({ feeds: [] }).analyzeGap(change)).toMatchObject({ currentCoverage: null, projectedCoverage: null, outcome: "not_evaluated", sampleSize: 0 });
  });
  test("an empty fleet cannot claim measured zero compliance risk", () => {
    const change: RegulatoryChange = { id: "empty", framework: "test", changeType: "guidance_update", title: "empty", description: "empty", effectiveDate: 1, publishedDate: 1, impactedControls: ["risk_management"], source: "manual", sourceType: "manual", severity: "low", jurisdictions: [], humanReviewed: true, contentHash: "empty" };
    expect(new RegulatoryMonitor({ feeds: [] }).assessImpact(change, [])).toMatchObject({ complianceRisk: null, outcome: "not_evaluated", sampleSize: 0 });
    const result = new RegulatoryMonitor({ feeds: [] }).assessImpact(change, [{ agentId: "invalid", dimensionScores: { governance: Number.NaN } }]);
    expect(result.scoreImpact[0]).toMatchObject({ currentAvg: null, projectedAvg: null, delta: null, outcome: "not_evaluated" });
  });
  test("no MCP attacks cannot pass or yield finite attack metrics", () => {
    const result = analyzeMCPSecurityResilience([]);
    expect(result).toMatchObject({ passed: false, attackSuccessRate: null, performanceUnderAttack: null, outcome: "not_evaluated", sampleSize: 0 });
    expect(result.netResilientPerformance.score0to100).toBeNull();
  });
  test("missing MCP performance cannot become one", () => {
    const result = scoreMcpCompliance(noMcpCapabilities);
    expect(result.safety.securityResilience.netResilientPerformance.performanceUnderAttack).toBeNull();
    expect(computeNetResilientPerformance({ attackSuccessRate: 0, performanceUnderAttack: null }).score0to100).toBeNull();
  });
  test("nonfinite attack rates never become perfect defense", () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(computeNetResilientPerformance({ attackSuccessRate: value, performanceUnderAttack: 1 })).toMatchObject({ attackSuccessRate: null, score0to100: null, outcome: "not_evaluated" });
      expect(computeNetResilientPerformance({ attackSuccessRate: 0, performanceUnderAttack: value }).score0to100).toBeNull();
    }
  });
  test("ratios distinguish unavailable denominators and measured zero", () => {
    for (const den of [0, -1, Number.NaN, Infinity]) expect(ratioOrNull(0, den)).toBeNull();
    expect(ratioOrNull(Infinity, 1)).toBeNull();
    expect(ratioOrNull(Number.MAX_VALUE, Number.MIN_VALUE)).toBeNull();
    expect(ratioOrNull(0, 2)).toBe(0);
    expect(ratioOrNull(2, 2)).toBe(1);
    expect(weightedMean([[null, 1], [0.5, 2]])).toBe(0.5);
    expect(weightedMean([[null, 1]])).toBeNull();
    expect(weightedMean([[1, -1], [0.5, 2]])).toBe(0.5);
    expect(weightedMean([[Number.NaN, 1], [0.5, 2]])).toBe(0.5);
    expect(weightedMean([[1, Number.NaN], [0.5, 2]])).toBe(0.5);
    expect(weightedMean([[1, Infinity], [0.5, 2]])).toBe(0.5);
    expect(weightedMean([[1, 0]])).toBeNull();
  });
});
