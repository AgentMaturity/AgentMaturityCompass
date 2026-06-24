import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0864-chi-bench-question-explainability.md";
const REPO = "actava-ai/chi-bench";
const URL = "https://github.com/actava-ai/chi-bench";
const DOCS = "https://actava.ai/benchmarks/docs/quickstart";
const ARXIV = "https://arxiv.org/abs/2605.16679";
const TITLE = "CHI-Bench: Can AI Agents Automate End-to-End, Long-Horizon, Policy-Rich Healthcare Workflows?";

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
      "ev-gap0864-accepted-question-proof",
      "ev-gap0864-accepted-rejected-reasons",
      "ev-gap0864-accepted-repair-hint",
    ],
    flags: [],
    narrative: "CHI-Bench source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0864 CHI-Bench question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0864");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 41");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 10");
    expect(doc).toContain("124 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 98.3%");
    expect(doc).toContain("Other 1.7%");
    expect(doc).toContain("benchmark");
    expect(doc).toContain("care-management");
    expect(doc).toContain("healthcare-ai");
    expect(doc).toContain("prior-authorization");
    expect(doc).toContain("long-horizon, policy-rich healthcare workflow agents");
    expect(doc).toContain("provider prior authorization");
    expect(doc).toContain("payer utilization management");
    expect(doc).toContain("population care management");
    expect(doc).toContain("20 healthcare apps exposed over MCP");
    expect(doc).toContain("1,279-document Managed-Care Operations Handbook");
    expect(doc).toContain("75 tasks");
    expect(doc).toContain("78 single-agent tasks");
    expect(doc).toContain("23 provider-payer E2E tasks");
    expect(doc).toContain("pass@1");
    expect(doc).toContain("pass^3");
    expect(doc).toContain("Marathon");
    expect(doc).toContain("scorecard.json");
    expect(doc).toContain("reward.json");
    expect(doc).toContain("binary_reward");
    expect(doc).toContain("fractional_reward");
    expect(doc).toContain("submission.json");
    expect(doc).toContain("results.csv");
    expect(doc).toContain("provenance.json");
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

  it("accepts CHI-Bench context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0864-chi-bench-reviewed-agent",
      runId: "run-gap-0864-question-explainability",
      generatedAt: "2026-06-21T21:00:00.000Z",
      sourceRefs: [URL, DOCS, ARXIV],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0864-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0864-question-proof",
              event_type: "artifact",
              session_id: "session-gap0864-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0864-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0864-rejected",
              event_type: "review",
              session_id: "session-gap0864-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0864-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0864-repair",
              event_type: "audit",
              session_id: "session-gap0864-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0864-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0864-metadata",
                event_type: "review",
                session_id: "session-gap0864-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "CHI-Bench source metadata identifies relevant healthcare workflow benchmark context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0864-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0864-accepted-question-proof",
                "ev-gap0864-accepted-rejected-reasons",
                "ev-gap0864-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0864-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep CHI-Bench healthcare workflow metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0864-accepted-question-proof",
        "ev-gap0864-accepted-rejected-reasons",
        "ev-gap0864-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant healthcare workflow benchmark context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when CHI-Bench metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0864-metadata-only-agent",
      runId: "run-gap-0864-metadata-only",
      generatedAt: "2026-06-21T21:00:00.000Z",
      sourceRefs: [URL, DOCS, ARXIV],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "CHI-Bench source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0864-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0864-missing",
                event_type: "review",
                session_id: "session-gap0864-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/healthcare workflow benchmark metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/healthcare workflow benchmark metadata is not question-level score explainability proof.",
    );
  });

  it("does not add CHI-Bench identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("chi_bench_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
