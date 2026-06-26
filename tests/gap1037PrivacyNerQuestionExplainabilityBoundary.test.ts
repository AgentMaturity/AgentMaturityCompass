import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1037-privacy-ner-question-explainability.md";
const OPENALEX = "https://openalex.org/W7143515573";
const OPENALEX_API = "https://api.openalex.org/works/W7143515573";
const DOI = "https://doi.org/10.3390/app16073332";
const DOI_VALUE = "10.3390/app16073332";
const CROSSREF = "https://api.crossref.org/works/10.3390/app16073332";
const MDPI = "https://www.mdpi.com/2076-3417/16/7/3332";
const PDF = "https://www.mdpi.com/2076-3417/16/7/3332/pdf?version=1774868239";
const TITLE =
  "On the Applicability of LLMs and SLMs for Privacy-Preserving Named Entity Recognition in Financial Applications";
const IDENTIFIER = "privacy_ner_question_explainability";

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
    questionId: "AMC-1.4",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.9,
    evidenceEventIds: ["ev-gap1037-question-row", "ev-gap1037-repair-hint"],
    flags: [],
    narrative:
      "Privacy-preserving NER paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1037 privacy NER question-explainability boundary", () => {
  it("documents live privacy NER paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1037");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(PDF);
    expect(doc).toContain("Applied Sciences");
    expect(doc).toContain("publication_date `2026-03-30`");
    expect(doc).toContain("OpenAlex type `article`");
    expect(doc).toContain("Crossref type `journal-article`");
    expect(doc).toContain("is_oa `true`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("volume `16`");
    expect(doc).toContain("issue `7`");
    expect(doc).toContain("page `3332`");
    expect(doc).toContain("Evgenia Psarra");
    expect(doc).toContain("Kyriakos Stefanidis");
    expect(doc).toContain("Athena Research");
    expect(doc).toContain("Industrial Systems Institute");
    expect(doc).toContain("University of Piraeus");
    expect(doc).toContain("Named-entity recognition");
    expect(doc).toContain("Transformer");
    expect(doc).toContain("Natural language processing");
    expect(doc).toContain("AI4Privacy PII 43 K dataset");
    expect(doc).toContain("54 PII categories");
    expect(doc).toContain("229 diverse use cases");
    expect(doc).toContain("accuracy, precision, recall, and F1-score");
    expect(doc).toContain("DistilBERT");
    expect(doc).toContain("ModernBERT");
    expect(doc).toContain("DeBERTa");
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

  it("accepts privacy NER context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1037-privacy-ner-reviewed-agent",
      runId: "run-gap-1037-question-explainability",
      generatedAt: "2026-06-25T00:50:00.000+05:30",
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, MDPI, PDF, "amc:no-privacy-ner-subsystem"],
      rows: [
        {
          question: question("AMC-1.4"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1037-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1037-question-row",
              event_type: "test",
              session_id: "session-gap1037-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1037-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1037-repair",
              event_type: "audit",
              session_id: "session-gap1037-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1037-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1037-paper",
                event_type: "review",
                session_id: "session-gap1037-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, MDPI, privacy-preserving NER, PII, financial application, AI4Privacy, DistilBERT, ModernBERT, DeBERTa, accuracy, precision, recall, and F1-score labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1037-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1037-question-row", "ev-gap1037-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1037-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the privacy NER paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1037-privacy-ner-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1037/privacy-ner-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1037-privacy-ner-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1037-privacy-ner",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1037-privacy-ner",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1037-question-row", "ev-gap1037-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1037-paper-metadata-only"],
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
      questionId: "AMC-1.4",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1037-question-row", "ev-gap1037-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1037-privacy-ner-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1037-privacy-ner",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1037-privacy-ner-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1037-privacy-ner-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when privacy NER paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1037-privacy-ner-metadata-agent",
      runId: "run-gap-1037-metadata-only",
      generatedAt: "2026-06-25T00:50:00.000+05:30",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, MDPI],
      rows: [
        {
          question: question("AMC-1.4"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Privacy NER paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1037-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1037-missing",
                event_type: "review",
                session_id: "session-gap1037-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Privacy NER paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Privacy NER paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add privacy NER identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Privacy-Preserving Named Entity Recognition");
      expect(source).not.toContain("AI4Privacy PII 43 K");
      expect(source).not.toContain("DeBERTa");
    }
  });
});
