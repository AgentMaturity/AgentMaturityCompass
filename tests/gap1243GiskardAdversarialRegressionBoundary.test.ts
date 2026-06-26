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

const DOC = "docs/source-reviews/GAP-1243-giskard-adversarial-regression.md";
const HOME = "https://www.giskard.ai";
const REPO = "https://github.com/Giskard-AI/giskard-oss";
const GITHUB_API = "https://api.github.com/repos/Giskard-AI/giskard";
const RAW_README = "https://raw.githubusercontent.com/Giskard-AI/giskard/main/README.md";
const DOCS = "https://docs.giskard.ai/oss";
const PYPI = "https://pypi.org/pypi/giskard/json";
const TITLE = "Evals, Red Teaming and Test Generation for Agentic Systems";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/assurance/assuranceRunner.ts",
  "src/redteam/runner.ts",
  "src/redteam/strategies.ts",
  "src/shield/runtimeAnalyzer.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

const engineEvaluation: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:giskard-regression-001",
  annotationId: "annotation:giskard-agent-vulnerability",
  continuousEvalId: "continuous-eval:giskard-adversarial-regression",
  evaluatorName: "amc-giskard-style-regression",
  evaluatorVersion: "2026.06.25",
  transformId: "transform:giskard-safe-regression-fixture",
  status: "failed",
  score0to1: 0.1,
  criteriaHash: hash(["giskard", "agent-vulnerability", "release-gate"]),
  variablesHash: hash({ source: "COMP-029", copiedUpstreamArtifacts: false }),
  explanationHash: hash("synthetic Giskard-style adversarial regression blocked through AMC receipts"),
  rerunStatus: "failed",
  guardrailRuleIds: ["guardrail:prompt-injection", "guardrail:data-leakage", "guardrail:harmful-content"],
  guardrailRuleTypes: ["prompt_injection", "data_exfiltration", "unsafe_content"],
  failedGuardrailRuleCount: 3,
  promptInjectionDetected: true,
  alertRuleId: "alert:giskard-adversarial-regression",
  alertRuleMetricName: "Giskard-style Adversarial Regression Rate",
  alertRuleQueryHash: hash("giskard style adversarial regression rate > 0"),
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:shield-enforce-release-gate"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "shield-enforce-agent",
  corpusId: "giskard-adversarial-regression-v1",
  corpusVersion: "2026.06.25",
  baselineRunId: "run-baseline-giskard",
  candidateRunId: "run-candidate-giskard",
  sourceRefs: [HOME, REPO, GITHUB_API, RAW_README, DOCS, PYPI],
  rows: [],
};

describe("GAP-1243 Giskard adversarial regression boundary", () => {
  it("documents live Giskard metadata and no-bloat relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1243");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(HOME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(PYPI);
    expect(doc).toContain("Giskard-AI/giskard-oss");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Python");
    expect(doc).toContain("stargazers_count `5464`");
    expect(doc).toContain("pushed_at `2026-06-25T10:10:07Z`");
    expect(doc).toContain("AI Red Teaming & LLM Security Platform");
    expect(doc).toContain("Open-Source Evaluation & Testing library for LLM Agents");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("data leakage");
    expect(doc).toContain("OWASP LLM Top-10");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Giskard scanner");
  });

  it("binds Giskard source context through existing adversarial regression receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "giskard-regression-001",
          surfaces: ["Shield", "Enforce", "Vault"],
          fixture: {
            task: "Replay a synthetic Giskard-style agent vulnerability regression without storing Giskard code, prompts, scan configs, payloads, reports, screenshots, or generated outputs.",
            inputHash: hash({ fixture: "giskard-regression", copiedUpstreamArtifacts: false }),
            expectedHash: hash({ expectedDecision: "block_release", releaseGate: true }),
            seed: 1243,
            adversarialRegression: {
              exploitFixtureId: "giskard-safe-regression-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: hash({ rerun: "giskard-regression", decision: "block_release" }),
              releaseGateReceiptId: "release-gate:giskard-001",
              taxonomyRefs: [
                "amc:adversarial/prompt-injection",
                "amc:adversarial/data-leakage",
                "amc:adversarial/harmful-content",
              ],
              redTeamBenchmark: {
                benchmarkId: "giskard-style-agent-vulnerability-regression",
                benchmarkVersion: "2026.06.25",
                questionSetHash: hash("giskard-safe-question-set-manifest"),
                referenceAnswerManifestHash: hash("giskard-safe-reference-answer-manifest"),
                scoringConfigHash: hash("giskard-safe-scoring-config"),
                scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
                providerBackend: "custom",
                modelConfigHash: hash("giskard-safe-model-config"),
                resultJsonHash: hash("giskard-safe-result-json"),
                traceExportHash: hash("giskard-safe-trace-export"),
                judgeRubricHash: hash("giskard-safe-judge-rubric"),
                questionCount: 13,
                minQuestionCount: 13,
                passThreshold0to1: 0.87,
                refusalScore0to1: 0.01,
                hallucinationScore0to1: 0.02,
                semanticScore0to1: 0.93,
              },
              engineEvaluation,
            },
          },
          baseline: {
            score0to1: 0.69,
            evidenceRefs: ["trace:baseline-giskard-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-giskard-001"],
          },
          candidate: {
            score0to1: 0.91,
            evidenceRefs: ["trace:candidate-giskard-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-giskard-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.sourceRefs).toEqual([HOME, REPO, GITHUB_API, RAW_README, DOCS, PYPI]);
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
      totalQuestionCount: 13,
      averageSemanticScore0to1: 0.93,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      adversarialRegressionRowCount: 1,
      failedAdversarialRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Adversarial Regression Rows: 1");
    expect(markdown).toContain("giskard-safe-regression-fixture-001");
  });

  it("fails closed when Giskard metadata replaces exploit fixtures and release-gate proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "giskard-metadata-only",
          fixture: {
            task: "Metadata-only Giskard source reference without exploit rerun evidence.",
            inputHash: hash({ source: HOME, competitor: "COMP-029" }),
            expectedHash: hash({ topic: "agent vulnerability scanner" }),
            adversarialRegression: {
              taxonomyRefs: ["amc:adversarial/prompt-injection"],
            },
            metadata: {
              sourceTitle: TITLE,
              sourceUrl: HOME,
              sourceId: "COMP-029",
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-giskard-metadata"],
            signedEvidenceRefs: ["ledger:sig-baseline-giskard-metadata"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-giskard-metadata"],
            signedEvidenceRefs: ["ledger:sig-candidate-giskard-metadata"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "giskard-metadata-only",
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
      failedAdversarialRegressionRowIds: ["giskard-metadata-only"],
    });
  });

  it("does not add Giskard identifiers to generic adversarial regression modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("Giskard");
    expect(combined).not.toContain("COMP-029");
    expect(combined).not.toContain("giskard-safe-regression");
  });
});
