import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  renderReplayBenchmarkCorpusMarkdown,
  runReplayBenchmarkCorpus,
  type ReplayBenchmarkAdversarialEngineEvaluationFixture,
  type ReplayBenchmarkCorpusInput,
} from "../src/benchmarks/replayBenchmarkCorpus.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";

const DOC = "docs/source-reviews/GAP-1237-prompt-injection-review-adversarial-regression.md";
const OPENALEX = "https://openalex.org/W7118532765";
const OPENALEX_API = "https://api.openalex.org/works/W7118532765";
const DOI = "https://doi.org/10.3390/info17010054";
const CROSSREF_API = "https://api.crossref.org/works/10.3390/info17010054";
const MDPI = "https://www.mdpi.com/2078-2489/17/1/54";
const TITLE = "Prompt Injection Attacks in Large Language Models and AI Agent Systems";
const IDENTIFIER = "eval-adversarial-regression";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/assurance/assuranceRunner.ts",
  "src/redteam/runner.ts",
  "src/redteam/strategies.ts",
  "src/shield/runtimeAnalyzer.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

const engineEvaluation: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:prompt-injection-review-001",
  annotationId: "annotation:indirect-prompt-injection",
  continuousEvalId: "continuous-eval:prompt-injection-review-regression",
  evaluatorName: "amc-prompt-injection-regression",
  evaluatorVersion: "2026.06.25",
  transformId: "transform:safe-prompt-injection-review-fixture",
  status: "failed",
  score0to1: 0.08,
  criteriaHash: hash(["prompt-injection", "tool-poisoning", "release-gate"]),
  variablesHash: hash({ copiedPaperText: false, copiedAttackPrompts: false }),
  explanationHash: hash("synthetic prompt-injection review regression blocked with no copied paper text or attacks"),
  rerunStatus: "failed",
  guardrailRuleIds: ["guardrail:direct-injection", "guardrail:indirect-injection", "guardrail:tool-poisoning"],
  guardrailRuleTypes: ["prompt_injection", "indirect_prompt_injection", "tool_misuse"],
  failedGuardrailRuleCount: 3,
  promptInjectionDetected: true,
  alertRuleId: "alert:prompt-injection-review-regression",
  alertRuleMetricName: "Prompt Injection Review Regression Rate",
  alertRuleQueryHash: hash("prompt injection review regression rate > 0"),
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:shield-enforce-release-gate"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "shield-enforce-agent",
  corpusId: "prompt-injection-review-adversarial-regression-v1",
  corpusVersion: "2026.06.25",
  baselineRunId: "run-baseline-prompt-injection-review",
  candidateRunId: "run-candidate-prompt-injection-review",
  sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF_API, MDPI],
  rows: [],
};

describe("GAP-1237 prompt-injection review adversarial regression boundary", () => {
  it("documents live paper metadata and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1237");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF_API);
    expect(doc).toContain(MDPI);
    expect(doc).toContain("Information");
    expect(doc).toContain("2026-01-07");
    expect(doc).toContain("Saidakhror Gulyamov");
    expect(doc).toContain("Andrey Rodionov");
    expect(doc).toContain("direct jailbreaking");
    expect(doc).toContain("indirect injection");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("tool poisoning");
    expect(doc).toContain("credential theft");
    expect(doc).toContain("OWASP Top 10 for LLM Applications 2025");
    expect(doc).toContain("Exploit fixture, expected decision, rerun output, and release gate receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No paper importer");
  });

  it("binds prompt-injection review context through existing adversarial regression receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "prompt-injection-review-regression-001",
          surfaces: ["Shield", "Enforce", "Vault"],
          fixture: {
            task: "Replay a synthetic prompt-injection review regression without storing paper text, attack prompts, exploit payloads, tables, figures, reports, or generated outputs.",
            inputHash: hash({ fixture: "prompt-injection-review", copiedSourceArtifacts: false }),
            expectedHash: hash({ expectedDecision: "block_release", releaseGate: true }),
            seed: 1237,
            adversarialRegression: {
              exploitFixtureId: "prompt-injection-safe-regression-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: hash({ rerun: "prompt-injection-review-regression", decision: "block_release" }),
              releaseGateReceiptId: "release-gate:prompt-injection-review-001",
              taxonomyRefs: ["amc:adversarial/direct-injection", "amc:adversarial/indirect-injection", "amc:adversarial/tool-poisoning"],
              redTeamBenchmark: {
                benchmarkId: "prompt-injection-review-regression",
                benchmarkVersion: "2026.06.25",
                questionSetHash: hash("safe-prompt-injection-question-set-manifest"),
                referenceAnswerManifestHash: hash("safe-prompt-injection-reference-answer-manifest"),
                scoringConfigHash: hash("safe-prompt-injection-scoring-config"),
                scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
                providerBackend: "custom",
                modelConfigHash: hash("safe-prompt-injection-model-config"),
                resultJsonHash: hash("safe-prompt-injection-result-json"),
                traceExportHash: hash("safe-prompt-injection-trace-export"),
                judgeRubricHash: hash("safe-prompt-injection-judge-rubric"),
                questionCount: 10,
                minQuestionCount: 10,
                passThreshold0to1: 0.9,
                refusalScore0to1: 0.02,
                hallucinationScore0to1: 0.01,
                semanticScore0to1: 0.95,
              },
              engineEvaluation,
            },
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: ["trace:baseline-prompt-injection-review-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-prompt-injection-review-001"],
          },
          candidate: {
            score0to1: 0.93,
            evidenceRefs: ["trace:candidate-prompt-injection-review-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-prompt-injection-review-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.sourceRefs).toEqual([OPENALEX, OPENALEX_API, DOI, CROSSREF_API, MDPI]);
    expect(result.manifest.adversarialRegressionSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      releaseGateReceiptCount: 1,
      engineEvaluationReceiptCount: 1,
      alertRuleReceiptCount: 1,
      failedGuardrailRuleCount: 3,
      redTeamBenchmarkRowCount: 1,
      providerBackends: ["custom"],
      scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
      resultExportCount: 1,
      totalQuestionCount: 10,
      averageSemanticScore0to1: 0.95,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "prompt-injection-review-regression-001",
      status: "passed",
      surfaces: ["Shield", "Enforce", "Vault"],
      adversarialRegression: {
        exploitFixtureId: "prompt-injection-safe-regression-fixture-001",
        expectedDecision: "block_release",
        actualDecision: "block_release",
        releaseGateReceiptId: "release-gate:prompt-injection-review-001",
      },
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      adversarialRegressionRowCount: 1,
      failedAdversarialRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Adversarial Regression Rows: 1");
    expect(markdown).toContain("Adversarial Engine Eval Receipts: 1");
    expect(markdown).toContain("prompt-injection-safe-regression-fixture-001");
  });

  it("fails closed when paper metadata replaces exploit fixtures and release-gate proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "prompt-injection-review-metadata-only",
          fixture: {
            task: "Metadata-only prompt-injection paper reference without exploit rerun evidence.",
            inputHash: hash({ source: DOI, paper: TITLE }),
            expectedHash: hash({ topic: "prompt injection" }),
            adversarialRegression: {
              taxonomyRefs: ["amc:adversarial/prompt-injection"],
            },
            metadata: {
              sourceTitle: TITLE,
              sourceUrl: DOI,
              sourceId: "W7118532765",
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-prompt-injection-metadata"],
            signedEvidenceRefs: ["ledger:sig-baseline-prompt-injection-metadata"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-prompt-injection-metadata"],
            signedEvidenceRefs: ["ledger:sig-candidate-prompt-injection-metadata"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "prompt-injection-review-metadata-only",
      status: "missing_evidence",
    });
    expect(result.manifest.rows[0]?.issues).toEqual(expect.arrayContaining([
      "adversarial exploit fixture missing",
      "adversarial expected decision missing",
      "adversarial actual decision missing",
      "adversarial rerun output hash missing",
      "adversarial release gate receipt missing",
      "adversarial engine evaluation evidence missing",
    ]));
    expect(result.ciReceipt).toMatchObject({
      passed: false,
      failClosed: true,
      failedAdversarialRegressionRowIds: ["prompt-injection-review-metadata-only"],
    });
  });

  it("does not add paper-specific identifiers to generic adversarial regression modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("W7118532765");
    expect(combined).not.toContain("10.3390/info17010054");
    expect(combined).not.toContain(TITLE);
    expect(combined).not.toContain(IDENTIFIER);
  });
});
