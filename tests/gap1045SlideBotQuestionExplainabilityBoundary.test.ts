import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1045-slidebot-question-explainability.md";
const OPENALEX = "https://openalex.org/W7138903429";
const OPENALEX_API = "https://api.openalex.org/works/W7138903429";
const DOI = "https://doi.org/10.1609/aaai.v40i48.42124";
const DOI_VALUE = "10.1609/aaai.v40i48.42124";
const CROSSREF = "https://api.crossref.org/works/10.1609/aaai.v40i48.42124";
const AAAI = "https://ojs.aaai.org/index.php/AAAI/article/view/42124";
const PDF = "https://ojs.aaai.org/index.php/AAAI/article/download/42124/46085";
const TITLE = "SlideBot: A Multi-Agent Framework for Generating Informative, Reliable, Multi-Modal Presentations";
const IDENTIFIER = "slidebot_question_explainability";

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
    questionId: "AMC-4.2",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.9,
    evidenceEventIds: ["ev-gap1045-question-row", "ev-gap1045-repair-hint"],
    flags: [],
    narrative: "SlideBot paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1045 SlideBot question-explainability boundary", () => {
  it("documents live SlideBot paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1045");
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
    expect(doc).toContain("issue `48`");
    expect(doc).toContain("pages `40907-40915`");
    expect(doc).toContain("Eric Xie");
    expect(doc).toContain("Danielle Waterfield");
    expect(doc).toContain("Danielle A. Waterfield");
    expect(doc).toContain("Michael Kennedy");
    expect(doc).toContain("Aidong Zhang");
    expect(doc).toContain("University of Virginia");
    expect(doc).toContain("Visual and Cognitive Learning Processes");
    expect(doc).toContain("Multimodal Machine Learning Applications");
    expect(doc).toContain("Intelligent Tutoring Systems and Adaptive Learning");
    expect(doc).toContain("Cognitive load");
    expect(doc).toContain("Personalization");
    expect(doc).toContain("Adaptability");
    expect(doc).toContain("Multimedia");
    expect(doc).toContain("Human-computer interaction");
    expect(doc).toContain("Instructional design");
    expect(doc).toContain("Quality Education");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("content-type: application/pdf");
    expect(doc).toContain("00108-EAAI26.XieE-EDU.pdf");
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

  it("accepts SlideBot context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1045-slidebot-reviewed-agent",
      runId: "run-gap-1045-question-explainability",
      generatedAt: "2026-06-25T02:20:00.000+05:30",
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, CROSSREF, AAAI, PDF, "amc:no-slidebot-subsystem"],
      rows: [
        {
          question: question("AMC-4.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1045-question-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1045-question-row",
              event_type: "test",
              session_id: "session-gap1045-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1045-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1045-repair",
              event_type: "audit",
              session_id: "session-gap1045-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1045-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1045-paper",
                event_type: "review",
                session_id: "session-gap1045-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, AAAI, PDF, SlideBot, multi-agent, multi-modal presentation, cognitive load, personalization, and education labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1045-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1045-question-row", "ev-gap1045-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1045-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the SlideBot paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1045-slidebot-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1045/slidebot-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1045-slidebot-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1045-slidebot",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1045-slidebot",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1045-question-row", "ev-gap1045-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1045-paper-metadata-only"],
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
      questionId: "AMC-4.2",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap1045-question-row", "ev-gap1045-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1045-slidebot-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1045-slidebot",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1045-slidebot-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1045-slidebot-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when SlideBot paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1045-slidebot-metadata-agent",
      runId: "run-gap-1045-metadata-only",
      generatedAt: "2026-06-25T02:20:00.000+05:30",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, AAAI],
      rows: [
        {
          question: question("AMC-4.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "SlideBot paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1045-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1045-missing",
                event_type: "review",
                session_id: "session-gap1045-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["SlideBot paper metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "SlideBot paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add SlideBot identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(PDF);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("SlideBot");
      expect(source).not.toContain("Multi-Agent Framework");
      expect(source).not.toContain("00108-EAAI26.XieE-EDU.pdf");
    }
  });
});
