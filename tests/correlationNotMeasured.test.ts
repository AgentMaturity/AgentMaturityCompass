import { describe, expect, test } from "vitest";
import { correlateTracesAgainstEvidence } from "../src/correlation/correlate.js";
import { correlationWarnings } from "../src/correlation/correlationReport.js";
import { evaluateAssuranceEvidenceGates } from "../src/assurance/assuranceScoring.js";
import { defaultAssurancePolicy } from "../src/assurance/assurancePolicySchema.js";
import { evaluateValueEvidenceGates } from "../src/value/valueEvidenceGates.js";
import { defaultValuePolicy } from "../src/value/valuePolicySchema.js";
import { evaluateDriftRules } from "../src/drift/driftRules.js";
import { defaultAlertsConfig } from "../src/drift/alerts.js";
import { deriveTrustSummaryFromRun } from "../src/governor/actionPolicyEngine.js";
import type { DiagnosticReport } from "../src/types.js";
import { CustomerSupportBot } from "../src/agents/customerSupportBot.js";

/**
 * AXE-27 remainder: a window in which no trace carried a receipt measured no correlation. It published
 * `correlationRatio: 0`, which read as a measured total failure; it is null now, and every gate reads null as
 * "not measured", never as 0 and never as passing.
 */
describe("correlation over a window with no receipted trace", () => {
  test("is null, not 0, and raises no low-correlation issue or warning", () => {
    const metrics = correlateTracesAgainstEvidence({ events: [], monitorPublicKeys: [], expectedAgentId: "default" });
    expect(metrics.totalTracesWithReceipt).toBe(0);
    expect(metrics.correlationRatio).toBeNull();
    expect(metrics.issues.map((issue) => issue.auditType)).not.toContain("TRACE_CORRELATION_LOW");
    expect(correlationWarnings(metrics).join("\n")).not.toMatch(/below recommended/);
  });

  test("blocks an assurance certificate as not measured", () => {
    const result = evaluateAssuranceEvidenceGates({ policy: defaultAssurancePolicy(),
      gates: { integrityIndex: 1, correlationRatio: null, observedShare: 1 } });
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["correlationRatio not measured"]);
  });

  test("fails the value strong-claim gate as not measured", () => {
    const result = evaluateValueEvidenceGates(defaultValuePolicy(), { integrityIndex: 1, correlationRatio: null,
      observedShare: 1, selfReportedShare: 0, notaryRequired: false, notaryHealthy: true });
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["correlationRatio not measured"]);
  });

  test("a policy minimum of 0 sets no correlation requirement, so not measured passes it", () => {
    const assurance = defaultAssurancePolicy();
    assurance.assurancePolicy.gates.minCorrelationRatio = 0;
    expect(evaluateAssuranceEvidenceGates({ policy: assurance, gates: { integrityIndex: 1, correlationRatio: null, observedShare: 1 } }).ok)
      .toBe(true);
    const value = defaultValuePolicy();
    value.valuePolicy.evidenceGates.minCorrelationRatioForStrongClaims = 0;
    expect(evaluateValueEvidenceGates(value, { integrityIndex: 1, correlationRatio: null, observedShare: 1, selfReportedShare: 0,
      notaryRequired: false, notaryHealthy: true }).reasons).not.toContain("correlationRatio not measured");
  });

  test("the governor's summary without a run carries null, not a measured 0", () => {
    expect(deriveTrustSummaryFromRun("/nonexistent", "default", null, null).correlationRatio).toBeNull();
  });
});

describe("drift with an unmeasured correlation", () => {
  const run = (runId: string, ts: number, correlationRatio: number | null): DiagnosticReport => ({
    runId, agentId: "default", ts, windowStartTs: 0, windowEndTs: 100, status: "VALID", integrityIndex: 1, correlationRatio,
    layerScores: [{ layerName: "Skills", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }]
  }) as unknown as DiagnosticReport;
  const config = (correlationDropBelow: number) => {
    const out = defaultAlertsConfig();
    out.alerts.rules = [{ ...out.alerts.rules[0]!, when: { overallDropGte: 1, layerDropGte: 1, integrityDropGte: 1,
      correlationDropBelow, assuranceDropBelow: {} } }];
    return out;
  };
  const evaluate = (correlationDropBelow: number, previous: number | null, current: number | null) =>
    evaluateDriftRules({ config: config(correlationDropBelow), previousRun: run("a", 1, previous), currentRun: run("b", 2, current),
      assuranceByPack: new Map() });

  test("is comparable and reports insufficient evidence where a correlation threshold is set", () => {
    const result = evaluate(0.9, 0.95, null);
    expect(result.triggered).toBe(true);
    expect(result.reasons).toContain("correlation not measured (INSUFFICIENT_EVIDENCE)");
  });

  test("raises nothing where the rule sets no correlation threshold", () => {
    expect(evaluate(0, 0.95, null).triggered).toBe(false);
  });

  test("an unmeasured baseline run is left out of the correlation drop, not read as 0", () => {
    expect(evaluate(0, null, 0.95).deltas.correlationDrop).toBe(0);
    expect(evaluate(0.5, null, 0.4).reasons).toContain("correlation 0.4 < 0.5");
  });
});

describe("a rate over zero events", () => {
  test("support bot escalation and SLA breach rates are null with no tickets", () => {
    const stats = new CustomerSupportBot().getBotStats();
    expect(stats.escalationRate).toBeNull();
    expect(stats.slaBreachRate).toBeNull();
  });
});
