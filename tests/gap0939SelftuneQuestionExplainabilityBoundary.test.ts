import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0939-selftune-question-explainability.md";
const SOURCE = "selftune-dev/selftune";
const SOURCE_URL = "https://github.com/selftune-dev/selftune";

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
    questionId: "AMC-1.1",
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.9,
    evidenceEventIds: ["ev-gap0939-question-trace", "ev-gap0939-eval-thresholds"],
    flags: [],
    narrative: "selftune source-review context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0939 selftune question-explainability boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0939");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("main");
    expect(doc).toContain("Star 12");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 11");
    expect(doc).toContain("142 Commits");
    expect(doc).toContain("MIT license");
    expect(doc).toContain(".agent/ skills");
    expect(doc).toContain(".claude/ skills");
    expect(doc).toContain("apps/ local-dashboard");
    expect(doc).toContain("cli/ selftune");
    expect(doc).toContain("packages");
    expect(doc).toContain("skill");
    expect(doc).toContain("tests");
    expect(doc).toContain("AGENTS.md");
    expect(doc).toContain("ARCHITECTURE.md");
    expect(doc).toContain("PRD.md");
    expect(doc).toContain("Research_trigger_eval.json");
    expect(doc).toContain("SelfTuneBlog_trigger_eval.json");
    expect(doc).toContain("risk-policy.json");
    expect(doc).toContain("Skill-level observability");
    expect(doc).toContain("Claude Code");
    expect(doc).toContain("Codex");
    expect(doc).toContain("OpenCode");
    expect(doc).toContain("OpenClaw");
    expect(doc).toContain("47% pass rate");
    expect(doc).toContain("89% pass rate");
    expect(doc).toContain("eval sets");
    expect(doc).toContain("majority voting");
    expect(doc).toContain("Post-deploy monitoring");
    expect(doc).toContain("auto-rollback");
    expect(doc).toContain("selftune verify");
    expect(doc).toContain("selftune grade baseline");
    expect(doc).toContain("selftune watch");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("fail-closed thresholds");
    expect(doc).toContain("v0.2.32");
    expect(doc).toContain("TypeScript 99.4%");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts selftune context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0939-selftune-reviewed-agent",
      runId: "run-gap-0939-question-explainability",
      generatedAt: "2026-06-22T15:39:00.000Z",
      sourceRefs: [SOURCE_URL, "amc:no-selftune-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0939-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0939-question-trace",
              event_type: "test",
              session_id: "session-gap0939-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0939-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0939-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0939-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0939-selftune-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0939-metadata",
                event_type: "review",
                session_id: "session-gap0939-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "selftune GitHub/README metadata identifies relevant source context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0939-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0939-question-trace", "ev-gap0939-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0939-selftune-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep selftune as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0939-selftune-skill-routing-pack",
              sourceRef: SOURCE_URL,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0939/selftune-skill-routing",
              datasetHash: hash("d"),
              testCaseId: "gap0939-skill-routing-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0939-selftune-routing",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0939-selftune-routing",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.92,
              minPassRate0to1: 0.85,
              averageScore0to1: 0.88,
              threshold0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-gap0939-question-trace", "ev-gap0939-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0939-selftune-metadata-only"],
              repairHint: "Preserve question-tagged eval rows, thresholds, accepted evidence IDs, rejected evidence reasons, repair hints, and row hashes.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-gap0939-question-trace", "ev-gap0939-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0939-selftune-skill-routing-pack",
          sourceRef: SOURCE_URL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0939-selftune-routing",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0939-selftune-skill-routing-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0939-selftune-skill-routing-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("metadata identifies relevant source context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when selftune metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0939-selftune-metadata-agent",
      runId: "run-gap-0939-metadata-only",
      generatedAt: "2026-06-22T15:39:00.000Z",
      sourceRefs: [SOURCE_URL],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "selftune metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0939-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0939-missing",
                event_type: "review",
                session_id: "session-gap0939-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["selftune source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({ status: "fail_closed", reproducibleEvalPacks: [] });
  });

  it("does not add selftune identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(SOURCE_URL);
      expect(source).not.toContain("selftune_question_explainability");
    }
  });
});
