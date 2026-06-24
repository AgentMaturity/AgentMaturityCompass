import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0692-openai-evals-traces-question-explainability.md";
const SOURCE = "https://platform.openai.com/docs/guides/evals";
const REDIRECTED = "https://developers.openai.com/api/docs/guides/evals";
const AGENT_EVALS = "https://developers.openai.com/api/docs/guides/agent-evals";

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
    confidence: 0.88,
    evidenceEventIds: [
      "ev-gap0692-accepted-trace",
      "ev-gap0692-accepted-eval-row",
      "ev-gap0692-accepted-repair",
    ],
    flags: [],
    narrative: "OpenAI Evals and Traces source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0692 OpenAI Evals and Traces question-explainability boundary", () => {
  it("documents live OpenAI evals/traces metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0692");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(REDIRECTED);
    expect(doc).toContain(AGENT_EVALS);
    expect(doc).toContain("Working with evals");
    expect(doc).toContain("Evaluate agent workflows");
    expect(doc).toContain("Evals platform");
    expect(doc).toContain("read-only for existing users on October 31, 2026");
    expect(doc).toContain("shut down on November 30, 2026");
    expect(doc).toContain("Datasets");
    expect(doc).toContain("traces, graders, datasets, and eval runs");
    expect(doc).toContain("model calls");
    expect(doc).toContain("tool calls");
    expect(doc).toContain("guardrails");
    expect(doc).toContain("handoffs");
    expect(doc).toContain("Logs > Traces");
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

  it("accepts OpenAI eval/trace context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0692-openai-eval-trace-reviewed-agent",
      runId: "run-gap-0692-question-explainability",
      generatedAt: "2026-06-21T10:20:00.000Z",
      sourceRefs: [REDIRECTED, AGENT_EVALS],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0692-accepted-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0692-trace",
              event_type: "artifact",
              session_id: "session-gap0692-trace",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0692-accepted-eval-row",
              event_hash: hash("b"),
              writer_sig: "sig-gap0692-eval-row",
              event_type: "metric",
              session_id: "session-gap0692-eval-row",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0692-accepted-repair",
              event_hash: hash("c"),
              writer_sig: "sig-gap0692-repair",
              event_type: "audit",
              session_id: "session-gap0692-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0692-openai-docs-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0692-metadata",
                event_type: "review",
                session_id: "session-gap0692-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "OpenAI evals and traces documentation identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0692-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0692-accepted-trace",
                "ev-gap0692-accepted-eval-row",
                "ev-gap0692-accepted-repair",
              ],
              rejectedEvidenceRefs: ["ev-gap0692-openai-docs-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Use AMC-owned traces, eval rows, accepted evidence IDs, rejected evidence reasons, and repair hints; keep OpenAI eval/trace docs as source-review context only.",
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
        "ev-gap0692-accepted-trace",
        "ev-gap0692-accepted-eval-row",
        "ev-gap0692-accepted-repair",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("documentation identifies relevant source context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when OpenAI docs metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0692-metadata-only-agent",
      runId: "run-gap-0692-metadata-only",
      generatedAt: "2026-06-21T10:20:00.000Z",
      sourceRefs: [REDIRECTED],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "OpenAI evals/traces metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0692-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0692-missing",
                event_type: "review",
                session_id: "session-gap0692-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["OpenAI evals/traces source metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("OpenAI evals/traces source metadata is not question-level score explainability proof.");
  });

  it("does not add OpenAI Evals identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("OpenAI Evals and Traces");
      expect(source).not.toContain("openai_evals_traces_question_explainability");
      expect(source).not.toContain(REDIRECTED);
      expect(source).not.toContain(AGENT_EVALS);
    }
  });
});
