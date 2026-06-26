import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0894-smallevals-metric-validity.md";
const REPO = "mburaksayici/smallevals";
const URL = "https://github.com/mburaksayici/smallevals";
const TITLE = "smallevals";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.87): QuestionScore {
  return {
    questionId: `AMC-SMALLEVALS-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`smallevals-metric-row-${index}`],
    flags: [],
    narrative: `smallevals source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "smallevals-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 894).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `smallevals-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `smallevals-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0894 smallevals metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0894");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Star 20");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 1");
    expect(doc).toContain("22 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("logo");
    expect(doc).toContain("smallevals");
    expect(doc).toContain("tests");
    expect(doc).toContain(".python-version");
    expect(doc).toContain("example_usage_chromadb.py");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("Local LLM Evaluation Framework with Tiny 0.6B Models");
    expect(doc).toContain("CPU-fast");
    expect(doc).toContain("GPU-blazing fast");
    expect(doc).toContain("offline retrieval evaluation");
    expect(doc).toContain("RAG systems");
    expect(doc).toContain("0.6B models");
    expect(doc).toContain("QAG-0.6B");
    expect(doc).toContain("CRC-0.6B");
    expect(doc).toContain("GJ-0.6B");
    expect(doc).toContain("ASM-0.6B");
    expect(doc).toContain("Milvus");
    expect(doc).toContain("Elastic");
    expect(doc).toContain("PGVector");
    expect(doc).toContain("Chroma");
    expect(doc).toContain("Pinecone");
    expect(doc).toContain("FAISS");
    expect(doc).toContain("Qdrant");
    expect(doc).toContain("Weaviate");
    expect(doc).toContain("generate questions");
    expect(doc).toContain("top_k");
    expect(doc).toContain("n_chunks");
    expect(doc).toContain("retrieval metrics");
    expect(doc).toContain("validation table");
    expect(doc).toContain("confidence interval");
    expect(doc).toContain("sample size");
    expect(doc).toContain("metric owner");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts smallevals context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 16 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "smallevals-retrieval-coverage",
      "smallevals-validation-table",
      "smallevals-sample-size",
      "smallevals-confidence-interval",
      "smallevals-reliability-check",
      "smallevals-regression-threshold",
      "smallevals-metric-owner",
      "smallevals-retrieval-outcome-alignment",
      "smallevals-rag-eval-repeatability",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "smallevals-context-agent",
        runId: "run-gap0894-smallevals-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.84,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.83,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "retrieval-question-generation-coverage",
          "vector-db-agnostic-evaluation",
          "rag-grounding-relevance",
          "offline-repeatability",
          "tiny-model-evaluator-limitations",
        ].map((facetId, index) => ({
          facetId: `smallevals-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "smallevals-validation-table"],
          ["sample-size", "smallevals-sample-size"],
          ["confidence-interval", "smallevals-confidence-interval"],
          ["reliability-check", "smallevals-reliability-check"],
          ["regression-threshold", "smallevals-regression-threshold"],
          ["metric-owner", "smallevals-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `smallevals-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "smallevals-score-predicts-rag-retrieval-quality",
          aligned: true,
          evidenceRefs: ["smallevals-retrieval-outcome-alignment", "smallevals-rag-eval-repeatability"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0894-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0894-repeat", Date.UTC(2026, 5, 15), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 16,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.83);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when smallevals metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "smallevals-context-agent",
      runId: "run-gap0894-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-SMALLEVALS-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add smallevals identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("smallevals_metric_validity");
    }
  });
});
