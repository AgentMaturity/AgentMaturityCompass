import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0693-prompty-question-explainability.md";
const SOURCE = "microsoft/prompty";
const SOURCE_URL = "https://github.com/microsoft/prompty";

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
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.87,
    evidenceEventIds: [
      "ev-gap0693-accepted-prompt-trace",
      "ev-gap0693-accepted-template-review",
      "ev-gap0693-accepted-repair",
    ],
    flags: [],
    narrative: "Prompty source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0693 Prompty question-explainability boundary", () => {
  it("documents live Prompty metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0693");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain("v2 Alpha");
    expect(doc).toContain(".prompty");
    expect(doc).toContain("VS Code, Python, or TypeScript");
    expect(doc).toContain("live preview");
    expect(doc).toContain("connections sidebar");
    expect(doc).toContain("chat mode");
    expect(doc).toContain(".tracy trace file");
    expect(doc).toContain("render, parse, execute, process");
    expect(doc).toContain("timing and payloads");
    expect(doc).toContain("YAML frontmatter");
    expect(doc).toContain("role markers");
    expect(doc).toContain("template syntax");
    expect(doc).toContain("1.2k stars");
    expect(doc).toContain("118 forks");
    expect(doc).toContain("1,216 commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("0.2.3-beta");
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

  it("accepts Prompty context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0693-prompty-reviewed-agent",
      runId: "run-gap-0693-question-explainability",
      generatedAt: "2026-06-21T10:35:00.000Z",
      sourceRefs: [SOURCE_URL, "github_repo:microsoft/prompty"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0693-accepted-prompt-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0693-trace",
              event_type: "artifact",
              session_id: "session-gap0693-trace",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0693-accepted-template-review",
              event_hash: hash("b"),
              writer_sig: "sig-gap0693-template",
              event_type: "review",
              session_id: "session-gap0693-template",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0693-accepted-repair",
              event_hash: hash("c"),
              writer_sig: "sig-gap0693-repair",
              event_type: "audit",
              session_id: "session-gap0693-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0693-prompty-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0693-metadata",
                event_type: "review",
                session_id: "session-gap0693-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Prompty GitHub metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0693-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0693-accepted-prompt-trace",
                "ev-gap0693-accepted-template-review",
                "ev-gap0693-accepted-repair",
              ],
              rejectedEvidenceRefs: ["ev-gap0693-prompty-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep Prompty as source-review context and rely on AMC-owned prompt traces, accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-4.1",
      status: "passed",
      acceptedEvidenceIds: [
        "ev-gap0693-accepted-prompt-trace",
        "ev-gap0693-accepted-template-review",
        "ev-gap0693-accepted-repair",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("GitHub metadata identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Prompty metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0693-metadata-only-agent",
      runId: "run-gap-0693-metadata-only",
      generatedAt: "2026-06-21T10:35:00.000Z",
      sourceRefs: [SOURCE_URL],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Prompty metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0693-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0693-missing",
                event_type: "review",
                session_id: "session-gap0693-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Prompty source metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("Prompty source metadata is not question-level score explainability proof.");
  });

  it("does not add Prompty identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("prompty_question_explainability");
      expect(source).not.toContain("github_repo:microsoft/prompty");
    }
  });
});
