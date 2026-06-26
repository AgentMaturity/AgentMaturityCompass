import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "../src/redteam/promptInjectionRegressionSuite.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1238-malicious-ai-swarms-prompt-injection-suite.md";
const OPENALEX = "https://openalex.org/W7125492504";
const OPENALEX_API = "https://api.openalex.org/works/W7125492504";
const DOI = "https://doi.org/10.1126/science.adz1697";
const CROSSREF_API = "https://api.crossref.org/works/10.1126/science.adz1697";
const SCIENCE = "https://www.science.org/doi/10.1126/science.adz1697";
const TITLE = "How malicious AI swarms can threaten democracy";

const implementationFiles = [
  "src/redteam/promptInjectionRegressionSuite.ts",
  "src/redteam/index.ts",
  "src/index.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

describe("GAP-1238 malicious AI swarms prompt-injection suite boundary", () => {
  it("documents live paper metadata and prompt-injection suite relevance", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1238");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF_API);
    expect(doc).toContain(SCIENCE);
    expect(doc).toContain("Science");
    expect(doc).toContain("2026-01-22");
    expect(doc).toContain("Daniel Thilo Schroeder");
    expect(doc).toContain("Meeyoung Cha");
    expect(doc).toContain("The fusion of agentic AI and LLMs marks a new frontier in information warfare.");
    expect(doc).toContain("direct");
    expect(doc).toContain("indirect");
    expect(doc).toContain("multimodal");
    expect(doc).toContain("retrieved_content");
    expect(doc).toContain("Attack fixture, policy mapping, observed decision, and regression status");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No paper importer");
  });

  it("builds a fail-closed prompt injection regression suite across required vectors", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "prompt-injection-regression-suite-v1",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1238-regression-suite",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF_API, SCIENCE],
      evidenceRefs: ["ledger:prompt-injection-suite-run-001"],
      signedEvidenceRefs: ["ledger:sig-prompt-injection-suite-run-001"],
      fixtures: [
        {
          fixtureId: "gap-1238-direct-fixture",
          vector: "direct",
          attackTraceRef: "trace:gap-1238-direct",
          attackTraceHash: hash({ vector: "direct", copiedPaperText: false }),
          policyId: "policy:prompt-injection/direct",
          policyMappingRef: "policy-map:direct-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:gap-1238-direct",
          regressionStatus: "passed",
          evidenceRefs: ["trace:gap-1238-direct", "policy-map:direct-block"],
          signedEvidenceRefs: ["ledger:sig-gap-1238-direct"],
        },
        {
          fixtureId: "gap-1238-indirect-fixture",
          vector: "indirect",
          attackTraceRef: "trace:gap-1238-indirect",
          attackTraceHash: hash({ vector: "indirect", copiedPaperText: false }),
          policyId: "policy:prompt-injection/indirect",
          policyMappingRef: "policy-map:indirect-quarantine",
          expectedDecision: "quarantine",
          observedDecision: "quarantine",
          observedDecisionReceiptId: "decision:gap-1238-indirect",
          regressionStatus: "passed",
          evidenceRefs: ["trace:gap-1238-indirect", "policy-map:indirect-quarantine"],
          signedEvidenceRefs: ["ledger:sig-gap-1238-indirect"],
        },
        {
          fixtureId: "gap-1238-multimodal-fixture",
          vector: "multimodal",
          attackTraceRef: "trace:gap-1238-multimodal",
          attackTraceHash: hash({ vector: "multimodal", copiedPaperText: false }),
          policyId: "policy:prompt-injection/multimodal",
          policyMappingRef: "policy-map:multimodal-escalate",
          expectedDecision: "escalate",
          observedDecision: "escalate",
          observedDecisionReceiptId: "decision:gap-1238-multimodal",
          regressionStatus: "passed",
          evidenceRefs: ["trace:gap-1238-multimodal", "policy-map:multimodal-escalate"],
          signedEvidenceRefs: ["ledger:sig-gap-1238-multimodal"],
        },
        {
          fixtureId: "gap-1238-retrieved-content-fixture",
          vector: "retrieved_content",
          attackTraceRef: "trace:gap-1238-retrieved-content",
          attackTraceHash: hash({ vector: "retrieved_content", copiedPaperText: false }),
          policyId: "policy:prompt-injection/retrieved-content",
          policyMappingRef: "policy-map:retrieved-content-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:gap-1238-retrieved-content",
          regressionStatus: "passed",
          evidenceRefs: ["trace:gap-1238-retrieved-content", "policy-map:retrieved-content-block"],
          signedEvidenceRefs: ["ledger:sig-gap-1238-retrieved-content"],
        },
      ],
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.coverage.requiredVectors).toEqual(["direct", "indirect", "multimodal", "retrieved_content"]);
    expect(receipt.coverage.presentVectors).toEqual(["direct", "indirect", "multimodal", "retrieved_content"]);
    expect(receipt.coverage.missingVectors).toEqual([]);
    expect(receipt.rows.every((row) => row.status === "passed")).toBe(true);
    expect(receipt.rows.every((row) => row.rowHash.length === 64)).toBe(true);
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt)).toEqual({ valid: true, failClosedReasons: [] });

    const markdown = renderPromptInjectionRegressionSuiteMarkdown(receipt);
    expect(markdown).toContain("Prompt Injection Regression Suite");
    expect(markdown).toContain("Status: pass");
    expect(markdown).toContain("Required Vectors: direct, indirect, multimodal, retrieved_content");
    expect(markdown).toContain("gap-1238-retrieved-content-fixture");
  });

  it("fails closed when source metadata replaces attack traces and policy mappings", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "metadata-only-suite",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1238-metadata-only",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [OPENALEX, DOI],
      evidenceRefs: [],
      signedEvidenceRefs: [],
      fixtures: [
        {
          fixtureId: "metadata-only-direct",
          vector: "direct",
          sourceMetadata: {
            sourceTitle: TITLE,
            sourceUrl: DOI,
            sourceId: "W7125492504",
          },
        },
      ],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.coverage.missingVectors).toEqual(["indirect", "multimodal", "retrieved_content"]);
    expect(receipt.rows[0]).toMatchObject({
      fixtureId: "metadata-only-direct",
      status: "missing_evidence",
    });
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "suite evidence refs missing",
      "suite signed evidence refs missing",
      "required vector indirect missing",
      "required vector multimodal missing",
      "required vector retrieved_content missing",
      "metadata-only-direct attack trace ref missing",
      "metadata-only-direct attack trace hash missing",
      "metadata-only-direct policy id missing",
      "metadata-only-direct policy mapping ref missing",
      "metadata-only-direct expected decision missing",
      "metadata-only-direct observed decision missing",
      "metadata-only-direct observed decision receipt missing",
      "metadata-only-direct regression status missing",
      "metadata-only-direct signed evidence refs missing",
    ]));
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt).valid).toBe(false);
  });

  it("blocks regressions when observed decision diverges from mapped policy", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "decision-mismatch-suite",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1238-mismatch",
      requiredVectors: ["direct"],
      sourceRefs: [OPENALEX],
      evidenceRefs: ["ledger:decision-mismatch-suite"],
      signedEvidenceRefs: ["ledger:sig-decision-mismatch-suite"],
      fixtures: [
        {
          fixtureId: "direct-mismatch",
          vector: "direct",
          attackTraceRef: "trace:direct-mismatch",
          attackTraceHash: hash({ vector: "direct", mismatch: true }),
          policyId: "policy:prompt-injection/direct",
          policyMappingRef: "policy-map:direct-block",
          expectedDecision: "block",
          observedDecision: "allow",
          observedDecisionReceiptId: "decision:direct-mismatch",
          regressionStatus: "failed",
          evidenceRefs: ["trace:direct-mismatch", "policy-map:direct-block"],
          signedEvidenceRefs: ["ledger:sig-direct-mismatch"],
        },
      ],
    });

    expect(receipt.status).toBe("regressed");
    expect(receipt.rows[0]).toMatchObject({
      fixtureId: "direct-mismatch",
      status: "regressed",
    });
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "direct-mismatch observed decision does not match expected decision",
      "direct-mismatch regression status is failed",
    ]));
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt).valid).toBe(false);
  });

  it("does not add paper-specific identifiers to generic prompt-injection suite modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("W7125492504");
    expect(combined).not.toContain("10.1126/science.adz1697");
    expect(combined).not.toContain(TITLE);
  });
});
