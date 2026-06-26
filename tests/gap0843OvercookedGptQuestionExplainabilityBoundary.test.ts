import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0843-overcookedgpt-question-explainability.md";
const REPO = "BladeTransformerLLC/OvercookedGPT";
const URL = "https://github.com/BladeTransformerLLC/OvercookedGPT";
const TITLE = "OvercookedGPT (WIP)";

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
      "ev-gap0843-accepted-question-proof",
      "ev-gap0843-accepted-rejected-reasons",
      "ev-gap0843-accepted-repair-hint",
    ],
    flags: [],
    narrative: "OvercookedGPT source-review context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0843 OvercookedGPT question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0843");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("api.github.com repository metadata");
    expect(doc).toContain("README.md");
    expect(doc).toContain("LICENSE");
    expect(doc).toContain("MIT License");
    expect(doc).toContain("stargazers_count");
    expect(doc).toContain("73");
    expect(doc).toContain("Python");
    expect(doc).toContain("OpenAI gym");
    expect(doc).toContain("GPT-4");
    expect(doc).toContain("Claude");
    expect(doc).toContain("long-horizon reasoning");
    expect(doc).toContain("task planning");
    expect(doc).toContain("dynamic multi-agent settings");
    expect(doc).toContain("gym-cooking");
    expect(doc).toContain("in-context learning");
    expect(doc).toContain("CoT");
    expect(doc).toContain("PAL");
    expect(doc).toContain("GPT-3.5-Turbo");
    expect(doc).toContain("multi-agent simulation");
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

  it("accepts OvercookedGPT context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0843-overcookedgpt-reviewed-agent",
      runId: "run-gap-0843-question-explainability",
      generatedAt: "2026-06-21T23:58:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0843-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0843-question-proof",
              event_type: "artifact",
              session_id: "session-gap0843-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0843-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0843-rejected",
              event_type: "review",
              session_id: "session-gap0843-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0843-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0843-repair",
              event_type: "audit",
              session_id: "session-gap0843-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0843-source-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0843-metadata",
                event_type: "review",
                session_id: "session-gap0843-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "OvercookedGPT source metadata identifies relevant multi-agent planning context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0843-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0843-accepted-question-proof",
                "ev-gap0843-accepted-rejected-reasons",
                "ev-gap0843-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0843-source-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep OvercookedGPT environment metadata as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0843-accepted-question-proof",
        "ev-gap0843-accepted-rejected-reasons",
        "ev-gap0843-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("source metadata identifies relevant multi-agent planning context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when OvercookedGPT metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0843-metadata-only-agent",
      runId: "run-gap-0843-metadata-only",
      generatedAt: "2026-06-21T23:58:00.000Z",
      sourceRefs: [URL],
      rows: [
        {
          question: question("AMC-2.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "OvercookedGPT source metadata-only proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0843-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0843-missing",
                event_type: "review",
                session_id: "session-gap0843-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["GitHub/README/license/OvercookedGPT environment metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "GitHub/README/license/OvercookedGPT environment metadata is not question-level score explainability proof.",
    );
  });

  it("does not add OvercookedGPT identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("overcookedgpt_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
