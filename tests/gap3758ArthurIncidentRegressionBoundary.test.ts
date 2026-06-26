import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildIncidentRegressionReceipt,
  buildIncidentRegressionWatchAlerts,
  type IncidentRegressionGeneratedTest,
  type IncidentRegressionTraceRow,
  type IncidentRegressionValidationRun,
} from "../src/incidents/incidentRegression.js";

const DOC = "docs/source-reviews/GAP-3758-arthur-incident-regression.md";
const HOMEPAGE = "https://www.arthur.ai";
const PLATFORM = "https://www.arthur.ai/platform";
const EVAL_PAGE = "https://www.arthur.ai/ai-performance-eval";
const PRODUCTION_EVAL = "https://www.arthur.ai/column/evaluating-ai-agents-in-production";
const DOCS_OVERVIEW = "https://docs.arthur.ai/docs/overview";
const REPO = "https://github.com/arthur-ai/arthur-engine";
const API = "https://api.github.com/repos/arthur-ai/arthur-engine";
const README = "https://raw.githubusercontent.com/arthur-ai/arthur-engine/main/README.md";

const implementationFiles = [
  "src/incidents/incidentRegression.ts",
  "src/incidents/index.ts",
  "src/index.ts",
];

function trace(overrides: Partial<IncidentRegressionTraceRow> = {}): IncidentRegressionTraceRow {
  return {
    incidentId: "incident-gap3758",
    traceId: "trace-gap3758",
    agentId: "agent-gap3758",
    timestamp: "2026-06-26T02:05:00.000Z",
    failureMode: "tool_timeout",
    riskEvent: "customer_escalation",
    promptBoundary: "support-triage",
    toolBoundary: "ticket-search",
    latencyMs: 4_800,
    costUsd: 0.12,
    remediationState: "mitigated",
    evidenceRefs: ["trace-row-hash", "runtime-receipt"],
    ...overrides,
  };
}

function generatedTest(overrides: Partial<IncidentRegressionGeneratedTest> = {}): IncidentRegressionGeneratedTest {
  return {
    testId: "regression-gap3758-tool-timeout",
    sourceIncidentId: "incident-gap3758",
    sourceTraceId: "trace-gap3758",
    name: "Tool timeout falls back to human review",
    assertion: "When ticket search exceeds the timeout budget, the agent must escalate with a stable fallback response.",
    expectedOutcome: "fallback_escalation",
    evidenceRefs: ["generated-test-receipt", "test-fixture-hash"],
    ...overrides,
  };
}

function validationRun(overrides: Partial<IncidentRegressionValidationRun> = {}): IncidentRegressionValidationRun {
  return {
    runId: "validation-gap3758",
    testId: "regression-gap3758-tool-timeout",
    status: "passed",
    validatedAt: "2026-06-26T02:30:00.000Z",
    evidenceRefs: ["validation-run-receipt", "ci-run-hash"],
    ...overrides,
  };
}

describe("GAP-3758 Arthur incident-to-regression boundary", () => {
  it("documents live Arthur AI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-3758");
    expect(doc).toContain("Arthur AI");
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain(PLATFORM);
    expect(doc).toContain(EVAL_PAGE);
    expect(doc).toContain(PRODUCTION_EVAL);
    expect(doc).toContain(DOCS_OVERVIEW);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain("Monitoring across the entire AI lifecycle");
    expect(doc).toContain("Continuous AI Evaluation");
    expect(doc).toContain("Evaluating AI Agents in Production");
    expect(doc).toContain("Trace Visualization & Analysis");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("alerts");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Incident trace, generated test, validation run, and closure status");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("requires incident traces to become generated regression tests before closure is ready", () => {
    const receipt = buildIncidentRegressionReceipt({
      generatedAt: "2026-06-26T02:45:00.000Z",
      sourceRefs: [PLATFORM, PRODUCTION_EVAL],
      traces: [
        trace(),
        trace({
          incidentId: "incident-gap3758",
          traceId: "trace-gap3758-policy",
          failureMode: "policy_gap",
          riskEvent: "guardrail_miss",
          promptBoundary: "support-resolution",
          toolBoundary: "refund-tool",
          latencyMs: 1_700,
          costUsd: 0.04,
          remediationState: "closed",
          evidenceRefs: ["policy-trace-row-hash"],
        }),
      ],
      generatedTests: [
        generatedTest(),
        generatedTest({
          testId: "regression-gap3758-policy-gap",
          sourceTraceId: "trace-gap3758-policy",
          name: "Refund tool remains policy gated",
          assertion: "Refund requests above the policy threshold must require supervisor approval.",
          expectedOutcome: "approval_required",
          evidenceRefs: ["policy-regression-test-receipt"],
        }),
      ],
      validationRuns: [
        validationRun(),
        validationRun({
          runId: "validation-gap3758-policy",
          testId: "regression-gap3758-policy-gap",
          evidenceRefs: ["policy-validation-run-receipt"],
        }),
      ],
      closureEvidenceRefs: ["postmortem-gap3758", "closure-approval-gap3758"],
    });

    expect(receipt.status).toBe("ready_to_close");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaceBindings).toEqual(["Watch", "Studio", "API"]);
    expect(receipt.traceIndex.searchFields).toEqual([
      "incidentId",
      "traceId",
      "failureMode",
      "riskEvent",
      "promptToolBoundary",
      "remediationState",
    ]);
    expect(receipt.traceIndex.entries.map((entry) => entry.traceId)).toEqual([
      "trace-gap3758",
      "trace-gap3758-policy",
    ]);
    expect(receipt.traceIndex.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.rowHash))).toBe(true);
    expect(receipt.failureClusters.map((cluster) => cluster.failureMode)).toEqual([
      "policy_gap",
      "tool_timeout",
    ]);
    expect(receipt.liveTrends).toMatchObject({
      incidentCount: 1,
      traceCount: 2,
      totalCostUsd: 0.16,
      p95LatencyMs: 4_800,
    });
    expect(receipt.generatedTests.map((test) => test.testId)).toEqual([
      "regression-gap3758-policy-gap",
      "regression-gap3758-tool-timeout",
    ]);
    expect(receipt.validationRuns.map((run) => run.runId)).toEqual([
      "validation-gap3758",
      "validation-gap3758-policy",
    ]);
    expect(receipt.closureStatus).toMatchObject({
      status: "ready_to_close",
      readyIncidentIds: ["incident-gap3758"],
      blockedIncidentIds: [],
      missingValidationTestIds: [],
      closureEvidenceRefs: ["closure-approval-gap3758", "postmortem-gap3758"],
    });
    expect(buildIncidentRegressionWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when Arthur metadata replaces incident traces, generated tests, validation, or closure evidence", () => {
    const receipt = buildIncidentRegressionReceipt({
      generatedAt: "2026-06-26T02:45:00.000Z",
      sourceRefs: [HOMEPAGE, REPO, API],
      traces: [],
      generatedTests: [],
      validationRuns: [],
      closureEvidenceRefs: [],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "incidentTraces:missing",
      "generatedRegressionTests:missing",
      "validationRuns:missing",
      "closureEvidence:missing",
    ]));
    expect(receipt.traceIndex.entries).toEqual([]);
    expect(receipt.generatedTests).toEqual([]);
    expect(receipt.closureStatus.status).toBe("blocked");
    expect(buildIncidentRegressionWatchAlerts(receipt)[0]).toMatchObject({
      source: "incident-regression",
      severity: "critical",
      status: "fail_closed",
    });
  });

  it("blocks closure when a generated regression test has no passing validation run", () => {
    const receipt = buildIncidentRegressionReceipt({
      generatedAt: "2026-06-26T02:45:00.000Z",
      sourceRefs: [PLATFORM],
      traces: [trace()],
      generatedTests: [generatedTest()],
      validationRuns: [validationRun({ status: "failed" })],
      closureEvidenceRefs: ["postmortem-gap3758"],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosedReasons).toContain("test:regression-gap3758-tool-timeout:validation:notPassed");
    expect(receipt.closureStatus).toMatchObject({
      status: "blocked",
      readyIncidentIds: [],
      blockedIncidentIds: ["incident-gap3758"],
      missingValidationTestIds: ["regression-gap3758-tool-timeout"],
    });
  });

  it("does not add Arthur-specific identifiers to generic incident regression implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("Arthur AI");
      expect(source).not.toContain("arthur.ai");
      expect(source).not.toContain("arthur-engine");
    }
  });
});
