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

const DOC = "docs/source-reviews/GAP-0016-edge-cloud-question-explainability.md";
const DOI = "https://doi.org/10.1109/COMST.2026.3669216";
const ARXIV = "https://arxiv.org/abs/2505.01821";
const OPENALEX = "https://openalex.org/W4415028496";
const IEEE = "https://ieeexplore.ieee.org/document/11417814/";
const TITLE = "Edge-Cloud Collaborative Computing on Distributed Intelligence and Model Optimization: A Survey";
const IDENTIFIER = "edge_cloud_question_explainability";

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
    confidence: 0.89,
    evidenceEventIds: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack", "ev-edge-cloud-threshold"],
    flags: [],
    narrative: "AMC-1.1: edge-cloud survey context is bounded to AMC question-level evidence receipts.",
    ...overrides,
  };
}

function signedEvent(id: string, index: number) {
  return {
    id,
    event_hash: hash(`edge-cloud-${index}`),
    writer_sig: `edge-cloud-question-writer-${index}`,
    event_type: "metric" as const,
    session_id: `edge-cloud-question-session-${index}`,
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
    passportId: "pass_gap0016_edge_cloud",
    generatedTs: Date.UTC(2026, 5, 26),
    scope: { type: "AGENT", idHash: hash("edge-cloud-agent").slice(0, 16) },
    trust: {
      integrityIndex: 0.95,
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
      includedEventProofIds: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack"],
      calculationManifestSha256: hash("calculation"),
    },
  };
}

describe("GAP-0016 edge-cloud survey question-level score explainability boundary", () => {
  it("documents live edge-cloud survey metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0016");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(IEEE);
    expect(doc).toContain("IEEE Communications Surveys & Tutorials");
    expect(doc).toContain("Publication date: 2026-01-01");
    expect(doc).toContain("Submitted on 3 May 2025");
    expect(doc).toContain("last revised 18 Mar 2026");
    expect(doc).toContain("Accepted by IEEE ComST");
    expect(doc).toContain("45 pages");
    expect(doc).toContain("Distributed, Parallel, and Cluster Computing");
    expect(doc).toContain("Artificial Intelligence");
    expect(doc).toContain("Machine Learning");
    expect(doc).toContain("benchmarking");
    expect(doc).toContain("privacy protection");
    expect(doc).toContain("security enhancement");
    expect(doc).toContain("LLMs deployment");
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

  it("accepts edge-cloud survey context only through AMC-owned question explainability receipts", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "edge-cloud-context-agent",
      runId: "run-gap0016-edge-cloud-question-explainability",
      generatedAt: "2026-06-26T00:00:00.000Z",
      sourceRefs: [DOI, ARXIV, OPENALEX, IEEE],
      rows: [
        {
          question: question(),
          score: score(),
          acceptedEvidence: [
            signedEvent("ev-edge-cloud-question-row", 1),
            signedEvent("ev-edge-cloud-eval-pack", 2),
            signedEvent("ev-edge-cloud-threshold", 3),
          ],
          rejectedEvidence: [
            {
              event: signedEvent("ev-edge-cloud-paper-metadata-only", 4),
              reason: "Edge-cloud survey metadata cannot replace AMC-owned question evidence and threshold proof.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "edge-cloud-question-evidence-chain",
              criterionType: "agent_judge",
              status: "satisfied",
              evidenceRefs: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack", "ev-edge-cloud-threshold"],
              rejectedEvidenceRefs: ["ev-edge-cloud-paper-metadata-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Keep accepted evidence IDs, rejected reasons, repair hints, eval-pack rows, and thresholds attached to this question.",
            },
          ],
          testSuiteEvaluationLens: [
            {
              suiteId: "edge-cloud-context-eval-pack",
              sourceRef: ARXIV,
              language: "typescript",
              testFramework: "vitest",
              adapter: "custom",
              datasetRef: "edge-cloud-distributed-intelligence-fixtures",
              datasetHash: hash("dataset"),
              testCaseId: "edge-cloud-question-case-001",
              testCaseHash: hash("case"),
              evaluatorIds: ["distributed-intelligence-reviewer", "resource-management-reviewer"],
              evaluatorConfigHash: hash("evaluator"),
              judgeModelRef: "judge://amc/edge-cloud-question-evidence",
              experimentRunId: "edge-cloud-context-experiment-001",
              experimentResultHash: hash("experiment"),
              exportArtifactHash: hash("export"),
              ciRunId: "ci-gap0016-question-explainability",
              ciConfigHash: hash("ci"),
              traceArtifactHash: hash("trace"),
              toolCallValidationHash: hash("toolcall"),
              agentBehaviorEvaluation: true,
              passRate0to1: 0.95,
              minPassRate0to1: 0.9,
              averageScore0to1: 0.9,
              threshold0to1: 0.85,
              costUsd: 0.11,
              latencyMs: 760,
              tokenCount: 4100,
              status: "satisfied",
              evidenceRefs: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack", "ev-edge-cloud-threshold"],
              rejectedEvidenceRefs: ["ev-edge-cloud-paper-metadata-only"],
              repairHint: "Preserve dataset, trace, evaluator config, experiment export, and CI threshold proof before externalizing this question.",
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
      acceptedEvidenceIds: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack", "ev-edge-cloud-threshold"],
      missingGateReasons: [],
    });
    expect(report.rows[0]?.rejectedEvidence[0]).toMatchObject({
      evidenceId: "ev-edge-cloud-paper-metadata-only",
      reason: expect.stringContaining("survey metadata cannot replace"),
    });
    expect(report.rows[0]?.repairHint.length).toBeGreaterThan(10);
    expect(report.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);

    expect(pack.failClosed).toBe(false);
    expect(pack.rows[0]).toMatchObject({
      questionId: "AMC-1.1",
      status: "ready",
      acceptedEvidenceIds: ["ev-edge-cloud-question-row", "ev-edge-cloud-eval-pack", "ev-edge-cloud-threshold"],
      rejectedEvidenceReasons: [
        {
          evidenceId: "ev-edge-cloud-paper-metadata-only",
          reason: expect.stringContaining("threshold proof"),
        },
      ],
    });
    expect(pack.rows[0]?.reproducibleEvalPacks[0]).toMatchObject({
      packId: "edge-cloud-context-eval-pack",
      sourceRef: ARXIV,
      kind: "test_suite_evaluation",
      ciRunId: "ci-gap0016-question-explainability",
    });
    expect(pack.rows[0]?.failClosedThresholds.every((threshold) => threshold.passed)).toBe(true);
    expect(passportJsonSchema.safeParse(passportWithQuestionExplainability(report.manifestHash, pack)).success).toBe(true);
  });

  it("fails closed when edge-cloud paper metadata replaces accepted evidence, repair proof, and thresholds", () => {
    const report = buildQuestionExplainabilityReport({
      agentId: "edge-cloud-context-agent",
      runId: "run-gap0016-edge-cloud-metadata-only",
      generatedAt: "2026-06-26T00:00:00.000Z",
      sourceRefs: [DOI, ARXIV, OPENALEX, IEEE],
      rows: [
        {
          question: question(),
          score: score({
            claimedLevel: 5,
            supportedMaxLevel: 1,
            finalLevel: 1,
            confidence: 0.18,
            evidenceEventIds: [],
            flags: ["metadata_only", "missing_question_evidence"],
            narrative: "Edge-cloud survey metadata alone does not explain an AMC question score.",
          }),
          acceptedEvidence: [],
          rejectedEvidence: [
            {
              event: signedEvent("ev-edge-cloud-openalex-only", 5),
              reason: "OpenAlex, arXiv, DOI, IEEE, title, subject, and survey metadata do not supply accepted evidence IDs, rejected evidence reasons, or a repair hint.",
            },
          ],
          criteriaDiagnostics: [
            {
              criterionId: "edge-cloud-question-evidence-chain",
              criterionType: "agent_judge",
              status: "failed",
              evidenceRefs: [],
              rejectedEvidenceRefs: ["ev-edge-cloud-openalex-only"],
              judgeRef: "judge://amc/question-explainability",
              repairHint: "Attach signed question evidence, a reproducible eval pack, and CI threshold proof.",
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
    expect(report.rows[0]?.rejectedEvidence[0]?.reason).toContain("OpenAlex, arXiv, DOI");
    expect(pack.failClosed).toBe(true);
    expect(pack.rows[0]).toMatchObject({
      status: "fail_closed",
      acceptedEvidenceIds: [],
      reproducibleEvalPacks: [],
      failClosedThresholds: [],
    });
  });

  it("keeps edge-cloud source-review context out of question-explainability implementation modules", () => {
    for (const filePath of implementationFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W4415028496");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
