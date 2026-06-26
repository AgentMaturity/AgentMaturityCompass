import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1010-el-agente-grafico-question-explainability.md";
const OPENALEX = "https://openalex.org/W7131078049";
const OPENALEX_API = "https://api.openalex.org/works/W7131078049";
const DOI = "https://doi.org/10.48550/arxiv.2602.17902";
const ARXIV = "https://arxiv.org/abs/2602.17902";
const ARXIV_V1 = "https://arxiv.org/abs/2602.17902v1";
const ARXIV_PDF = "https://arxiv.org/pdf/2602.17902v1";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2602.17902";
const IDENTIFIER = "el_agente_grafico_question_explainability";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function question(id: string): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) throw new Error(`missing test question ${id}`);
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.2",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.91,
    evidenceEventIds: ["ev-gap1010-execution-graph-row", "ev-gap1010-thresholds"],
    flags: [],
    narrative: "El Agente Grafico context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1010 El Agente Grafico question-explainability boundary", () => {
  it("documents live OpenAlex, DOI, and arXiv metadata plus required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1010");
    expect(doc).toContain("El Agente Gráfico");
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_V1);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("last-modified: Mon, 23 Feb 2026 01:11:02 GMT");
    expect(doc).toContain("publication_date 2026-02-19");
    expect(doc).toContain("preprint");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("green");
    expect(doc).toContain("cited_by_count 2");
    expect(doc).toContain("cs.AI");
    expect(doc).toContain("cs.MA");
    expect(doc).toContain("cs.SE");
    expect(doc).toContain("physics.chem-ph");
    expect(doc).toContain("Jiaru Bai");
    expect(doc).toContain("Abdulrahman Aldossary");
    expect(doc).toContain("Thomas Swanick");
    expect(doc).toContain("Marcel Müller");
    expect(doc).toContain("Alán Aspuru-Guzik");
    expect(doc).toContain("Scientific Computing and Data Management");
    expect(doc).toContain("Machine Learning in Materials Science");
    expect(doc).toContain("Correctness");
    expect(doc).toContain("Scalability");
    expect(doc).toContain("Workflow");
    expect(doc).toContain("Abstraction");
    expect(doc).toContain("Automated reasoning");
    expect(doc).toContain("Symbolic execution");
    expect(doc).toContain("Python");
    expect(doc).toContain("decision provenance");
    expect(doc).toContain("auditability");
    expect(doc).toContain("type-safe execution environment");
    expect(doc).toContain("dynamic knowledge graphs");
    expect(doc).toContain("object-graph mapper");
    expect(doc).toContain("typed Python objects");
    expect(doc).toContain("symbolic identifiers");
    expect(doc).toContain("provenance tracking");
    expect(doc).toContain("tool orchestration");
    expect(doc).toContain("automated benchmarking");
    expect(doc).toContain("quantum chemistry");
    expect(doc).toContain("conformer ensemble generation");
    expect(doc).toContain("metal-organic framework design");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("fail-closed thresholds");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts El Agente Grafico context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1010-el-agente-grafico-reviewed-agent",
      runId: "run-gap-1010-question-explainability",
      generatedAt: "2026-06-24T17:00:00.000Z",
      sourceRefs: [OPENALEX, DOI, ARXIV, ARXIV_PDF, "amc:no-el-agente-grafico-paper-importer"],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1010-execution-graph-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1010-execution-row",
              event_type: "test",
              session_id: "session-gap1010-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1010-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap1010-thresholds",
              event_type: "audit",
              session_id: "session-gap1010-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1010-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1010-paper",
                event_type: "review",
                session_id: "session-gap1010-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, arXiv metadata, paper labels, execution-graph language, and scientific workflow claims are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1010-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1010-execution-graph-row", "ev-gap1010-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1010-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep El Agente Grafico as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1010-el-agente-grafico-pack",
              sourceRef: ARXIV,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1010/el-agente-grafico-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1010-el-agente-grafico-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1010-el-agente-grafico",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1010-el-agente-grafico",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.93,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.91,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1010-execution-graph-row", "ev-gap1010-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1010-paper-metadata-only"],
              repairHint:
                "Preserve question-tagged eval rows, signed evidence IDs, rejected reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.2",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1010-execution-graph-row", "ev-gap1010-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1010-el-agente-grafico-pack",
          sourceRef: ARXIV,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1010-el-agente-grafico",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1010-el-agente-grafico-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1010-el-agente-grafico-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1010-el-agente-grafico-metadata-agent",
      runId: "run-gap-1010-metadata-only",
      generatedAt: "2026-06-24T17:00:00.000Z",
      sourceRefs: [OPENALEX_API, DOI, ARXIV_API],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "El Agente Grafico metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1010-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1010-missing",
                event_type: "review",
                session_id: "session-gap1010-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["El Agente Grafico paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "El Agente Grafico paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add El Agente Grafico identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("El Agente Gráfico");
      expect(source).not.toContain("El Agente Grafico");
    }
  });
});
