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

const DOC = "docs/source-reviews/GAP-1236-promptfoo-adversarial-regression.md";
const REPO = "https://github.com/promptfoo/promptfoo";
const RAW_README = "https://raw.githubusercontent.com/promptfoo/promptfoo/main/README.md";
const DOCS = "https://www.promptfoo.dev/docs/intro/";
const RED_TEAM = "https://www.promptfoo.dev/docs/red-team/";
const CONFIG = "https://www.promptfoo.dev/docs/configuration/guide/";
const CICD = "https://www.promptfoo.dev/docs/integrations/ci-cd/";
const LATEST_RELEASE = "https://github.com/promptfoo/promptfoo/releases/tag/code-scan-action-0.1.8";
const MAIN_SHA = "4f8103c0ff8c53ae19fb8d64fd40ffb2e37f3ab6";
const TITLE = "Promptfoo: LLM evals & red teaming";
const IDENTIFIER = "promptfoo_adversarial_regression";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/assurance/assuranceRunner.ts",
  "src/redteam/runner.ts",
  "src/shield/runtimeAnalyzer.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

const engineEvaluation: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:promptfoo-regression-001",
  annotationId: "annotation:promptfoo-prompt-injection",
  continuousEvalId: "continuous-eval:promptfoo-adversarial-regression",
  evaluatorName: "amc-adversarial-regression",
  evaluatorVersion: "2026.06.25",
  transformId: "transform:promptfoo-safe-redaction",
  status: "failed",
  score0to1: 0.12,
  criteriaHash: hash(["expected-decision", "release-gate", "safe-redacted-redteam-regression"]),
  variablesHash: hash({ source: "promptfoo", copiedUpstreamArtifacts: false }),
  explanationHash: hash("synthetic promptfoo-style adversarial regression blocked with no copied prompts or configs"),
  rerunStatus: "failed",
  guardrailRuleIds: ["guardrail:prompt-injection", "guardrail:tool-misuse"],
  guardrailRuleTypes: ["prompt_injection", "tool_misuse"],
  failedGuardrailRuleCount: 2,
  promptInjectionDetected: true,
  alertRuleId: "alert:promptfoo-adversarial-regression",
  alertRuleMetricName: "Promptfoo-style Adversarial Regression Rate",
  alertRuleQueryHash: hash("promptfoo adversarial regression rate > 0"),
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:shield-enforce-release-gate"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "shield-enforce-agent",
  corpusId: "promptfoo-adversarial-regression-v1",
  corpusVersion: "2026.06.25",
  baselineRunId: "run-baseline-promptfoo",
  candidateRunId: "run-candidate-promptfoo",
  sourceRefs: [REPO, DOCS, RED_TEAM, CONFIG, CICD, LATEST_RELEASE],
  rows: [],
};

describe("GAP-1236 promptfoo adversarial regression boundary", () => {
  it("documents live promptfoo metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1236");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(RED_TEAM);
    expect(doc).toContain(CONFIG);
    expect(doc).toContain(CICD);
    expect(doc).toContain(LATEST_RELEASE);
    expect(doc).toContain("CLI and library for evaluating and red-teaming LLM apps");
    expect(doc).toContain("Promptfoo is now part of OpenAI");
    expect(doc).toContain("open source and MIT licensed");
    expect(doc).toContain("Test your prompts, agents, and RAGs");
    expect(doc).toContain("Red teaming/pentesting/vulnerability scanning for AI");
    expect(doc).toContain("Simple declarative configs with command line and CI/CD integration");
    expect(doc).toContain("MIT");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("stargazers_count `22573`");
    expect(doc).toContain("forks_count `2003`");
    expect(doc).toContain("open_issues_count `353`");
    expect(doc).toContain("pushed_at `2026-06-25T05:39:35Z`");
    expect(doc).toContain("updated_at `2026-06-25T07:37:10Z`");
    expect(doc).toContain(`main commit \`${MAIN_SHA}\``);
    expect(doc).toContain("release `code-scan-action-0.1.8`");
    expect(doc).toContain("prompt injections");
    expect(doc).toContain("untrusted user input");
    expect(doc).toContain("technical security vulnerabilities");
    expect(doc).toContain("assertions");
    expect(doc).toContain("threshold");
    expect(doc).toContain("tests");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("quality gate");
    expect(doc).toContain("exploit fixture");
    expect(doc).toContain("expected decision");
    expect(doc).toContain("rerun output");
    expect(doc).toContain("release gate receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("binds promptfoo-style adversarial regression proof into existing replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "promptfoo-redteam-regression-001",
          surfaces: ["Shield", "Enforce", "Vault"],
          fixture: {
            task: "Replay a synthetic promptfoo-style red-team regression without storing promptfoo prompts, configs, attacks, reports, or generated outputs.",
            inputHash: hash({ fixture: "promptfoo-redteam-regression", copiedUpstreamArtifacts: false }),
            expectedHash: hash({ expectedDecision: "block_release", releaseGate: true }),
            seed: 1236,
            adversarialRegression: {
              exploitFixtureId: "promptfoo-safe-regression-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: hash({ rerun: "promptfoo-redteam-regression", decision: "block_release" }),
              releaseGateReceiptId: "release-gate:promptfoo-001",
              taxonomyRefs: ["amc:adversarial/prompt-injection", "amc:adversarial/tool-misuse"],
              redTeamBenchmark: {
                benchmarkId: "promptfoo-style-redteam-regression",
                benchmarkVersion: "2026.06.25",
                questionSetHash: hash("promptfoo-safe-question-set-manifest"),
                referenceAnswerManifestHash: hash("promptfoo-safe-reference-answer-manifest"),
                scoringConfigHash: hash("promptfoo-safe-scoring-config"),
                scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
                providerBackend: "custom",
                modelConfigHash: hash("promptfoo-safe-model-config"),
                promptOptimizationConfigHash: hash("promptfoo-safe-prompt-optimization-config"),
                promptOptimizationIterationCount: 1,
                resultJsonHash: hash("promptfoo-safe-result-json"),
                resultCsvHash: hash("promptfoo-safe-result-csv"),
                traceExportHash: hash("promptfoo-safe-trace-export"),
                judgeRubricHash: hash("promptfoo-safe-judge-rubric"),
                questionCount: 12,
                minQuestionCount: 12,
                passThreshold0to1: 0.8,
                refusalScore0to1: 0,
                hallucinationScore0to1: 0.03,
                semanticScore0to1: 0.92,
              },
              engineEvaluation,
            },
          },
          baseline: {
            score0to1: 0.72,
            evidenceRefs: ["trace:baseline-promptfoo-redteam-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-promptfoo-redteam-001"],
          },
          candidate: {
            score0to1: 0.86,
            evidenceRefs: ["trace:candidate-promptfoo-redteam-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-promptfoo-redteam-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.sourceRefs).toEqual([REPO, DOCS, RED_TEAM, CONFIG, CICD, LATEST_RELEASE]);
    expect(result.manifest.adversarialRegressionSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      releaseGateReceiptCount: 1,
      engineEvaluationReceiptCount: 1,
      alertRuleReceiptCount: 1,
      failedGuardrailRuleCount: 2,
      redTeamBenchmarkRowCount: 1,
      providerBackends: ["custom"],
      scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
      promptOptimizationRunCount: 1,
      resultExportCount: 1,
      totalQuestionCount: 12,
      averageSemanticScore0to1: 0.92,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "promptfoo-redteam-regression-001",
      status: "passed",
      surfaces: ["Shield", "Enforce", "Vault"],
      adversarialRegression: {
        exploitFixtureId: "promptfoo-safe-regression-fixture-001",
        expectedDecision: "block_release",
        actualDecision: "block_release",
        releaseGateReceiptId: "release-gate:promptfoo-001",
        taxonomyRefs: ["amc:adversarial/prompt-injection", "amc:adversarial/tool-misuse"],
        redTeamBenchmark: {
          benchmarkId: "promptfoo-style-redteam-regression",
          providerBackend: "custom",
          questionCount: 12,
          scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
          semanticScore0to1: 0.92,
        },
        engineEvaluation: {
          traceId: "trace:promptfoo-regression-001",
          continuousEvalId: "continuous-eval:promptfoo-adversarial-regression",
          status: "failed",
          alertRuleMetricName: "Promptfoo-style Adversarial Regression Rate",
          failedGuardrailRuleCount: 2,
        },
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
    expect(markdown).toContain("Adversarial Red-Team Benchmark Rows: 1");
    expect(markdown).toContain("Adversarial Prompt Optimization Runs: 1");
    expect(markdown).toContain("promptfoo-safe-regression-fixture-001");
  });

  it("fails closed when promptfoo source metadata replaces adversarial regression proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "promptfoo-metadata-only",
          fixture: {
            task: "Metadata-only promptfoo source reference without replay evidence.",
            inputHash: hash({ source: REPO, docs: DOCS }),
            expectedHash: hash({ title: TITLE }),
            adversarialRegression: {
              taxonomyRefs: ["amc:adversarial/prompt-injection"],
            },
            metadata: {
              sourceTitle: TITLE,
              sourceUrl: REPO,
              sourceId: "promptfoo/promptfoo",
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-promptfoo-metadata-only"],
            signedEvidenceRefs: ["ledger:sig-baseline-promptfoo-metadata-only"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-promptfoo-metadata-only"],
            signedEvidenceRefs: ["ledger:sig-candidate-promptfoo-metadata-only"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "promptfoo-metadata-only",
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
      failedRowIds: ["promptfoo-metadata-only"],
      failedAdversarialRegressionRowIds: ["promptfoo-metadata-only"],
    });
  });

  it("keeps promptfoo adversarial identifiers out of generic implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOCS);
      expect(source).not.toContain(RED_TEAM);
      expect(source).not.toContain(CICD);
      expect(source).not.toContain(LATEST_RELEASE);
      expect(source).not.toContain(MAIN_SHA);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
