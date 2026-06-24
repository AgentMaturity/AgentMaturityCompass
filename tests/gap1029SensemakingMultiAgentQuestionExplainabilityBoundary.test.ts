import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-1029-sensemaking-multi-agent-question-explainability.md";
const OPENALEX = "https://openalex.org/W7153858602";
const OPENALEX_API = "https://api.openalex.org/works/W7153858602";
const DOI = "https://doi.org/10.1145/3772318.3791157";
const DOI_VALUE = "10.1145/3772318.3791157";
const CROSSREF = "https://api.crossref.org/works/10.1145/3772318.3791157";
const ACM = "https://dl.acm.org/doi/10.1145/3772318.3791157";
const VBN = "https://vbn.aau.dk/en/publications/sensemaking-in-multi-agent-llm-interfaces-how-users-interpret-tra/";
const VBN_UUID = "https://vbn.aau.dk/en/publications/29038e14-80a8-4e5d-bf98-27c1d27fa7d4";
const TITLE = "Sensemaking in Multi-Agent LLM Interfaces: How Users Interpret Transparency and Trustworthiness Cues";
const IDENTIFIER = "sensemaking_multi_agent_question_explainability";

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
    evidenceEventIds: ["ev-gap1029-transparency-row", "ev-gap1029-trust-repair-hint"],
    flags: [],
    narrative:
      "Multi-agent transparency and trustworthiness paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-1029 sensemaking multi-agent question-explainability boundary", () => {
  it("documents live OpenAlex, DOI, Crossref, ACM, and VBN metadata plus required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1029");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(DOI_VALUE);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain(ACM);
    expect(doc).toContain(VBN);
    expect(doc).toContain(VBN_UUID);
    expect(doc).toContain("Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems");
    expect(doc).toContain("publication_date `2026-04-13`");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("proceedings-article");
    expect(doc).toContain("article number `913`");
    expect(doc).toContain("pages `1-20`");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("CC BY 4.0");
    expect(doc).toContain("gold");
    expect(doc).toContain("reference count `109`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("Saumya Pareek");
    expect(doc).toContain("Jarod Govers");
    expect(doc).toContain("Naja Kathrine Kollerup");
    expect(doc).toContain("Emily Wong");
    expect(doc).toContain("Eduardo Velloso");
    expect(doc).toContain("Jorge Goncalves");
    expect(doc).toContain("University of Melbourne");
    expect(doc).toContain("Aalborg University");
    expect(doc).toContain("The University of Sydney");
    expect(doc).toContain("human-AI decision-making");
    expect(doc).toContain("human-AI interaction");
    expect(doc).toContain("information seeking");
    expect(doc).toContain("mental models");
    expect(doc).toContain("multi-agent chatbots");
    expect(doc).toContain("multi-agent LLM");
    expect(doc).toContain("reliance");
    expect(doc).toContain("sensemaking");
    expect(doc).toContain("transparency");
    expect(doc).toContain("trust");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("HTTP/2 403");
    expect(doc).toContain("Cloudflare challenge");
    expect(doc).toContain("VBN HTTP/2 200");
    expect(doc).toContain("Pure Portal");
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

  it("accepts sensemaking paper context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1029-sensemaking-reviewed-agent",
      runId: "run-gap-1029-question-explainability",
      generatedAt: "2026-06-24T18:50:00.000Z",
      sourceRefs: [OPENALEX, DOI, CROSSREF, VBN, "amc:no-sensemaking-paper-importer"],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap1029-transparency-row",
              event_hash: hash("a"),
              writer_sig: "sig-gap1029-transparency-row",
              event_type: "test",
              session_id: "session-gap1029-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap1029-trust-repair-hint",
              event_hash: hash("b"),
              writer_sig: "sig-gap1029-repair",
              event_type: "audit",
              session_id: "session-gap1029-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1029-paper-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap1029-paper",
                event_type: "review",
                session_id: "session-gap1029-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason:
                "OpenAlex, DOI, Crossref, ACM challenge headers, VBN metadata, CHI venue facts, transparency, trustworthiness, sensemaking, mental-model, and multi-agent interface labels are context only; they are not AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, or row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-1029-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap1029-transparency-row", "ev-gap1029-trust-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1029-paper-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint:
                "Keep the multi-agent sensemaking paper as source-review context and rely on AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap1029-sensemaking-multi-agent-pack",
              sourceRef: DOI,
              language: "typescript",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap1029/sensemaking-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap1029-sensemaking-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap1029-sensemaking",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap1029-sensemaking",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.88,
              status: "satisfied",
              evidenceRefs: ["ev-gap1029-transparency-row", "ev-gap1029-trust-repair-hint"],
              rejectedEvidenceRefs: ["ev-gap1029-paper-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap1029-transparency-row", "ev-gap1029-trust-repair-hint"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap1029-sensemaking-multi-agent-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap1029-sensemaking",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap1029-sensemaking-multi-agent-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap1029-sensemaking-multi-agent-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when sensemaking paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-1029-sensemaking-metadata-agent",
      runId: "run-gap-1029-metadata-only",
      generatedAt: "2026-06-24T18:50:00.000Z",
      sourceRefs: [OPENALEX_API, DOI, CROSSREF, ACM, VBN],
      rows: [
        {
          question: question("AMC-1.2"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Sensemaking paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap1029-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap1029-missing",
                event_type: "review",
                session_id: "session-gap1029-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason:
                "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: [
            "Multi-agent transparency and trustworthiness paper metadata is not question-level score explainability proof.",
          ],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "Multi-agent transparency and trustworthiness paper metadata is not question-level score explainability proof.",
    );
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add sensemaking paper identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain(OPENALEX_API);
      expect(source).not.toContain(DOI_VALUE);
      expect(source).not.toContain(VBN);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Sensemaking in Multi-Agent LLM Interfaces");
      expect(source).not.toContain("human-AI decision-making");
      expect(source).not.toContain("multi-agent chatbots");
    }
  });
});
