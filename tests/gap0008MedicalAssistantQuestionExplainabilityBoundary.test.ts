import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getQuestionSet } from "../src/diagnostic/questionSets.js";
import {
  buildEvalScoreExplainabilityPack,
  buildQuestionExplainabilityReport,
} from "../src/diagnostic/questionScoreExplainability.js";
import { passportJsonSchema } from "../src/passport/passportSchema.js";
import type { DiagnosticQuestion, QuestionScore } from "../src/types.js";

const DOC = "docs/source-reviews/GAP-0008-medical-assistant-question-explainability.md";
const DOI = "https://doi.org/10.1038/s41591-025-04074-y";
const NATURE = "https://www.nature.com/articles/s41591-025-04074-y";
const OPENALEX = "https://openalex.org/W7128444586";
const TITLE = "Reliability of LLMs as medical assistants for the general public: a randomized preregistered study";
const IDENTIFIER = "medical_assistant_question_explainability";

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
    claimedLevel: 4,
    supportedMaxLevel: 4,
    finalLevel: 4,
    confidence: 0.88,
    evidenceEventIds: ["ev-medical-user-workflow", "ev-medical-eval-pack", "ev-medical-threshold"],
    flags: [],
    narrative: "AMC-1.1: medical-assistant context is bounded to AMC question-level evidence receipts.",
    ...overrides,
  };
}

function signedEvent(id: string, index: number) {
  return {
    id,
    event_hash: hash(`medical-assistant-${index}`),
    writer_sig: `medical-assistant-question-writer-${index}`,
    event_type: "metric" as const,
    session_id: `medical-assistant-session-${index}`,
    ts: Date.UTC(2026, 5, 26) + index,
    trustTier: "OBSERVED_HARDENED" as const,
  };
}

function passportWithQuestionExplainability(
  questionExplainabilityHash: string,
  pack: ReturnType<typeof buildEvalScoreExplainabilityPack>,
) {
  return {
    v: 1,
    passportId: "pass_gap0008_medical",
    generatedTs: Date.UTC(2026, 5, 26),
    scope: { type: "AGENT", idHash: hash("medical-agent").slice(0, 16) },
    trust: {
      integrityIndex: 0.96,
      correlationRatio: 0.92,
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
      overall: 4,
      byFiveLayers: {
        strategicOps: 4,
        leadership: 4,
        culture: 4,
        resilience: 4,
        skills: 4,
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
      lastAssuranceCert: { status: "PASS", sha256: hash("cert"), issuedTs: Date.UTC(2026, 5, 26) },
      lastBench: { sha256: hash("bench"), generatedTs: Date.UTC(2026, 5, 26) },
      lastAuditBinder: { sha256: hash("audit"), generatedTs: Date.UTC(2026, 5, 26) },
      lastValueSnapshot: { sha256: hash("value"), generatedTs: Date.UTC(2026, 5, 26) },
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
      includedEventProofIds: ["ev-medical-user-workflow", "ev-medical-eval-pack"],
      calculationManifestSha256: hash("calculation"),
    },
  };
}

describe("GAP-0008 medical-assistant question-level score explainability boundary", () => {
  it("documents live medical-assistant study metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0008");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(NATURE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("Nature Medicine");
    expect(doc).toContain("Published: 09 February 2026");
    expect(doc).toContain("1,298 participants");
    expect(doc).toContain("ten medical scenarios");
    expect(doc).toContain("GPT-4o");
    expect(doc).toContain("Llama 3");
    expect(doc).toContain("Command R+");
    expect(doc).toContain("standard benchmarks");
    expect(doc).toContain("human user testing");
    expect(doc).toContain("high-risk deployments");
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

  it("accepts medical-assistant context only through AMC-owned question explainability receipts", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "medical-assistant-context-agent",
      runId: "run-gap0008-medical-assistant-question-explainability",
      generatedAt: "2026-06-26T00:00:00.000Z",
      sourceRefs: [DOI, NATURE, OPENALEX],
      rows: [
        {
          question: question(),
          score: score(),
          acceptedEvidence: [
            signedEvent("ev-medical-user-workflow", 1),
            signedEvent("ev-medical-eval-pack", 2),
            signedEvent("ev-medical-threshold", 3),
          ],
          rejectedEvidence: [
            {
              event: signedEvent("ev-medical-paper-metadata-only", 4),
              reason: "Nature Medicine paper metadata cannot replace AMC-owned human-interaction evidence and threshold proof.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "medical-assistant-question-evidence-chain",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-medical-user-workflow", "ev-medical-eval-pack", "ev-medical-threshold"],
              rejectedEvidenceRefs: ["ev-medical-paper-metadata-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Keep question evidence, rejected reasons, realistic user workflow receipts, eval-pack rows, and thresholds attached.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "medical-assistant-human-interaction-eval-pack",
              sourceRef: NATURE,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "medical-assistant-human-workflow-fixtures",
              datasetHash: hash("dataset"),
              testCaseId: "medical-assistant-question-case-001",
              testCaseHash: hash("case"),
              evaluatorIds: ["medical-safety-reviewer", "human-workflow-reviewer"],
              evaluatorConfigHash: hash("evaluator"),
              judgeModelRef: "judge://amc/medical-assistant-human-workflow",
              experimentRunId: "medical-assistant-context-experiment-001",
              experimentResultHash: hash("experiment"),
              exportArtifactHash: hash("export"),
              ciRunId: "ci-gap0008-question-explainability",
              ciConfigHash: hash("ci"),
              traceArtifactHash: hash("trace"),
              toolCallValidationHash: hash("toolcall"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.94,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.85,
              costUsd: 0.16,
              latencyMs: 910,
              tokenCount: 4800,
              status: "satisfied",
              evidenceRefs: ["ev-medical-user-workflow", "ev-medical-eval-pack", "ev-medical-threshold"],
              rejectedEvidenceRefs: ["ev-medical-paper-metadata-only"],
              repairHint: "Preserve the user-workflow trace, evaluator config, experiment export, and CI threshold before using this question externally.",
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
      acceptedEvidenceIds: ["ev-medical-user-workflow", "ev-medical-eval-pack", "ev-medical-threshold"],
      missingGateReasons: [],
    });
    expect(report.rows[0]?.rejectedEvidence[0]).toMatchObject({
      evidenceId: "ev-medical-paper-metadata-only",
      reason: expect.stringContaining("paper metadata cannot replace"),
    });
    expect(report.rows[0]?.repairHint.length).toBeGreaterThan(10);
    expect(report.rows[0]?.criteriaDiagnostics[0]?.repairHint).toContain("realistic user workflow receipts");
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-medical-user-workflow", "ev-medical-eval-pack", "ev-medical-threshold"],
      rejectedEvidenceReasons: [
        {
          evidenceId: "ev-medical-paper-metadata-only",
          reason: expect.stringContaining("threshold proof"),
        },
      ],
    });
    expect(pack.rows[0]?.reproducibleEvalPacks[0]).toMatchObject({
      packId: "medical-assistant-human-interaction-eval-pack",
      sourceRef: NATURE,
      kind: "test_suite_evaluation",
      ciRunId: "ci-gap0008-question-explainability",
    });
    expect(pack.rows[0]?.failClosedThresholds.every((threshold) => threshold.passed)).toBe(true);
    expect(passportJsonSchema.safeParse(passportWithQuestionExplainability(report.manifestHash, pack)).success).toBe(true);
  });

  it("fails closed when medical-assistant paper metadata replaces accepted evidence, repair proof, and thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "medical-assistant-context-agent",
      runId: "run-gap0008-medical-assistant-metadata-only",
      generatedAt: "2026-06-26T00:00:00.000Z",
      sourceRefs: [DOI, NATURE, OPENALEX],
      rows: [
        {
          question: question(),
          score: score({
            claimedLevel: 5,
            supportedMaxLevel: 1,
            finalLevel: 1,
            confidence: 0.18,
            evidenceEventIds: [],
            flags: ["metadata_only", "missing_question_evidence", "missing_human_interaction_evidence"],
            narrative: "Nature Medicine article metadata alone does not explain an AMC question score.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: signedEvent("ev-medical-nature-page-only", 5),
              reason: "Article title, DOI, participant count, and benchmark findings do not supply accepted evidence IDs, rejected evidence reasons, or a repair hint.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "medical-assistant-question-evidence-chain",
              criterionType: "agent_judge",
              status: "failed",
              evidenceRefs: [],
              rejectedEvidenceRefs: ["ev-medical-nature-page-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Attach signed question evidence, realistic user workflow evidence, a reproducible eval pack, and CI threshold proof.",
            },
          ],
          missingGateReasons: [
            "missing accepted evidence IDs",
            "missing realistic user workflow evidence",
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
        "missing realistic user workflow evidence",
        "missing reproducible eval pack",
        "missing regression thresholds",
      ],
    });
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("Article title, DOI");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({
      status: "fail_closed",
      acceptedEvidenceIds: [],
      reproducibleEvalPacks: [],
      failClosedThresholds: [],
    });
  });

  it("keeps medical-assistant source-review context out of question-explainability implementation modules", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7128444586");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
