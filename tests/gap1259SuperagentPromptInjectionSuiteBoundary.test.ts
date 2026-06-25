import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPromptInjectionRegressionSuiteReceipt,
  renderPromptInjectionRegressionSuiteMarkdown,
  verifyPromptInjectionRegressionSuiteReceipt,
} from "../src/redteam/promptInjectionRegressionSuite.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1259-superagent-prompt-injection-suite.md";
const REPO = "https://github.com/superagent-ai/superagent";
const API = "https://api.github.com/repos/superagent-ai/superagent";
const README = "https://raw.githubusercontent.com/superagent-ai/superagent/main/README.md";
const CLI_README = "https://raw.githubusercontent.com/superagent-ai/superagent/main/cli/README.md";
const MCP_README = "https://raw.githubusercontent.com/superagent-ai/superagent/main/mcp/README.md";
const TYPESCRIPT_README = "https://raw.githubusercontent.com/superagent-ai/superagent/main/sdk/typescript/README.md";
const DOCS = "https://docs.superagent.sh";
const WEBSITE = "https://superagent.sh";

const implementationFiles = [
  "src/redteam/promptInjectionRegressionSuite.ts",
  "src/redteam/index.ts",
  "src/index.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

describe("GAP-1259 Superagent prompt-injection suite boundary", () => {
  it("documents live Superagent source metadata and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1259");
    expect(doc).toContain("superagent-ai/superagent");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CLI_README);
    expect(doc).toContain(MCP_README);
    expect(doc).toContain(TYPESCRIPT_README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(WEBSITE);
    expect(doc).toContain("Superagent SDK");
    expect(doc).toContain("AI agent safety");
    expect(doc).toContain("prompt injections");
    expect(doc).toContain("data leaks");
    expect(doc).toContain("harmful outputs");
    expect(doc).toContain("runtime");
    expect(doc).toContain("CLI");
    expect(doc).toContain("MCP Server");
    expect(doc).toContain("open-weight models");
    expect(doc).toContain("PDF");
    expect(doc).toContain("Image");
    expect(doc).toContain("direct");
    expect(doc).toContain("indirect");
    expect(doc).toContain("multimodal");
    expect(doc).toContain("retrieved_content");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Superagent adapter");
  });

  it("reuses generic prompt-injection suite receipts for Superagent context", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "superagent-style-prompt-injection-suite",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1259-superagent-suite",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [REPO, API, README, CLI_README, MCP_README, TYPESCRIPT_README, DOCS, WEBSITE],
      evidenceRefs: ["ledger:superagent-style-suite-run-001"],
      signedEvidenceRefs: ["ledger:sig-superagent-style-suite-run-001"],
      fixtures: [
        {
          fixtureId: "superagent-direct-fixture",
          vector: "direct",
          attackTraceRef: "trace:superagent-direct",
          attackTraceHash: hash({ vector: "direct", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/direct",
          policyMappingRef: "policy-map:superagent-direct-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:superagent-direct",
          regressionStatus: "passed",
          evidenceRefs: ["trace:superagent-direct", "policy-map:superagent-direct-block"],
          signedEvidenceRefs: ["ledger:sig-superagent-direct"],
        },
        {
          fixtureId: "superagent-indirect-fixture",
          vector: "indirect",
          attackTraceRef: "trace:superagent-indirect",
          attackTraceHash: hash({ vector: "indirect", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/indirect",
          policyMappingRef: "policy-map:superagent-indirect-quarantine",
          expectedDecision: "quarantine",
          observedDecision: "quarantine",
          observedDecisionReceiptId: "decision:superagent-indirect",
          regressionStatus: "passed",
          evidenceRefs: ["trace:superagent-indirect", "policy-map:superagent-indirect-quarantine"],
          signedEvidenceRefs: ["ledger:sig-superagent-indirect"],
        },
        {
          fixtureId: "superagent-multimodal-fixture",
          vector: "multimodal",
          attackTraceRef: "trace:superagent-multimodal",
          attackTraceHash: hash({ vector: "multimodal", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/multimodal",
          policyMappingRef: "policy-map:superagent-multimodal-escalate",
          expectedDecision: "escalate",
          observedDecision: "escalate",
          observedDecisionReceiptId: "decision:superagent-multimodal",
          regressionStatus: "passed",
          evidenceRefs: ["trace:superagent-multimodal", "policy-map:superagent-multimodal-escalate"],
          signedEvidenceRefs: ["ledger:sig-superagent-multimodal"],
        },
        {
          fixtureId: "superagent-retrieved-content-fixture",
          vector: "retrieved_content",
          attackTraceRef: "trace:superagent-retrieved-content",
          attackTraceHash: hash({ vector: "retrieved_content", copiedSourceArtifacts: false }),
          policyId: "policy:prompt-injection/retrieved-content",
          policyMappingRef: "policy-map:superagent-retrieved-content-block",
          expectedDecision: "block",
          observedDecision: "block",
          observedDecisionReceiptId: "decision:superagent-retrieved-content",
          regressionStatus: "passed",
          evidenceRefs: ["trace:superagent-retrieved-content", "policy-map:superagent-retrieved-content-block"],
          signedEvidenceRefs: ["ledger:sig-superagent-retrieved-content"],
        },
      ],
    });

    expect(receipt.status).toBe("pass");
    expect(receipt.coverage.presentVectors).toEqual(["direct", "indirect", "multimodal", "retrieved_content"]);
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt)).toEqual({ valid: true, failClosedReasons: [] });
    expect(renderPromptInjectionRegressionSuiteMarkdown(receipt)).toContain("superagent-retrieved-content-fixture");
  });

  it("fails closed when Superagent repository and docs metadata replace suite evidence", () => {
    const receipt = buildPromptInjectionRegressionSuiteReceipt({
      suiteId: "superagent-metadata-only",
      suiteVersion: "2026.06.25",
      agentId: "shield-enforce-agent",
      runId: "run-gap-1259-metadata-only",
      requiredVectors: ["direct", "indirect", "multimodal", "retrieved_content"],
      sourceRefs: [REPO, README, DOCS],
      fixtures: [
        {
          fixtureId: "superagent-metadata-only-direct",
          vector: "direct",
          sourceMetadata: {
            sourceTitle: "Superagent SDK",
            sourceUrl: REPO,
            sourceId: "github_repo:superagent-ai/superagent",
          },
        },
      ],
    });

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.coverage.missingVectors).toEqual(["indirect", "multimodal", "retrieved_content"]);
    expect(receipt.rows[0]).toMatchObject({
      fixtureId: "superagent-metadata-only-direct",
      status: "missing_evidence",
    });
    expect(receipt.failClosedReasons).toEqual(expect.arrayContaining([
      "suite evidence refs missing",
      "suite signed evidence refs missing",
      "required vector indirect missing",
      "required vector multimodal missing",
      "required vector retrieved_content missing",
      "superagent-metadata-only-direct attack trace ref missing",
      "superagent-metadata-only-direct policy mapping ref missing",
      "superagent-metadata-only-direct observed decision missing",
      "superagent-metadata-only-direct regression status missing",
      "superagent-metadata-only-direct signed evidence refs missing",
    ]));
    expect(verifyPromptInjectionRegressionSuiteReceipt(receipt).valid).toBe(false);
  });

  it("does not add Superagent identifiers to generic prompt-injection suite modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Superagent");
    expect(combined).not.toContain("superagent-ai/superagent");
    expect(combined).not.toContain("safety-agent");
  });
});
