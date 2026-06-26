import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0674-swe-agent-question-explainability.md";
const SOURCE = "SWE-agent/SWE-agent";
const SOURCE_URL = "https://github.com/SWE-agent/SWE-agent";

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
    confidence: 0.86,
    evidenceEventIds: ["ev-gap0674-accepted-run", "ev-gap0674-accepted-receipt"],
    flags: [],
    narrative: "SWE-agent source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportArtifact.ts",
];

describe("GAP-0674 SWE-agent question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0674");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain("main");
    expect(doc).toContain("MIT");
    expect(doc).toContain("19.6k");
    expect(doc).toContain("2.1k forks");
    expect(doc).toContain("2,168 commits");
    expect(doc).toContain("SWE-bench");
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

  it("accepts SWE-agent context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0674-swe-agent-reviewed-agent",
      runId: "run-gap-0674-question-explainability",
      generatedAt: "2026-06-21T09:00:00.000Z",
      sourceRefs: [SOURCE_URL, "competitor:COMP-106"],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0674-accepted-run",
              event_hash: hash("a"),
              writer_sig: "sig-gap0674-run",
              event_type: "artifact",
              session_id: "session-gap0674-run",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0674-accepted-receipt",
              event_hash: hash("b"),
              writer_sig: "sig-gap0674-receipt",
              event_type: "audit",
              session_id: "session-gap0674-receipt",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0674-swe-agent-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0674-metadata",
                event_type: "review",
                session_id: "session-gap0674-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "SWE-agent GitHub metadata identifies a relevant source only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0674-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0674-accepted-run", "ev-gap0674-accepted-receipt"],
              rejectedEvidenceRefs: ["ev-gap0674-swe-agent-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep SWE-agent as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
      acceptedEvidenceIds: ["ev-gap0674-accepted-run", "ev-gap0674-accepted-receipt"],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("metadata identifies a relevant source only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when SWE-agent metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0674-metadata-only-agent",
      runId: "run-gap-0674-metadata-only",
      generatedAt: "2026-06-21T09:00:00.000Z",
      sourceRefs: [SOURCE_URL],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "SWE-agent metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0674-missing-amc-question-proof",
                event_hash: hash("d"),
                writer_sig: "sig-gap0674-missing",
                event_type: "review",
                session_id: "session-gap0674-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["SWE-agent source metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("SWE-agent source metadata is not question-level score explainability proof.");
  });

  it("does not add SWE-agent identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain("swe_agent_question_explainability");
      expect(source).not.toContain("COMP-106");
    }
  });
});
