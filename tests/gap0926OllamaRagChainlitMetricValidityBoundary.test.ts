import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricValidationReport } from "../src/score/metricValidity.js";
import type { DiagnosticReport, LayerName, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0926-ollama-rag-chainlit-metric-validity.md";
const REPO = "ohdoking/ollama-with-rag";
const URL = "https://github.com/ohdoking/ollama-with-rag";
const TITLE = "Ollama with RAG and Chainlit";

const implementationFiles = [
  "src/score/metricValidity.ts",
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
];

const layerName: LayerName = "Evaluation and Improvement";

function score(index: number, finalLevel = 3, confidence = 0.88): QuestionScore {
  return {
    questionId: `AMC-OLLAMA-RAG-${index.toString().padStart(2, "0")}`,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`ollama-rag-metric-row-${index}`],
    flags: [],
    narrative: `ollama-with-rag source-review context is bounded to AMC metric-validity sample ${index}`,
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "ollama-rag-context-agent",
    runId,
    ts,
    layerScores: [{ layerName, avgFinalLevel: layerValue, confidenceWeightedFinalLevel: layerValue }],
  } as DiagnosticReport;
}

function signedRef(evidenceId: string, index: number) {
  return {
    evidenceId,
    eventHash: `${(index + 926).toString(16)}`.repeat(64).slice(0, 64),
    writerSig: `ollama-rag-metric-writer-${index}`,
    eventType: "metric" as const,
    sessionId: `ollama-rag-metric-session-${index}`,
    ts: Date.UTC(2026, 5, 22),
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

describe("GAP-0926 Ollama with RAG and Chainlit metric-validity boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0926");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("33 Commits");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain(".env");
    expect(doc).toContain(".gitignore");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("bot.py");
    expect(doc).toContain("chainlit.md");
    expect(doc).toContain("load_data_vdb.py");
    expect(doc).toContain("requirements-extended.txt");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Packages 0");
    expect(doc).toContain("Python 100.0%");
    expect(doc).toContain("Ollama locally");
    expect(doc).toContain("RAG (Retrieval-Augmented Generation)");
    expect(doc).toContain("Chainlit");
    expect(doc).toContain("Chromadb");
    expect(doc).toContain("Vectorstore");
    expect(doc).toContain("gpt4all");
    expect(doc).toContain("text embeddings");
    expect(doc).toContain("langchain");
    expect(doc).toContain("ChatGPT-like interface");
    expect(doc).toContain("Install Ollama");
    expect(doc).toContain("pip install -r requirements.txt");
    expect(doc).toContain("mkdir data");
    expect(doc).toContain("mkdir vectorstores/db");
    expect(doc).toContain("python3 load_data_vdb.py");
    expect(doc).toContain("chainlit run bot.py -w");
    expect(doc).toContain("fine-tuning and evaluation module");
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

  it("accepts Ollama RAG context only through existing metric-validity receipts", () => {
    const questionScores = Array.from({ length: 17 }, (_, index) => score(index + 1));
    const evidenceIds = [
      "ollama-rag-retrieval-coverage",
      "ollama-rag-validation-table",
      "ollama-rag-sample-size",
      "ollama-rag-confidence-interval",
      "ollama-rag-reliability-check",
      "ollama-rag-regression-threshold",
      "ollama-rag-metric-owner",
      "ollama-rag-chatbot-outcome-alignment",
      "ollama-rag-repeatability-evidence",
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => signedRef(row.evidenceEventIds[0]!, index)),
      ...evidenceIds.map((evidenceId, index) => signedRef(evidenceId, index + 100)),
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ollama-rag-context-agent",
        runId: "run-gap0926-ollama-rag-metric-validity",
        ts: Date.UTC(2026, 5, 22),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 0.85,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.84,
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "local-ollama-rag-construct-validity",
          "vectorstore-retrieval-fit",
          "embedding-repeatability",
          "chatbot-response-quality",
          "chainlit-eval-boundary",
        ].map((facetId, index) => ({
          facetId: `ollama-rag-${facetId}`,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
        })),
        processEvidenceChecks: [
          ["validation-table", "ollama-rag-validation-table"],
          ["sample-size", "ollama-rag-sample-size"],
          ["confidence-interval", "ollama-rag-confidence-interval"],
          ["reliability-check", "ollama-rag-reliability-check"],
          ["regression-threshold", "ollama-rag-regression-threshold"],
          ["metric-owner", "ollama-rag-metric-owner"],
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `ollama-rag-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId],
        })),
        outcomeAlignmentChecks: [{
          outcomeId: "ollama-rag-score-predicts-chatbot-answer-quality",
          aligned: true,
          evidenceRefs: ["ollama-rag-chatbot-outcome-alignment", "ollama-rag-repeatability-evidence"],
        }],
        sourceRefs: [URL],
        gateMode: "ci",
      },
      [
        prior("run-gap0926-baseline", Date.UTC(2026, 5, 8), 3),
        prior("run-gap0926-repeat", Date.UTC(2026, 5, 15), 3.01),
      ],
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      sampleSize: 17,
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      status: "pass",
    });
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.84);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toEqual([URL]);
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  it("fails closed when Ollama RAG metadata replaces signed metric-validity evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "ollama-rag-context-agent",
      runId: "run-gap0926-metadata-only",
      ts: Date.UTC(2026, 5, 22),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score(1, 1, 0.12), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-OLLAMA-RAG-01", layerName }],
      sourceRefs: [URL],
      gateMode: "ci",
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  it("does not add Ollama RAG identifiers to metric-validity implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ollama_rag_chainlit_metric_validity");
    }
  });
});
