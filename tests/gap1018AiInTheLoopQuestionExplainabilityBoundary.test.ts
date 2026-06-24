import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1018-ai-in-the-loop-question-explainability.md";
const OPENALEX = "https://openalex.org/W7125630689";
const OPENALEX_API = "https://api.openalex.org/works/W7125630689";
const DOI = "https://doi.org/10.56553/popets-2026-0006";
const CROSSREF = "https://api.crossref.org/works/10.56553/popets-2026-0006";
const PUBLISHER = "https://petsymposium.org/popets/2026/popets-2026-0006.php";
const PDF = "https://petsymposium.org/popets/2026/popets-2026-0006.pdf";
const TITLE =
  "AI-in-the-Loop: Privacy Preserving Real-Time Scam Detection and Conversational Scam-baiting by Leveraging LLMs and Federated Learning";
const IDENTIFIER = "ai_in_the_loop_question_explainability";

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
    evidenceEventIds: ["ev-gap1018-scam-risk-row", "ev-gap1018-privacy-thresholds"],
    flags: [],
    narrative: "AI-in-the-loop scam paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1018 AI-in-the-loop question-explainability boundary", () => {
  it("documents live OpenAlex, DOI, Crossref, publisher, and PDF metadata plus required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1018");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(PUBLISHER);
    expect(doc).toContain(PDF);
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/1.1 200 OK");
    expect(doc).toContain("Content-Length: 4294220");
    expect(doc).toContain("Last-Modified: Sun, 25 Jan 2026 16:48:15 GMT");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("journal-article");
    expect(doc).toContain("Proceedings on Privacy Enhancing Technologies");
    expect(doc).toContain("Privacy Enhancing Technologies Symposium Advisory Board");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("hybrid");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("Ismail Hossain");
    expect(doc).toContain("Sai Puppala");
    expect(doc).toContain("Md. Jahangir Alam");
    expect(doc).toContain("Sajedul Talukder");
    expect(doc).toContain("The University of Texas at El Paso");
    expect(doc).toContain("Southern Illinois University Carbondale");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Internet privacy");
    expect(doc).toContain("Federated learning");
    expect(doc).toContain("Computer security");
    expect(doc).toContain("Moderation");
    expect(doc).toContain("real-time scam detection");
    expect(doc).toContain("conversational scam-baiting");
    expect(doc).toContain("differential privacy");
    expect(doc).toContain("FedAvg");
    expect(doc).toContain("guard models");
    expect(doc).toContain("LlamaGuard");
    expect(doc).toContain("MD-Judge");
    expect(doc).toContain("PII leakage");
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

  it("accepts AI-in-the-loop paper context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1018-ai-in-loop-reviewed-agent",
      runId: "run-gap-1018-question-explainability",
      generatedAt: "2026-06-24T18:00:00.000Z",
      sourceRefs: [OPENALEX, DOI, CROSSREF, PUBLISHER, PDF, "amc:no-ai-in-loop-paper-importer"],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1018-scam-risk-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1018-risk-row",
              event_type: "test",
              session_id: "session-gap1018-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1018-privacy-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap1018-thresholds",
              event_type: "audit",
              session_id: "session-gap1018-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1018-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1018-paper",
                event_type: "review",
                session_id: "session-gap1018-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, publisher, PDF, scam-detection, federated-learning, and guard-model labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1018-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1018-scam-risk-row", "ev-gap1018-privacy-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1018-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the AI-in-the-loop scam paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1018-ai-in-loop-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1018/ai-in-loop-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1018-ai-in-loop-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1018-ai-in-loop",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1018-ai-in-loop",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1018-scam-risk-row", "ev-gap1018-privacy-thresholds"],
              rejectedEvidenceRefs: ["ev-gap1018-paper-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap1018-scam-risk-row", "ev-gap1018-privacy-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1018-ai-in-loop-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1018-ai-in-loop",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1018-ai-in-loop-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1018-ai-in-loop-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1018-ai-in-loop-metadata-agent",
      runId: "run-gap-1018-metadata-only",
      generatedAt: "2026-06-24T18:00:00.000Z",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, PUBLISHER],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "AI-in-the-loop paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1018-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1018-missing",
                event_type: "review",
                session_id: "session-gap1018-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["AI-in-the-loop paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "AI-in-the-loop paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add AI-in-the-loop paper identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("AI-in-the-Loop");
      expect(source).not.toContain("Scam-baiting");
      expect(source).not.toContain("Federated Learning");
    }
  });
});
