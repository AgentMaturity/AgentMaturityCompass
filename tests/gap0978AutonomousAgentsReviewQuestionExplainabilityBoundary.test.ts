import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0978-autonomous-agents-review-question-explainability.md";
const OPENALEX = "https://openalex.org/W4416982487";
const OPENALEX_API = "https://api.openalex.org/works/W4416982487";
const DOI = "https://doi.org/10.1109/access.2026.3698694";
const IEEE = "https://ieeexplore.ieee.org/document/11540994/";
const TITLE = "From LLM Reasoning to Autonomous AI Agents: A Comprehensive Review";

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
    evidenceEventIds: ["ev-gap0978-question-trace", "ev-gap0978-eval-thresholds"],
    flags: [],
    narrative: "Autonomous-agent survey context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0978 autonomous agents review question-explainability boundary", () => {
  it("documents live paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0978");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(IEEE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("HTTP/2 302");
    expect(doc).toContain("x-amzn-waf-action: challenge");
    expect(doc).toContain("IEEE Access");
    expect(doc).toContain("Institute of Electrical and Electronics Engineers");
    expect(doc).toContain("publication_year `2026`");
    expect(doc).toContain("publication_date `2026-01-01`");
    expect(doc).toContain("article");
    expect(doc).toContain("cited_by_count `6`");
    expect(doc).toContain("open access status `gold`");
    expect(doc).toContain("Mohamed Amine Ferrag");
    expect(doc).toContain("Norbert Tihanyi");
    expect(doc).toContain("Debbah");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Modular design");
    expect(doc).toContain("Artificial intelligence");
    expect(doc).toContain("Software engineering");
    expect(doc).toContain("Autonomous agent");
    expect(doc).toContain("about 60 benchmarks");
    expect(doc).toContain("ACP");
    expect(doc).toContain("MCP");
    expect(doc).toContain("A2A");
    expect(doc).toContain("failure modes");
    expect(doc).toContain("dynamic tool integration");
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

  it("accepts survey context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0978-autonomous-agents-reviewed-agent",
      runId: "run-gap-0978-question-explainability",
      generatedAt: "2026-06-24T14:45:00.000Z",
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, IEEE, "amc:no-paper-importer-or-taxonomy-claim"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0978-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0978-question-trace",
              event_type: "test",
              session_id: "session-gap0978-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0978-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0978-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0978-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0978-survey-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0978-metadata",
                event_type: "review",
                session_id: "session-gap0978-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "The autonomous-agents review identifies relevant benchmark taxonomy context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0978-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0978-question-trace", "ev-gap0978-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0978-survey-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep the review paper as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0978-autonomous-agents-review-eval-score-pack",
              sourceRef: DOI,
              language: "python",
              testFramework: "custom",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0978/autonomous-agents-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0978-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0978-autonomous-agents-review-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0978-autonomous-agents-review-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.93,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.91,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0978-question-trace", "ev-gap0978-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0978-survey-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0978-question-trace", "ev-gap0978-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0978-autonomous-agents-review-eval-score-pack",
          sourceRef: DOI,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0978-autonomous-agents-review-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0978-autonomous-agents-review-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0978-autonomous-agents-review-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("benchmark taxonomy context only");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when survey metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0978-autonomous-agents-metadata-agent",
      runId: "run-gap-0978-metadata-only",
      generatedAt: "2026-06-24T14:45:00.000Z",
      sourceRefs: [OPENALEX, DOI],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Autonomous-agents review metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0978-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0978-missing",
                event_type: "review",
                session_id: "session-gap0978-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["OpenAlex/DOI/IEEE metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("OpenAlex/DOI/IEEE metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add autonomous-agents review identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("10.1109/access.2026.3698694");
      expect(source).not.toContain("W4416982487");
      expect(source).not.toContain("gap0978_autonomous_agents_question_explainability");
    }
  });
});
