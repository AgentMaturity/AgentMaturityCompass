import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "../src/redteam/promptInjectionRegressionSuite.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1269-vigil-prompt-injection-suite.md";
const REPO = "https://github.com/deadbits/vigil-llm";
const API = "https://api.github.com/repos/deadbits/vigil-llm";
const README = "https://raw.githubusercontent.com/deadbits/vigil-llm/main/README.md";
const DETECTIONS = "https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/detections.md";
const CANARY = "https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/canarytokens.md";
const DOCKER = "https://raw.githubusercontent.com/deadbits/vigil-llm/main/docs/docker.md";
const DOCS = "https://vigil.deadbits.ai";

const implementationFiles = [
  "src/redteam/promptInjectionRegressionSuite.ts",
  "src/redteam/index.ts",
  "src/index.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

describe("GAP-1269 Vigil prompt-injection suite boundary", () => {
  it("documents live Vigil source metadata and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1269");
    expect(doc).toContain("Vigil");
    expect(doc).toContain("deadbits/vigil-llm");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(DETECTIONS);
    expect(doc).toContain(CANARY);
    expect(doc).toContain(DOCKER);
    expect(doc).toContain(DOCS);
    expect(doc).toContain("LLM prompt injection scanner");
    expect(doc).toContain("Python library and REST API");
    expect(doc).toContain("alpha");
    expect(doc).toContain("research purposes");
    expect(doc).toContain("Vector database");
    expect(doc).toContain("YARA");
    expect(doc).toContain("Transformer model");
    expect(doc).toContain("Prompt-response similarity");
    expect(doc).toContain("Canary Tokens");
    expect(doc).toContain("Prompt leakage");
    expect(doc).toContain("Goal hijacking");
    expect(doc).toContain("direct");
    expect(doc).toContain("indirect");
    expect(doc).toContain("multimodal");
    expect(doc).toContain("retrieved_content");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Vigil adapter");
  });

  it("reuses generic prompt-injection suite receipts for Vigil context", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "vigil-style-prompt-injection-suite",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1269-vigil-suite",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [REPO, API, README, DETECTIONS, CANARY, DOCKER, DOCS],
      evidenceRefs: ["ledger:vigil-style-suite-run-001"],
      signedEvidenceRefs: ["ledger:sig-vigil-style-suite-run-001"],
      fixtures: [
        {
          fixtureId: "vigil-direct-fixture",
          vector: "direct",
          attackTraceRef: "trace:vigil-direct",
          attackTraceHash: hash({ vector: "direct", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/direct",
          policyMappingRef: "policy-map:vigil-direct-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:vigil-direct",
          regressionStatus: "passed",
          evidenceRefs: ["trace:vigil-direct", "policy-map:vigil-direct-block"],
          signedEvidenceRefs: ["ledger:sig-vigil-direct"],
        },
        {
          fixtureId: "vigil-indirect-fixture",
          vector: "indirect",
          attackTraceRef: "trace:vigil-indirect",
          attackTraceHash: hash({ vector: "indirect", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/indirect",
          policyMappingRef: "policy-map:vigil-indirect-quarantine",
          expectedDecision: "quarantine",
          observedDecision: "quarantine",
          observedDecisionReceiptId: "decision:vigil-indirect",
          regressionStatus: "passed",
          evidenceRefs: ["trace:vigil-indirect", "policy-map:vigil-indirect-quarantine"],
          signedEvidenceRefs: ["ledger:sig-vigil-indirect"],
        },
        {
          fixtureId: "vigil-multimodal-fixture",
          vector: "multimodal",
          attackTraceRef: "trace:vigil-multimodal",
          attackTraceHash: hash({ vector: "multimodal", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/multimodal",
          policyMappingRef: "policy-map:vigil-multimodal-escalate",
          expectedDecision: "escalate",
          observedDecision: "escalate",
          observedDecisionReceiptId: "decision:vigil-multimodal",
          regressionStatus: "passed",
          evidenceRefs: ["trace:vigil-multimodal", "policy-map:vigil-multimodal-escalate"],
          signedEvidenceRefs: ["ledger:sig-vigil-multimodal"],
        },
        {
          fixtureId: "vigil-retrieved-content-fixture",
          vector: "retrieved_content",
          attackTraceRef: "trace:vigil-retrieved-content",
          attackTraceHash: hash({ vector: "retrieved_content", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/retrieved-content",
          policyMappingRef: "policy-map:vigil-retrieved-content-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:vigil-retrieved-content",
          regressionStatus: "passed",
          evidenceRefs: ["trace:vigil-retrieved-content", "policy-map:vigil-retrieved-content-block"],
          signedEvidenceRefs: ["ledger:sig-vigil-retrieved-content"],
        },
      ],
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.coverage.presentVectors).toEqual(["direct", "indirect", "multimodal", "retrieved_content"]);
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt)).toEqual({ valid: true, failClosedReasons: [] });
    expect(renderPromptInjectionRegressionSuiteMarkdown(receipt)).toContain("vigil-retrieved-content-fixture");
  });

  it("fails closed when Vigil repository and scanner metadata replace suite evidence", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "vigil-metadata-only",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1269-metadata-only",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [REPO, README, DETECTIONS],
      fixtures: [
        {
          fixtureId: "vigil-metadata-only-direct",
          vector: "direct",
          sourceMetadata: {
            sourceTitle: "Vigil",
            sourceUrl: REPO,
            sourceId: "COMP-058",
          },
        },
      ],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.coverage.missingVectors).toEqual(["indirect", "multimodal", "retrieved_content"]);
    expect(receipt.rows[0]).toMatchObject({
      fixtureId: "vigil-metadata-only-direct",
      status: "missing_evidence",
    });
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "suite evidence refs missing",
      "suite signed evidence refs missing",
      "required vector indirect missing",
      "required vector multimodal missing",
      "required vector retrieved_content missing",
      "vigil-metadata-only-direct attack trace ref missing",
      "vigil-metadata-only-direct policy mapping ref missing",
      "vigil-metadata-only-direct observed decision missing",
      "vigil-metadata-only-direct regression status missing",
      "vigil-metadata-only-direct signed evidence refs missing",
    ]));
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt).valid).toBe(false);
  });

  it("does not add Vigil identifiers to generic prompt-injection suite modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Vigil");
    expect(combined).not.toContain("deadbits/vigil-llm");
    expect(combined).not.toContain("vigil-llm");
  });
});
