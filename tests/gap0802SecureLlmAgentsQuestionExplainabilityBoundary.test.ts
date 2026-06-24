import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0802-secure-llm-agents-question-explainability.md";
const ARXIV = "https://arxiv.org/abs/2606.10749";
const OPENALEX = "W7164446700";
const TITLE = "Toward Secure LLM Agents: Threat Surfaces, Attacks, Defenses, and Evaluation";

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
    confidence: 0.88,
    evidenceEventIds: [
      "ev-gap0802-accepted-question-proof",
      "ev-gap0802-accepted-rejected-reasons",
      "ev-gap0802-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Secure LLM agents source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0802 secure LLM agents question-explainability boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0802");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Yuchen Ling");
    expect(doc).toContain("Shengcheng Yu");
    expect(doc).toContain("Zhenyu Chen");
    expect(doc).toContain("Chunrong Fang");
    expect(doc).toContain("Tue Jun 9 12:01:07 2026");
    expect(doc).toContain("247 papers");
    expect(doc).toContain("lifecycle-based");
    expect(doc).toContain("systems-oriented framework");
    expect(doc).toContain("information flow");
    expect(doc).toContain("delegated authority");
    expect(doc).toContain("persistent state");
    expect(doc).toContain("prompt injection");
    expect(doc).toContain("tool-mediated control-flow hijacking");
    expect(doc).toContain("multi-agent propagation");
    expect(doc).toContain("trust boundaries");
    expect(doc).toContain("privilege control");
    expect(doc).toContain("provenance-aware state management");
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

  it("accepts secure-agent context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0802-secure-agent-reviewed-agent",
      runId: "run-gap-0802-question-explainability",
      generatedAt: "2026-06-21T21:20:00.000Z",
      sourceRefs: [ARXIV, `https://openalex.org/${OPENALEX}`],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0802-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0802-question-proof",
              event_type: "artifact",
              session_id: "session-gap0802-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0802-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0802-rejected",
              event_type: "review",
              session_id: "session-gap0802-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0802-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0802-repair",
              event_type: "audit",
              session_id: "session-gap0802-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0802-paper-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0802-metadata",
                event_type: "review",
                session_id: "session-gap0802-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Secure LLM Agents paper metadata identifies relevant security context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0802-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0802-accepted-question-proof",
                "ev-gap0802-accepted-rejected-reasons",
                "ev-gap0802-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0802-paper-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep secure-agent survey findings as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0802-accepted-question-proof",
        "ev-gap0802-accepted-rejected-reasons",
        "ev-gap0802-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant security context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when secure-agent paper metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0802-metadata-only-agent",
      runId: "run-gap-0802-metadata-only",
      generatedAt: "2026-06-21T21:20:00.000Z",
      sourceRefs: [ARXIV],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Secure LLM Agents paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0802-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0802-missing",
                event_type: "review",
                session_id: "session-gap0802-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["arXiv/OpenAlex/title/security-survey metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "arXiv/OpenAlex/title/security-survey metadata is not question-level score explainability proof.",
    );
  });

  it("does not add secure-agent identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("secure_llm_agents_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
