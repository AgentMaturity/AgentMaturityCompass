import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRouterFallbackSafetyReceipt,
  renderRouterFallbackSafetyMarkdown,
  verifyRouterFallbackSafetyReceipt,
  type RouterFallbackProviderSnapshot,
  type RouterFallbackSafetySourceCitation
} from "../src/observability/routerFallbackSafety.js";

const DOC = "docs/source-reviews/GAP-4741-litellm-router-fallback-safety.md";
const GITHUB_REPO_API = "https://api.github.com/repos/BerriAI/litellm";
const GITHUB_LANGUAGES_API = "https://api.github.com/repos/BerriAI/litellm/languages";
const GITHUB_LICENSE_API = "https://api.github.com/repos/BerriAI/litellm/license";
const GITHUB_REPO = "https://github.com/BerriAI/litellm";
const README_RAW = "https://raw.githubusercontent.com/BerriAI/litellm/main/README.md";
const IDENTIFIER = "llmops-router-fallback";
const IMPLEMENTATION_FILES = [
  "src/observability/routerFallbackSafety.ts",
  "src/gateway/server.ts",
  "src/gateway/config.ts",
  "src/compliance/providerRisk.ts",
  "src/product/costLatencyRouter.ts"
];

const sourceCitations: RouterFallbackSafetySourceCitation[] = [
  {
    sourceId: "github-repo",
    title: "BerriAI/litellm GitHub repository metadata",
    url: GITHUB_REPO_API,
    retrievedAt: "2026-06-25T11:18:00.000Z"
  },
  {
    sourceId: "readme",
    title: "LiteLLM AI Gateway README",
    url: README_RAW,
    retrievedAt: "2026-06-25T11:18:00.000Z"
  }
];

function provider(overrides: Partial<RouterFallbackProviderSnapshot> = {}): RouterFallbackProviderSnapshot {
  return {
    providerId: "primary-provider",
    modelId: "primary-model",
    routeId: "regulated-support-agent",
    safetyPolicyIds: ["policy-pii-redaction", "policy-tool-approval", "policy-data-retention"],
    dataResidencyRegions: ["us-east-1", "us-west-2"],
    allowedDataClasses: ["public", "internal", "customer-pii"],
    evalThresholds: [
      {
        metricId: "tool-safety",
        minScore: 0.94,
        actualScore: 0.97,
        evidenceRef: "eval-threshold-tool-safety-primary"
      },
      {
        metricId: "residency-routing",
        minScore: 0.99,
        actualScore: 1,
        evidenceRef: "eval-threshold-residency-primary"
      }
    ],
    auditReceiptRefs: ["audit-receipt-primary-1"],
    costBudget: {
      maxEstimatedCostUsd: 0.4,
      estimatedCostUsd: 0.31,
      evidenceRef: "budget-primary"
    },
    latencySlo: {
      p95TargetMs: 1800,
      observedP95Ms: 1220,
      evidenceRef: "latency-primary"
    },
    ...overrides
  };
}

describe("GAP-4741 router fallback safety checks boundary", () => {
  it("documents live LiteLLM metadata and no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-4741");
    expect(doc).toContain("BerriAI/litellm");
    expect(doc).toContain(GITHUB_REPO);
    expect(doc).toContain(GITHUB_REPO_API);
    expect(doc).toContain(GITHUB_LANGUAGES_API);
    expect(doc).toContain(GITHUB_LICENSE_API);
    expect(doc).toContain(README_RAW);
    expect(doc).toContain("LiteLLM AI Gateway");
    expect(doc).toContain("100+ LLM");
    expect(doc).toContain("cost tracking");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("load balancing");
    expect(doc).toContain("logging");
    expect(doc).toContain("ai-gateway");
    expect(doc).toContain("NOASSERTION");
    expect(doc).toContain("Fallback policy, provider comparison, test run, and routing receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No LiteLLM adapter");
  });

  it("allows provider fallback only when safety, residency, eval, audit, cost, and latency evidence are preserved", () => {
    const receipt = buildRouterFallbackSafetyReceipt({
      receiptId: "router-fallback-safe-1",
      policyId: "fallback-policy-regulated-support",
      routeId: "regulated-support-agent",
      fallbackReason: "primary provider outage",
      fallbackPolicyRef: "signed-policy-fallback-regulated-support",
      providerComparisonRef: "signed-provider-comparison-2026-06-25",
      testRunRef: "signed-canary-fallback-test-run-2026-06-25",
      routingReceiptRef: "signed-routing-receipt-2026-06-25",
      primary: provider(),
      fallback: provider({
        providerId: "approved-fallback-provider",
        modelId: "fallback-model",
        safetyPolicyIds: ["policy-tool-approval", "policy-data-retention", "policy-pii-redaction"],
        dataResidencyRegions: ["us-east-1"],
        allowedDataClasses: ["public", "internal", "customer-pii"],
        evalThresholds: [
          {
            metricId: "tool-safety",
            minScore: 0.94,
            actualScore: 0.95,
            evidenceRef: "eval-threshold-tool-safety-fallback"
          },
          {
            metricId: "residency-routing",
            minScore: 0.99,
            actualScore: 1,
            evidenceRef: "eval-threshold-residency-fallback"
          }
        ],
        auditReceiptRefs: ["audit-receipt-fallback-1", "audit-receipt-fallback-2"],
        costBudget: {
          maxEstimatedCostUsd: 0.4,
          estimatedCostUsd: 0.33,
          evidenceRef: "budget-fallback"
        },
        latencySlo: {
          p95TargetMs: 1800,
          observedP95Ms: 1410,
          evidenceRef: "latency-fallback"
        }
      }),
      sourceCitations,
      generatedAt: "2026-06-25T11:20:00.000Z"
    });

    expect(receipt.decision).toBe("allow");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.failClosedReasons).toEqual([]);
    expect(receipt.preservesSafetyPolicies).toBe(true);
    expect(receipt.preservesDataResidency).toBe(true);
    expect(receipt.preservesEvalThresholds).toBe(true);
    expect(receipt.hasAuditReceipts).toBe(true);
    expect(receipt.preservesCostBudget).toBe(true);
    expect(receipt.preservesLatencySlo).toBe(true);
    expect(receipt.requiredEvidenceRefs).toEqual(expect.arrayContaining([
      "signed-policy-fallback-regulated-support",
      "signed-provider-comparison-2026-06-25",
      "signed-canary-fallback-test-run-2026-06-25",
      "signed-routing-receipt-2026-06-25"
    ]));
    expect(verifyRouterFallbackSafetyReceipt(receipt).valid).toBe(true);

    const markdown = renderRouterFallbackSafetyMarkdown(receipt);
    expect(markdown).toContain("router-fallback-safe-1");
    expect(markdown).toContain("approved-fallback-provider");
    expect(markdown).toContain("allow");
    expect(markdown).toContain("Fleet");
  });

  it("blocks fallback when compatibility or required evidence is missing", () => {
    const receipt = buildRouterFallbackSafetyReceipt({
      receiptId: "router-fallback-blocked-1",
      policyId: "fallback-policy-regulated-support",
      routeId: "regulated-support-agent",
      fallbackReason: "primary timeout",
      fallbackPolicyRef: "",
      providerComparisonRef: "",
      testRunRef: "signed-canary-fallback-test-run-2026-06-25",
      routingReceiptRef: "",
      primary: provider(),
      fallback: provider({
        providerId: "unsafe-fallback-provider",
        safetyPolicyIds: ["policy-data-retention"],
        dataResidencyRegions: ["eu-central-1"],
        allowedDataClasses: ["public", "internal", "customer-pii", "regulated-health-data"],
        evalThresholds: [
          {
            metricId: "tool-safety",
            minScore: 0.94,
            actualScore: 0.83,
            evidenceRef: ""
          }
        ],
        auditReceiptRefs: [],
        costBudget: {
          maxEstimatedCostUsd: 0.4,
          estimatedCostUsd: 0.52,
          evidenceRef: "budget-fallback"
        },
        latencySlo: {
          p95TargetMs: 1800,
          observedP95Ms: 2300,
          evidenceRef: "latency-fallback"
        }
      }),
      sourceCitations,
      generatedAt: "2026-06-25T11:25:00.000Z"
    });

    expect(receipt.decision).toBe("block");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "fallbackPolicyRef:missing",
      "providerComparisonRef:missing",
      "routingReceiptRef:missing",
      "unsafe-fallback-provider:safetyPolicy:policy-pii-redaction:missing",
      "unsafe-fallback-provider:dataResidency:eu-central-1:not-allowed",
      "unsafe-fallback-provider:dataClass:regulated-health-data:not-allowed",
      "unsafe-fallback-provider:evalThreshold:tool-safety:below-threshold",
      "unsafe-fallback-provider:evalThreshold:tool-safety:evidence:missing",
      "unsafe-fallback-provider:evalThreshold:residency-routing:missing",
      "unsafe-fallback-provider:auditReceiptRefs:missing",
      "unsafe-fallback-provider:costBudget:exceeded",
      "unsafe-fallback-provider:latencySlo:exceeded"
    ]));
    expect(receipt.preservesSafetyPolicies).toBe(false);
    expect(receipt.preservesDataResidency).toBe(false);
    expect(receipt.preservesEvalThresholds).toBe(false);
    expect(receipt.hasAuditReceipts).toBe(false);
    expect(verifyRouterFallbackSafetyReceipt(receipt).valid).toBe(false);
  });

  it("does not treat source metadata alone as fallback safety proof", () => {
    const receipt = buildRouterFallbackSafetyReceipt({
      receiptId: "router-fallback-metadata-only",
      policyId: "fallback-policy-regulated-support",
      routeId: "regulated-support-agent",
      fallbackReason: "metadata-only review",
      fallbackPolicyRef: "",
      providerComparisonRef: "",
      testRunRef: "",
      routingReceiptRef: "",
      primary: provider(),
      fallback: provider({
        providerId: "metadata-only-fallback",
        auditReceiptRefs: []
      }),
      sourceCitations,
      generatedAt: "2026-06-25T11:30:00.000Z"
    });

    expect(receipt.decision).toBe("block");
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "fallbackPolicyRef:missing",
      "providerComparisonRef:missing",
      "testRunRef:missing",
      "routingReceiptRef:missing",
      "metadata-only-fallback:auditReceiptRefs:missing"
    ]));
  });

  it("does not add LiteLLM-specific identifiers to generic router safety implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => existsSync(file) ? readFileSync(file, "utf8") : "").join("\n");
    expect(combined).not.toContain("BerriAI");
    expect(combined).not.toContain("litellm_internal_staging");
    expect(combined).not.toContain("LiteLLM AI Gateway");
    expect(combined).not.toContain("LiteLLM adapter");
    expect(combined).not.toContain(IDENTIFIER);
  });
});
