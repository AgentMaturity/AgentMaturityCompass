import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDegradedModeBehaviorReceipt,
  renderDegradedModeBehaviorMarkdown,
  verifyDegradedModeBehaviorReceipt,
  type DegradedModeBehaviorSourceCitation
} from "../src/runtime/degradedModeContract.js";

const DOC = "docs/source-reviews/GAP-4768-latency-offline-degraded-mode.md";
const OPENALEX = "https://openalex.org/W7153665608";
const OPENALEX_API = "https://api.openalex.org/works/W7153665608";
const DOI = "https://doi.org/10.1145/3772318.3790716";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3790716";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3790716";
const TITLE = "The Impact of Response Latency and Task Type on Human-LLM Interaction and Perception";
const IDENTIFIER = "llmops-offline-degradation";
const IMPLEMENTATION_FILES = [
  "src/runtime/degradedModeContract.ts",
  "src/runtime/runManager.ts",
  "src/ops/degradationMode.ts",
  "src/index.ts"
];

const sourceCitations: DegradedModeBehaviorSourceCitation[] = [
  {
    sourceId: "openalex",
    title: TITLE,
    url: OPENALEX_API,
    retrievedAt: "2026-06-25T11:45:00.000Z"
  },
  {
    sourceId: "crossref",
    title: TITLE,
    url: CROSSREF,
    retrievedAt: "2026-06-25T11:45:00.000Z"
  }
];

describe("GAP-4768 offline and degraded-mode behavior boundary", () => {
  it("documents live paper metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4768");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("ACM");
    expect(doc).toContain("Felicia Fang-Yi Tan");
    expect(doc).toContain("Moritz Alexander Messerschmidt");
    expect(doc).toContain("Wen Yin");
    expect(doc).toContain("Oded Nov");
    expect(doc).toContain("Latency");
    expect(doc).toContain("Human–computer interaction");
    expect(doc).toContain("Failure mode, allowed behavior, test run, and operator-facing message");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No latency paper adapter");
  });

  it("allows degraded operation only when failure mode, allowed behavior, test run, and operator message are evidenced", () => {
    const receipt = buildDegradedModeBehaviorReceipt({
      receiptId: "degraded-mode-receipt-1",
      policyId: "degraded-mode-policy-support-agent",
      agentId: "support-agent",
      failureMode: "provider_outage",
      allowedBehaviors: ["serve_cached", "read_only", "fallback_provider"],
      disallowedBehaviors: ["new_external_write", "unverified_claim"],
      testRun: {
        testRunId: "degraded-provider-outage-run",
        passed: true,
        scenario: "Primary provider unavailable; agent uses cached retrieval and fallback route.",
        evidenceRef: "signed-degraded-mode-test-run"
      },
      operatorMessage: {
        audience: "operator",
        message: "Support agent is in degraded mode: cached context and fallback provider only.",
        evidenceRef: "signed-operator-message"
      },
      recoveryPlanRef: "signed-recovery-plan",
      sourceCitations,
      generatedAt: "2026-06-25T11:46:00.000Z"
    });

    expect(receipt.status).toBe("allow_degraded");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.allowedBehaviorMet).toBe(true);
    expect(receipt.operatorMessageMet).toBe(true);
    expect(receipt.testRunMet).toBe(true);
    expect(receipt.requiredEvidenceRefs).toEqual(expect.arrayContaining([
      "signed-degraded-mode-test-run",
      "signed-operator-message",
      "signed-recovery-plan"
    ]));
    expect(verifyDegradedModeBehaviorReceipt(receipt).valid).toBe(true);

    const markdown = renderDegradedModeBehaviorMarkdown(receipt);
    expect(markdown).toContain("support-agent");
    expect(markdown).toContain("provider_outage");
    expect(markdown).toContain("allow_degraded");
    expect(markdown).toContain("operator");
    expect(markdown).toContain("Fleet");
  });

  it("blocks degraded operation when the degradation test run fails but evidence is complete", () => {
    const receipt = buildDegradedModeBehaviorReceipt({
      receiptId: "degraded-mode-receipt-blocked",
      policyId: "degraded-mode-policy-support-agent",
      agentId: "support-agent",
      failureMode: "policy_service_failure",
      allowedBehaviors: ["deny", "request_human_review"],
      disallowedBehaviors: ["fail_open", "new_external_write"],
      testRun: {
        testRunId: "policy-service-failure-run",
        passed: false,
        scenario: "Policy service unavailable; agent must deny or request human review.",
        evidenceRef: "signed-policy-service-failure-run"
      },
      operatorMessage: {
        audience: "operator",
        message: "Policy service unavailable; agent is blocked except for human-review requests.",
        evidenceRef: "signed-policy-service-message"
      },
      sourceCitations,
      generatedAt: "2026-06-25T11:47:00.000Z"
    });

    expect(receipt.status).toBe("block");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.testRunMet).toBe(false);
    expect(receipt.scorePenalty).toBeGreaterThan(0);
    expect(verifyDegradedModeBehaviorReceipt(receipt).valid).toBe(true);
  });

  it("fails closed when source metadata exists but runtime degradation evidence is missing", () => {
    const receipt = buildDegradedModeBehaviorReceipt({
      receiptId: "degraded-mode-metadata-only",
      policyId: "",
      agentId: "support-agent",
      failureMode: "missing_retrieval",
      allowedBehaviors: [],
      disallowedBehaviors: [],
      testRun: {
        testRunId: "",
        passed: true,
        scenario: "",
        evidenceRef: ""
      },
      operatorMessage: {
        audience: "operator",
        message: "",
        evidenceRef: ""
      },
      sourceCitations,
      generatedAt: "2026-06-25T11:48:00.000Z"
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "policyId:missing",
      "allowedBehaviors:missing",
      "testRunId:missing",
      "testRunScenario:missing",
      "testRunEvidenceRef:missing",
      "operatorMessage:missing",
      "operatorMessageEvidenceRef:missing"
    ]));
    expect(verifyDegradedModeBehaviorReceipt(receipt).valid).toBe(false);
  });

  it("does not add latency-paper-specific identifiers to generic degraded-mode implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("3772318.3790716");
    expect(combined).not.toContain("W7153665608");
    expect(combined).not.toContain("The Impact of Response Latency");
    expect(combined).not.toContain("Felicia Fang-Yi Tan");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
