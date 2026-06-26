import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import { passportJsonSchema } from "../src/passport/passportSchema.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0005-braintrust-question-explainability.md";
const SOURCE = "https://www.braintrust.dev";
const DOCS = `${SOURCE}/docs`;
const EVALS = `${SOURCE}/docs/evaluation-quickstart`;
const DATASETS = `${SOURCE}/docs/annotate/datasets`;
const RUN_EVALS = `${SOURCE}/docs/evaluate/run-evaluations`;
const OBSERVE = `${SOURCE}/docs/observe`;
const SCORE_ONLINE = `${SOURCE}/docs/evaluate/score-online`;
const MONITOR = `${SOURCE}/docs/deploy/monitor`;
const TITLE = "Braintrust";
const IDENTIFIER = "braintrust_question_explainability";

const implementationFiles = [
  "src/diagnostic/questionScoreExplainability.ts",
  "src/diagnostic/runner.ts",
  "src/guide/guideGenerator.ts",
  "src/passport/passportCollector.ts",
  "src/passport/passportSchema.ts",
  "src/api/shieldRouter.ts",
  "src/api/watchRouter.ts",
];

function hash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

function question(id = "AMC-1.1"): DiagnosticQuestion {
  const found = getQuestionSet().questions.find((row) => row.id === id);
  if (!found) {
    throw new Error(`missing test question ${id}`);
  }
  return found;
}

function score(overrides: Partial<QuestionScore> = {}): QuestionScore {
  return {
    questionId: "AMC-1.1",
    claimedLevel: 3,
    supportedMaxLevel: 3,
    finalLevel: 3,
    confidence: 0.91,
    evidenceEventIds: ["ev-braintrust-question-row", "ev-braintrust-eval-pack"],
    flags: [],
    narrative: "AMC-1.1: Braintrust context is bounded to AMC question-level evidence receipts.",
    ...overrides,
  };
}

function signedEvent(id: string, index: number) {
  return {
    id,
    event_hash: hash((index + 5).toString(16)),
    writer_sig: `braintrust-question-writer-${index}`,
    event_type: "metric" as const,
    session_id: `braintrust-question-session-${index}`,
    ts: Date.UTC(2026, 5, 25) + index,
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

function passportWithQuestionExplainability(questionExplainabilityHash: string, pack: ReturnType<typeof buildEvalScoreExplainabilityPack>) {
  return {
    v: 1,
    passportId: "pass_braintrust0005",
    generatedTs: Date.UTC(2026, 5, 25),
    scope: { type: "AGENT", idHash: hash("agent").slice(0, 16) },
    trust: {
      integrityIndex: 0.97,
      correlationRatio: 0.91,
      trustLabel: "HIGH",
      evidenceCoverage: {
        observedShare: 1,
        attestedShare: 0,
        selfReportedShare: 0,
      },
      notary: { enabled: false },
    },
    status: { label: "VERIFIED", reasons: ["question explainability receipts are bound"] },
    maturity: {
      status: "OK",
      overall: 3,
      byFiveLayers: {
        strategicOps: 3,
        leadership: 3,
        culture: 3,
        resilience: 3,
        skills: 3,
      },
      unknownQuestionsCount: 0,
      questionExplainabilityHash,
      questionExplainabilitySummary: {
        replayable: pack.replayable,
        failClosed: pack.failClosed,
        rowCount: pack.rows.length,
        signedEvidenceRowCount: pack.rows.reduce((count, row) => count + row.signedEvidenceRows.length, 0),
        acceptedEvidenceCount: pack.rows.reduce((count, row) => count + row.acceptedEvidenceIds.length, 0),
        rejectedEvidenceCount: pack.rows.reduce((count, row) => count + row.rejectedEvidenceReasons.length, 0),
        rejectedEvidenceReasonCount: pack.rows.reduce((count, row) => count + row.rejectedEvidenceReasons.length, 0),
        reproducibleEvalPackCount: pack.rows.reduce((count, row) => count + row.reproducibleEvalPacks.length, 0),
        failClosedThresholdCount: pack.rows.reduce((count, row) => count + row.failClosedThresholds.length, 0),
        surfaces: ["Score", "Shield", "Watch"],
        sourceRefs: pack.sourceRefs,
        sourceRefCount: pack.sourceRefCount,
        rows: pack.rows.map((row) => ({
          questionId: row.questionId,
          acceptedEvidenceIds: row.acceptedEvidenceIds,
          rejectedEvidenceReasons: row.rejectedEvidenceReasons,
          repairHint: row.repairHint,
          status: row.status,
          rowHash: row.rowHash,
        })),
      },
      questionExplainabilityReplayable: pack.replayable,
      questionExplainabilityFailClosed: pack.failClosed,
    },
    strategyFailureRisks: {
      ecosystemFocusRisk: null,
      clarityPathRisk: null,
      economicSignificanceRisk: null,
      riskAssuranceRisk: null,
      digitalDualityRisk: null,
    },
    valueDimensions: {
      emotionalValue: null,
      functionalValue: null,
      economicValue: null,
      brandValue: null,
      lifetimeValue: null,
      valueScore: null,
    },
    checkpoints: {
      cgxPackSha256: hash("cgx"),
      lastAssuranceCert: { status: "PASS", sha256: hash("cert"), issuedTs: Date.UTC(2026, 5, 25) },
      lastBench: { sha256: hash("bench"), generatedTs: Date.UTC(2026, 5, 25) },
      lastAuditBinder: { sha256: hash("audit"), generatedTs: Date.UTC(2026, 5, 25) },
      lastValueSnapshot: { sha256: hash("value"), generatedTs: Date.UTC(2026, 5, 25) },
    },
    governanceSummary: {
      promptEnforcement: "ON",
      truthguard: "ENFORCE",
      providerAllowlist: "PASS",
      modelAllowlist: "PASS",
      toolAllowlist: "PASS",
      approvals: "PASS",
      leases: "PASS",
      pluginsIntegrity: "PASS",
    },
    bindings: {
      passportPolicySha256: hash("policy"),
      canonSha256: hash("canon"),
      bankSha256: hash("bank"),
      trustMode: "LOCAL_VAULT",
    },
    proofBindings: {
      transparencyRootSha256: hash("transparency"),
      merkleRootSha256: hash("merkle"),
      includedEventProofIds: ["ev-braintrust-question-row", "ev-braintrust-eval-pack"],
      calculationManifestSha256: hash("calculation"),
    },
  };
}

describe("GAP-0005 Braintrust question-level score explainability boundary", () => {
  it("documents live Braintrust metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0005");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(EVALS);
    expect(doc).toContain(DATASETS);
    expect(doc).toContain(RUN_EVALS);
    expect(doc).toContain(OBSERVE);
    expect(doc).toContain(SCORE_ONLINE);
    expect(doc).toContain(MONITOR);
    expect(doc).toContain("Ship quality AI at scale");
    expect(doc).toContain("Surface patterns in production");
    expect(doc).toContain("Inspect traces in real time");
    expect(doc).toContain("Measure quality with evals");
    expect(doc).toContain("Score outputs with LLMs, code, or humans");
    expect(doc).toContain("Block bad releases before they hit production");
    expect(doc).toContain("versioned datasets");
    expect(doc).toContain("input");
    expect(doc).toContain("expected");
    expect(doc).toContain("metadata");
    expect(doc).toContain("tags");
    expect(doc).toContain("track improvements over time");
    expect(doc).toContain("track performance");
    expect(doc).toContain("same data structure as experiments");
    expect(doc).toContain("Scores and feedback apply to both logs and experiments");
    expect(doc).toContain("Score drops below 0.8");
    expect(doc).toContain("question ID");
    expect(doc).toContain("accepted evidence IDs");
    expect(doc).toContain("rejected evidence reasons");
    expect(doc).toContain("repair hint");
    expect(doc).toContain("reproducible eval pack");
    expect(doc).toContain("regression thresholds");
    expect(doc).toContain("Passport");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts Braintrust context only through AMC-owned question explainability receipts", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "braintrust-context-agent",
      runId: "run-gap0005-braintrust-question-explainability",
      generatedAt: "2026-06-25T00:00:00.000Z",
      sourceRefs: [SOURCE, EVALS, DATASETS, RUN_EVALS, OBSERVE, SCORE_ONLINE, MONITOR],
      rows: [
        {
          question: question(),
          score: score(),
          acceptedEvidence: [
            signedEvent("ev-braintrust-question-row", 1),
            signedEvent("ev-braintrust-eval-pack", 2),
            signedEvent("ev-braintrust-ci-threshold", 3),
          ],
          rejectedEvidence: [
            {
              event: signedEvent("ev-braintrust-metadata-only", 4),
              reason: "Braintrust product metadata cannot replace AMC-owned question evidence and threshold proof.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "braintrust-question-evidence-chain",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-braintrust-question-row", "ev-braintrust-eval-pack", "ev-braintrust-ci-threshold"],
              rejectedEvidenceRefs: ["ev-braintrust-metadata-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Keep accepted evidence IDs, rejected reasons, repair hints, eval-pack rows, and thresholds attached to this question.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "braintrust-context-eval-pack",
              sourceRef: EVALS,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "braintrust-versioned-dataset-gap0005",
              datasetHash: hash("dataset"),
              testCaseId: "braintrust-question-case-001",
              testCaseHash: hash("case"),
              evaluatorIds: ["quality-scorer", "human-reviewer"],
              evaluatorConfigHash: hash("evaluator"),
              judgeModelRef: "judge://amc/question-evidence",
              experimentRunId: "braintrust-context-experiment-001",
              experimentResultHash: hash("experiment"),
              exportArtifactHash: hash("export"),
              ciRunId: "ci-gap0005-question-explainability",
              ciConfigHash: hash("ci"),
              traceArtifactHash: hash("trace"),
              toolCallValidationHash: hash("toolcall"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.96,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.91,
              threshold0to1: 0.85,
              costUsd: 0.12,
              latencyMs: 820,
              tokenCount: 4200,
              status: "satisfied",
              evidenceRefs: ["ev-braintrust-question-row", "ev-braintrust-eval-pack", "ev-braintrust-ci-threshold"],
              rejectedEvidenceRefs: ["ev-braintrust-metadata-only"],
              repairHint: "Preserve the versioned dataset, trace, experiment, scorer, and CI threshold before using this question externally.",
            },
          ],
          missingGateReasons: [],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(true);
    expect(report.failClosed).toBe(false);
    expect(report.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "passed",
      acceptedEvidenceIds: ["ev-braintrust-question-row", "ev-braintrust-eval-pack", "ev-braintrust-ci-threshold"],
      missingGateReasons: [],
    });
    expect(report.rows[0]?.rejectedEvidence[0]).toMatchObject({
      evidenceId: "ev-braintrust-metadata-only",
      reason: expect.stringContaining("product metadata cannot replace"),
    });
    expect(report.rows[0]?.repairHint.length).toBeGreaterThan(10);
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-braintrust-question-row", "ev-braintrust-eval-pack", "ev-braintrust-ci-threshold"],
      rejectedEvidenceReasons: [
        {
          evidenceId: "ev-braintrust-metadata-only",
          reason: expect.stringContaining("threshold proof"),
        },
      ],
    });
    expect(pack.rows[0]?.reproducibleEvalPacks[0]).toMatchObject({
      packId: "braintrust-context-eval-pack",
      sourceRef: EVALS,
      kind: "test_suite_evaluation",
      ciRunId: "ci-gap0005-question-explainability",
    });
    expect(pack.rows[0]?.failClosedThresholds.every((threshold) => threshold.passed)).toBe(true);
    expect(passportJsonSchema.safeParse(passportWithQuestionExplainability(report.manifestHash, pack)).success).toBe(true);
  });

  it("fails closed when Braintrust metadata replaces accepted evidence, repair proof, and thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "braintrust-context-agent",
      runId: "run-gap0005-braintrust-metadata-only",
      generatedAt: "2026-06-25T00:00:00.000Z",
      sourceRefs: [SOURCE, EVALS, DATASETS],
      rows: [
        {
          question: question(),
          score: score({
            claimedLevel: 4,
            supportedMaxLevel: 1,
            finalLevel: 1,
            confidence: 0.2,
            evidenceEventIds: [],
            flags: ["metadata_only", "missing_question_evidence"],
            narrative: "Braintrust page labels alone do not explain an AMC question score.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: signedEvent("ev-braintrust-homepage-only", 5),
              reason: "Homepage and docs labels do not supply accepted evidence IDs, rejected evidence reasons, or a repair hint.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "braintrust-question-evidence-chain",
              criterionType: "agent_judge",
              status: "failed",
              evidenceRefs: [],
              rejectedEvidenceRefs: ["ev-braintrust-homepage-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Attach signed question evidence, a versioned eval pack, and CI threshold proof.",
            },
          ],
          missingGateReasons: [
            "missing accepted evidence IDs",
            "missing reproducible eval pack",
            "missing regression thresholds",
          ],
        },
      ],
    });
    const pack = buildEvalScoreExplainabilityPack(report);

    expect(report.replayable).toBe(false);
    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "needs_evidence",
      acceptedEvidenceIds: [],
      missingGateReasons: [
        "missing accepted evidence IDs",
        "missing reproducible eval pack",
        "missing regression thresholds",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("Homepage and docs labels");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({
      status: "fail_closed",
      acceptedEvidenceIds: [],
      reproducibleEvalPacks: [],
      failClosedThresholds: [],
    });
  });

  it("keeps Braintrust question-explainability source-review context out of product implementation files", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain("Braintrust Data, Inc.");
    }
  });
});
