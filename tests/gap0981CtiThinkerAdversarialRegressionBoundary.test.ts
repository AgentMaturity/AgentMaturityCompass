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

const DOC = "docs/source-reviews/GAP-0981-cti-thinker-adversarial-regression.md";
const OPENALEX = "https://openalex.org/W7124423884";
const OPENALEX_API = "https://api.openalex.org/works/W7124423884";
const DOI = "https://doi.org/10.1186/s42400-025-00505-y";
const SPRINGER = "https://link.springer.com/article/10.1186/s42400-025-00505-y";
const PDF = "https://link.springer.com/content/pdf/10.1186/s42400-025-00505-y.pdf";
const SOURCE_REPO = "https://github.com/eastmountyxz/CTI-Thinker";
const TITLE =
  "CTI-Thinker: an LLM-driven system for CTI knowledge graph construction and attack reasoning";
const IDENTIFIER = "cti_thinker_adversarial_regression";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/assurance/assuranceRunner.ts",
  "src/redteam/runner.ts",
  "src/shield/runtimeAnalyzer.ts",
];

const hash = (value: unknown): string => sha256Hex(canonicalize(value));

const engineEvaluation: ReplayBenchmarkAdversarialEngineEvaluationFixture = {
  traceId: "trace:cti-thinker-regression-001",
  annotationId: "annotation:cti-thinker-threat-reasoning",
  continuousEvalId: "continuous-eval:cti-threat-reasoning-regression",
  evaluatorName: "amc-adversarial-regression",
  evaluatorVersion: "2026.06.13",
  transformId: "transform:cti-safe-redaction",
  status: "failed",
  score0to1: 0.18,
  criteriaHash: hash(["expected-decision", "release-gate", "safe-redacted-threat-reasoning"]),
  variablesHash: hash({ source: "cti-thinker", copiedThreatReportContent: false }),
  explanationHash: hash("synthetic CTI reasoning regression blocked with no copied CTI reports"),
  rerunStatus: "failed",
  guardrailRuleIds: ["guardrail:prompt-injection"],
  guardrailRuleTypes: ["prompt_injection"],
  failedGuardrailRuleCount: 1,
  promptInjectionDetected: true,
  alertRuleId: "alert:cti-adversarial-regression",
  alertRuleMetricName: "CTI Adversarial Regression Rate",
  alertRuleQueryHash: hash("cti adversarial regression rate > 0"),
  alertRuleThreshold: 0,
  alertRuleBound: "upper",
  alertWebhookRefs: ["webhook:watch-security"],
};

const baseInput: ReplayBenchmarkCorpusInput = {
  agentId: "security-reasoning-agent",
  corpusId: "cti-thinker-adversarial-regression-v1",
  corpusVersion: "2026.06.13",
  baselineRunId: "run-baseline-cti",
  candidateRunId: "run-candidate-cti",
  sourceRefs: [OPENALEX, DOI, SPRINGER],
  rows: [],
};

describe("GAP-0981 CTI-Thinker adversarial regression boundary", () => {
  it("documents live CTI-Thinker metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0981");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(SPRINGER);
    expect(doc).toContain(PDF);
    expect(doc).toContain(SOURCE_REPO);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 303");
    expect(doc).toContain("Cybersecurity");
    expect(doc).toContain("Springer Nature");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-16`");
    expect(doc).toContain("article");
    expect(doc).toContain("cited_by_count `4`");
    expect(doc).toContain("open access status `diamond`");
    expect(doc).toContain("Xiuzhang Yang");
    expect(doc).toContain("Ruijie Zhong");
    expect(doc).toContain("Yuling Chen");
    expect(doc).toContain("Guojun Peng");
    expect(doc).toContain("Di Yao");
    expect(doc).toContain("Chaofan Chen");
    expect(doc).toContain("Chenyang Wang");
    expect(doc).toContain("Dongni Zhang");
    expect(doc).toContain("Yilin Zhou");
    expect(doc).toContain("Zixuan Yang");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Knowledge graph");
    expect(doc).toContain("Robustness");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("APT attacks");
    expect(doc).toContain("cyber threat intelligence");
    expect(doc).toContain("ATT&CK");
    expect(doc).toContain("in-context learning");
    expect(doc).toContain("LoRA");
    expect(doc).toContain("vector-based alignment");
    expect(doc).toContain("GraphRAG");
    expect(doc).toContain("entity recognition");
    expect(doc).toContain("relation extraction");
    expect(doc).toContain("threat reasoning");
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

  it("binds CTI-style adversarial regression proof into existing replay receipts", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "cti-threat-reasoning-regression-001",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "Replay a synthetic CTI threat-reasoning regression without storing CTI reports, attack steps, or paper content.",
            inputHash: hash({ fixture: "cti-threat-reasoning", copiedSourceContent: false }),
            expectedHash: hash({ expectedDecision: "block_release", releaseGate: true }),
            seed: 981,
            adversarialRegression: {
              exploitFixtureId: "cti-thinker-safe-regression-fixture-001",
              expectedDecision: "block_release",
              actualDecision: "block_release",
              rerunOutputHash: hash({ rerun: "cti-threat-reasoning", decision: "block_release" }),
              releaseGateReceiptId: "release-gate:cti-thinker-001",
              taxonomyRefs: ["amc:adversarial/cti-threat-reasoning"],
              engineEvaluation,
            },
          },
          baseline: {
            score0to1: 0.76,
            evidenceRefs: ["trace:baseline-cti-threat-reasoning-001"],
            signedEvidenceRefs: ["ledger:sig-baseline-cti-threat-reasoning-001"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["trace:candidate-cti-threat-reasoning-001"],
            signedEvidenceRefs: ["ledger:sig-candidate-cti-threat-reasoning-001"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(true);
    expect(result.manifest.sourceRefs).toEqual([OPENALEX, DOI, SPRINGER]);
    expect(result.manifest.adversarialRegressionSummary).toMatchObject({
      rowCount: 1,
      failedRowIds: [],
      releaseGateReceiptCount: 1,
      engineEvaluationReceiptCount: 1,
      alertRuleReceiptCount: 1,
      failedGuardrailRuleCount: 1,
    });
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "cti-threat-reasoning-regression-001",
      status: "passed",
      adversarialRegression: {
        exploitFixtureId: "cti-thinker-safe-regression-fixture-001",
        expectedDecision: "block_release",
        actualDecision: "block_release",
        releaseGateReceiptId: "release-gate:cti-thinker-001",
        taxonomyRefs: ["amc:adversarial/cti-threat-reasoning"],
        engineEvaluation: {
          traceId: "trace:cti-thinker-regression-001",
          continuousEvalId: "continuous-eval:cti-threat-reasoning-regression",
          status: "failed",
          alertRuleMetricName: "CTI Adversarial Regression Rate",
          failedGuardrailRuleCount: 1,
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
    expect(markdown).toContain("cti-thinker-safe-regression-fixture-001");
  });

  it("fails closed when CTI source metadata replaces adversarial regression proof", () => {
    const result = runReplayBenchmarkCorpus({
      ...baseInput,
      rows: [
        {
          rowId: "cti-threat-reasoning-metadata-only",
          fixture: {
            task: "Metadata-only CTI-Thinker source reference without replay evidence.",
            inputHash: hash({ source: OPENALEX, doi: DOI }),
            expectedHash: hash({ title: TITLE }),
            adversarialRegression: {
              taxonomyRefs: ["amc:adversarial/cti-threat-reasoning"],
            },
            metadata: {
              sourceTitle: TITLE,
              sourceUrl: DOI,
              sourceId: OPENALEX,
            },
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: ["trace:baseline-cti-metadata-only"],
            signedEvidenceRefs: ["ledger:sig-baseline-cti-metadata-only"],
          },
          candidate: {
            score0to1: 0.81,
            evidenceRefs: ["trace:candidate-cti-metadata-only"],
            signedEvidenceRefs: ["ledger:sig-candidate-cti-metadata-only"],
          },
        },
      ],
    });

    expect(result.manifest.replayable).toBe(false);
    expect(result.manifest.rows[0]).toMatchObject({
      rowId: "cti-threat-reasoning-metadata-only",
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
      failedRowIds: ["cti-threat-reasoning-metadata-only"],
      failedAdversarialRegressionRowIds: ["cti-threat-reasoning-metadata-only"],
    });
  });

  it("keeps source-specific CTI identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7124423884");
      expect(source).not.toContain("10.1186/s42400-025-00505-y");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
