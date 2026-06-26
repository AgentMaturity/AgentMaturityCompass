import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1049-code-incoherence-question-explainability.md";
const OPENALEX = "https://openalex.org/W7138089774";
const OPENALEX_API = "https://api.openalex.org/works/W7138089774";
const DOI = "https://doi.org/10.1609/aaai.v40i39.40616";
const DOI_VALUE = "10.1609/aaai.v40i39.40616";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i39.40616";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/40616";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/40616/44577";
const TITLE = "Incoherence as Oracle-less Measure of Error in LLM-Based Code Generation";
const IDENTIFIER = "code_incoherence_question_explainability";

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
    confidence: 0.9,
    evidenceEventIds: ["ev-gap1049-question-row", "ev-gap1049-repair-hint"],
    flags: [],
    narrative:
      "Code-incoherence paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1049 code-incoherence question-explainability boundary", () => {
  it("documents live code-incoherence paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1049");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(AAAI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Proceedings of the AAAI Conference on Artificial Intelligence");
    expect(doc).toContain("Association for the Advancement of Artificial Intelligence");
    expect(doc).toContain("publication_date `2026-03-14`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("open access status `diamond`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("volume `40`");
    expect(doc).toContain("issue `39`");
    expect(doc).toContain("pages `33305-33313`");
    expect(doc).toContain("Thomas Jean-Michel Valentin");
    expect(doc).toContain("Ardi Madadi");
    expect(doc).toContain("Gaetano Sapia");
    expect(doc).toContain("Marcel Böhme");
    expect(doc).toContain("Ecole Normale Supérieure Paris-Saclay");
    expect(doc).toContain("Max Planck Institute for Security and Privacy");
    expect(doc).toContain("Software Engineering Research");
    expect(doc).toContain("Natural Language Processing Techniques");
    expect(doc).toContain("Topic Modeling");
    expect(doc).toContain("Oracle");
    expect(doc).toContain("Ranking (information retrieval)");
    expect(doc).toContain("False positive paradox");
    expect(doc).toContain("Programming language");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("19045-AAAI26.ValentinT-NLP.pdf");
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

  it("accepts code-incoherence context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1049-code-incoherence-reviewed-agent",
      runId: "run-gap-1049-question-explainability",
      generatedAt: "2026-06-25T03:05:00.000+05:30",
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, AAAI, PDF, "amc:no-code-incoherence-subsystem"],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1049-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1049-question-row",
              event_type: "test",
              session_id: "session-gap1049-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1049-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1049-repair",
              event_type: "audit",
              session_id: "session-gap1049-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1049-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1049-paper",
                event_type: "review",
                session_id: "session-gap1049-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, AAAI, PDF, oracle-less, incoherence, code generation, false-positive, ranking, and programming-language labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1049-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1049-question-row", "ev-gap1049-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1049-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the code-incoherence paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1049-code-incoherence-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1049/code-incoherence-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1049-code-incoherence-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1049-code-incoherence",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1049-code-incoherence",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1049-question-row", "ev-gap1049-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1049-paper-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap1049-question-row", "ev-gap1049-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1049-code-incoherence-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1049-code-incoherence",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1049-code-incoherence-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1049-code-incoherence-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when code-incoherence paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1049-code-incoherence-metadata-agent",
      runId: "run-gap-1049-metadata-only",
      generatedAt: "2026-06-25T03:05:00.000+05:30",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, AAAI],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Code-incoherence paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1049-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1049-missing",
                event_type: "review",
                session_id: "session-gap1049-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Code-incoherence paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Code-incoherence paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add code-incoherence identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("19045-AAAI26.ValentinT-NLP.pdf");
    }
  });
});
