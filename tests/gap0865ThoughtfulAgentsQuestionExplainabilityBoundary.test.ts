import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0865-thoughtful-agents-question-explainability.md";
const REPO = "xybruceliu/thoughtful-agents";
const URL = "https://github.com/xybruceliu/thoughtful-agents";
const PYPI = "https://pypi.org/project/thoughtful-agents/";
const ARXIV = "https://arxiv.org/abs/2506.06975";
const TITLE = "Proactive Agents with Inner Thoughts";

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
    confidence: 0.86,
    evidenceEventIds: [
      "ev-gap0865-accepted-question-proof",
      "ev-gap0865-accepted-rejected-reasons",
      "ev-gap0865-accepted-repair-hint",
    ],
    flags: [],
    narrative: "thoughtful-agents source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0865 thoughtful-agents question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0865");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(PYPI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 39");
    expect(doc).toContain("Fork 11");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("20 Commits");
    expect(doc).toContain("assets/images");
    expect(doc).toContain("examples");
    expect(doc).toContain("scripts");
    expect(doc).toContain("tests");
    expect(doc).toContain("thoughtful_agents");
    expect(doc).toContain("PyPI_README.md");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("structured approach to modeling the internal thought processes");
    expect(doc).toContain("proactive AI driven by its own internal thoughts");
    expect(doc).toContain("Proactive Conversational Agents with Inner Thoughts");
    expect(doc).toContain("CHI 2025");
    expect(doc).toContain("Trigger");
    expect(doc).toContain("Retrieval");
    expect(doc).toContain("Thought Formation");
    expect(doc).toContain("Evaluation");
    expect(doc).toContain("Participation");
    expect(doc).toContain("Thinking engine");
    expect(doc).toContain("System 1");
    expect(doc).toContain("System 2");
    expect(doc).toContain("Mental object management");
    expect(doc).toContain("ThoughtReservoir");
    expect(doc).toContain("MemoryStore");
    expect(doc).toContain("Conversation");
    expect(doc).toContain("Event");
    expect(doc).toContain("Overt Proactivity");
    expect(doc).toContain("Covert Proactivity");
    expect(doc).toContain("Tonal Proactivity");
    expect(doc).toContain("predict_turn_taking_type");
    expect(doc).toContain("decide_next_speaker_and_utterance");
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

  it("accepts thoughtful-agents context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0865-thoughtful-agents-reviewed-agent",
      runId: "run-gap-0865-question-explainability",
      generatedAt: "2026-06-21T21:04:00.000Z",
      sourceRefs: [URL, PYPI, ARXIV],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0865-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0865-question-proof",
              event_type: "artifact",
              session_id: "session-gap0865-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0865-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0865-rejected",
              event_type: "review",
              session_id: "session-gap0865-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0865-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0865-repair",
              event_type: "audit",
              session_id: "session-gap0865-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0865-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0865-metadata",
                event_type: "review",
                session_id: "session-gap0865-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "thoughtful-agents source metadata identifies relevant proactive inner-thought agent context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0865-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0865-accepted-question-proof",
                "ev-gap0865-accepted-rejected-reasons",
                "ev-gap0865-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0865-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep thoughtful-agents proactive inner-thought metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0865-accepted-question-proof",
        "ev-gap0865-accepted-rejected-reasons",
        "ev-gap0865-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant proactive inner-thought agent context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when thoughtful-agents metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0865-metadata-only-agent",
      runId: "run-gap-0865-metadata-only",
      generatedAt: "2026-06-21T21:04:00.000Z",
      sourceRefs: [URL, PYPI, ARXIV],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "thoughtful-agents source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0865-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0865-missing",
                event_type: "review",
                session_id: "session-gap0865-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/proactive inner-thought agent metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/proactive inner-thought agent metadata is not question-level score explainability proof.",
    );
  });

  it("does not add thoughtful-agents identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("thoughtful_agents_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
