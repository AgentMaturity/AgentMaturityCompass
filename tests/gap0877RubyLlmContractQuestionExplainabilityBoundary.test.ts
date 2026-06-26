import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0877-ruby-llm-contract-question-explainability.md";
const REPO = "justi/ruby_llm-contract";
const URL = "https://github.com/justi/ruby_llm-contract";
const TITLE = "ruby_llm-contract";

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
      "ev-gap0877-accepted-question-proof",
      "ev-gap0877-accepted-rejected-reasons",
      "ev-gap0877-accepted-repair-hint",
    ],
    flags: [],
    narrative: "ruby_llm-contract source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0877 ruby_llm-contract question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0877");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 14");
    expect(doc).toContain("Fork 0");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("97 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Ruby 100.0%");
    expect(doc).toContain("doc/ decisions");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("lib/ ruby_llm");
    expect(doc).toContain("spec");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("Gemfile");
    expect(doc).toContain("Rakefile");
    expect(doc).toContain("ruby_llm-contract.gemspec");
    expect(doc).toContain("Contracts for LLM quality");
    expect(doc).toContain("JSON output schema");
    expect(doc).toContain("retry_policy");
    expect(doc).toContain("cost tracking");
    expect(doc).toContain("compare_models");
    expect(doc).toContain("fail-fast");
    expect(doc).toContain("CI gate");
    expect(doc).toContain("baseline regression detection");
    expect(doc).toContain("eval history");
    expect(doc).toContain("score_trend");
    expect(doc).toContain("drift");
    expect(doc).toContain("Prompt A/B testing");
    expect(doc).toContain("observe DSL");
    expect(doc).toContain("estimate_eval_cost");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Gemini");
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

  it("accepts ruby_llm-contract context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0877-ruby-llm-contract-reviewed-agent",
      runId: "run-gap-0877-question-explainability",
      generatedAt: "2026-06-21T21:35:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0877-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0877-question-proof",
              event_type: "artifact",
              session_id: "session-gap0877-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0877-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0877-rejected",
              event_type: "review",
              session_id: "session-gap0877-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0877-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0877-repair",
              event_type: "audit",
              session_id: "session-gap0877-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0877-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0877-metadata",
                event_type: "review",
                session_id: "session-gap0877-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "ruby_llm-contract source metadata identifies relevant contract-validation context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0877-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0877-accepted-question-proof",
                "ev-gap0877-accepted-rejected-reasons",
                "ev-gap0877-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0877-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep contract validation, cost tracking, and regression metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0877-accepted-question-proof",
        "ev-gap0877-accepted-rejected-reasons",
        "ev-gap0877-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant contract-validation context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when ruby_llm-contract metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0877-metadata-only-agent",
      runId: "run-gap-0877-metadata-only",
      generatedAt: "2026-06-21T21:35:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "ruby_llm-contract source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0877-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0877-missing",
                event_type: "review",
                session_id: "session-gap0877-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/contract-validation metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/contract-validation metadata is not question-level score explainability proof.",
    );
  });

  it("does not add ruby_llm-contract identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ruby_llm_contract_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
