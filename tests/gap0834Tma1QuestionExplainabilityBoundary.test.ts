import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0834-tma1-question-explainability.md";
const REPO = "tma1-ai/tma1";
const URL = "https://github.com/tma1-ai/tma1";
const TITLE = "Local-first observability your agent reads back";

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
      "ev-gap0834-accepted-question-proof",
      "ev-gap0834-accepted-rejected-reasons",
      "ev-gap0834-accepted-repair-hint",
    ],
    flags: [],
    narrative: "TMA1 source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0834 TMA1 question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0834");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("api.github.com DNS lookup failed");
    expect(doc).toContain("records every LLM call");
    expect(doc).toContain("hooks");
    expect(doc).toContain("MCP tools");
    expect(doc).toContain("anomaly");
    expect(doc).toContain("dashboard");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Go");
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

  it("accepts TMA1 context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0834-tma1-reviewed-agent",
      runId: "run-gap-0834-question-explainability",
      generatedAt: "2026-06-21T23:34:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0834-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0834-question-proof",
              event_type: "artifact",
              session_id: "session-gap0834-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0834-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0834-rejected",
              event_type: "review",
              session_id: "session-gap0834-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0834-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0834-repair",
              event_type: "audit",
              session_id: "session-gap0834-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0834-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0834-metadata",
                event_type: "review",
                session_id: "session-gap0834-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "TMA1 source metadata identifies relevant observability context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0834-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0834-accepted-question-proof",
                "ev-gap0834-accepted-rejected-reasons",
                "ev-gap0834-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0834-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep TMA1 observability metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0834-accepted-question-proof",
        "ev-gap0834-accepted-rejected-reasons",
        "ev-gap0834-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant observability context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when TMA1 metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0834-metadata-only-agent",
      runId: "run-gap-0834-metadata-only",
      generatedAt: "2026-06-21T23:34:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "TMA1 source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0834-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0834-missing",
                event_type: "review",
                session_id: "session-gap0834-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/TMA1 observability metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/TMA1 observability metadata is not question-level score explainability proof.",
    );
  });

  it("does not add TMA1 identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("tma1_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
