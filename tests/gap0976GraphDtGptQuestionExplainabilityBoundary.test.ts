import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0976-graph-dt-gpt-question-explainability.md";
const CAMBRIDGE = "https://www.repository.cam.ac.uk/items/87f596f4-6981-415c-9ce6-e63aa74460d8";
const DOI = "https://doi.org/10.1016/j.autcon.2026.106791";
const OPENALEX = "https://openalex.org/W7125818766";
const TITLE = "LLM-enabled multi-agent framework for natural language interaction with graph-based digital twins";

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
    questionId: "AMC-4.1",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.9,
    evidenceEventIds: ["ev-gap0976-question-trace", "ev-gap0976-eval-thresholds"],
    flags: [],
    narrative: "Graph-DT-GPT paper context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0976 Graph-DT-GPT question-explainability boundary", () => {
  it("documents live Graph-DT-GPT paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0976");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(CAMBRIDGE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("Published version");
    expect(doc).toContain("Peer-reviewed");
    expect(doc).toContain("Article");
    expect(doc).toContain("Automation in Construction");
    expect(doc).toContain("Volume 183");
    expect(doc).toContain("Elsevier");
    expect(doc).toContain("Attribution 4.0 International");
    expect(doc).toContain("Yuandong Pan");
    expect(doc).toContain("Mudan Wang");
    expect(doc).toContain("Rabindra Lamsal");
    expect(doc).toContain("Sisi Zlatanova");
    expect(doc).toContain("Ioannis Brilakis");
    expect(doc).toContain("Graph-DT-GPT");
    expect(doc).toContain("modular agents");
    expect(doc).toContain("decision, query generation, and answer extraction");
    expect(doc).toContain("structured graph data");
    expect(doc).toContain("city-level graph with over 40,000 building nodes");
    expect(doc).toContain("room-level apartment layout graphs");
    expect(doc).toContain("100% and 95.5% answer correctness");
    expect(doc).toContain("Claude Sonnet 4.5 and GPT-4o");
    expect(doc).toContain("LangChain Neo4j pipelines");
    expect(doc).toContain("40% and 10%");
    expect(doc).toContain("publication_date: 2026-01-27");
    expect(doc).toContain("cited_by_count: 5");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Correctness");
    expect(doc).toContain("Scalability");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Graph database");
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

  it("accepts Graph-DT-GPT context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0976-graph-dt-gpt-reviewed-agent",
      runId: "run-gap-0976-question-explainability",
      generatedAt: "2026-06-24T13:30:00.000Z",
      sourceRefs: [CAMBRIDGE, DOI, OPENALEX, "amc:no-graph-dt-gpt-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0976-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0976-question-trace",
              event_type: "test",
              session_id: "session-gap0976-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0976-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0976-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0976-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0976-graph-dt-gpt-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0976-metadata",
                event_type: "review",
                session_id: "session-gap0976-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "Graph-DT-GPT paper metadata identifies relevant multi-agent digital-twin context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0976-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0976-question-trace", "ev-gap0976-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0976-graph-dt-gpt-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep Graph-DT-GPT as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0976-graph-dt-gpt-eval-score-pack",
              sourceRef: DOI,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0976/graph-dt-gpt-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0976-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0976-graph-dt-gpt-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0976-graph-dt-gpt-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.9,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0976-question-trace", "ev-gap0976-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0976-graph-dt-gpt-metadata-only"],
              repairHint: "Preserve question-tagged eval rows, thresholds, accepted evidence IDs, rejected evidence reasons, repair hints, and row hashes.",
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
      questionId: "AMC-4.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap0976-question-trace", "ev-gap0976-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0976-graph-dt-gpt-eval-score-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0976-graph-dt-gpt-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0976-graph-dt-gpt-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0976-graph-dt-gpt-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("multi-agent digital-twin context only");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Graph-DT-GPT metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0976-graph-dt-gpt-metadata-agent",
      runId: "run-gap-0976-metadata-only",
      generatedAt: "2026-06-24T13:30:00.000Z",
      sourceRefs: [DOI],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Graph-DT-GPT paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0976-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0976-missing",
                event_type: "review",
                session_id: "session-gap0976-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Graph-DT-GPT DOI/OpenAlex/Cambridge metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("Graph-DT-GPT DOI/OpenAlex/Cambridge metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add Graph-DT-GPT identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("graph_dt_gpt_question_explainability");
    }
  });
});
