import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0963-openobserve-question-explainability.md";
const REPO = "https://github.com/openobserve/openobserve";
const DOCS = "https://openobserve.ai";
const TITLE = "openobserve/openobserve";

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
    confidence: 0.91,
    evidenceEventIds: ["ev-gap0963-question-trace", "ev-gap0963-eval-thresholds"],
    flags: [],
    narrative: "OpenObserve source context is bounded to AMC-owned question-score explainability proof.",
    ...overrides,
  };
}

describe("GAP-0963 OpenObserve question-explainability boundary", () => {
  it("documents live OpenObserve metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0963");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(REPO);
    expect(doc).toContain(DOCS);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("Star 19.4k");
    expect(doc).toContain("Fork 862");
    expect(doc).toContain("Issues 542");
    expect(doc).toContain("Pull requests 26");
    expect(doc).toContain("6,252 Commits");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Open source observability platform for logs, metrics, traces, frontend monitoring, pipelines and LLM observability");
    expect(doc).toContain("Datadog, Splunk, and Elasticsearch");
    expect(doc).toContain("140x lower storage costs");
    expect(doc).toContain("single binary deployment");
    expect(doc).toContain("OpenTelemetry Native");
    expect(doc).toContain("Unified Platform Logs, metrics, traces, RUM, dashboards, alerts");
    expect(doc).toContain("Logs Management");
    expect(doc).toContain("Distributed Tracing");
    expect(doc).toContain("Metrics & Dashboards");
    expect(doc).toContain("Frontend Monitoring");
    expect(doc).toContain("Alerts");
    expect(doc).toContain("Pipelines");
    expect(doc).toContain("Trace details page");
    expect(doc).toContain("Flamegraphs and Gantt Charts");
    expect(doc).toContain("Real User Monitoring");
    expect(doc).toContain("Sensitive Data Redaction");
    expect(doc).toContain("SOC 2 Type II certified");
    expect(doc).toContain("ISO 27001 certified");
    expect(doc).toContain("GDPR compliant");
    expect(doc).toContain("HIPAA ready");
    expect(doc).toContain("question ID");
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

  it("accepts OpenObserve context only through existing eval-score explainability proof", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0963-openobserve-reviewed-agent",
      runId: "run-gap-0963-question-explainability",
      generatedAt: "2026-06-22T19:03:00.000Z",
      sourceRefs: [REPO, DOCS, "amc:no-openobserve-adapter-or-parity-claim"],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score(),
          acceptedEvidence: [
            {
              id: "ev-gap0963-question-trace",
              event_hash: hash("a"),
              writer_sig: "sig-gap0963-question-trace",
              event_type: "test",
              session_id: "session-gap0963-eval",
              ts: 1,
              trustTier: "OBSERVED",
            },
            {
              id: "ev-gap0963-eval-thresholds",
              event_hash: hash("b"),
              writer_sig: "sig-gap0963-eval-thresholds",
              event_type: "audit",
              session_id: "session-gap0963-eval",
              ts: 2,
              trustTier: "OBSERVED_HARDENED",
            },
          ],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0963-openobserve-metadata-only",
                event_hash: hash("c"),
                writer_sig: "sig-gap0963-metadata",
                event_type: "review",
                session_id: "session-gap0963-source",
                ts: 3,
                trustTier: "ATTESTED",
              },
              reason: "OpenObserve repository metadata identifies relevant observability context only; it lacks AMC-owned question IDs, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hashes.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "gap-0963-question-score-proof",
              criterionType: "tool_use_trace",
              status: "satisfied",
              evidenceRefs: ["ev-gap0963-question-trace", "ev-gap0963-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0963-openobserve-metadata-only"],
              judgeRef: "judge://amc/eval-score-explainability",
              repairHint: "Keep OpenObserve as source-review context and rely on AMC-owned accepted evidence, rejected evidence reasons, repair hints, thresholds, and row hashes.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "gap0963-openobserve-eval-score-pack",
              sourceRef: REPO,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "dataset://amc/gap0963/openobserve-question-explainability",
              datasetHash: hash("d"),
              testCaseId: "gap0963-agent-eval-row",
              testCaseHash: hash("e"),
              evaluatorIds: ["judge://amc/question-score-explainability"],
              evaluatorConfigHash: hash("f"),
              judgeModelRef: "amc-deterministic-question-judge",
              experimentRunId: "exp-gap0963-openobserve-eval",
              experimentResultHash: hash("1"),
              exportArtifactHash: hash("2"),
              ciRunId: "ci-gap0963-openobserve-eval",
              ciConfigHash: hash("3"),
              traceArtifactHash: hash("4"),
              toolCallValidationHash: hash("5"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.93,
              minPassRate0to1: 0.86,
              averageScore0to1: 0.91,
              threshold0to1: 0.82,
              status: "satisfied",
              evidenceRefs: ["ev-gap0963-question-trace", "ev-gap0963-eval-thresholds"],
              rejectedEvidenceRefs: ["ev-gap0963-openobserve-metadata-only"],
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
      acceptedEvidenceIds: ["ev-gap0963-question-trace", "ev-gap0963-eval-thresholds"],
      reproducibleEvalPacks: [
        expect.objectContaining({
          packId: "gap0963-openobserve-eval-score-pack",
          sourceRef: REPO,
          kind: "test_suite_evaluation",
          ciRunId: "ci-gap0963-openobserve-eval",
        }),
      ],
      failClosedThresholds: [
        expect.objectContaining({ id: "gap0963-openobserve-eval-score-pack:pass_rate", passed: true }),
        expect.objectContaining({ id: "gap0963-openobserve-eval-score-pack:average_score", passed: true }),
      ],
    });
    expect(pack.rows[0]?.rejectedEvidenceReasons[0]?.reason).toContain("observability context only");
    expect(pack.rows[0]?.repairHint).toContain("Target L5");
    expect(pack.packHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when OpenObserve metadata replaces AMC-owned question evidence", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "gap-0963-openobserve-metadata-agent",
      runId: "run-gap-0963-metadata-only",
      generatedAt: "2026-06-22T19:03:00.000Z",
      sourceRefs: [REPO],
      rows: [
        {
          question: question("AMC-1.1"),
          score: score({
            supportedMaxLevel: 0,
            finalLevel: 0,
            evidenceEventIds: [],
            narrative: "OpenObserve metadata-only source-review proof must fail closed.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: {
                id: "ev-gap0963-missing-question-proof",
                event_hash: hash("6"),
                writer_sig: "sig-gap0963-missing",
                event_type: "review",
                session_id: "session-gap0963-source",
                ts: 1,
                trustTier: "ATTESTED",
              },
              reason: "Missing AMC-owned question score evidence, accepted evidence IDs, rejected evidence reasons, repair hints, signed rows, thresholds, and row hash proof.",
            },
          ],
          missingGateReasons: ["OpenObserve source metadata is not question-level score explainability proof."],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.status).toBe("needs_evidence");
    expect(report.rows[0]?.missingGateReasons).toContain("OpenObserve source metadata is not question-level score explainability proof.");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]?.status).toBe("fail_closed");
  });

  it("keeps OpenObserve identifiers out of explainability implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("openobserve/openobserve");
      expect(source).not.toContain("openobserve_question_explainability");
      expect(source).not.toContain("OpenObserve");
    }
  });
});
