import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "../src/redteam/promptInjectionRegressionSuite.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1244-lakera-guard-prompt-injection-suite.md";
const HOME = "https://www.lakera.ai";
const AGENT_SECURITY = "https://www.lakera.ai/ai-agent-security";
const PROMPT_INJECTION = "https://www.lakera.ai/risk/prompt-injection-attacks";
const DOCS_API = "https://docs.lakera.ai/docs/api";
const PLATFORM_DOCS = "https://platform.lakera.ai/docs";

const implementationFiles = [
  "src/redteam/promptInjectionRegressionSuite.ts",
  "src/redteam/index.ts",
  "src/index.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

describe("GAP-1244 Lakera Guard prompt-injection suite boundary", () => {
  it("documents live Lakera source metadata and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1244");
    expect(doc).toContain("Lakera Guard");
    expect(doc).toContain(HOME);
    expect(doc).toContain(AGENT_SECURITY);
    expect(doc).toContain(PROMPT_INJECTION);
    expect(doc).toContain(DOCS_API);
    expect(doc).toContain(PLATFORM_DOCS);
    expect(doc).toContain("AI-Native Security Platform");
    expect(doc).toContain("AI Agent Security");
    expect(doc).toContain("Prompt Injection Attacks");
    expect(doc).toContain("Indirect Prompt Injection");
    expect(doc).toContain("Multilingual & Multimodal Attacks");
    expect(doc).toContain("Protect in Real Time");
    expect(doc).toContain("sub-50 ms runtime latency");
    expect(doc).toContain("policy and runtime enforcement");
    expect(doc).toContain("Real-Time, Context-Aware Detection");
    expect(doc).toContain("Block, redact, or warn");
    expect(doc).toContain("Check Point AI Security");
    expect(doc).toContain("direct");
    expect(doc).toContain("indirect");
    expect(doc).toContain("multimodal");
    expect(doc).toContain("retrieved_content");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Lakera Guard adapter");
  });

  it("reuses generic prompt-injection suite receipts for Lakera Guard context", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "lakera-guard-style-prompt-injection-suite",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1244-lakera-suite",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [HOME, AGENT_SECURITY, PROMPT_INJECTION, DOCS_API, PLATFORM_DOCS],
      evidenceRefs: ["ledger:lakera-style-suite-run-001"],
      signedEvidenceRefs: ["ledger:sig-lakera-style-suite-run-001"],
      fixtures: [
        {
          fixtureId: "lakera-direct-fixture",
          vector: "direct",
          attackTraceRef: "trace:lakera-direct",
          attackTraceHash: hash({ vector: "direct", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/direct",
          policyMappingRef: "policy-map:lakera-direct-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:lakera-direct",
          regressionStatus: "passed",
          evidenceRefs: ["trace:lakera-direct", "policy-map:lakera-direct-block"],
          signedEvidenceRefs: ["ledger:sig-lakera-direct"],
        },
        {
          fixtureId: "lakera-indirect-fixture",
          vector: "indirect",
          attackTraceRef: "trace:lakera-indirect",
          attackTraceHash: hash({ vector: "indirect", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/indirect",
          policyMappingRef: "policy-map:lakera-indirect-quarantine",
          expectedDecision: "quarantine",
          observedDecision: "quarantine",
          observedDecisionReceiptId: "decision:lakera-indirect",
          regressionStatus: "passed",
          evidenceRefs: ["trace:lakera-indirect", "policy-map:lakera-indirect-quarantine"],
          signedEvidenceRefs: ["ledger:sig-lakera-indirect"],
        },
        {
          fixtureId: "lakera-multimodal-fixture",
          vector: "multimodal",
          attackTraceRef: "trace:lakera-multimodal",
          attackTraceHash: hash({ vector: "multimodal", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/multimodal",
          policyMappingRef: "policy-map:lakera-multimodal-escalate",
          expectedDecision: "escalate",
          observedDecision: "escalate",
          observedDecisionReceiptId: "decision:lakera-multimodal",
          regressionStatus: "passed",
          evidenceRefs: ["trace:lakera-multimodal", "policy-map:lakera-multimodal-escalate"],
          signedEvidenceRefs: ["ledger:sig-lakera-multimodal"],
        },
        {
          fixtureId: "lakera-retrieved-content-fixture",
          vector: "retrieved_content",
          attackTraceRef: "trace:lakera-retrieved-content",
          attackTraceHash: hash({ vector: "retrieved_content", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/retrieved-content",
          policyMappingRef: "policy-map:lakera-retrieved-content-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:lakera-retrieved-content",
          regressionStatus: "passed",
          evidenceRefs: ["trace:lakera-retrieved-content", "policy-map:lakera-retrieved-content-block"],
          signedEvidenceRefs: ["ledger:sig-lakera-retrieved-content"],
        },
      ],
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.coverage.presentVectors).toEqual(["direct", "indirect", "multimodal", "retrieved_content"]);
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt)).toEqual({ valid: true, failClosedReasons: [] });
    expect(renderPromptInjectionRegressionSuiteMarkdown(receipt)).toContain("lakera-retrieved-content-fixture");
  });

  it("fails closed when Lakera marketing and docs labels replace suite evidence", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "lakera-metadata-only",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1244-metadata-only",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [HOME, PROMPT_INJECTION],
      fixtures: [
        {
          fixtureId: "lakera-metadata-only-direct",
          vector: "direct",
          sourceMetadata: {
            sourceTitle: "Lakera Guard",
            sourceUrl: HOME,
            sourceId: "COMP-038",
          },
        },
      ],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.coverage.missingVectors).toEqual(["indirect", "multimodal", "retrieved_content"]);
    expect(receipt.rows[0]).toMatchObject({
      fixtureId: "lakera-metadata-only-direct",
      status: "missing_evidence",
    });
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "suite evidence refs missing",
      "suite signed evidence refs missing",
      "required vector indirect missing",
      "required vector multimodal missing",
      "required vector retrieved_content missing",
      "lakera-metadata-only-direct attack trace ref missing",
      "lakera-metadata-only-direct policy mapping ref missing",
      "lakera-metadata-only-direct observed decision missing",
      "lakera-metadata-only-direct regression status missing",
      "lakera-metadata-only-direct signed evidence refs missing",
    ]));
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt).valid).toBe(false);
  });

  it("does not add Lakera identifiers to generic prompt-injection suite modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Lakera");
    expect(combined).not.toContain("COMP-038");
    expect(combined).not.toContain("lakera-guard");
  });
});
