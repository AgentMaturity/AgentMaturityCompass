import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0861-hypothetical-minds-question-explainability.md";
const REPO = "locross93/Hypothetical-Minds";
const URL = "https://github.com/locross93/Hypothetical-Minds";
const ARXIV = "https://arxiv.org/abs/2407.07086";
const PROJECT = "https://locross93.github.io/hypotheticalminds/";
const TITLE = "Hypothetical-Minds: Scaffolding Theory of Mind for Multi-Agent Tasks with Large Language Models";

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
      "ev-gap0861-accepted-question-proof",
      "ev-gap0861-accepted-rejected-reasons",
      "ev-gap0861-accepted-repair-hint",
    ],
    flags: [],
    narrative: "Hypothetical-Minds source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0861 Hypothetical-Minds question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0861");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(PROJECT);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("MIT license");
    expect(doc).toContain("Star 41");
    expect(doc).toContain("Fork 6");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("27 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 99.9%");
    expect(doc).toContain("Shell 0.1%");
    expect(doc).toContain("environments");
    expect(doc).toContain("llm_plan");
    expect(doc).toContain("main.py");
    expect(doc).toContain("run_scenarios.py");
    expect(doc).toContain("setup.py");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("Theory of Mind module");
    expect(doc).toContain("generating, evaluating, and refining hypotheses");
    expect(doc).toContain("multi-agent settings");
    expect(doc).toContain("Research Paper");
    expect(doc).toContain("Hypothetical Minds Project Website");
    expect(doc).toContain("MeltingPot");
    expect(doc).toContain("OPENAI_API_KEY");
    expect(doc).toContain("Running With Scissors Repeated");
    expect(doc).toContain("Collaborative Cooking Asymmetric");
    expect(doc).toContain("Reflexion baseline");
    expect(doc).toContain("Substrates");
    expect(doc).toContain("collaborative_cooking__asymmetric");
    expect(doc).toContain("running_with_scissors_in_the_matrix__repeated");
    expect(doc).toContain("prisoners_dilemma_in_the_matrix__repeated");
    expect(doc).toContain("vllm");
    expect(doc).toContain("LLaMA 3");
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

  it("accepts Hypothetical-Minds context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0861-hypothetical-minds-reviewed-agent",
      runId: "run-gap-0861-question-explainability",
      generatedAt: "2026-06-21T20:52:00.000Z",
      sourceRefs: [URL, ARXIV, PROJECT],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0861-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0861-question-proof",
              event_type: "artifact",
              session_id: "session-gap0861-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0861-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0861-rejected",
              event_type: "review",
              session_id: "session-gap0861-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0861-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0861-repair",
              event_type: "audit",
              session_id: "session-gap0861-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0861-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0861-metadata",
                event_type: "review",
                session_id: "session-gap0861-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "Hypothetical-Minds source metadata identifies relevant multi-agent Theory of Mind context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0861-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0861-accepted-question-proof",
                "ev-gap0861-accepted-rejected-reasons",
                "ev-gap0861-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0861-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep Hypothetical-Minds multi-agent Theory of Mind metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0861-accepted-question-proof",
        "ev-gap0861-accepted-rejected-reasons",
        "ev-gap0861-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant multi-agent Theory of Mind context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Hypothetical-Minds metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0861-metadata-only-agent",
      runId: "run-gap-0861-metadata-only",
      generatedAt: "2026-06-21T20:52:00.000Z",
      sourceRefs: [URL, ARXIV, PROJECT],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Hypothetical-Minds source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0861-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0861-missing",
                event_type: "review",
                session_id: "session-gap0861-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/Theory-of-Mind agent metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/Theory-of-Mind agent metadata is not question-level score explainability proof.",
    );
  });

  it("does not add Hypothetical-Minds identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("hypothetical_minds_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
