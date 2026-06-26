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

const DOC = "docs/source-reviews/GAP-1240-promptfoo-adversarial-regression-duplicate-boundary.md";
const PROMPTFOO = "https://www.promptfoo.dev";
const REPO = "https://github.com/promptfoo/promptfoo";
const GITHUB_API = "https://api.github.com/repos/promptfoo/promptfoo";
const RAW_README = "https://raw.githubusercontent.com/promptfoo/promptfoo/main/README.md";
const RED_TEAM = "https://www.promptfoo.dev/docs/red-team/";
const GAP_1236_DOC = "docs/source-reviews/GAP-1236-promptfoo-adversarial-regression.md";
const TITLE = "Promptfoo: LLM evals & red teaming";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/assurance/assuranceRunner.ts",
  "src/redteam/runner.ts",
  "src/redteam/strategies.ts",
  "src/shield/runtimeAnalyzer.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

const engineEvaluation: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:promptfoo-competitor-boundary-001",
  annotationId: "annotation:promptfoo-competitor-redteam",
  continuousEvalId: "continuous-eval:gap-1240-promptfoo-boundary",
  evaluatorName: "amc-adversarial-regression",
  evaluatorVersion: "2026.06.25",
  transformId: "transform:promptfoo-competitor-safe-fixture",
  status: "failed",
  score0to1: 0.11,
  criteriaHash: hash(["promptfoo-competitor-context", "release-gate", "no-duplicate-subsystem"]),
  variablesHash: hash({ source: "COMP-026", copiedUpstreamArtifacts: false }),
  explanationHash: hash("synthetic promptfoo competitor regression blocked through existing AMC receipts"),
  rerunStatus: "failed",
  guardrailRuleIds: ["guardrail:prompt-injection", "guardrail:insecure-tool-use"],
  guardrailRuleTypes: ["prompt_injection", "tool_misuse"],
  failedGuardrailRuleCount: 2,
  promptInjectionDetected: true,
  alertRuleId: "alert:gap-1240-promptfoo-boundary",
  alertRuleMetricName: "GAP-1240 Promptfoo Duplicate Regression Rate",
  alertRuleQueryHash: hash("gap 1240 promptfoo duplicate regression rate > 0"),
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:shield-enforce-release-gate"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "shield-enforce-agent",
  corpusId: "gap-1240-promptfoo-duplicate-boundary-v1",
  corpusVersion: "2026.06.25",
  baselineRunId: "run-baseline-gap-1240-promptfoo",
  candidateRunId: "run-candidate-gap-1240-promptfoo",
  sourceRefs: [PROMPTFOO, REPO, GITHUB_API, RAW_README, RED_TEAM, GAP_1236_DOC],
  rows: [],
};

describe("GAP-1240 promptfoo duplicate adversarial regression boundary", () => {
  it("documents live promptfoo metadata and no-duplicate relevance decision", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1240");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PROMPTFOO);
    expect(doc).toContain(REPO);
    expect(doc).toContain(GITHUB_API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(RED_TEAM);
    expect(doc).toContain(GAP_1236_DOC);
    expect(doc).toContain("promptfoo/promptfoo");
    expect(doc).toContain("MIT");
    expect(doc).toContain("TypeScript");
    expect(doc).toContain("stargazers_count `22589`");
    expect(doc).toContain("pushed_at `2026-06-25T08:56:54Z`");
    expect(doc).toContain("updated_at `2026-06-25T11:53:39Z`");
    expect(doc).toContain("Ship agents, not vulnerabilities");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("GAP-1236");
    expect(doc).toContain("No duplicate product code");
    expect(doc).toContain("metadata-only");
  });

  it("reuses existing adversarial regression receipts for promptfoo competitor context", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "gap-1240-promptfoo-regression-001",
          surfaces: ["Shield", "Enforce", "Vault"],
          fixture: {
            task: "Replay a synthetic promptfoo competitor red-team regression without storing promptfoo prompts, configs, attacks, reports, screenshots, or generated outputs.",
            inputHash: hash({ fixture: "gap-1240-promptfoo-regression", copiedUpstreamArtifacts: false }),
            expectedHash: hash({ expectedDecision: "block_release", releaseGate: true }),
            seed: 1240,
            adversarialRegression: {
              exploitFixtureId: "gap-1240-promptfoo-safe-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: hash({ rerun: "gap-1240-promptfoo-regression", decision: "block_release" }),
              releaseGateReceiptId: "release-gate:gap-1240-promptfoo-001",
              taxonomyRefs: ["amc:adversarial/prompt-injection", "amc:adversarial/insecure-tool-use"],
              redTeamBenchmark: {
                benchmarkId: "gap-1240-promptfoo-competitor-boundary",
                benchmarkVersion: "2026.06.25",
                questionSetHash: hash("gap-1240-safe-question-set-manifest"),
                referenceAnswerManifestHash: hash("gap-1240-safe-reference-answer-manifest"),
                scoringConfigHash: hash("gap-1240-safe-scoring-config"),
                scoringModes: ["keyword", "semantic_similarity", "llm_judge"],
                providerBackend: "custom",
                modelConfigHash: hash("gap-1240-safe-model-config"),
                resultJsonHash: hash("gap-1240-safe-result-json"),
                traceExportHash: hash("gap-1240-safe-trace-export"),
                judgeRubricHash: hash("gap-1240-safe-judge-rubric"),
                questionCount: 11,
                minQuestionCount: 11,
                passThreshold0to1: 0.85,
                refusalScore0to1: 0.01,
                hallucinationScore0to1: 0.02,
                semanticScore0to1: 0.94,
              },
              engineEvaluation,
            },
          },
          baseline: {
            score0to1: 0.71,
            evidenceRefs: ["trace:baseline-gap-1240-promptfoo-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-gap-1240-promptfoo-001"],
          },
          candidate: {
            score0to1: 0.9,
            evidenceRefs: ["trace:candidate-gap-1240-promptfoo-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-gap-1240-promptfoo-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.sourceRefs).toEqual([PROMPTFOO, REPO, GITHUB_API, RAW_README, RED_TEAM, GAP_1236_DOC]);
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
      resultExportCount: 1,
      totalQuestionCount: 11,
      averageSemanticScore0to1: 0.94,
    });
    expect(result.ciReceipt).toMatchObject({
      passed: true,
      failClosed: false,
      adversarialRegressionRowCount: 1,
      failedAdversarialRegressionRowIds: [],
    });

    const markdown = renderReplayBenchmarkCorpusMarkdown(result.manifest, result.ciReceipt);
    expect(markdown).toContain("Adversarial Regression Rows: 1");
    expect(markdown).toContain("gap-1240-promptfoo-safe-fixture-001");
  });

  it("fails closed when promptfoo competitor metadata replaces exploit proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "gap-1240-promptfoo-metadata-only",
          fixture: {
            task: "Metadata-only promptfoo competitor reference without exploit rerun evidence.",
            inputHash: hash({ source: PROMPTFOO, competitor: "COMP-026" }),
            expectedHash: hash({ topic: "red-team prompt injection" }),
            adversarialRegression: {
              taxonomyRefs: ["amc:adversarial/prompt-injection"],
            },
            metadata: {
              sourceTitle: TITLE,
              sourceUrl: PROMPTFOO,
              sourceId: "COMP-026",
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-gap-1240-metadata"],
            signedEvidenceRefs: ["ledger:sig-baseline-gap-1240-metadata"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-gap-1240-metadata"],
            signedEvidenceRefs: ["ledger:sig-candidate-gap-1240-metadata"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "gap-1240-promptfoo-metadata-only",
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
      failedAdversarialRegressionRowIds: ["gap-1240-promptfoo-metadata-only"],
    });
  });

  it("does not add GAP-1240 or COMP-026 identifiers to generic security modules", () => {
    const combined = implementationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("GAP-1240");
    expect(combined).not.toContain("COMP-026");
    expect(combined).not.toContain("gap-1240-promptfoo");
  });
});
