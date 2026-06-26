import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1036-integrated-bi-question-explainability.md";
const OPENALEX = "https://openalex.org/W7149926154";
const OPENALEX_API = "https://api.openalex.org/works/W7149926154";
const DOI = "https://doi.org/10.3390/bdcc10040110";
const DOI_VALUE = "10.3390/bdcc10040110";
const CROSSREF = "https://api.crossref.org/works/10.3390/bdcc10040110";
const MDPI = "https://www.mdpi.com/2504-2289/10/4/110";
const PDF = "https://www.mdpi.com/2504-2289/10/4/110/pdf?version=1775385171";
const TITLE =
  "LLMs for Integrated Business Intelligence: A Big Data-Driven Framework Integrating Marketing Optimization, Financial Performance, and Audit Quality";
const IDENTIFIER = "integrated_bi_question_explainability";

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
    questionId: "AMC-1.3",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.9,
    evidenceEventIds: ["ev-gap1036-question-row", "ev-gap1036-repair-hint"],
    flags: [],
    narrative:
      "Integrated business intelligence paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1036 integrated BI question-explainability boundary", () => {
  it("documents live integrated BI paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1036");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Big Data and Cognitive Computing");
    expect(doc).toContain("publication_date `2026-04-05`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("cited_by_count `2`");
    expect(doc).toContain("Leonidas Theodorakopoulos");
    expect(doc).toContain("Aristeidis Karras");
    expect(doc).toContain("Alexandra Theodoropoulou");
    expect(doc).toContain("Christos Klavdianos");
    expect(doc).toContain("Audit");
    expect(doc).toContain("Business");
    expect(doc).toContain("Marketing");
    expect(doc).toContain("Customer lifetime value");
    expect(doc).toContain("2.8 million customers");
    expect(doc).toContain("USD 156 million");
    expect(doc).toContain("marketing ROI");
    expect(doc).toContain("financial forecasting error");
    expect(doc).toContain("fraud detection accuracy");
    expect(doc).toContain("Audit Quality Index");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
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

  it("accepts integrated BI context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1036-integrated-bi-reviewed-agent",
      runId: "run-gap-1036-question-explainability",
      generatedAt: "2026-06-25T00:35:00.000+05:30",
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, MDPI, PDF, "amc:no-integrated-bi-subsystem"],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1036-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1036-question-row",
              event_type: "test",
              session_id: "session-gap1036-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1036-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1036-repair",
              event_type: "audit",
              session_id: "session-gap1036-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1036-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1036-paper",
                event_type: "review",
                session_id: "session-gap1036-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, MDPI, integrated business intelligence, marketing optimization, financial forecasting, audit quality, ROI, MAPE, fraud-detection, and customer-lifetime-value labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1036-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1036-question-row", "ev-gap1036-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1036-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the integrated BI paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1036-integrated-bi-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1036/integrated-bi-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1036-integrated-bi-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1036-integrated-bi",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1036-integrated-bi",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1036-question-row", "ev-gap1036-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1036-paper-metadata-only"],
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
      questionId: "AMC-1.3",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1036-question-row", "ev-gap1036-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1036-integrated-bi-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1036-integrated-bi",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1036-integrated-bi-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1036-integrated-bi-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when integrated BI paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1036-integrated-bi-metadata-agent",
      runId: "run-gap-1036-metadata-only",
      generatedAt: "2026-06-25T00:35:00.000+05:30",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, MDPI],
      rows: [
        {
          question: question("AMC-1.3"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Integrated BI paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1036-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1036-missing",
                event_type: "review",
                session_id: "session-gap1036-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Integrated BI paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Integrated BI paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add integrated BI identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Integrated Business Intelligence");
      expect(source).not.toContain("Marketing Optimization");
      expect(source).not.toContain("Audit Quality Index");
    }
  });
});
