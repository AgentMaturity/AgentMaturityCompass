import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import { buildQuestionExplainabilityReport } from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0792-medqa-cs-question-explainability.md";
const ACL = "https://aclanthology.org/2026.eacl-long.292/";
const DOI = "10.18653/v1/2026.eacl-long.292";
const OPENALEX = "W7140118344";
const TITLE = "MedQA-CS: Objective Structured Clinical Examination (OSCE)-Style Benchmark for Evaluating LLM Clinical Skills";

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
      "ev-gap0792-accepted-question-proof",
      "ev-gap0792-accepted-rejected-reasons",
      "ev-gap0792-accepted-repair-hint",
    ],
    flags: [],
    narrative: "MedQA-CS clinical-skills benchmark context is bounded to AMC-owned question-score proof.",
    ...overrides,
  };
}

describe("GAP-0792 MedQA-CS question-explainability boundary", () => {
  it("documents live ACL metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0792");
    expect(doc).toContain(ACL);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Zonghai Yao");
    expect(doc).toContain("Zihao Zhang");
    expect(doc).toContain("Chaolong Tang");
    expect(doc).toContain("Xingyu Bian");
    expect(doc).toContain("Youxia Zhao");
    expect(doc).toContain("EACL");
    expect(doc).toContain("2026.eacl-long.292");
    expect(doc).toContain("Objective Structured Clinical Examination");
    expect(doc).toContain("OSCE");
    expect(doc).toContain("clinical skills");
    expect(doc).toContain("standardized patient");
    expect(doc).toContain("history taking");
    expect(doc).toContain("physical examination");
    expect(doc).toContain("diagnosis");
    expect(doc).toContain("clinical communication");
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

  it("accepts clinical-skills context only through existing question-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0792-medqa-cs-reviewed-agent",
      runId: "run-gap-0792-question-explainability",
      generatedAt: "2026-06-21T19:35:00.000Z",
      sourceRefs: [ACL, `doi:${DOI}`, `openalex:${OPENALEX}`],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0792-accepted-question-proof",
              event_hash: hash("a"),
              writer_sig: "sig-gap0792-question-proof",
              event_type: "artifact",
              session_id: "session-gap0792-question",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0792-accepted-rejected-reasons",
              event_hash: hash("b"),
              writer_sig: "sig-gap0792-rejected",
              event_type: "review",
              session_id: "session-gap0792-reasons",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
            {
              id: "ev-gap0792-accepted-repair-hint",
              event_hash: hash("c"),
              writer_sig: "sig-gap0792-repair",
              event_type: "audit",
              session_id: "session-gap0792-repair",
              ts: 3,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0792-medqa-cs-metadata-only",
                event_hash: hash("d"),
                writer_sig: "sig-gap0792-metadata",
                event_type: "review",
                session_id: "session-gap0792-source",
                ts: 4,
                trustTier: "ATTESTED",
              },
              reason: "MedQA-CS paper metadata identifies relevant clinical-skills benchmark context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0792-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: [
                "ev-gap0792-accepted-question-proof",
                "ev-gap0792-accepted-rejected-reasons",
                "ev-gap0792-accepted-repair-hint",
              ],
              rejectedEvidenceRefs: ["ev-gap0792-medqa-cs-metadata-only"],
              judgeRef: "judge://amc/question-score-explainability",
              repairHint: "Keep MedQA-CS as clinical benchmark context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
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
        "ev-gap0792-accepted-question-proof",
        "ev-gap0792-accepted-rejected-reasons",
        "ev-gap0792-accepted-repair-hint",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("paper metadata identifies relevant clinical-skills benchmark context only");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when MedQA-CS metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0792-metadata-only-agent",
      runId: "run-gap-0792-metadata-only",
      generatedAt: "2026-06-21T19:35:00.000Z",
      sourceRefs: [ACL],
      rows: [
        {
          question: question("AMC-4.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "MedQA-CS paper metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0792-missing-amc-question-proof",
                event_hash: hash("e"),
                writer_sig: "sig-gap0792-missing",
                event_type: "review",
                session_id: "session-gap0792-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["ACL/DOI/OpenAlex/title metadata is not question-level score explainability proof."],
        },
      ],
    });

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain(
      "ACL/DOI/OpenAlex/title metadata is not question-level score explainability proof.",
    );
  });

  it("does not add MedQA-CS identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("medqa_cs_question_explainability");
      expect(source).not.toContain(TITLE);
    }
  });
});
