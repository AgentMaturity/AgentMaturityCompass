import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0951-haystack-question-explainability.md";
const REPO = "deepset-ai/haystack";
const GITHUB_URL = "https://github.com/deepset-ai/haystack";
const HOME_URL = "https://haystack.deepset.ai/";
const DOCS_URL = "https://docs.haystack.deepset.ai/docs/intro";
const IDENTIFIER = "haystack_question_explainability";

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
    evidenceEventIds: ["ev-gap0951-question-trace", "ev-gap0951-eval-thresholds"],
    flags: [],
    narrative: "Haystack source-review context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0951 Haystack question-explainability boundary", () => {
  it("documents live Haystack metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0951");
    expect(doc).toContain(REPO);
    expect(doc).toContain(GITHUB_URL);
    expect(doc).toContain(HOME_URL);
    expect(doc).toContain(DOCS_URL);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 25.6k");
    expect(doc).toContain("Fork 2.9k");
    expect(doc).toContain("Issues 81");
    expect(doc).toContain("Pull requests 27");
    expect(doc).toContain("5,491 Commits");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("v2.30.2 Latest Jun 18, 2026");
    expect(doc).toContain("MDX 81.4%");
    expect(doc).toContain("Open-source AI orchestration framework");
    expect(doc).toContain("explicit control over retrieval, routing, memory, and generation");
    expect(doc).toContain("transparent and traceable");
    expect(doc).toContain("Model- and vendor-agnostic");
    expect(doc).toContain("built-in components for retrieval, indexing, tool calling, memory, and evaluation");
    expect(doc).toContain("The Open Source AI Framework");
    expect(doc).toContain("Production Ready Agents, RAG & Context Engineering");
    expect(doc).toContain("Haystack Sets the Standard for Agentic AI Across Industries");
    expect(doc).toContain("Build Transparent, Context Engineered AI Systems");
    expect(doc).toContain("full visibility to inspect, debug, and optimize every decision your AI makes");
    expect(doc).toContain("Integrate Freely with Your AI Stack");
    expect(doc).toContain("no vendor lock-in");
    expect(doc).toContain("Operate at Enterprise Scale");
    expect(doc).toContain("built-in reliability and observability");
    expect(doc).toContain("AI Agents");
    expect(doc).toContain("standardized tool calling");
    expect(doc).toContain("Branching and looping pipelines");
    expect(doc).toContain("Introduction to Haystack");
    expect(doc).toContain("Version: 2.30");
    expect(doc).toContain("production-ready AI Agents");
    expect(doc).toContain("reusable components");
    expect(doc).toContain("components and pipelines");
    expect(doc).toContain("Document Stores");
    expect(doc).toContain("Agents");
    expect(doc).toContain("Tools");
    expect(doc).toContain("testing, and governance");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("fail-closed thresholds");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Haystack context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0951-haystack-reviewed-agent",
      runId: "run-gap-0951-question-explainability",
      generatedAt: "2026-06-22T17:51:00.000Z",
      sourceRefs: [GITHUB_URL, HOME_URL, DOCS_URL, "amc:no-haystack-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0951-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0951-question-trace",
              event_type: "test",
              session_id: "session-gap0951-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0951-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0951-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0951-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0951-haystack-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0951-metadata",
                event_type: "review",
                session_id: "session-gap0951-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "Haystack repository/product/docs metadata identifies relevant orchestration context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0951-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0951-question-trace", "ev-gap0951-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0951-haystack-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep Haystack as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0951-haystack-eval-score-pack",
              sourceRef: DOCS_URL,
              language: "python",
              testFramework: "pytest",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0951/haystack-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0951-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0951-haystack-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0951-haystack-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.91,
              minPassRate0to1: 0.85,
              averageScore0to1: 0.88,
              threshold0to1: 0.8,
              status: "satisfied",
              evidenceRefs: ["ev-gap0951-question-trace", "ev-gap0951-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0951-haystack-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0951-question-trace", "ev-gap0951-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0951-haystack-eval-score-pack",
          sourceRef: DOCS_URL,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0951-haystack-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0951-haystack-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0951-haystack-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("orchestration context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when Haystack metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0951-haystack-metadata-agent",
      runId: "run-gap-0951-metadata-only",
      generatedAt: "2026-06-22T17:51:00.000Z",
      sourceRefs: [GITHUB_URL],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "Haystack metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0951-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0951-missing",
                event_type: "review",
                session_id: "session-gap0951-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["Haystack source metadata is not question-level score explainability proof."],
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

  it("does not add Haystack identifiers to diagnostic, guide, or passport modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(GITHUB_URL);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
