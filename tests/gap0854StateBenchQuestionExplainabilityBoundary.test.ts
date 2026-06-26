import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0854-state-bench-question-explainability.md";
const REPO = "microsoft/STATE-Bench";
const URL = "https://github.com/microsoft/STATE-Bench";
const RAW_README = "https://raw.githubusercontent.com/microsoft/STATE-Bench/main/README.md";
const LEADERBOARD = "https://microsoft.github.io/STATE-Bench/leaderboard/";
const TITLE = "STATE-Bench";

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
    questionId: "AMC-2.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.87,
    evidenceEventIds: [
      "ev-gap0854-accepted-question-proof",
      "ev-gap0854-accepted-rejected-reasons",
      "ev-gap0854-accepted-repair-hint",
    ],
    flags: [],
    narrative: "STATE-Bench source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0854 STATE-Bench question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0854");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(LEADERBOARD);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 57");
    expect(doc).toContain("Fork 9");
    expect(doc).toContain("Issues 3");
    expect(doc).toContain("Pull requests 6");
    expect(doc).toContain("87 Commits");
    expect(doc).toContain("v0.7.0 Latest May 28, 2026");
    expect(doc).toContain("Python 96.3%");
    expect(doc).toContain("JavaScript 1.8%");
    expect(doc).toContain("benchmark-framework");
    expect(doc).toContain("ai-agents");
    expect(doc).toContain("realistic, multi-step enterprise workflows");
    expect(doc).toContain("travel");
    expect(doc).toContain("customer support");
    expect(doc).toContain("shopping assistant");
    expect(doc).toContain("task-local sandbox database");
    expect(doc).toContain("domain-specific tools");
    expect(doc).toContain("simulated user");
    expect(doc).toContain("450 challenging enterprise tasks");
    expect(doc).toContain("Main Track");
    expect(doc).toContain("Agent Learning Track");
    expect(doc).toContain("train trajectories");
    expect(doc).toContain("retrieval hook");
    expect(doc).toContain("Task Completion pass@1");
    expect(doc).toContain("Task Completion pass^5");
    expect(doc).toContain("UX Score");
    expect(doc).toContain("Cost Per Task");
    expect(doc).toContain("synthetically generated using large language models");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hints");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts STATE-Bench context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0854-state-bench-reviewed-agent",
      runId: "run-gap-0854-question-explainability",
      generatedAt: "2026-06-21T20:32:00.000Z",
      sourceRefs: [URL, RAW_README, LEADERBOARD],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0854-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0854-question-proof",
              event_type: "artifact",
              session_id: "session-gap0854-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0854-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0854-rejected",
              event_type: "review",
              session_id: "session-gap0854-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0854-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0854-repair",
              event_type: "audit",
              session_id: "session-gap0854-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0854-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0854-metadata",
                event_type: "review",
                session_id: "session-gap0854-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "STATE-Bench source metadata identifies relevant enterprise workflow benchmark context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0854-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0854-accepted-question-proof",
                "ev-gap0854-accepted-rejected-reasons",
                "ev-gap0854-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0854-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep STATE-Bench enterprise workflow metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-2.1",
      status: "passed",
      acceptedEvidenceIds: [
        "ev-gap0854-accepted-question-proof",
        "ev-gap0854-accepted-rejected-reasons",
        "ev-gap0854-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant enterprise workflow benchmark context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when STATE-Bench metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0854-metadata-only-agent",
      runId: "run-gap-0854-metadata-only",
      generatedAt: "2026-06-21T20:32:00.000Z",
      sourceRefs: [URL, RAW_README, LEADERBOARD],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "STATE-Bench source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0854-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0854-missing",
                event_type: "review",
                session_id: "session-gap0854-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/enterprise workflow benchmark metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/enterprise workflow benchmark metadata is not question-level score explainability proof.",
    );
  });

  it("does not add STATE-Bench identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("state_bench_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
