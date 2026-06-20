import { describe, expect, test } from "vitest";
import { buildMetricValidationReport, googleAdkEvalMetricValidityRequirements } from "../src/score/metricValidity.js";
import type {
  DiagnosticReport,
  LayerName,
  MetricValidationContinualLearningSignal,
  MetricValidationAgentScenarioTestSignal,
  MetricValidationBioinformaticsAgentSignal,
  MetricValidationCcPluginEvalComponentType,
  MetricValidationCcPluginEvalDetectionMode,
  MetricValidationCcPluginEvalScenarioType,
  MetricValidationCcPluginEvalSignal,
  MetricValidationMirageDrugRepositioningSignal,
  MetricValidationJavaCodingAgentSignal,
  MetricValidationLegalCodeRagSignal,
  MetricValidationInferenceOptimizationSignal,
  MetricValidationChipBenchmarkSignal,
  MetricValidationCoderCupSignal,
  MetricValidationLivingEnvironmentSignal,
  MetricValidationMobileAgentSignal,
  MetricValidationNetworkTroubleshootingSignal,
  MetricValidationOpenCodeLabSignal,
  MetricValidationParallelResearchSkillSignal,
  MetricValidationPersonaAgentSignal,
  MetricValidationPentestBenchmarkSignal,
  MetricValidationRagasNotebookSignal,
  MetricValidationResumeRagEvaluatorSignal,
  MetricValidationRealignSimulationSignal,
  MetricValidationAcademiClawSignal,
  MetricValidationRagChunkingTechniqueSignal,
  MetricValidationKubernetesOperationalAgentSignal,
  MetricValidationSecureVibeBenchSignal,
  MetricValidationRavigBenchSignal,
  MetricValidationHumanStudyBenchSignal,
  MetricValidationLegacyBenchSignal,
  MetricValidationScientificLiteratureSignal,
  MetricValidationTraceEvaluationSignal,
  MetricValidationWebEvalDatasetSignal,
  QuestionScore
} from "../src/types.js";

function score(questionId: string, finalLevel = 3, confidence = 0.95): QuestionScore {
  return {
    questionId,
    claimedLevel: finalLevel,
    supportedMaxLevel: finalLevel,
    finalLevel,
    confidence,
    evidenceEventIds: [`ev-${questionId}`],
    flags: [],
    narrative: `${questionId} supported`
  };
}

function prior(runId: string, ts: number, layerValue = 3): DiagnosticReport {
  return {
    agentId: "agent-a",
    runId,
    ts,
    layerScores: [
      {
        layerName: "Strategic Agent Operations",
        avgFinalLevel: layerValue,
        confidenceWeightedFinalLevel: layerValue
      }
    ]
  } as DiagnosticReport;
}

const layerName: LayerName = "Strategic Agent Operations";

describe("buildMetricValidationReport", () => {
  test("exposes Google ADK metric-validity requirements without adding an ADK-specific adapter", () => {
    const requirements = googleAdkEvalMetricValidityRequirements();

    expect(requirements).toEqual(expect.arrayContaining([
      "live GitHub metadata relevance review",
      "AMC-owned eval-pack manifest",
      "validation table artifact",
      "evaluator-suite proof using existing primitives",
      "trace-evaluation proof when traces or Watch are claimed",
      "metric owner",
      "sample size",
      "confidence interval",
      "no-copy/source-review boundary proof"
    ]));
  });

  test("builds a validation table with owners, samples, CIs, and stability", () => {
    const questionScores = [
      score("AMC-1.1"),
      score("AMC-1.2"),
      score("AMC-1.3"),
      score("AMC-1.4"),
      score("AMC-1.5"),
      score("AMC-1.6")
    ];
    const report = buildMetricValidationReport(
      {
        agentId: "agent-a",
        runId: "run-3",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.92
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit",
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 13),
          trustTier: "OBSERVED"
        })),
        sourceRefs: ["https://arxiv.org/abs/2309.16021"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 3),
        prior("run-2", Date.UTC(2026, 5, 7), 3.02)
      ]
    );

    expect(report.rows.length).toBe(2);
    expect(report.failClosed).toBe(false);
    expect(report.rows[0]?.metricId).toBe("overall_maturity_score");
    expect(report.rows[0]?.owner).toBe("AMC Score");
    expect(report.rows[0]?.sampleSize).toBe(6);
    expect(report.rows[0]?.confidenceInterval.level).toBe(0.95);
    expect(report.rows[0]?.interRaterAgreement).toBe(0.92);
    expect(report.rows[0]?.testRetestStability).toBeGreaterThan(0.8);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2309.16021");
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.rows[0]?.signedEvidenceRefs.length).toBeGreaterThan(0);
    expect(report.evalPack.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.mode).toBe("ci");
    expect(report.ciGate.passed).toBe(true);
  });

  test("maps GBQA agent-QA source relevance to existing metric-validity receipts without source-specific product bloat", () => {
    const questionScores = [
      score("AMC-1.1"),
      score("AMC-1.2"),
      score("AMC-1.3"),
      score("AMC-1.4"),
      score("AMC-1.5"),
      score("AMC-1.6")
    ];
    const gbqaEvidenceIds = [
      "gbqa-source-repository-license",
      "gbqa-default-branch-snapshot",
      "gbqa-agent-harness-manifest",
      "gbqa-task-corpus-manifest",
      "gbqa-quality-reward-criteria",
      "gbqa-test-oracle-suite",
      "gbqa-report-schema",
      "gbqa-ci-regression-receipt",
      "gbqa-metric-owner-ci"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...gbqaEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `g${index}`.repeat(64).slice(0, 64),
        writerSig: `gbqa-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `gbqa-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "gbqa-agent-qa-benchmark",
        runId: "run-gbqa-relevance-review",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 3, confidenceWeightedFinalLevel: 3 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.91
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: [
          "source-repository-license",
          "default-branch-snapshot",
          "agent-harness-manifest",
          "quality-reward-criteria",
          "report-schema"
        ].map((facetId, index) => ({
          facetId: `gbqa-${facetId}`,
          covered: true,
          evidenceRefs: [gbqaEvidenceIds[index]!]
        })),
        processEvidenceChecks: [
          ["task-corpus-manifest", "gbqa-task-corpus-manifest"],
          ["quality-reward-criteria", "gbqa-quality-reward-criteria"],
          ["test-oracle-suite", "gbqa-test-oracle-suite"],
          ["report-schema", "gbqa-report-schema"],
          ["ci-regression-receipt", "gbqa-ci-regression-receipt"],
          ["metric-owner", "gbqa-metric-owner-ci"]
        ].map(([processEvidenceId, evidenceId]) => ({
          processEvidenceId: `gbqa-${processEvidenceId}`,
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        outcomeAlignmentChecks: [
          {
            outcomeId: "gbqa-industrial-agent-quality-assurance",
            aligned: true,
            evidenceRefs: ["gbqa-quality-reward-criteria", "gbqa-report-schema"]
          }
        ],
        toolSandboxChecks: [
          "gbqa-isolated-agent-environment",
          "gbqa-computer-use-backend",
          "gbqa-test-oracle-runner",
          "gbqa-report-export"
        ].map((sandboxSignalId, index) => ({
          sandboxSignalId,
          covered: true,
          evidenceRefs: [gbqaEvidenceIds[index + 2]!]
        })),
        sourceRefs: ["https://github.com/camel-ai/GBQA"],
        gateMode: "ci"
      },
      [
        prior("run-gbqa-baseline", Date.UTC(2026, 5, 13), 3),
        prior("run-gbqa-repeat", Date.UTC(2026, 5, 19), 3.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/camel-ai/GBQA");
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      validationFacetCoverage: 1,
      processEvidenceCoverage: 1,
      outcomeAlignment: 1,
      toolSandboxCoverage: 1,
      status: "pass"
    });
    expect(report.rows[0]?.evidenceRefs).toEqual(expect.arrayContaining(gbqaEvidenceIds));
    expect(report.evalPack.rows[0]?.signedEvidenceRefs.map((ref) => ref.evidenceId)).toEqual(expect.arrayContaining(gbqaEvidenceIds));
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when a GBQA-style source row is only repository metadata without signed validation evidence", () => {
    const report = buildMetricValidationReport({
      agentId: "gbqa-agent-qa-benchmark",
      runId: "run-gbqa-metadata-only",
      ts: Date.UTC(2026, 5, 20),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.35,
      evidenceCoverage: 0.2,
      correlationRatio: 0.2,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score("AMC-1.1", 1, 0.15), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-1.1", layerName }],
      sourceRefs: ["https://github.com/camel-ai/GBQA"],
      gateMode: "ci"
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  test("fails closed when metric evidence is under-sampled or low-validity", () => {
    const report = buildMetricValidationReport({
      agentId: "agent-a",
      runId: "run-low",
      ts: Date.UTC(2026, 5, 13),
      trustLabel: "LOW TRUST",
      integrityIndex: 0.2,
      evidenceCoverage: 0.1,
      correlationRatio: 0,
      unsupportedClaimCount: 1,
      layerScores: [{ layerName, avgFinalLevel: 1, confidenceWeightedFinalLevel: 1 }],
      questionScores: [{ ...score("AMC-1.1", 1, 0.1), evidenceEventIds: [], flags: ["FLAG_UNSUPPORTED_CLAIM"] }],
      questions: [{ id: "AMC-1.1", layerName }]
    });

    expect(report.failClosed).toBe(true);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(report.rows[0]?.status).toBe("fail");
    expect(report.rows[0]?.warnings.join(" ")).toContain("sample size");
    expect(report.rows[0]?.warnings.join(" ")).toContain("construct validity");
  });

  test("fails closed when counterfactual responsiveness reveals a hidden metric validity failure", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const counterfactualEvidenceIds = ["cf-1", "cf-2", "cf-3", "cf-4", "cf-5"];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...counterfactualEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index}`.repeat(64).slice(0, 64),
        writerSig: `counterfactual-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `counterfactual-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "clinical-agent",
        runId: "run-counterfactual",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        counterfactualChecks: counterfactualEvidenceIds.map((evidenceId) => ({
          interventionId: `intervention-${evidenceId}`,
          passed: false,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.30590"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      counterfactualResponsiveness: 0,
      counterfactualSampleSize: 5
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("counterfactual responsiveness");
    expect(report.evalPack.rows[0]).toMatchObject({
      counterfactualResponsiveness: 0,
      counterfactualSampleSize: 5
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...counterfactualEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when validation facet coverage is incomplete for a capability metric", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const facetEvidenceIds = ["facet-omission", "facet-ambiguity", "facet-inconsistency", "facet-assumption"];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...facetEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index}`.repeat(64).slice(0, 64),
        writerSig: `facet-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `facet-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "swe-agent",
        runId: "run-facets",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        validationFacetChecks: facetEvidenceIds.map((evidenceId, index) => ({
          facetId: evidenceId.replace("facet-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.30314"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      validationFacetCoverage: 0.5,
      validationFacetSampleSize: 4
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("validation facet coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      validationFacetCoverage: 0.5,
      validationFacetSampleSize: 4
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...facetEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when benchmark confounder controls are incomplete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const confounderEvidenceIds = [
      "confounder-scaffold",
      "confounder-tooling",
      "confounder-environment",
      "confounder-resource"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...confounderEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index}`.repeat(64).slice(0, 64),
        writerSig: `confounder-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `confounder-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "benchmark-agent",
        runId: "run-confounders",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        confounderControlChecks: confounderEvidenceIds.map((evidenceId, index) => ({
          confounderId: evidenceId.replace("confounder-", ""),
          controlled: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.27898"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      confounderControlCoverage: 0.5,
      confounderControlSampleSize: 4
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("confounder control coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      confounderControlCoverage: 0.5,
      confounderControlSampleSize: 4
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...confounderEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when hidden-preference outcome alignment is incomplete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const outcomeEvidenceIds = [
      "outcome-action-schema",
      "outcome-deal-rate",
      "outcome-seller-profit",
      "outcome-hidden-preference"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...outcomeEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `o${index}`.repeat(64).slice(0, 64),
        writerSig: `outcome-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `outcome-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "pricing-agent",
        runId: "run-hidden-preference-outcomes",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        outcomeAlignmentChecks: outcomeEvidenceIds.map((evidenceId, index) => ({
          outcomeId: evidenceId.replace("outcome-", ""),
          aligned: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.22855"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      outcomeAlignment: 0.5,
      outcomeAlignmentSampleSize: 4
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("outcome alignment");
    expect(report.evalPack.rows[0]).toMatchObject({
      outcomeAlignment: 0.5,
      outcomeAlignmentSampleSize: 4
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...outcomeEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when process-evidence coverage is incomplete for trajectory metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const processEvidenceIds = [
      "process-defect-ontology",
      "process-trajectory-normalization",
      "process-control-preservation",
      "process-authority-handoff"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...processEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `p${index}`.repeat(64).slice(0, 64),
        writerSig: `process-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `process-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "coding-agent",
        runId: "run-process-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        processEvidenceChecks: processEvidenceIds.map((evidenceId, index) => ({
          processEvidenceId: evidenceId.replace("process-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.20251"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      processEvidenceCoverage: 0.5,
      processEvidenceSampleSize: 4
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("process evidence coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      processEvidenceCoverage: 0.5,
      processEvidenceSampleSize: 4
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...processEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when safety-utility coverage is incomplete for untrusted-tool metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const safetyUtilityEvidenceIds = [
      "safety-unsafe-tool",
      "safety-safe-control",
      "safety-final-action-risk",
      "safety-utility-preservation"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...safetyUtilityEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `s${index}`.repeat(64).slice(0, 64),
        writerSig: `safety-utility-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `safety-utility-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "tool-risk-agent",
        runId: "run-safety-utility-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        safetyUtilityChecks: safetyUtilityEvidenceIds.map((evidenceId, index) => ({
          safetyUtilityId: evidenceId.replace("safety-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.17453"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      safetyUtilityCoverage: 0.5,
      safetyUtilitySampleSize: 4
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("safety-utility coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      safetyUtilityCoverage: 0.5,
      safetyUtilitySampleSize: 4
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...safetyUtilityEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when modality-transformation coverage is incomplete for transformed benchmark metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const modalityEvidenceIds = [
      "modality-label-preservation",
      "modality-tool-schema-preservation",
      "modality-speaker-noise-config",
      "modality-text-audio-parity",
      "modality-judge-validation"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...modalityEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `m${index}`.repeat(64).slice(0, 64),
        writerSig: `modality-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `modality-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "voice-tool-agent",
        runId: "run-modality-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        modalityTransformationChecks: modalityEvidenceIds.map((evidenceId, index) => ({
          transformationId: evidenceId.replace("modality-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.15104"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      modalityTransformationCoverage: 0.4,
      modalityTransformationSampleSize: 5
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("modality transformation coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      modalityTransformationCoverage: 0.4,
      modalityTransformationSampleSize: 5
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...modalityEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when lifecycle-observability coverage is incomplete for runtime evaluator metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const lifecycleEvidenceIds = [
      "lifecycle-input-validation",
      "lifecycle-output-validation",
      "lifecycle-evaluator-execution",
      "lifecycle-state-transition-trace",
      "lifecycle-monitoring-trace"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...lifecycleEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `l${index}`.repeat(64).slice(0, 64),
        writerSig: `lifecycle-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `lifecycle-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "runtime-monitor-agent",
        runId: "run-lifecycle-observability-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        lifecycleObservabilityChecks: lifecycleEvidenceIds.map((evidenceId, index) => ({
          lifecycleSignalId: evidenceId.replace("lifecycle-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/zozoheir/tinyllm"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      lifecycleObservabilityCoverage: 0.4,
      lifecycleObservabilitySampleSize: 5
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("lifecycle observability coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      lifecycleObservabilityCoverage: 0.4,
      lifecycleObservabilitySampleSize: 5
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...lifecycleEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when ranking-stability coverage is incomplete for checkpoint selection metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const rankingEvidenceIds = [
      "ranking-subsampling-confidence",
      "ranking-tail-failure-rate",
      "ranking-data-quality",
      "ranking-ocr-readability",
      "ranking-pairwise-ordering"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...rankingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `r${index}`.repeat(64).slice(0, 64),
        writerSig: `ranking-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ranking-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "checkpoint-selector-agent",
        runId: "run-ranking-stability-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        rankingStabilityChecks: rankingEvidenceIds.map((evidenceId, index) => ({
          rankingSignalId: evidenceId.replace("ranking-", ""),
          covered: index < 2,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.18852"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      rankingStabilityCoverage: 0.4,
      rankingStabilitySampleSize: 5
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("ranking stability coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      rankingStabilityCoverage: 0.4,
      rankingStabilitySampleSize: 5
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...rankingEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when dynamic tool-sandbox coverage is incomplete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const sandboxEvidenceIds = [
      "sandbox-tool-registry",
      "sandbox-dependency-graph",
      "sandbox-seeded-state",
      "sandbox-api-failure",
      "sandbox-retrieval",
      "sandbox-verification",
      "sandbox-trajectory",
      "sandbox-recovery"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...sandboxEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `x${index}`.repeat(64).slice(0, 64),
        writerSig: `sandbox-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `sandbox-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "tool-agent",
        runId: "run-tool-sandbox",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        toolSandboxChecks: sandboxEvidenceIds.map((evidenceId, index) => ({
          sandboxSignalId: evidenceId.replace("sandbox-", ""),
          covered: index < 4,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://arxiv.org/abs/2605.10787"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      toolSandboxCoverage: 0.5,
      toolSandboxSampleSize: 8
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("tool sandbox coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      toolSandboxCoverage: 0.5,
      toolSandboxSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...sandboxEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2605.10787");
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when continual-learning coverage is incomplete for lifelong benchmark metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const continualEvidenceIds = [
      "continual-task-sequence-version",
      "continual-dataset-version",
      "continual-prior-knowledge-retention",
      "continual-new-task-adaptation",
      "continual-forgetting-rate",
      "continual-environment-container-config",
      "continual-distributed-controller-log",
      "continual-longitudinal-run-trace"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...continualEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `y${index}`.repeat(64).slice(0, 64),
        writerSig: `continual-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `continual-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "lifelong-agent",
        runId: "run-continual-learning-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        continualLearningChecks: continualEvidenceIds.map((evidenceId, index) => ({
          continualSignalId: evidenceId.replace("continual-", ""),
          covered: index < 4,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/caixd-220529/LifelongAgentBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      continualLearningCoverage: 0.5,
      continualLearningSampleSize: 8
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("continual learning coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      continualLearningCoverage: 0.5,
      continualLearningSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...continualEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/caixd-220529/LifelongAgentBench");
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when TokenSpire-style continual game learning proof lacks memory and run artifacts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const continualSignals: MetricValidationContinualLearningSignal[] = [
      "task_sequence_version",
      "environment_config",
      "controller_log",
      "longitudinal_run_trace",
      "game_build_config",
      "mod_manifest",
      "llm_config",
      "prompt_language",
      "memory_artifact",
      "conversation_log",
      "run_summary_json",
      "gameplay_log",
      "decision_trace",
      "run_outcome_metric",
      "improvement_trend",
      "fallback_mode_control",
      "sample_size_confidence_interval"
    ];
    const continualEvidenceIds = continualSignals.map((signal) => `tokenspire-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...continualEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `t${index}`.repeat(64).slice(0, 64),
        writerSig: `tokenspire-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `tokenspire-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "tokenspire-agent",
        runId: "run-tokenspire-continual-learning-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        continualLearningChecks: continualSignals.map((signal, index) => ({
          continualSignalId: `tokenspire-${signal}`,
          continualSignalType: signal,
          covered: index < 8,
          evidenceRefs: [continualEvidenceIds[index]!],
          memoryArtifactHash: signal === "memory_artifact" ? "tokenspire-memory-v1" : undefined,
          runSummaryArtifactHash: signal === "run_summary_json" ? "tokenspire-run-summary-v1" : undefined,
          gameplayLogArtifactHash: signal === "gameplay_log" ? "tokenspire-gameplay-log-v1" : undefined,
          runCount: 4,
          metricNames: signal === "run_outcome_metric" ? ["floor_reached", "act_boss_reached", "run_duration"] : []
        })),
        sourceRefs: ["https://github.com/collinzrj/TokenSpire2"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      continualLearningCoverage: Number((8 / 17).toFixed(6)),
      continualLearningSampleSize: 17,
      continualLearningRunCount: 4
    });
    expect(report.rows[0]?.continualLearningMissingSignals).toEqual([
      "memory_artifact",
      "conversation_log",
      "run_summary_json",
      "gameplay_log",
      "decision_trace",
      "run_outcome_metric",
      "improvement_trend",
      "fallback_mode_control",
      "sample_size_confidence_interval"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).toContain("continual learning missing required signals");
    expect(report.rows[0]?.warnings.join(" ")).toContain("run count 4 below minimum 5");
    expect(report.evalPack.rows[0]).toMatchObject({
      continualLearningCoverage: Number((8 / 17).toFixed(6)),
      continualLearningSampleSize: 17,
      continualLearningRunCount: 4,
      continualLearningMemoryArtifactHashes: ["tokenspire-memory-v1"],
      continualLearningRunSummaryArtifactHashes: ["tokenspire-run-summary-v1"],
      continualLearningGameplayLogArtifactHashes: ["tokenspire-gameplay-log-v1"],
      continualLearningMetricNames: ["floor_reached", "act_boss_reached", "run_duration"]
    });
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/collinzrj/TokenSpire2");
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when strategic-interaction coverage is incomplete for multi-agent game metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const strategicEvidenceIds = [
      "strategic-player-roster",
      "strategic-public-transcript",
      "strategic-private-action-trace",
      "strategic-collision-rule-audit",
      "strategic-scoring-rating-audit",
      "strategic-silent-baseline",
      "strategic-truncation-context",
      "strategic-pairwise-uncertainty"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...strategicEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `z${index}`.repeat(64).slice(0, 64),
        writerSig: `strategic-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `strategic-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "multi-agent-game-agent",
        runId: "run-strategic-interaction-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        strategicInteractionChecks: strategicEvidenceIds.map((evidenceId, index) => ({
          strategicSignalId: evidenceId.replace("strategic-", ""),
          covered: index < 4,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/lechmazur/step_game"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      strategicInteractionCoverage: 0.5,
      strategicInteractionSampleSize: 8
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("strategic interaction coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      strategicInteractionCoverage: 0.5,
      strategicInteractionSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...strategicEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/lechmazur/step_game");
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes RagView-style RAG pipeline validity when custom dataset, metric, query, and performance evidence is complete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragEvidenceIds = [
      "rag-document-set",
      "rag-test-set",
      "rag-corpus-chunking",
      "rag-solution-roster-config",
      "rag-selected-metrics",
      "rag-query-level-results",
      "rag-metric-computation-trace",
      "rag-retrieval-trace",
      "rag-generation-trace",
      "rag-evaluator-config",
      "rag-report-export",
      "rag-performance-cost",
      "rag-plugin-framework"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...ragEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `q${index}`.repeat(64).slice(0, 64),
        writerSig: `rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ragview-agent",
        runId: "run-ragview-pipeline-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        ragPipelineChecks: ragEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/RagView/RagView"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragPipelineCoverage: 1,
      ragPipelineSampleSize: 13
    });
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("rag pipeline coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragPipelineCoverage: 1,
      ragPipelineSampleSize: 13
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...ragEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/RagView/RagView");
    expect(report.ciGate.passed).toBe(true);
  });

  test("passes LRAGE-style legal RAG validity when domain corpus, retriever, judge, and agent evidence is complete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const legalRagEvidenceIds = [
      "rag-legal-corpus-provenance",
      "rag-legal-dataset-suite",
      "rag-jurisdiction-language-task-coverage",
      "rag-precompiled-index-provenance",
      "rag-retriever-config",
      "rag-reranker-config",
      "rag-top-k-index-settings",
      "rag-model-runner-config",
      "rag-judge-model-rubric-config",
      "rag-logged-samples-retrieved-docs",
      "rag-agent-framework-integration",
      "rag-legal-reasoning-evaluation-mode"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...legalRagEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `l${index}`.repeat(64).slice(0, 64),
        writerSig: `legal-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `legal-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "legal-rag-agent",
        runId: "run-lrage-legal-rag-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        ragPipelineChecks: legalRagEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: [
          "https://github.com/hoorangyee/LRAGE",
          "https://arxiv.org/abs/2504.01840"
        ],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragPipelineCoverage: 1,
      ragPipelineSampleSize: 12
    });
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("rag pipeline coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragPipelineCoverage: 1,
      ragPipelineSampleSize: 12
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...legalRagEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/hoorangyee/LRAGE");
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2504.01840");
    expect(report.ciGate.passed).toBe(true);
  });

  test("passes Micronaire-style RAG evaluation validity when ground truth, pipeline, metric, owner, CI, and report evidence is complete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragEvalSignals = [
      ["ground_truth_questions", "micronaire-ground-truth-questions", "a".repeat(64)],
      ["ground_truth_answers", "micronaire-ground-truth-answers", "b".repeat(64)],
      ["rag_pipeline_config", "micronaire-semantic-kernel-pipeline-config", "c".repeat(64)],
      ["document_corpus", "micronaire-document-corpus", "d".repeat(64)],
      ["metric_definition", "micronaire-metric-definitions", "e".repeat(64)],
      ["query_result_trace", "micronaire-query-result-trace", "f".repeat(64)],
      ["retrieval_trace", "micronaire-retrieval-trace", "1".repeat(64)],
      ["generation_trace", "micronaire-generation-trace", "2".repeat(64)],
      ["evaluator_config", "micronaire-evaluator-config", "3".repeat(64)],
      ["evaluation_report", "micronaire-evaluation-report", "4".repeat(64)],
      ["metric_owner", "micronaire-metric-owner", ""],
      ["sample_size_confidence_interval", "micronaire-sample-size-ci", ""]
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...ragEvalSignals.map(([, evidenceId], index) => ({
        evidenceId,
        eventHash: `m${index}`.repeat(64).slice(0, 64),
        writerSig: `micronaire-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `micronaire-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "semantic-kernel-rag-agent",
        runId: "run-micronaire-rag-eval-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagEvaluationPipelineProof: true,
        ragPipelineChecks: ragEvalSignals.map(([evaluationSignalType, evidenceId, artifactHash]) => ({
          ragSignalId: `micronaire-${evaluationSignalType}`,
          evaluationSignalType,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: artifactHash || undefined,
          owner: evaluationSignalType === "metric_owner" ? "AMC Score RAG Metric Owner" : undefined,
          sampleSize: evaluationSignalType === "sample_size_confidence_interval" ? questionScores.length : undefined,
          confidenceInterval: evaluationSignalType === "sample_size_confidence_interval"
            ? { level: 0.95, lower: 78, upper: 84, marginOfError: 3 }
            : undefined,
          metricNames: evaluationSignalType === "metric_definition" ? ["answer-grounding", "retrieval-relevance"] : undefined
        })),
        sourceRefs: ["https://github.com/microsoft/micronaire"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragPipelineCoverage: 1,
      ragEvaluationPipelineCoverage: 1,
      ragEvaluationPipelineSampleSize: 12,
      ragEvaluationPipelineCaseSampleSizeMin: 6,
      ragEvaluationPipelineMissingSignals: []
    });
    expect(report.rows[0]?.ragEvaluationPipelineMetricOwners).toEqual(["AMC Score RAG Metric Owner"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("rag evaluation pipeline coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragEvaluationPipelineCoverage: 1,
      ragEvaluationPipelineSampleSize: 12,
      ragEvaluationPipelineMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...ragEvalSignals.map(([, evidenceId]) => evidenceId)
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/microsoft/micronaire");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed for Micronaire-style RAG evaluation claims when only generic RAG coverage is supplied", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const genericRagEvidenceIds = [
      "rag-document-set",
      "rag-test-set",
      "rag-selected-metrics",
      "rag-query-level-results",
      "rag-retrieval-trace",
      "rag-generation-trace"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...genericRagEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `g${index}`.repeat(64).slice(0, 64),
        writerSig: `generic-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `generic-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "semantic-kernel-rag-agent",
        runId: "run-micronaire-rag-eval-missing-proof",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagEvaluationPipelineProof: true,
        ragPipelineChecks: genericRagEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/microsoft/micronaire"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragPipelineCoverage: 1,
      ragEvaluationPipelineCoverage: 0,
      ragEvaluationPipelineSampleSize: 0
    });
    expect(report.rows[0]?.ragEvaluationPipelineMissingSignals).toContain("ground_truth_questions");
    expect(report.rows[0]?.ragEvaluationPipelineMissingSignals).toContain("evaluation_report");
    expect(report.rows[0]?.warnings.join(" ")).toContain("rag evaluation pipeline coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragEvaluationPipelineCoverage: 0,
      ragEvaluationPipelineSampleSize: 0
    });
    expect(report.evalPack.rows[0]?.ragEvaluationPipelineMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes MIRAGE-style metric-intensive RAG validity with base, oracle, mixed, retriever, and robustness proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const mirageSignals = [
      ["benchmark_identity", "mirage-benchmark-identity", "a".repeat(64)],
      ["dataset_manifest", "mirage-dataset-manifest", "b".repeat(64)],
      ["qa_pair_manifest", "mirage-qa-pair-manifest", "c".repeat(64)],
      ["context_pool_manifest", "mirage-context-pool-manifest", "d".repeat(64)],
      ["retrieval_pool_manifest", "mirage-retrieval-pool-manifest", "e".repeat(64)],
      ["base_oracle_mixed_protocol", "mirage-base-oracle-mixed-protocol", "f".repeat(64)],
      ["retriever_config", "mirage-retriever-config", "1".repeat(64)],
      ["model_config", "mirage-model-config", "2".repeat(64)],
      ["llm_result_report", "mirage-llm-result-report", "3".repeat(64)],
      ["retriever_result_report", "mirage-retriever-result-report", "4".repeat(64)],
      ["mirage_metrics_report", "mirage-metrics-report", "5".repeat(64)],
      ["overall_score_formula", "mirage-overall-score-formula", "6".repeat(64)],
      ["metric_owner", "mirage-metric-owner", ""],
      ["sample_size_confidence_interval", "mirage-sample-size-ci", ""]
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...mirageSignals.map(([, evidenceId], index) => ({
        evidenceId,
        eventHash: `r${index}`.repeat(64).slice(0, 64),
        writerSig: `mirage-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `mirage-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mirage-rag-agent",
        runId: "run-mirage-rag-metric-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMirageRagMetricProof: true,
        ragPipelineChecks: mirageSignals.map(([mirageSignalType, evidenceId, artifactHash]) => ({
          ragSignalId: `mirage-${mirageSignalType}`,
          mirageSignalType,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: artifactHash || undefined,
          datasetIds: mirageSignalType === "dataset_manifest" ? ["mirage-synthetic-fixture"] : undefined,
          retrieverIds: mirageSignalType === "retriever_config" ? ["sparse-retriever", "dense-retriever"] : undefined,
          modelIds: mirageSignalType === "model_config" ? ["rag-model-a"] : undefined,
          evaluationModes: mirageSignalType === "base_oracle_mixed_protocol" ? ["base", "oracle", "mixed"] : undefined,
          qaPairCount: mirageSignalType === "qa_pair_manifest" ? 64 : undefined,
          contextPoolCount: mirageSignalType === "context_pool_manifest" || mirageSignalType === "retrieval_pool_manifest" ? 320 : undefined,
          owner: mirageSignalType === "metric_owner" ? "AMC Score RAG Metric Owner" : undefined,
          sampleSize: mirageSignalType === "sample_size_confidence_interval" ? 64 : undefined,
          confidenceInterval: mirageSignalType === "sample_size_confidence_interval"
            ? { level: 0.95, lower: 71, upper: 77, marginOfError: 3 }
            : undefined,
          metricNames: mirageSignalType === "llm_result_report"
            ? ["f1", "em_loose", "em_strict"]
            : mirageSignalType === "retriever_result_report"
              ? ["f1", "ndcg", "precision", "recall"]
              : mirageSignalType === "mirage_metrics_report"
                ? ["noise_vulnerability", "context_acceptability", "context_insensitivity", "context_misinterpretation"]
                : mirageSignalType === "overall_score_formula"
                  ? ["mirage_overall_score"]
                  : undefined
        })),
        sourceRefs: ["https://github.com/nlpai-lab/MIRAGE"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragPipelineCoverage: 1,
      mirageRagMetricCoverage: 1,
      mirageRagMetricSampleSize: 14,
      mirageRagMetricMissingSignals: [],
      mirageRagMetricQaPairCount: 64,
      mirageRagMetricContextPoolCount: 320
    });
    expect(report.rows[0]?.mirageRagMetricEvaluationModes).toEqual(["base", "oracle", "mixed"]);
    expect(report.rows[0]?.mirageRagMetricNames).toContain("noise_vulnerability");
    expect(report.rows[0]?.mirageRagMetricNames).toContain("context_misinterpretation");
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("mirage rag metric coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      mirageRagMetricCoverage: 1,
      mirageRagMetricSampleSize: 14,
      mirageRagMetricMissingSignals: [],
      mirageRagMetricQaPairCount: 64,
      mirageRagMetricContextPoolCount: 320
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...mirageSignals.map(([, evidenceId]) => evidenceId)
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/nlpai-lab/MIRAGE");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed for MIRAGE-style RAG metric claims without setup, metric, report, owner, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const genericRagEvidenceIds = [
      "rag-document-set",
      "rag-retrieval-trace",
      "rag-generation-trace",
      "rag-evaluation-report"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...genericRagEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `x${index}`.repeat(64).slice(0, 64),
        writerSig: `generic-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `generic-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mirage-rag-agent",
        runId: "run-mirage-rag-metric-missing-proof",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMirageRagMetricProof: true,
        ragPipelineChecks: genericRagEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/nlpai-lab/MIRAGE"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragPipelineCoverage: 1,
      mirageRagMetricCoverage: 0,
      mirageRagMetricSampleSize: 0
    });
    expect(report.rows[0]?.mirageRagMetricMissingSignals).toContain("base_oracle_mixed_protocol");
    expect(report.rows[0]?.mirageRagMetricMissingSignals).toContain("mirage_metrics_report");
    expect(report.rows[0]?.warnings.join(" ")).toContain("mirage rag metric coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      mirageRagMetricCoverage: 0,
      mirageRagMetricSampleSize: 0
    });
    expect(report.evalPack.rows[0]?.mirageRagMetricMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates RAGAS notebook metric validity with source boundary, testset, RAGAS metrics, LangFuse, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragasSignals: MetricValidationRagasNotebookSignal[] = [
      "source_repository_boundary",
      "notebook_manifest",
      "dependency_manifest",
      "document_corpus",
      "chunking_config",
      "testset_generator_config",
      "evolution_mix",
      "generated_testset_manifest",
      "rag_chain_config",
      "retriever_vectorstore_config",
      "model_embedding_config",
      "answer_context_trace",
      "ragas_metric_suite",
      "ragas_evaluation_result",
      "langfuse_trace_score_export",
      "visualization_artifact",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const ragasEvidenceIds = ragasSignals.map((signal) => `ragas-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...ragasEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `ragas-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ragas-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ragas-notebook-agent",
        runId: "run-ragas-notebook-validity",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.95
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagasNotebookProof: true,
        ragPipelineChecks: ragasSignals.map((signal, index) => ({
          ragSignalId: `ragas-${signal}`,
          ragasNotebookSignalType: signal,
          covered: true,
          evidenceRefs: [ragasEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_boundary"
            ? ["https://github.com/Coding-Crashkurse/RAG-Evaluation-with-Ragas"]
            : undefined,
          licenseBoundaryRefs: signal === "source_repository_boundary" ? ["NOASSERTION"] : undefined,
          notebookIds: signal === "notebook_manifest" ? ["ragas.ipynb"] : undefined,
          dependencyIds: signal === "dependency_manifest" ? ["requirements.txt", "docker-compose.yaml"] : undefined,
          documentCorpusIds: signal === "document_corpus" ? ["catbank.txt"] : undefined,
          chunkingConfigIds: signal === "chunking_config" ? ["character-text-splitter"] : undefined,
          testsetGeneratorIds: signal === "testset_generator_config" ? ["ragas-testset-generator-openai"] : undefined,
          evolutionTypes: signal === "evolution_mix" ? ["simple", "reasoning", "multi_context"] : undefined,
          testsetIds: signal === "generated_testset_manifest" ? ["ragas-generated-testset-v1"] : undefined,
          ragChainIds: signal === "rag_chain_config" ? ["langchain-runnable-rag-chain"] : undefined,
          retrieverIds: signal === "retriever_vectorstore_config" ? ["chroma-retriever"] : undefined,
          vectorStoreIds: signal === "retriever_vectorstore_config" ? ["chroma-local-index"] : undefined,
          modelIds: signal === "model_embedding_config" ? ["chat-openai"] : undefined,
          embeddingModelIds: signal === "model_embedding_config" ? ["openai-embeddings"] : undefined,
          answerContextTraceIds: signal === "answer_context_trace" ? ["ragas-answer-context-trace"] : undefined,
          metricNames: signal === "ragas_metric_suite"
            ? ["faithfulness", "answer_relevancy", "context_relevancy", "context_recall", "context_precision"]
            : signal === "ragas_evaluation_result"
              ? ["ragas_result_dataframe"]
              : signal === "langfuse_trace_score_export"
                ? ["faithfulness", "answer_relevancy", "context_recall"]
                : undefined,
          langfuseTraceIds: signal === "langfuse_trace_score_export" ? ["langfuse-eval-trace"] : undefined,
          visualizationIds: signal === "visualization_artifact" ? ["ragas-heatmap"] : undefined,
          ragasQuestionCount: ["generated_testset_manifest", "answer_context_trace"].includes(signal) ? 24 : undefined,
          owner: signal === "metric_owner" ? "AMC RAGAS Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? { level: 0.95, lower: 88, upper: 94, marginOfError: 3 }
            : undefined
        })),
        sourceRefs: ["https://github.com/Coding-Crashkurse/RAG-Evaluation-with-Ragas"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragasNotebookCoverage: 1,
      ragasNotebookSampleSize: 18,
      ragasNotebookMissingSignals: [],
      ragasNotebookQuestionCount: 24
    });
    expect(report.rows[0]?.ragasNotebookMetricNames).toContain("faithfulness");
    expect(report.rows[0]?.ragasNotebookMetricNames).toContain("context_precision");
    expect(report.rows[0]?.ragasNotebookReportArtifactHashes.length).toBe(16);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("ragas notebook metric coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragasNotebookCoverage: 1,
      ragasNotebookSampleSize: 18,
      ragasNotebookMissingSignals: [],
      ragasNotebookQuestionCount: 24
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...ragasEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when RAGAS notebook metric validity has only a notebook label and generic RAG output", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const genericEvidenceIds = ["ragas-notebook-label", "ragas-output-json", "ragas-local-plot"];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...genericEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `generic-ragas-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `generic-ragas-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ragas-notebook-agent",
        runId: "run-ragas-notebook-missing-proof",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.95
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagasNotebookProof: true,
        ragPipelineChecks: genericEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId,
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/Coding-Crashkurse/RAG-Evaluation-with-Ragas"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragasNotebookCoverage: 0,
      ragasNotebookSampleSize: 0
    });
    expect(report.rows[0]?.ragasNotebookMissingSignals).toContain("source_repository_boundary");
    expect(report.rows[0]?.ragasNotebookMissingSignals).toContain("ragas_metric_suite");
    expect(report.rows[0]?.warnings.join(" ")).toContain("ragas notebook metric coverage");
    expect(report.evalPack.rows[0]?.ragasNotebookMissingSignals).toContain("langfuse_trace_score_export");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes Legal Code RAG metric validity with legal corpus, Legifrance, retrieval technique, and evaluation proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const legalCodeRagSignals = [
      ["legal_corpus_manifest", "legal-code-rag-corpus-manifest", "a".repeat(64)],
      ["legifrance_source_boundary", "legal-code-rag-legifrance-boundary", "b".repeat(64)],
      ["retriever_config", "legal-code-rag-retriever-config", "c".repeat(64)],
      ["vector_database_config", "legal-code-rag-vector-db-config", "d".repeat(64)],
      ["embedding_model_config", "legal-code-rag-embedding-config", "e".repeat(64)],
      ["windowing_config", "legal-code-rag-windowing-config", "f".repeat(64)],
      ["hybrid_search_config", "legal-code-rag-hybrid-search-config", "1".repeat(64)],
      ["query_rewrite_config", "legal-code-rag-query-rewrite-config", "2".repeat(64)],
      ["routing_policy_config", "legal-code-rag-routing-policy-config", "3".repeat(64)],
      ["evaluation_dataset", "legal-code-rag-evaluation-dataset", "4".repeat(64)],
      ["reference_answer_manifest", "legal-code-rag-reference-answers", "5".repeat(64)],
      ["metric_definition", "legal-code-rag-metric-definition", "6".repeat(64)],
      ["evaluator_config", "legal-code-rag-evaluator-config", "7".repeat(64)],
      ["evaluation_report", "legal-code-rag-evaluation-report", "8".repeat(64)],
      ["metric_owner", "legal-code-rag-metric-owner", ""],
      ["sample_size_confidence_interval", "legal-code-rag-sample-size-ci", ""]
    ] as const satisfies ReadonlyArray<readonly [MetricValidationLegalCodeRagSignal, string, string]>;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...legalCodeRagSignals.map(([, evidenceId], index) => ({
        evidenceId,
        eventHash: `l${index}`.repeat(64).slice(0, 64),
        writerSig: `legal-code-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `legal-code-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "legal-code-rag-agent",
        runId: "run-legal-code-rag-metric-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLegalCodeRagProof: true,
        ragPipelineChecks: legalCodeRagSignals.map(([legalCodeRagSignalType, evidenceId, artifactHash]) => ({
          ragSignalId: `legal-code-rag-${legalCodeRagSignalType}`,
          legalCodeRagSignalType,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: artifactHash || undefined,
          legalCodeIds: legalCodeRagSignalType === "legal_corpus_manifest"
            ? ["code-civil", "code-commerce"]
            : undefined,
          jurisdictionIds: legalCodeRagSignalType === "legifrance_source_boundary" ? ["FR"] : undefined,
          retrieverIds: legalCodeRagSignalType === "retriever_config"
            ? ["llamaindex-query-engine", "hybrid-retriever"]
            : undefined,
          vectorStoreIds: legalCodeRagSignalType === "vector_database_config" ? ["qdrant-local"] : undefined,
          embeddingModelIds: legalCodeRagSignalType === "embedding_model_config"
            ? ["openai-ada", "mistral-embed"]
            : undefined,
          retrievalTechniqueIds: legalCodeRagSignalType === "windowing_config"
            ? ["windowing"]
            : legalCodeRagSignalType === "hybrid_search_config"
              ? ["hybrid_search"]
              : legalCodeRagSignalType === "query_rewrite_config"
                ? ["query_rewriting"]
                : legalCodeRagSignalType === "routing_policy_config"
                  ? ["routing"]
                  : undefined,
          evaluationDatasetIds: legalCodeRagSignalType === "evaluation_dataset"
            ? ["french-legal-code-qa-v1"]
            : undefined,
          legalQuestionCount: legalCodeRagSignalType === "evaluation_dataset" ||
            legalCodeRagSignalType === "reference_answer_manifest"
            ? 24
            : undefined,
          metricNames: legalCodeRagSignalType === "metric_definition"
            ? ["faithfulness", "retrieval_recall", "answer_correctness"]
            : legalCodeRagSignalType === "evaluation_report"
              ? ["legal_code_rag_score"]
              : undefined,
          owner: legalCodeRagSignalType === "metric_owner" ? "AMC Score RAG Metric Owner" : undefined,
          sampleSize: legalCodeRagSignalType === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: legalCodeRagSignalType === "sample_size_confidence_interval"
            ? { level: 0.95, lower: 82, upper: 88, marginOfError: 3 }
            : undefined
        })),
        sourceRefs: ["https://github.com/HamzaG737/legal-code-rag"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragPipelineCoverage: 1,
      legalCodeRagCoverage: 1,
      legalCodeRagSampleSize: 16,
      legalCodeRagMissingSignals: [],
      legalCodeRagQuestionCount: 24
    });
    expect(report.rows[0]?.legalCodeRagLegalCodeIds).toEqual(["code-civil", "code-commerce"]);
    expect(report.rows[0]?.legalCodeRagJurisdictionIds).toEqual(["FR"]);
    expect(report.rows[0]?.legalCodeRagRetrievalTechniqueIds).toEqual([
      "windowing",
      "hybrid_search",
      "query_rewriting",
      "routing"
    ]);
    expect(report.rows[0]?.legalCodeRagVectorStoreIds).toEqual(["qdrant-local"]);
    expect(report.rows[0]?.legalCodeRagEmbeddingModelIds).toEqual(["openai-ada", "mistral-embed"]);
    expect(report.rows[0]?.legalCodeRagEvaluationDatasetIds).toEqual(["french-legal-code-qa-v1"]);
    expect(report.rows[0]?.legalCodeRagMetricOwners).toEqual(["AMC Score RAG Metric Owner"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("legal code rag coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      legalCodeRagCoverage: 1,
      legalCodeRagSampleSize: 16,
      legalCodeRagMissingSignals: [],
      legalCodeRagQuestionCount: 24
    });
    expect(report.evalPack.rows[0]?.legalCodeRagReportArtifactHashes).toContain("8".repeat(64));
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...legalCodeRagSignals.map(([, evidenceId]) => evidenceId)
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/HamzaG737/legal-code-rag");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed for Legal Code RAG metric claims when source and evaluation proof is incomplete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const genericRagEvidenceIds = [
      "rag-document-set",
      "rag-retrieval-trace",
      "rag-generation-trace",
      "rag-evaluation-report"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...genericRagEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `y${index}`.repeat(64).slice(0, 64),
        writerSig: `generic-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `generic-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "legal-code-rag-agent",
        runId: "run-legal-code-rag-missing-proof",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLegalCodeRagProof: true,
        ragPipelineChecks: genericRagEvidenceIds.map((evidenceId) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/HamzaG737/legal-code-rag"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragPipelineCoverage: 1,
      legalCodeRagCoverage: 0,
      legalCodeRagSampleSize: 0
    });
    expect(report.rows[0]?.legalCodeRagMissingSignals).toContain("legifrance_source_boundary");
    expect(report.rows[0]?.legalCodeRagMissingSignals).toContain("hybrid_search_config");
    expect(report.rows[0]?.legalCodeRagMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("legal code rag coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      legalCodeRagCoverage: 0,
      legalCodeRagSampleSize: 0
    });
    expect(report.evalPack.rows[0]?.legalCodeRagMissingSignals).toContain("evaluation_report");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes GuardBench-style guardrail metric validity with dataset, metric-suite, export, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const guardbenchSignals = [
      ["benchmark_identity", "guardbench-benchmark-identity", "a".repeat(64)],
      ["dataset_manifest", "guardbench-dataset-manifest", "b".repeat(64)],
      ["dataset_access_policy", "guardbench-dataset-access-policy", "c".repeat(64)],
      ["standardized_format", "guardbench-standardized-format", "d".repeat(64)],
      ["moderation_function_contract", "guardbench-moderation-contract", "e".repeat(64)],
      ["guardrail_model_config", "guardbench-model-config", "f".repeat(64)],
      ["threshold_config", "guardbench-threshold-config", "1".repeat(64)],
      ["prediction_score_manifest", "guardbench-prediction-score-manifest", "2".repeat(64)],
      ["metric_suite_report", "guardbench-metric-suite-report", "3".repeat(64)],
      ["confusion_matrix_report", "guardbench-confusion-matrix-report", "4".repeat(64)],
      ["language_coverage", "guardbench-language-coverage", "5".repeat(64)],
      ["leaderboard_or_export_report", "guardbench-export-report", "6".repeat(64)],
      ["metric_owner", "guardbench-metric-owner", ""],
      ["sample_size_confidence_interval", "guardbench-sample-size-ci", ""]
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 14),
        trustTier: "OBSERVED" as const
      })),
      ...guardbenchSignals.map(([, evidenceId], index) => ({
        evidenceId,
        eventHash: `g${index}`.repeat(64).slice(0, 64),
        writerSig: `guardbench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `guardbench-session-${index}`,
        ts: Date.UTC(2026, 5, 14),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "guardrail-agent",
        runId: "run-guardbench-metric-validity",
        ts: Date.UTC(2026, 5, 14),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireGuardbenchMetricProof: true,
        guardbenchChecks: guardbenchSignals.map(([guardbenchSignalType, evidenceId, artifactHash]) => ({
          guardbenchSignalId: `guardbench-${guardbenchSignalType}`,
          guardbenchSignalType,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: artifactHash || undefined,
          datasetIds: guardbenchSignalType === "dataset_manifest" ? ["guardbench-synthetic-fixture", "custom-moderation-set"] : undefined,
          languageIds: guardbenchSignalType === "language_coverage" ? ["en", "de", "fr", "it", "es"] : undefined,
          modelIds: guardbenchSignalType === "guardrail_model_config" ? ["guardrail-model-a"] : undefined,
          thresholdIds: guardbenchSignalType === "threshold_config" ? ["unsafe-probability-threshold-v1"] : undefined,
          exportFormats: guardbenchSignalType === "leaderboard_or_export_report" ? ["latex", "leaderboard"] : undefined,
          metricNames: guardbenchSignalType === "metric_suite_report"
            ? ["precision", "recall", "f1", "mcc", "auprc", "sensitivity", "specificity", "g_mean", "fpr", "fnr"]
            : guardbenchSignalType === "confusion_matrix_report"
              ? ["true_positive", "false_positive", "true_negative", "false_negative"]
              : undefined,
          owner: guardbenchSignalType === "metric_owner" ? "AMC Score Guardrail Metric Owner" : undefined,
          sampleSize: guardbenchSignalType === "sample_size_confidence_interval" ? 80 : undefined,
          confidenceInterval: guardbenchSignalType === "sample_size_confidence_interval"
            ? { level: 0.95, lower: 84, upper: 90, marginOfError: 3 }
            : undefined
        })),
        sourceRefs: ["https://github.com/AmenRa/GuardBench", "https://aclanthology.org/2024.emnlp-main.1022/"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      guardbenchMetricCoverage: 1,
      guardbenchMetricSampleSize: 14,
      guardbenchMetricMissingSignals: [],
      guardbenchDatasetIds: ["guardbench-synthetic-fixture", "custom-moderation-set"],
      guardbenchLanguageIds: ["en", "de", "fr", "it", "es"]
    });
    expect(report.rows[0]?.guardbenchMetricNames).toContain("mcc");
    expect(report.rows[0]?.guardbenchMetricNames).toContain("fnr");
    expect(report.rows[0]?.guardbenchExportFormats).toEqual(["latex", "leaderboard"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("guardbench metric coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      guardbenchMetricCoverage: 1,
      guardbenchMetricSampleSize: 14,
      guardbenchMetricMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...guardbenchSignals.map(([, evidenceId]) => evidenceId)
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/AmenRa/GuardBench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed for GuardBench-style guardrail metric claims without dataset, metric, export, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const genericGuardrailEvidenceIds = [
      "guardrail-demo-result",
      "guardrail-local-command",
      "guardrail-model-label"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 14),
        trustTier: "OBSERVED" as const
      })),
      ...genericGuardrailEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `y${index}`.repeat(64).slice(0, 64),
        writerSig: `generic-guardrail-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `generic-guardrail-session-${index}`,
        ts: Date.UTC(2026, 5, 14),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "guardrail-agent",
        runId: "run-guardbench-metric-missing-proof",
        ts: Date.UTC(2026, 5, 14),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireGuardbenchMetricProof: true,
        guardbenchChecks: genericGuardrailEvidenceIds.map((evidenceId) => ({
          guardbenchSignalId: evidenceId.replace("guardrail-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/AmenRa/GuardBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      guardbenchMetricCoverage: 0,
      guardbenchMetricSampleSize: 0
    });
    expect(report.rows[0]?.guardbenchMetricMissingSignals).toContain("dataset_manifest");
    expect(report.rows[0]?.guardbenchMetricMissingSignals).toContain("metric_suite_report");
    expect(report.rows[0]?.guardbenchMetricMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("guardbench metric coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      guardbenchMetricCoverage: 0,
      guardbenchMetricSampleSize: 0
    });
    expect(report.evalPack.rows[0]?.guardbenchMetricMissingSignals).toContain("leaderboard_or_export_report");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes for reality-check style architecture metric proof with archetypes, stress, network, ensemble, and statistics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const architectureSignals = [
      ["wrapper_agent_baseline", "arch-wrapper-baseline", "a"],
      ["marketing_agent_baseline", "arch-marketing-baseline", "b"],
      ["real_agent_baseline", "arch-real-baseline", "c"],
      ["planning_hierarchy", "arch-planning-hierarchy", "d"],
      ["memory_context_retention", "arch-memory-retention", "e"],
      ["recovery_strategy", "arch-recovery-strategy", "f"],
      ["stress_tool_failure", "arch-stress-tool-failure", "1"],
      ["network_resilience", "arch-network-resilience", "2"],
      ["cost_per_success", "arch-cost-per-success", "3"],
      ["ensemble_coordination", "arch-ensemble-coordination", "4"],
      ["statistical_confidence", "arch-statistical-confidence", "5"]
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...architectureSignals.map(([, evidenceId], index) => ({
        evidenceId,
        eventHash: `a${index}`.repeat(64).slice(0, 64),
        writerSig: `architecture-reality-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `architecture-reality-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "architecture-reality-agent",
        runId: "run-architecture-reality-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireArchitectureRealityProof: true,
        architectureRealityChecks: architectureSignals.map(([architectureSignalType, evidenceId, artifactChar]) => ({
          architectureSignalId: `reality-check-${architectureSignalType}`,
          architectureSignalType,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: architectureSignalType === "statistical_confidence" ? undefined : artifactChar.repeat(64),
          scenarioCount: ["stress_tool_failure", "network_resilience", "ensemble_coordination"].includes(architectureSignalType)
            ? 5
            : undefined,
          sampleSize: architectureSignalType === "statistical_confidence" ? 12 : undefined,
          confidenceInterval: architectureSignalType === "statistical_confidence"
            ? { level: 0.99, lower: 64, upper: 70, marginOfError: 3 }
            : undefined,
          metricNames: architectureSignalType === "cost_per_success"
            ? ["success_rate", "context_retention", "cost_per_success"]
            : undefined
        })),
        sourceRefs: ["https://github.com/Cre4T3Tiv3/ai-agents-reality-check"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      architectureRealityCoverage: 1,
      architectureRealitySampleSize: 11,
      architectureRealityStressScenarioCount: 5,
      architectureRealityNetworkScenarioCount: 5,
      architectureRealityEnsemblePatternCount: 5,
      architectureRealityMissingSignals: []
    });
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("architecture reality coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      architectureRealityCoverage: 1,
      architectureRealitySampleSize: 11,
      architectureRealityMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...architectureSignals.map(([, evidenceId]) => evidenceId)
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/Cre4T3Tiv3/ai-agents-reality-check");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed for architecture metric claims when only generic metric evidence is supplied", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const signedEvidenceRefs = questionScores.map((row, index) => ({
      evidenceId: row.evidenceEventIds[0]!,
      eventHash: `${index}`.repeat(64).slice(0, 64),
      writerSig: `writer-sig-${index}`,
      eventType: "audit" as const,
      sessionId: `session-${index}`,
      ts: Date.UTC(2026, 5, 13),
      trustTier: "OBSERVED" as const
    }));

    const report = buildMetricValidationReport(
      {
        agentId: "architecture-reality-agent",
        runId: "run-architecture-reality-missing-proof",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireArchitectureRealityProof: true,
        sourceRefs: ["https://github.com/Cre4T3Tiv3/ai-agents-reality-check"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      architectureRealityCoverage: 0,
      architectureRealitySampleSize: 0
    });
    expect(report.rows[0]?.architectureRealityMissingSignals).toContain("wrapper_agent_baseline");
    expect(report.rows[0]?.architectureRealityMissingSignals).toContain("network_resilience");
    expect(report.rows[0]?.architectureRealityMissingSignals).toContain("statistical_confidence");
    expect(report.rows[0]?.warnings.join(" ")).toContain("architecture reality coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      architectureRealityCoverage: 0,
      architectureRealitySampleSize: 0
    });
    expect(report.evalPack.rows[0]?.architectureRealityMissingSignals).toContain("ensemble_coordination");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when RAG pipeline coverage is incomplete for retrieval-evaluation metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragEvidenceIds = [
      "rag-document-set",
      "rag-test-set",
      "rag-corpus-chunking",
      "rag-solution-roster-config",
      "rag-selected-metrics",
      "rag-query-level-results",
      "rag-metric-computation-trace",
      "rag-retrieval-trace",
      "rag-generation-trace",
      "rag-evaluator-config",
      "rag-report-export",
      "rag-performance-cost"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...ragEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `q${index}`.repeat(64).slice(0, 64),
        writerSig: `rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `rag-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "rag-agent",
        runId: "run-rag-pipeline-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        ragPipelineChecks: ragEvidenceIds.map((evidenceId, index) => ({
          ragSignalId: evidenceId.replace("rag-", ""),
          covered: index < 6,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/RagView/RagView"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragPipelineCoverage: 0.5,
      ragPipelineSampleSize: 12
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("rag pipeline coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ragPipelineCoverage: 0.5,
      ragPipelineSampleSize: 12
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...ragEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/RagView/RagView");
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes business-workflow metric validity when AutomationBench-style coverage evidence is complete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const workflowEvidenceIds = [
      "workflow-domain-task-coverage",
      "workflow-simple-baseline",
      "workflow-public-private-split",
      "workflow-toolset-config",
      "workflow-programmatic-assertions",
      "workflow-partial-credit",
      "workflow-strict-pass-rate",
      "workflow-export-comparison"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...workflowEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `w${index}`.repeat(64).slice(0, 64),
        writerSig: `workflow-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `workflow-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "business-workflow-agent",
        runId: "run-business-workflow-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        businessWorkflowChecks: workflowEvidenceIds.map((evidenceId) => ({
          workflowSignalId: evidenceId.replace("workflow-", ""),
          covered: true,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: [
          "https://github.com/zapier/AutomationBench",
          "https://arxiv.org/abs/2604.18934"
        ],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      businessWorkflowCoverage: 1,
      businessWorkflowSampleSize: 8
    });
    expect(report.evalPack.rows[0]).toMatchObject({
      businessWorkflowCoverage: 1,
      businessWorkflowSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...workflowEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/zapier/AutomationBench");
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when business-workflow metric validity lacks AutomationBench-style coverage", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const workflowEvidenceIds = [
      "workflow-domain-task-coverage",
      "workflow-simple-baseline",
      "workflow-public-private-split",
      "workflow-toolset-config",
      "workflow-programmatic-assertions",
      "workflow-partial-credit",
      "workflow-strict-pass-rate",
      "workflow-export-comparison"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...workflowEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `x${index}`.repeat(64).slice(0, 64),
        writerSig: `workflow-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `workflow-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "business-workflow-agent",
        runId: "run-business-workflow-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        businessWorkflowChecks: workflowEvidenceIds.map((evidenceId, index) => ({
          workflowSignalId: evidenceId.replace("workflow-", ""),
          covered: index < 4,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/zapier/AutomationBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      businessWorkflowCoverage: 0.5,
      businessWorkflowSampleSize: 8
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("business workflow coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      businessWorkflowCoverage: 0.5,
      businessWorkflowSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...workflowEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("fails closed when data-agent analytical benchmark validity lacks FDABench-style coverage", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const dataAgentEvidenceIds = [
      "data-agent-task-type-coverage",
      "data-agent-database-source-modality",
      "data-agent-difficulty-distribution",
      "data-agent-metric-computation",
      "data-agent-agent-workflow-roster",
      "data-agent-expert-validation",
      "data-agent-cost-latency-trace",
      "data-agent-submission-schema"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...dataAgentEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index}`.repeat(64).slice(0, 64),
        writerSig: `data-agent-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `data-agent-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "data-agent-analyst",
        runId: "run-data-agent-analytical-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        dataAgentAnalyticalChecks: dataAgentEvidenceIds.map((evidenceId, index) => ({
          dataAgentSignalId: evidenceId.replace("data-agent-", ""),
          covered: index < 4,
          evidenceRefs: [evidenceId]
        })),
        sourceRefs: ["https://github.com/fdabench/FDAbench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      dataAgentAnalyticalCoverage: 0.5,
      dataAgentAnalyticalSampleSize: 8
    });
    expect(report.rows[0]?.constructValidity).toBeGreaterThan(0.95);
    expect(report.rows[0]?.warnings.join(" ")).toContain("data-agent analytical coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      dataAgentAnalyticalCoverage: 0.5,
      dataAgentAnalyticalSampleSize: 8
    });
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...dataAgentEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/fdabench/FDAbench");
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes when embodied-agent metric validity binds simulator, baselines, trajectories, and metric reports", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const embodiedEvidenceIds = [
      "embodied-task-type-coverage",
      "embodied-simulator-environment-config",
      "embodied-scene-dataset-package",
      "embodied-random-baseline",
      "embodied-human-baseline",
      "embodied-model-baseline",
      "embodied-action-observation-trajectory",
      "embodied-result-folder",
      "embodied-overall-metric-report",
      "embodied-task-type-metric-report",
      "embodied-metric-owner",
      "embodied-sample-size-confidence"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...embodiedEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index}`.repeat(64).slice(0, 64),
        writerSig: `embodied-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `embodied-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];
    const signals = [
      "task_type_coverage",
      "simulator_environment_config",
      "scene_dataset_package",
      "random_baseline",
      "human_baseline",
      "model_baseline",
      "action_observation_trajectory",
      "result_folder",
      "overall_metric_report",
      "task_type_metric_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;

    const report = buildMetricValidationReport(
      {
        agentId: "embodied-agent",
        runId: "run-embodied-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        embodiedAgentChecks: embodiedEvidenceIds.map((evidenceId, index) => ({
          embodiedSignalId: evidenceId.replace("embodied-", ""),
          embodiedSignalType: signals[index]!,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: `${index}`.repeat(64).slice(0, 64),
          taskTypes: ["navigation", "object_interaction", "instruction_following"],
          baselineIds: ["random", "human", "gpt-4o"],
          metricNames: ["success_rate", "task_type_score"],
          owner: "Embodied eval owner",
          sampleSize: 18,
          confidenceInterval: {
            level: 0.95,
            lower: 72,
            upper: 82,
            marginOfError: 5
          }
        })),
        sourceRefs: ["https://github.com/thunlp/EmbodiedEval"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      embodiedAgentCoverage: 1,
      embodiedAgentSampleSize: 12,
      embodiedAgentTaskTypes: ["navigation", "object_interaction", "instruction_following"],
      embodiedAgentBaselineIds: ["random", "human", "gpt-4o"]
    });
    expect(report.evalPack.rows[0]).toMatchObject({
      embodiedAgentCoverage: 1,
      embodiedAgentSampleSize: 12,
      embodiedAgentTaskTypes: ["navigation", "object_interaction", "instruction_following"],
      embodiedAgentBaselineIds: ["random", "human", "gpt-4o"]
    });
    expect(report.evalPack.rows[0]?.embodiedAgentReportArtifactHashes.length).toBe(2);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...embodiedEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/thunlp/EmbodiedEval");
    expect(report.evalPack.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when embodied-agent metric validity lacks simulator, baseline, and report proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const embodiedEvidenceIds = [
      "embodied-task-type-coverage",
      "embodied-simulator-environment-config",
      "embodied-scene-dataset-package",
      "embodied-random-baseline",
      "embodied-human-baseline",
      "embodied-model-baseline",
      "embodied-action-observation-trajectory",
      "embodied-result-folder",
      "embodied-overall-metric-report",
      "embodied-task-type-metric-report",
      "embodied-metric-owner",
      "embodied-sample-size-confidence"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...embodiedEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `m${index}`.repeat(64).slice(0, 64),
        writerSig: `embodied-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `embodied-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];
    const signals = [
      "task_type_coverage",
      "simulator_environment_config",
      "scene_dataset_package",
      "random_baseline",
      "human_baseline",
      "model_baseline",
      "action_observation_trajectory",
      "result_folder",
      "overall_metric_report",
      "task_type_metric_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;

    const report = buildMetricValidationReport(
      {
        agentId: "embodied-agent",
        runId: "run-embodied-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        embodiedAgentChecks: embodiedEvidenceIds.map((evidenceId, index) => ({
          embodiedSignalId: evidenceId.replace("embodied-", ""),
          embodiedSignalType: signals[index]!,
          covered: index < 5,
          evidenceRefs: [evidenceId],
          artifactHash: index < 5 ? `${index}`.repeat(64).slice(0, 64) : undefined,
          taskTypes: index === 0 ? ["navigation"] : [],
          baselineIds: index < 5 ? ["random", "human"] : [],
          metricNames: [],
          owner: "",
          sampleSize: 3,
          confidenceInterval: {
            level: 0.95,
            lower: 60,
            upper: 95,
            marginOfError: 17.5
          }
        })),
        sourceRefs: ["https://github.com/thunlp/EmbodiedEval"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      embodiedAgentSampleSize: 12
    });
    expect(report.rows[0]?.embodiedAgentCoverage).toBeCloseTo(5 / 12, 6);
    expect(report.rows[0]?.embodiedAgentMissingSignals).toEqual([
      "model_baseline",
      "action_observation_trajectory",
      "result_folder",
      "overall_metric_report",
      "task_type_metric_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).toContain("embodied-agent coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      embodiedAgentSampleSize: 12
    });
    expect(report.evalPack.rows[0]?.embodiedAgentCoverage).toBeCloseTo(5 / 12, 6);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates Tribunal-style evaluator suites with assertions, judges, reporters, datasets, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const evaluatorEvidenceIds = [
      "tribunal-deterministic-assertion",
      "tribunal-llm-judge-criterion",
      "tribunal-safety-assertion",
      "tribunal-red-team-attack",
      "tribunal-dataset-eval-manifest",
      "tribunal-custom-judge-definition",
      "tribunal-reporter-output",
      "tribunal-framework-integration",
      "tribunal-threshold-config",
      "tribunal-metric-owner",
      "tribunal-sample-size-confidence"
    ];
    const signals = [
      "deterministic_assertion",
      "llm_judge_criterion",
      "safety_assertion",
      "red_team_attack",
      "dataset_eval_manifest",
      "custom_judge_definition",
      "reporter_output",
      "framework_integration",
      "threshold_config",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...evaluatorEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index}`.repeat(64).slice(0, 64),
        writerSig: `tribunal-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `tribunal-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ruby-rag-agent",
        runId: "run-tribunal-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        evaluatorSuiteChecks: evaluatorEvidenceIds.map((evidenceId, index) => ({
          evaluatorSignalId: evidenceId.replace("tribunal-", ""),
          evaluatorSignalType: signals[index]!,
          covered: true,
          evidenceRefs: [evidenceId],
          artifactHash: `${index}`.repeat(64).slice(0, 64),
          assertionTypes: ["contains", "regex", "json", "faithful", "hallucination", "refusal"],
          reporterFormats: ["json", "html", "junit", "github_actions"],
          judgeNames: ["faithfulness", "hallucination", "brand_voice"],
          owner: "Tribunal metric owner",
          sampleSize: 18,
          confidenceInterval: {
            level: 0.95,
            lower: 76,
            upper: 86,
            marginOfError: 5
          }
        })),
        sourceRefs: ["https://github.com/Alqemist-labs/ruby_llm-tribunal"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      evaluatorSuiteCoverage: 1,
      evaluatorSuiteSampleSize: 11,
      evaluatorSuiteMissingSignals: [],
      evaluatorSuiteReporterFormats: ["json", "html", "junit", "github_actions"],
      evaluatorSuiteJudgeNames: ["faithfulness", "hallucination", "brand_voice"]
    });
    expect(report.rows[0]?.evaluatorSuiteAssertionTypes).toContain("faithful");
    expect(report.evalPack.rows[0]).toMatchObject({
      evaluatorSuiteCoverage: 1,
      evaluatorSuiteSampleSize: 11,
      evaluatorSuiteReporterFormats: ["json", "html", "junit", "github_actions"],
      evaluatorSuiteJudgeNames: ["faithfulness", "hallucination", "brand_voice"]
    });
    expect(report.evalPack.rows[0]?.evaluatorSuiteReportArtifactHashes).toEqual(["6".repeat(64)]);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...evaluatorEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/Alqemist-labs/ruby_llm-tribunal");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Tribunal-style evaluator suites lack judges, reporters, dataset, owner, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const evaluatorEvidenceIds = [
      "tribunal-deterministic-assertion",
      "tribunal-llm-judge-criterion",
      "tribunal-safety-assertion",
      "tribunal-red-team-attack",
      "tribunal-dataset-eval-manifest",
      "tribunal-custom-judge-definition",
      "tribunal-reporter-output",
      "tribunal-framework-integration",
      "tribunal-threshold-config",
      "tribunal-metric-owner",
      "tribunal-sample-size-confidence"
    ];
    const signals = [
      "deterministic_assertion",
      "llm_judge_criterion",
      "safety_assertion",
      "red_team_attack",
      "dataset_eval_manifest",
      "custom_judge_definition",
      "reporter_output",
      "framework_integration",
      "threshold_config",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...evaluatorEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index}`.repeat(64).slice(0, 64),
        writerSig: `tribunal-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `tribunal-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ruby-rag-agent",
        runId: "run-tribunal-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        evaluatorSuiteChecks: evaluatorEvidenceIds.map((evidenceId, index) => ({
          evaluatorSignalId: evidenceId.replace("tribunal-", ""),
          evaluatorSignalType: signals[index]!,
          covered: index < 3,
          evidenceRefs: [evidenceId],
          artifactHash: index < 3 ? `${index}`.repeat(64).slice(0, 64) : undefined,
          assertionTypes: index === 0 ? ["contains", "regex"] : [],
          reporterFormats: [],
          judgeNames: [],
          owner: "",
          sampleSize: 3,
          confidenceInterval: {
            level: 0.95,
            lower: 62,
            upper: 94,
            marginOfError: 16
          }
        })),
        sourceRefs: ["https://github.com/Alqemist-labs/ruby_llm-tribunal"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      evaluatorSuiteSampleSize: 11
    });
    expect(report.rows[0]?.evaluatorSuiteCoverage).toBeCloseTo(2 / 11, 6);
    expect(report.rows[0]?.evaluatorSuiteMissingSignals).toEqual([
      "llm_judge_criterion",
      "red_team_attack",
      "dataset_eval_manifest",
      "custom_judge_definition",
      "reporter_output",
      "framework_integration",
      "threshold_config",
      "metric_owner",
      "sample_size_confidence_interval"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).toContain("evaluator-suite coverage");
    expect(report.evalPack.rows[0]?.evaluatorSuiteCoverage).toBeCloseTo(2 / 11, 6);
    expect(report.evalPack.rows[0]?.evaluatorSuiteMissingSignals).toContain("reporter_output");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates Apex-style pentest and threat-model metric validity with ground truth, coverage, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "source_repository_license",
      "benchmark_release_manifest",
      "task_id_manifest",
      "target_image_manifest",
      "runtime_controller_manifest",
      "firewall_isolation_config",
      "llm_proxy_config",
      "smart_contract_dataset_manifest",
      "historical_fork_manifest",
      "problem_metadata_manifest",
      "flaw_verifier_contract_manifest",
      "forge_grader_result",
      "profit_threshold_metric",
      "anti_cheat_reset_proof",
      "dataset_cutoff_split",
      "dockerized_app_manifest",
      "language_stack_coverage",
      "vulnerability_class_coverage",
      "difficulty_distribution",
      "multi_step_chain_coverage",
      "flag_ground_truth",
      "threat_model_ground_truth",
      "false_positive_trap",
      "security_control_effectiveness",
      "exploit_execution_trace",
      "exploit_success_metric",
      "threat_model_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `apex-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `apex-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `apex-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "security-agent",
        runId: "run-apex-pentest-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("apex-", ""),
          pentestSignalType: signal,
          covered: true,
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: [
            "source_repository_license",
            "benchmark_release_manifest",
            "task_id_manifest",
            "target_image_manifest",
            "runtime_controller_manifest",
            "firewall_isolation_config",
            "llm_proxy_config",
            "smart_contract_dataset_manifest",
            "historical_fork_manifest",
            "problem_metadata_manifest",
            "flaw_verifier_contract_manifest",
            "forge_grader_result",
            "profit_threshold_metric",
            "anti_cheat_reset_proof",
            "dataset_cutoff_split",
            "dockerized_app_manifest",
            "multi_step_chain_coverage",
            "flag_ground_truth",
            "threat_model_ground_truth",
            "false_positive_trap",
            "security_control_effectiveness",
            "exploit_execution_trace",
            "exploit_success_metric",
            "threat_model_report"
          ].includes(signal)
            ? index.toString(16).repeat(64).slice(0, 64)
            : undefined,
          languageStacks: signal === "language_stack_coverage" ? ["node", "python", "go", "java", "php", "ruby"] : undefined,
          vulnerabilityClasses: signal === "vulnerability_class_coverage"
            ? ["injection", "authorization", "ssrf", "race_condition", "supply_chain"]
            : undefined,
          difficultyLevels: signal === "difficulty_distribution" ? ["easy", "medium", "hard"] : undefined,
          benchmarkSuiteIds: [
            "source_repository_license",
            "benchmark_release_manifest",
            "task_id_manifest",
            "target_image_manifest",
            "runtime_controller_manifest",
            "firewall_isolation_config",
            "llm_proxy_config",
            "smart_contract_dataset_manifest",
            "historical_fork_manifest",
            "problem_metadata_manifest",
            "flaw_verifier_contract_manifest",
            "forge_grader_result",
            "anti_cheat_reset_proof",
            "dataset_cutoff_split",
            "dockerized_app_manifest",
            "multi_step_chain_coverage",
            "threat_model_ground_truth",
            "threat_model_report"
          ].includes(signal)
            ? ["pentest-suite", "threat-model-suite"]
            : undefined,
          metricNames: signal === "false_positive_trap" ||
            signal === "security_control_effectiveness" ||
            signal === "exploit_success_metric" ||
            signal === "profit_threshold_metric"
            ? ["false_positive_rate", "control_effectiveness", "exploit_success_rate", "native_profit_threshold"]
            : undefined,
          owner: signal === "metric_owner" ? "AMC Security Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 70 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 84,
                upper: 92,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/pensarai/argus-validation-benchmarks"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      pentestBenchmarkCoverage: 1,
      pentestBenchmarkSampleSize: 29,
      pentestBenchmarkMissingSignals: [],
      pentestBenchmarkLanguageStacks: ["node", "python", "go", "java", "php", "ruby"],
      pentestBenchmarkDifficultyLevels: ["easy", "medium", "hard"],
      pentestBenchmarkSuiteIds: ["pentest-suite", "threat-model-suite"],
      pentestBenchmarkMetricNames: ["false_positive_rate", "control_effectiveness", "exploit_success_rate", "native_profit_threshold"]
    });
    expect(report.rows[0]?.pentestBenchmarkVulnerabilityClasses).toContain("ssrf");
    expect(report.evalPack.rows[0]).toMatchObject({
      pentestBenchmarkCoverage: 1,
      pentestBenchmarkSampleSize: 29,
      pentestBenchmarkMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("c".repeat(64));
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("18".repeat(32));
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("19".repeat(32));
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("1a".repeat(32));
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...pentestEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/pensarai/argus-validation-benchmarks");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Apex-style pentest validity lacks ground truth, false-positive, and execution proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "dockerized_app_manifest",
      "language_stack_coverage",
      "vulnerability_class_coverage",
      "difficulty_distribution",
      "multi_step_chain_coverage",
      "flag_ground_truth",
      "threat_model_ground_truth",
      "false_positive_trap",
      "security_control_effectiveness",
      "exploit_execution_trace",
      "threat_model_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `apex-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `apex-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `apex-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "security-agent",
        runId: "run-apex-pentest-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("apex-missing-", ""),
          pentestSignalType: signal,
          covered: [
            "dockerized_app_manifest",
            "language_stack_coverage",
            "vulnerability_class_coverage",
            "difficulty_distribution",
            "false_positive_trap",
            "exploit_execution_trace",
            "threat_model_report",
            "metric_owner",
            "sample_size_confidence_interval"
          ].includes(signal),
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: signal === "exploit_execution_trace" || signal === "false_positive_trap"
            ? index.toString(16).repeat(64).slice(0, 64)
            : "not-a-sha",
          languageStacks: [],
          vulnerabilityClasses: signal === "vulnerability_class_coverage" ? ["injection"] : undefined,
          difficultyLevels: signal === "difficulty_distribution" ? ["easy"] : undefined,
          benchmarkSuiteIds: signal === "threat_model_report" ? ["threat-model-suite"] : undefined,
          metricNames: [],
          owner: "",
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 55,
                upper: 95,
                marginOfError: 20
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/pensarai/argus-validation-benchmarks"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      pentestBenchmarkSampleSize: 13
    });
    expect(report.rows[0]?.pentestBenchmarkCoverage).toBeCloseTo(3 / 29, 6);
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toEqual([
      "source_repository_license",
      "benchmark_release_manifest",
      "task_id_manifest",
      "target_image_manifest",
      "runtime_controller_manifest",
      "firewall_isolation_config",
      "llm_proxy_config",
      "smart_contract_dataset_manifest",
      "historical_fork_manifest",
      "problem_metadata_manifest",
      "flaw_verifier_contract_manifest",
      "forge_grader_result",
      "profit_threshold_metric",
      "anti_cheat_reset_proof",
      "dataset_cutoff_split",
      "dockerized_app_manifest",
      "language_stack_coverage",
      "multi_step_chain_coverage",
      "flag_ground_truth",
      "threat_model_ground_truth",
      "false_positive_trap",
      "security_control_effectiveness",
      "exploit_success_metric",
      "threat_model_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).toContain("pentest benchmark coverage");
    expect(report.rows[0]?.warnings.join(" ")).toContain("missing source_repository_license");
    expect(report.evalPack.rows[0]?.pentestBenchmarkCoverage).toBeCloseTo(3 / 29, 6);
    expect(report.evalPack.rows[0]?.pentestBenchmarkMissingSignals).toContain("threat_model_ground_truth");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("treats Awesome AI Pentest curated indexes as discovery metadata, not pentest proof", () => {
    const questionScores = [score("AMC-1.1", 4), score("AMC-1.2", 4)];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      {
        evidenceId: "awesome-ai-pentest-readme-snapshot",
        eventHash: "d".repeat(64),
        writerSig: "source-index-writer-sig",
        eventType: "metric" as const,
        sessionId: "source-index-session",
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      }
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "security-agent",
        runId: "run-awesome-ai-pentest-curated-index",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: [
          {
            pentestSignalId: "awesome-ai-pentest-readme-snapshot",
            pentestSignalType: "source_repository_license",
            covered: true,
            evidenceRefs: ["awesome-ai-pentest-readme-snapshot"],
            artifactHash: "d".repeat(64),
            benchmarkSuiteIds: ["insidetrust/awesome-ai-pentest"]
          }
        ],
        sourceRefs: ["https://github.com/insidetrust/awesome-ai-pentest"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      pentestBenchmarkSampleSize: 1
    });
    expect(report.rows[0]?.pentestBenchmarkCoverage).toBeCloseTo(1 / 29, 6);
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("benchmark_release_manifest");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("exploit_execution_trace");
    expect(report.rows[0]?.warnings.join(" ")).toContain("pentest benchmark coverage");
    expect(report.evalPack.sourceRefs).toContain("https://github.com/insidetrust/awesome-ai-pentest");
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates ExploitGym-style exploit-development metric validity with release, task, isolation, proxy, and success proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "source_repository_license",
      "benchmark_release_manifest",
      "task_id_manifest",
      "target_image_manifest",
      "runtime_controller_manifest",
      "firewall_isolation_config",
      "llm_proxy_config",
      "smart_contract_dataset_manifest",
      "historical_fork_manifest",
      "problem_metadata_manifest",
      "flaw_verifier_contract_manifest",
      "forge_grader_result",
      "profit_threshold_metric",
      "anti_cheat_reset_proof",
      "dataset_cutoff_split",
      "dockerized_app_manifest",
      "language_stack_coverage",
      "vulnerability_class_coverage",
      "difficulty_distribution",
      "multi_step_chain_coverage",
      "flag_ground_truth",
      "threat_model_ground_truth",
      "false_positive_trap",
      "security_control_effectiveness",
      "exploit_execution_trace",
      "exploit_success_metric",
      "threat_model_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `exploitgym-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `exploitgym-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `exploitgym-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "security-agent",
        runId: "run-exploitgym-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("exploitgym-", ""),
          pentestSignalType: signal,
          covered: true,
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          languageStacks: signal === "language_stack_coverage" ? ["c", "javascript", "python", "dockerfile", "shell"] : undefined,
          vulnerabilityClasses: signal === "vulnerability_class_coverage"
            ? ["userspace", "v8", "linux_kernel", "memory_corruption", "sandbox_escape"]
            : undefined,
          difficultyLevels: signal === "difficulty_distribution" ? ["sample", "v1"] : undefined,
          benchmarkSuiteIds: [
            "source_repository_license",
            "benchmark_release_manifest",
            "task_id_manifest",
            "target_image_manifest",
            "runtime_controller_manifest",
            "firewall_isolation_config",
            "llm_proxy_config",
            "smart_contract_dataset_manifest",
            "historical_fork_manifest",
            "problem_metadata_manifest",
            "flaw_verifier_contract_manifest",
            "forge_grader_result",
            "profit_threshold_metric",
            "anti_cheat_reset_proof",
            "dataset_cutoff_split",
            "dockerized_app_manifest",
            "multi_step_chain_coverage",
            "threat_model_ground_truth",
            "threat_model_report"
          ].includes(signal)
            ? ["exploitgym-v1", "sample-task-list"]
            : undefined,
          metricNames: signal === "false_positive_trap" ||
            signal === "security_control_effectiveness" ||
            signal === "exploit_success_metric" ||
            signal === "profit_threshold_metric"
            ? ["exploit_success_rate", "flag_submission_rate", "blocked_egress_rate", "native_profit_threshold"]
            : undefined,
          owner: signal === "metric_owner" ? "AMC Security Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 32 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 62,
                upper: 76,
                marginOfError: 7
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/sunblaze-ucb/exploitgym"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      pentestBenchmarkCoverage: 1,
      pentestBenchmarkSampleSize: 29,
      pentestBenchmarkMissingSignals: [],
      pentestBenchmarkSuiteIds: ["exploitgym-v1", "sample-task-list"],
      pentestBenchmarkMetricNames: ["exploit_success_rate", "flag_submission_rate", "blocked_egress_rate", "native_profit_threshold"]
    });
    expect(report.rows[0]?.pentestBenchmarkVulnerabilityClasses).toContain("linux_kernel");
    expect(report.evalPack.rows[0]).toMatchObject({
      pentestBenchmarkCoverage: 1,
      pentestBenchmarkSampleSize: 29,
      pentestBenchmarkMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("c".repeat(64));
    expect(report.evalPack.rows[0]?.pentestBenchmarkReportArtifactHashes).toContain("18".repeat(32));
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...pentestEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/sunblaze-ucb/exploitgym");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when ExploitGym-style exploit-development proof lacks release, isolation, and success metrics", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "source_repository_license",
      "benchmark_release_manifest",
      "task_id_manifest",
      "target_image_manifest",
      "runtime_controller_manifest",
      "firewall_isolation_config",
      "llm_proxy_config",
      "exploit_success_metric",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `exploitgym-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `exploitgym-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `exploitgym-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "security-agent",
        runId: "run-exploitgym-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("exploitgym-missing-", ""),
          pentestSignalType: signal,
          covered: signal === "source_repository_license" || signal === "metric_owner" || signal === "sample_size_confidence_interval",
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: signal === "source_repository_license" ? index.toString(16).repeat(64).slice(0, 64) : "not-a-sha",
          benchmarkSuiteIds: [],
          metricNames: [],
          owner: signal === "metric_owner" ? "AMC Security Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 95,
                marginOfError: 27.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/sunblaze-ucb/exploitgym"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("benchmark_release_manifest");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("firewall_isolation_config");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("llm_proxy_config");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("exploit_success_metric");
    expect(report.rows[0]?.warnings.join(" ")).toContain("pentest benchmark coverage");
    expect(report.evalPack.rows[0]?.pentestBenchmarkMissingSignals).toContain("target_image_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
  });

  test("validates SconeBench-style smart-contract exploit metric validity with fork, verifier, grader, and profit proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "source_repository_license",
      "benchmark_release_manifest",
      "task_id_manifest",
      "target_image_manifest",
      "runtime_controller_manifest",
      "firewall_isolation_config",
      "llm_proxy_config",
      "smart_contract_dataset_manifest",
      "historical_fork_manifest",
      "problem_metadata_manifest",
      "flaw_verifier_contract_manifest",
      "forge_grader_result",
      "profit_threshold_metric",
      "anti_cheat_reset_proof",
      "dataset_cutoff_split",
      "dockerized_app_manifest",
      "language_stack_coverage",
      "vulnerability_class_coverage",
      "difficulty_distribution",
      "multi_step_chain_coverage",
      "flag_ground_truth",
      "threat_model_ground_truth",
      "false_positive_trap",
      "security_control_effectiveness",
      "exploit_execution_trace",
      "exploit_success_metric",
      "threat_model_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `scone-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `scone-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `scone-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "smart-contract-security-agent",
        runId: "run-scone-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("scone-", ""),
          pentestSignalType: signal,
          covered: true,
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          languageStacks: signal === "language_stack_coverage" ? ["python", "dockerfile", "shell", "solidity"] : undefined,
          vulnerabilityClasses: signal === "vulnerability_class_coverage"
            ? ["reentrancy", "price_oracle_manipulation", "access_control", "arithmetic_error"]
            : undefined,
          difficultyLevels: signal === "difficulty_distribution" || signal === "dataset_cutoff_split"
            ? ["smoke", "full", "post_cutoff"]
            : undefined,
          benchmarkSuiteIds: [
            "source_repository_license",
            "benchmark_release_manifest",
            "task_id_manifest",
            "target_image_manifest",
            "runtime_controller_manifest",
            "firewall_isolation_config",
            "llm_proxy_config",
            "smart_contract_dataset_manifest",
            "historical_fork_manifest",
            "problem_metadata_manifest",
            "flaw_verifier_contract_manifest",
            "forge_grader_result",
            "anti_cheat_reset_proof",
            "dataset_cutoff_split",
            "dockerized_app_manifest",
            "multi_step_chain_coverage",
            "threat_model_ground_truth",
            "threat_model_report"
          ].includes(signal)
            ? ["scone-bench-417", "post-cutoff-12", "smoke-local"]
            : undefined,
          metricNames: signal === "profit_threshold_metric" ||
            signal === "exploit_success_metric" ||
            signal === "false_positive_trap" ||
            signal === "security_control_effectiveness"
            ? ["native_profit_threshold", "forge_grade_pass_rate", "exploit_success_rate", "false_positive_rate", "control_effectiveness"]
            : undefined,
          owner: signal === "metric_owner" ? "AMC Smart Contract Security Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 55,
                upper: 71,
                marginOfError: 8
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/anthropics/scone-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      pentestBenchmarkCoverage: 1,
      pentestBenchmarkMissingSignals: [],
      pentestBenchmarkSuiteIds: ["scone-bench-417", "post-cutoff-12", "smoke-local"]
    });
    expect(report.rows[0]?.pentestBenchmarkVulnerabilityClasses).toContain("price_oracle_manipulation");
    expect(report.evalPack.rows[0]?.pentestBenchmarkMissingSignals).toEqual([]);
    expect(report.evalPack.rows[0]?.pentestBenchmarkMetricNames).toEqual([
      "native_profit_threshold",
      "forge_grade_pass_rate",
      "exploit_success_rate",
      "false_positive_rate",
      "control_effectiveness"
    ]);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...pentestEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/anthropics/scone-bench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when SconeBench-style smart-contract exploit proof lacks fork, verifier, and grader evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const pentestSignals: MetricValidationPentestBenchmarkSignal[] = [
      "source_repository_license",
      "smart_contract_dataset_manifest",
      "historical_fork_manifest",
      "problem_metadata_manifest",
      "flaw_verifier_contract_manifest",
      "forge_grader_result",
      "profit_threshold_metric",
      "anti_cheat_reset_proof",
      "dataset_cutoff_split",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const pentestEvidenceIds = pentestSignals.map((signal) => `scone-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...pentestEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `scone-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `scone-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];
    const report = buildMetricValidationReport(
      {
        agentId: "smart-contract-security-agent",
        runId: "run-scone-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePentestBenchmarkProof: true,
        pentestBenchmarkChecks: pentestSignals.map((signal, index) => ({
          pentestSignalId: pentestEvidenceIds[index]!.replace("scone-missing-", ""),
          pentestSignalType: signal,
          covered: signal === "source_repository_license" || signal === "metric_owner",
          evidenceRefs: [pentestEvidenceIds[index]!],
          artifactHash: signal === "source_repository_license" ? index.toString(16).repeat(64).slice(0, 64) : "not-a-sha",
          benchmarkSuiteIds: [],
          metricNames: [],
          owner: signal === "metric_owner" ? "AMC Smart Contract Security Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 96,
                marginOfError: 28
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/anthropics/scone-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("historical_fork_manifest");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("flaw_verifier_contract_manifest");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("forge_grader_result");
    expect(report.rows[0]?.pentestBenchmarkMissingSignals).toContain("profit_threshold_metric");
    expect(report.rows[0]?.warnings.join(" ")).toContain("pentest benchmark coverage");
    expect(report.evalPack.rows[0]?.pentestBenchmarkMissingSignals).toContain("anti_cheat_reset_proof");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
  });

  test("validates Bedrock-style trace evaluation with cases, permutations, mocks, metrics, and monitor proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const traceSignals: MetricValidationTraceEvaluationSignal[] = [
      "bedrock_converse_model_config",
      "agent_parameter_manifest",
      "tool_registry_manifest",
      "trace_manifest",
      "repeatable_case_manifest",
      "dynamic_expectation_validator",
      "bulk_case_run_manifest",
      "run_permutation_manifest",
      "mock_llm_backend_control",
      "metric_definition_manifest",
      "measurement_export_manifest",
      "production_monitor_binding",
      "threshold_alarm_config",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const traceEvidenceIds = traceSignals.map((signal) => `trace-eval-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...traceEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `trace-eval-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `trace-eval-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "bedrock-agent",
        runId: "run-trace-eval-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireTraceEvaluationProof: true,
        traceEvaluationChecks: traceSignals.map((signal, index) => ({
          traceEvaluationSignalId: traceEvidenceIds[index]!.replace("trace-eval-", ""),
          traceEvaluationSignalType: signal,
          covered: true,
          evidenceRefs: [traceEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          modelIds: signal === "bedrock_converse_model_config" ? ["synthetic-bedrock-model-a", "synthetic-bedrock-model-b"] : undefined,
          agentParameterKeys: signal === "agent_parameter_manifest" || signal === "run_permutation_manifest"
            ? ["system_prompt", "temperature", "model_id"]
            : undefined,
          toolNames: signal === "tool_registry_manifest" ? ["lookup_policy", "summarize_case"] : undefined,
          metricNames: [
            "metric_definition_manifest",
            "measurement_export_manifest",
            "production_monitor_binding",
            "threshold_alarm_config"
          ].includes(signal)
            ? ["latency", "cost", "similarity", "validation_failed"]
            : undefined,
          caseSuiteIds: signal === "repeatable_case_manifest" || signal === "bulk_case_run_manifest"
            ? ["agent-quality-smoke-suite"]
            : undefined,
          backendModes: signal === "mock_llm_backend_control"
            ? ["mock"]
            : signal === "production_monitor_binding"
              ? ["production-monitor"]
              : undefined,
          runPermutationCount: signal === "run_permutation_manifest" ? 4 : undefined,
          owner: signal === "metric_owner" ? "AMC Agent Quality Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 90 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 83,
                upper: 91,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/awslabs/generative-ai-toolkit"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      traceEvaluationCoverage: 1,
      traceEvaluationSampleSize: 15,
      traceEvaluationMissingSignals: [],
      traceEvaluationRunPermutationCount: 4,
      traceEvaluationCaseSuiteIds: ["agent-quality-smoke-suite"],
      traceEvaluationBackendModes: ["mock", "production-monitor"]
    });
    expect(report.rows[0]?.traceEvaluationModelIds).toEqual(["synthetic-bedrock-model-a", "synthetic-bedrock-model-b"]);
    expect(report.rows[0]?.traceEvaluationAgentParameterKeys).toEqual(["system_prompt", "temperature", "model_id"]);
    expect(report.rows[0]?.traceEvaluationToolNames).toEqual(["lookup_policy", "summarize_case"]);
    expect(report.rows[0]?.traceEvaluationMetricNames).toEqual(["latency", "cost", "similarity", "validation_failed"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      traceEvaluationCoverage: 1,
      traceEvaluationSampleSize: 15,
      traceEvaluationMissingSignals: [],
      traceEvaluationRunPermutationCount: 4
    });
    expect(report.evalPack.rows[0]?.traceEvaluationReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...traceEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/awslabs/generative-ai-toolkit");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Bedrock-style trace evaluation lacks cases, mocks, metrics, monitor, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const traceSignals: MetricValidationTraceEvaluationSignal[] = [
      "bedrock_converse_model_config",
      "agent_parameter_manifest",
      "tool_registry_manifest",
      "trace_manifest",
      "metric_owner"
    ];
    const traceEvidenceIds = traceSignals.map((signal) => `trace-eval-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...traceEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `trace-eval-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `trace-eval-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "bedrock-agent",
        runId: "run-trace-eval-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireTraceEvaluationProof: true,
        traceEvaluationChecks: traceSignals.map((signal, index) => ({
          traceEvaluationSignalId: traceEvidenceIds[index]!.replace("trace-eval-missing-", ""),
          traceEvaluationSignalType: signal,
          covered: true,
          evidenceRefs: [traceEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          modelIds: signal === "bedrock_converse_model_config" ? ["synthetic-bedrock-model-a"] : undefined,
          agentParameterKeys: signal === "agent_parameter_manifest" ? ["system_prompt"] : undefined,
          toolNames: signal === "tool_registry_manifest" ? ["lookup_policy"] : undefined,
          owner: signal === "metric_owner" ? "AMC Agent Quality Eval" : undefined
        })),
        sourceRefs: ["https://github.com/awslabs/generative-ai-toolkit"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      traceEvaluationSampleSize: 5
    });
    expect(report.rows[0]?.traceEvaluationCoverage).toBeCloseTo(5 / 15, 6);
    expect(report.rows[0]?.traceEvaluationMissingSignals).toEqual([
      "repeatable_case_manifest",
      "dynamic_expectation_validator",
      "bulk_case_run_manifest",
      "run_permutation_manifest",
      "mock_llm_backend_control",
      "metric_definition_manifest",
      "measurement_export_manifest",
      "production_monitor_binding",
      "threshold_alarm_config",
      "sample_size_confidence_interval"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).toContain("trace evaluation coverage");
    expect(report.rows[0]?.warnings.join(" ")).toContain("missing repeatable_case_manifest");
    expect(report.evalPack.rows[0]?.traceEvaluationCoverage).toBeCloseTo(5 / 15, 6);
    expect(report.evalPack.rows[0]?.traceEvaluationMissingSignals).toContain("mock_llm_backend_control");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates Terrarium-style living-environment metric validity with mutable worlds, checkers, trials, and pass@k proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const livingSignals: MetricValidationLivingEnvironmentSignal[] = [
      "task_program_manifest",
      "living_environment_manifest",
      "environment_mutation_trace",
      "capability_manifest",
      "sandbox_provider_config",
      "agent_adapter_manifest",
      "multi_turn_trajectory",
      "stage_checker_manifest",
      "checker_result_artifact",
      "trial_result_artifact",
      "aggregate_metric_report",
      "pass_at_k_metric",
      "proactive_trigger_trace",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const livingEvidenceIds = livingSignals.map((signal) => `terrarium-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...livingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `terrarium-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `terrarium-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "stateful-workflow-agent",
        runId: "run-terrarium-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLivingEnvironmentProof: true,
        livingEnvironmentChecks: livingSignals.map((signal, index) => ({
          livingEnvironmentSignalId: livingEvidenceIds[index]!.replace("terrarium-", ""),
          livingEnvironmentSignalType: signal,
          covered: true,
          evidenceRefs: [livingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          capabilityNames: signal === "capability_manifest"
            ? ["email", "calendar", "postgres", "notion", "workspace"]
            : undefined,
          sandboxProviders: signal === "sandbox_provider_config" ? ["docker", "k8s"] : undefined,
          agentAdapters: signal === "agent_adapter_manifest" ? ["claude_code", "codex", "openclaw", "mini"] : undefined,
          metricNames: signal === "aggregate_metric_report"
            ? ["mean", "max"]
            : signal === "pass_at_k_metric"
              ? ["pass@5"]
              : undefined,
          trialCount: ["trial_result_artifact", "aggregate_metric_report", "pass_at_k_metric"].includes(signal)
            ? 36
            : undefined,
          owner: signal === "metric_owner" ? "AMC Living Environment Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 36 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 78,
                upper: 86,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/evolvent-ai/Terrarium"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      livingEnvironmentCoverage: 1,
      livingEnvironmentSampleSize: 15,
      livingEnvironmentMissingSignals: [],
      livingEnvironmentTrialCount: 36,
      livingEnvironmentSandboxProviders: ["docker", "k8s"],
      livingEnvironmentAgentAdapters: ["claude_code", "codex", "openclaw", "mini"]
    });
    expect(report.rows[0]?.livingEnvironmentCapabilityNames).toEqual([
      "email",
      "calendar",
      "postgres",
      "notion",
      "workspace"
    ]);
    expect(report.rows[0]?.livingEnvironmentMetricNames).toEqual(["mean", "max", "pass@5"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      livingEnvironmentCoverage: 1,
      livingEnvironmentSampleSize: 15,
      livingEnvironmentMissingSignals: [],
      livingEnvironmentTrialCount: 36
    });
    expect(report.evalPack.rows[0]?.livingEnvironmentReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...livingEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/evolvent-ai/Terrarium");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Terrarium-style living-environment validity lacks capability, checker, metric, trial, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const livingSignals: MetricValidationLivingEnvironmentSignal[] = [
      "task_program_manifest",
      "living_environment_manifest",
      "capability_manifest",
      "trial_result_artifact",
      "metric_owner"
    ];
    const livingEvidenceIds = livingSignals.map((signal) => `terrarium-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...livingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `terrarium-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `terrarium-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "stateful-workflow-agent",
        runId: "run-terrarium-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLivingEnvironmentProof: true,
        livingEnvironmentChecks: livingSignals.map((signal, index) => ({
          livingEnvironmentSignalId: livingEvidenceIds[index]!.replace("terrarium-missing-", ""),
          livingEnvironmentSignalType: signal,
          covered: true,
          evidenceRefs: [livingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          trialCount: signal === "trial_result_artifact" ? 1 : undefined,
          owner: signal === "metric_owner" ? "AMC Living Environment Eval" : undefined
        })),
        sourceRefs: ["https://github.com/evolvent-ai/Terrarium"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      livingEnvironmentSampleSize: 5
    });
    expect(report.rows[0]?.livingEnvironmentCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.rows[0]?.livingEnvironmentMissingSignals).toContain("capability_manifest");
    expect(report.rows[0]?.livingEnvironmentMissingSignals).toContain("stage_checker_manifest");
    expect(report.rows[0]?.livingEnvironmentMissingSignals).toContain("pass_at_k_metric");
    expect(report.rows[0]?.warnings.join(" ")).toContain("living environment coverage");
    expect(report.evalPack.rows[0]?.livingEnvironmentCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.evalPack.rows[0]?.livingEnvironmentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates PersonaGym-style persona-agent metric validity with personas, environments, rubrics, traces, and PersonaScore proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const personaSignals: MetricValidationPersonaAgentSignal[] = [
      "persona_manifest",
      "static_environment_manifest",
      "benchmark_question_set",
      "persona_agent_config",
      "model_provider_config",
      "response_trace",
      "rubric_manifest",
      "personascore_metric_definition",
      "human_alignment_calibration",
      "evaluation_output_artifact",
      "benchmark_result_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const personaEvidenceIds = personaSignals.map((signal) => `personagym-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...personaEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `personagym-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `personagym-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "persona-agent",
        runId: "run-personagym-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePersonaAgentProof: true,
        personaAgentChecks: personaSignals.map((signal, index) => ({
          personaSignalId: personaEvidenceIds[index]!.replace("personagym-", ""),
          personaSignalType: signal,
          covered: true,
          evidenceRefs: [personaEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          personaIds: signal === "persona_manifest" ? ["teacher", "software-engineer", "doctor"] : undefined,
          environmentIds: signal === "static_environment_manifest" ? ["classroom", "code-review", "clinic"] : undefined,
          questionSetIds: signal === "benchmark_question_set" ? ["benchmark-v1"] : undefined,
          modelIds: signal === "model_provider_config" ? ["gpt-4.1", "claude-3.5-sonnet"] : undefined,
          providerIds: signal === "model_provider_config" ? ["openai", "anthropic"] : undefined,
          metricNames: [
            "personascore_metric_definition",
            "human_alignment_calibration",
            "evaluation_output_artifact",
            "benchmark_result_manifest"
          ].includes(signal)
            ? ["PersonaScore", "persona_adherence"]
            : undefined,
          questionCount: signal === "benchmark_question_set" ? 120 : undefined,
          owner: signal === "metric_owner" ? "AMC Persona Agent Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 120 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 72,
                upper: 82,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: [
          "https://github.com/vsamuel2003/PersonaGym",
          "https://arxiv.org/abs/2407.18416"
        ],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      personaAgentCoverage: 1,
      personaAgentSampleSize: 13,
      personaAgentMissingSignals: [],
      personaAgentQuestionCount: 120,
      personaAgentProviderIds: ["openai", "anthropic"]
    });
    expect(report.rows[0]?.personaAgentPersonaIds).toEqual(["teacher", "software-engineer", "doctor"]);
    expect(report.rows[0]?.personaAgentEnvironmentIds).toEqual(["classroom", "code-review", "clinic"]);
    expect(report.rows[0]?.personaAgentMetricNames).toEqual(["PersonaScore", "persona_adherence"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      personaAgentCoverage: 1,
      personaAgentSampleSize: 13,
      personaAgentMissingSignals: [],
      personaAgentQuestionCount: 120
    });
    expect(report.evalPack.rows[0]?.personaAgentReportArtifactHashes.length).toBe(11);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...personaEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/vsamuel2003/PersonaGym");
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2407.18416");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when PersonaGym-style persona-agent validity lacks persona, environment, scoring, result, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const personaSignals: MetricValidationPersonaAgentSignal[] = [
      "persona_manifest",
      "benchmark_question_set",
      "model_provider_config",
      "response_trace",
      "metric_owner"
    ];
    const personaEvidenceIds = personaSignals.map((signal) => `personagym-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...personaEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `personagym-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `personagym-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "persona-agent",
        runId: "run-personagym-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requirePersonaAgentProof: true,
        personaAgentChecks: personaSignals.map((signal, index) => ({
          personaSignalId: personaEvidenceIds[index]!.replace("personagym-missing-", ""),
          personaSignalType: signal,
          covered: true,
          evidenceRefs: [personaEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          questionCount: signal === "benchmark_question_set" ? 2 : undefined,
          owner: signal === "metric_owner" ? "AMC Persona Agent Eval" : undefined
        })),
        sourceRefs: ["https://github.com/vsamuel2003/PersonaGym"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      personaAgentSampleSize: 5
    });
    expect(report.rows[0]?.personaAgentCoverage).toBeCloseTo(2 / 13, 6);
    expect(report.rows[0]?.personaAgentMissingSignals).toContain("static_environment_manifest");
    expect(report.rows[0]?.personaAgentMissingSignals).toContain("personascore_metric_definition");
    expect(report.rows[0]?.personaAgentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("persona-agent coverage");
    expect(report.evalPack.rows[0]?.personaAgentCoverage).toBeCloseTo(2 / 13, 6);
    expect(report.evalPack.rows[0]?.personaAgentMissingSignals).toContain("benchmark_result_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates AutoResearchBench-style scientific literature discovery metric validity with task, dataset, tool, metric, owner, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const scientificSignals: MetricValidationScientificLiteratureSignal[] = [
      "benchmark_manifest",
      "deep_research_task_manifest",
      "wide_research_task_manifest",
      "released_dataset_manifest",
      "dataset_obfuscation_manifest",
      "literature_corpus_manifest",
      "search_backend_config",
      "deepxiv_tool_config",
      "web_search_tool_config",
      "agent_config_manifest",
      "inference_run_manifest",
      "evaluation_pipeline_config",
      "deep_search_accuracy_metric",
      "wide_search_iou_metric",
      "result_report_artifact",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const scientificEvidenceIds = scientificSignals.map((signal) => `autoresearchbench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...scientificEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `autoresearchbench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `autoresearchbench-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "scientific-literature-agent",
        runId: "run-autoresearchbench-validity",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireScientificLiteratureProof: true,
        scientificLiteratureChecks: scientificSignals.map((signal, index) => ({
          scientificLiteratureSignalId: scientificEvidenceIds[index]!.replace("autoresearchbench-", ""),
          scientificLiteratureSignalType: signal,
          covered: true,
          evidenceRefs: [scientificEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["autoresearchbench-synthetic"] : undefined,
          taskTypes: signal === "deep_research_task_manifest"
            ? ["deep_research"]
            : signal === "wide_research_task_manifest"
              ? ["wide_research"]
              : undefined,
          datasetIds: [
            "released_dataset_manifest",
            "dataset_obfuscation_manifest",
            "literature_corpus_manifest"
          ].includes(signal)
            ? ["synthetic-literature-corpus-v1"]
            : undefined,
          searchBackendIds: signal === "search_backend_config" ? ["semantic-scholar-mock", "web-search-mock"] : undefined,
          toolIds: signal === "deepxiv_tool_config"
            ? ["deepxiv-mock"]
            : signal === "web_search_tool_config"
              ? ["web-search-mock"]
              : undefined,
          metricNames: [
            "deep_search_accuracy_metric",
            "wide_search_iou_metric",
            "result_report_artifact"
          ].includes(signal)
            ? ["deep_search_accuracy", "wide_search_iou"]
            : undefined,
          taskCount: signal === "deep_research_task_manifest" || signal === "wide_research_task_manifest" ? 48 : undefined,
          owner: signal === "metric_owner" ? "AMC Scientific Literature Discovery Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 48 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 70,
                upper: 80,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/CherYou/AutoResearchBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      scientificLiteratureCoverage: 1,
      scientificLiteratureSampleSize: 17,
      scientificLiteratureMissingSignals: [],
      scientificLiteratureTaskCount: 48
    });
    expect(report.rows[0]?.scientificLiteratureBenchmarkIds).toEqual(["autoresearchbench-synthetic"]);
    expect(report.rows[0]?.scientificLiteratureTaskTypes).toEqual(["deep_research", "wide_research"]);
    expect(report.rows[0]?.scientificLiteratureMetricNames).toEqual(["deep_search_accuracy", "wide_search_iou"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      scientificLiteratureCoverage: 1,
      scientificLiteratureSampleSize: 17,
      scientificLiteratureMissingSignals: [],
      scientificLiteratureTaskCount: 48
    });
    expect(report.evalPack.rows[0]?.scientificLiteratureReportArtifactHashes.length).toBe(1);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...scientificEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/CherYou/AutoResearchBench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when AutoResearchBench-style scientific literature discovery validity lacks wide-task, dataset, tool, result, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const scientificSignals: MetricValidationScientificLiteratureSignal[] = [
      "benchmark_manifest",
      "deep_research_task_manifest",
      "search_backend_config",
      "result_report_artifact",
      "metric_owner"
    ];
    const scientificEvidenceIds = scientificSignals.map((signal) => `autoresearchbench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED" as const
      })),
      ...scientificEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `autoresearchbench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `autoresearchbench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 13),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "scientific-literature-agent",
        runId: "run-autoresearchbench-incomplete",
        ts: Date.UTC(2026, 5, 13),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireScientificLiteratureProof: true,
        scientificLiteratureChecks: scientificSignals.map((signal, index) => ({
          scientificLiteratureSignalId: scientificEvidenceIds[index]!.replace("autoresearchbench-missing-", ""),
          scientificLiteratureSignalType: signal,
          covered: true,
          evidenceRefs: [scientificEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["autoresearchbench-synthetic"] : undefined,
          taskTypes: signal === "deep_research_task_manifest" ? ["deep_research"] : undefined,
          taskCount: signal === "deep_research_task_manifest" ? 2 : undefined,
          searchBackendIds: signal === "search_backend_config" ? ["semantic-scholar-mock"] : undefined,
          owner: signal === "metric_owner" ? "AMC Scientific Literature Discovery Eval" : undefined
        })),
        sourceRefs: ["https://github.com/CherYou/AutoResearchBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      scientificLiteratureSampleSize: 5
    });
    expect(report.rows[0]?.scientificLiteratureCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.rows[0]?.scientificLiteratureMissingSignals).toContain("wide_research_task_manifest");
    expect(report.rows[0]?.scientificLiteratureMissingSignals).toContain("released_dataset_manifest");
    expect(report.rows[0]?.scientificLiteratureMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("scientific literature discovery coverage");
    expect(report.evalPack.rows[0]?.scientificLiteratureCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.evalPack.rows[0]?.scientificLiteratureMissingSignals).toContain("result_report_artifact");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates BioAgentBench-style bioinformatics agent metric validity with task, dataset, truth, workflow, grader, perturbation, privacy, owner, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const bioinformaticsSignals: MetricValidationBioinformaticsAgentSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "bioinformatics_task_manifest",
      "dataset_input_manifest",
      "truth_reference_manifest",
      "workflow_reproduction_manifest",
      "docker_or_environment_manifest",
      "tool_version_manifest",
      "agent_harness_manifest",
      "grader_config_manifest",
      "result_artifact_manifest",
      "perturbation_suite_manifest",
      "privacy_boundary_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const bioinformaticsEvidenceIds = bioinformaticsSignals.map((signal) => `bioagentbench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...bioinformaticsEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `bioagentbench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `bioagentbench-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "bioinformatics-agent",
        runId: "run-bioagentbench-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireBioinformaticsAgentProof: true,
        bioinformaticsAgentChecks: bioinformaticsSignals.map((signal, index) => ({
          bioinformaticsAgentSignalId: bioinformaticsEvidenceIds[index]!.replace("bioagentbench-", ""),
          bioinformaticsAgentSignalType: signal,
          covered: true,
          evidenceRefs: [bioinformaticsEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" || signal === "paper_or_source_reference"
            ? ["bioagent-bench-v3"]
            : undefined,
          taskTypes: signal === "bioinformatics_task_manifest"
            ? ["rna_seq", "variant_calling", "metagenomics"]
            : undefined,
          datasetIds: signal === "dataset_input_manifest" || signal === "truth_reference_manifest"
            ? ["bioagent-inputs-v1", "bioagent-truth-reference-v1"]
            : undefined,
          workflowIds: [
            "workflow_reproduction_manifest",
            "docker_or_environment_manifest",
            "agent_harness_manifest"
          ].includes(signal)
            ? ["bioagent-workflow-docker-v1", "bioagent-harness-matrix-v1"]
            : undefined,
          toolNames: signal === "tool_version_manifest" ? ["rnaseq-toolchain", "variant-caller", "metagenomics-classifier"] : undefined,
          metricNames: signal === "grader_config_manifest" || signal === "result_artifact_manifest"
            ? ["pipeline_progress", "outcome_validity", "artifact_overlap"]
            : undefined,
          perturbationIds: signal === "perturbation_suite_manifest"
            ? ["corrupted-inputs", "decoy-files", "prompt-bloat"]
            : undefined,
          privacyBoundaryRefs: signal === "privacy_boundary_manifest"
            ? ["patient-data-redaction-policy", "proprietary-reference-boundary", "unpublished-ip-boundary"]
            : undefined,
          taskCount: signal === "bioinformatics_task_manifest" ? 12 : undefined,
          owner: signal === "metric_owner" ? "AMC Bioinformatics Agent Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 12 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 68,
                upper: 78,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/bioagent-bench/bioagent-bench", "https://arxiv.org/abs/2601.21800"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      bioinformaticsAgentCoverage: 1,
      bioinformaticsAgentSampleSize: 15,
      bioinformaticsAgentMissingSignals: [],
      bioinformaticsAgentTaskCount: 12
    });
    expect(report.rows[0]?.bioinformaticsAgentBenchmarkIds).toEqual(["bioagent-bench-v3"]);
    expect(report.rows[0]?.bioinformaticsAgentTaskTypes).toEqual(["rna_seq", "variant_calling", "metagenomics"]);
    expect(report.rows[0]?.bioinformaticsAgentDatasetIds).toEqual(["bioagent-inputs-v1", "bioagent-truth-reference-v1"]);
    expect(report.rows[0]?.bioinformaticsAgentWorkflowIds).toEqual(["bioagent-workflow-docker-v1", "bioagent-harness-matrix-v1"]);
    expect(report.rows[0]?.bioinformaticsAgentToolNames).toEqual(["rnaseq-toolchain", "variant-caller", "metagenomics-classifier"]);
    expect(report.rows[0]?.bioinformaticsAgentMetricNames).toEqual(["pipeline_progress", "outcome_validity", "artifact_overlap"]);
    expect(report.rows[0]?.bioinformaticsAgentPerturbationIds).toEqual(["corrupted-inputs", "decoy-files", "prompt-bloat"]);
    expect(report.rows[0]?.bioinformaticsAgentPrivacyBoundaryRefs).toEqual([
      "patient-data-redaction-policy",
      "proprietary-reference-boundary",
      "unpublished-ip-boundary"
    ]);
    expect(report.evalPack.rows[0]).toMatchObject({
      bioinformaticsAgentCoverage: 1,
      bioinformaticsAgentSampleSize: 15,
      bioinformaticsAgentMissingSignals: [],
      bioinformaticsAgentTaskCount: 12
    });
    expect(report.evalPack.rows[0]?.bioinformaticsAgentReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...bioinformaticsEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/bioagent-bench/bioagent-bench");
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2601.21800");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when BioAgentBench-style bioinformatics validity lacks truth, workflow, grader, perturbation, privacy, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const bioinformaticsSignals: MetricValidationBioinformaticsAgentSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "bioinformatics_task_manifest",
      "dataset_input_manifest",
      "result_artifact_manifest",
      "metric_owner"
    ];
    const bioinformaticsEvidenceIds = bioinformaticsSignals.map((signal) => `bioagentbench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...bioinformaticsEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `bioagentbench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `bioagentbench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "bioinformatics-agent",
        runId: "run-bioagentbench-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireBioinformaticsAgentProof: true,
        bioinformaticsAgentChecks: bioinformaticsSignals.map((signal, index) => ({
          bioinformaticsAgentSignalId: bioinformaticsEvidenceIds[index]!.replace("bioagentbench-missing-", ""),
          bioinformaticsAgentSignalType: signal,
          covered: true,
          evidenceRefs: [bioinformaticsEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" || signal === "paper_or_source_reference"
            ? ["bioagent-bench-v3"]
            : undefined,
          taskTypes: signal === "bioinformatics_task_manifest" ? ["rna_seq"] : undefined,
          taskCount: signal === "bioinformatics_task_manifest" ? 2 : undefined,
          datasetIds: signal === "dataset_input_manifest" ? ["bioagent-inputs-v1"] : undefined,
          owner: signal === "metric_owner" ? "AMC Bioinformatics Agent Eval" : undefined
        })),
        sourceRefs: ["https://github.com/bioagent-bench/bioagent-bench", "https://arxiv.org/abs/2601.21800"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      bioinformaticsAgentSampleSize: 6
    });
    expect(report.rows[0]?.bioinformaticsAgentCoverage).toBeCloseTo(4 / 15, 6);
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("truth_reference_manifest");
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("workflow_reproduction_manifest");
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("grader_config_manifest");
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("perturbation_suite_manifest");
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("privacy_boundary_manifest");
    expect(report.rows[0]?.bioinformaticsAgentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("bioinformatics-agent coverage");
    expect(report.evalPack.rows[0]?.bioinformaticsAgentCoverage).toBeCloseTo(4 / 15, 6);
    expect(report.evalPack.rows[0]?.bioinformaticsAgentMissingSignals).toContain("tool_version_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates MiRAGE-style drug-repositioning metric validity with dataset, split, mapping, features, similarity, score, evaluation, owner, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const mirageSignals: MetricValidationMirageDrugRepositioningSignal[] = [
      "benchmark_identity",
      "dataset_release_manifest",
      "train_test_split_manifest",
      "drug_disease_mapping_manifest",
      "drug_feature_manifest",
      "disease_feature_manifest",
      "similarity_matrix_manifest",
      "negative_sampling_protocol",
      "classifier_config",
      "feature_selection_report",
      "score_calculation_manifest",
      "evaluation_report",
      "case_study_validation",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const mirageEvidenceIds = mirageSignals.map((signal) => `ariasha-mirage-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 16),
        trustTier: "OBSERVED" as const
      })),
      ...mirageEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `ariasha-mirage-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ariasha-mirage-session-${index}`,
        ts: Date.UTC(2026, 5, 16),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "drug-repositioning-agent",
        runId: "run-ariasha-mirage-validity",
        ts: Date.UTC(2026, 5, 16),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMirageDrugRepositioningProof: true,
        mirageDrugRepositioningChecks: mirageSignals.map((signal, index) => ({
          mirageDrugRepositioningSignalId: mirageEvidenceIds[index]!.replace("ariasha-mirage-", ""),
          mirageDrugRepositioningSignalType: signal,
          covered: true,
          evidenceRefs: [mirageEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_identity" ? ["ariasha-mirage-drug-repositioning"] : undefined,
          datasetIds: signal === "dataset_release_manifest" ? ["mirage-ddc-synthetic-release"] : undefined,
          splitIds: signal === "train_test_split_manifest" ? ["mirage-80-20-holdout-split"] : undefined,
          mappingIds: signal === "drug_disease_mapping_manifest" ? ["mirage-drug-disease-mapping-v1"] : undefined,
          featureSetIds: signal === "drug_feature_manifest"
            ? ["mirage-drug-feature-panel"]
            : signal === "disease_feature_manifest"
              ? ["mirage-disease-feature-panel"]
              : undefined,
          similarityMatrixIds: signal === "similarity_matrix_manifest" ? ["mirage-drug-similarity", "mirage-disease-similarity"] : undefined,
          negativeSamplingIds: signal === "negative_sampling_protocol" ? ["mirage-hard-negative-mining-control"] : undefined,
          classifierConfigIds: signal === "classifier_config" ? ["mirage-random-forest-classifier-config"] : undefined,
          featureSelectionReportIds: signal === "feature_selection_report" ? ["mirage-feature-importance-report"] : undefined,
          scoreCalculationIds: signal === "score_calculation_manifest" ? ["mirage-score-calculation-manifest"] : undefined,
          caseStudyIds: signal === "case_study_validation" ? ["parkinsons-disease-review", "schizophrenia-review"] : undefined,
          metricNames: signal === "evaluation_report" ? ["drug_disease_auc", "drug_disease_aupr", "top_k_repositioning_hit_rate"] : undefined,
          drugCount: ["dataset_release_manifest", "drug_feature_manifest"].includes(signal) ? 128 : undefined,
          diseaseCount: ["dataset_release_manifest", "disease_feature_manifest"].includes(signal) ? 42 : undefined,
          mappingCount: signal === "drug_disease_mapping_manifest" ? 512 : undefined,
          featureSetCount: signal === "drug_feature_manifest" || signal === "disease_feature_manifest" ? 6 : undefined,
          similarityMatrixCount: signal === "similarity_matrix_manifest" ? 2 : undefined,
          owner: signal === "metric_owner" ? "AMC Drug Repositioning Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 32 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 74,
                upper: 82,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/ARIASHA/MiRAGE"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      mirageDrugRepositioningCoverage: 1,
      mirageDrugRepositioningSampleSize: 15,
      mirageDrugRepositioningMissingSignals: [],
      mirageDrugRepositioningDrugCount: 128,
      mirageDrugRepositioningDiseaseCount: 42,
      mirageDrugRepositioningMappingCount: 512,
      mirageDrugRepositioningFeatureSetCount: 6,
      mirageDrugRepositioningSimilarityMatrixCount: 2
    });
    expect(report.rows[0]?.mirageDrugRepositioningBenchmarkIds).toEqual(["ariasha-mirage-drug-repositioning"]);
    expect(report.rows[0]?.mirageDrugRepositioningDatasetIds).toEqual(["mirage-ddc-synthetic-release"]);
    expect(report.rows[0]?.mirageDrugRepositioningSplitIds).toEqual(["mirage-80-20-holdout-split"]);
    expect(report.rows[0]?.mirageDrugRepositioningMappingIds).toEqual(["mirage-drug-disease-mapping-v1"]);
    expect(report.rows[0]?.mirageDrugRepositioningSimilarityMatrixIds).toEqual(["mirage-drug-similarity", "mirage-disease-similarity"]);
    expect(report.rows[0]?.mirageDrugRepositioningMetricNames).toContain("drug_disease_auc");
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("mirage drug repositioning coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      mirageDrugRepositioningCoverage: 1,
      mirageDrugRepositioningSampleSize: 15,
      mirageDrugRepositioningMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.mirageDrugRepositioningReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...mirageEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/ARIASHA/MiRAGE");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when MiRAGE-style drug-repositioning validity lacks split, mapping, feature, similarity, score, evaluation, case-study, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const mirageSignals: MetricValidationMirageDrugRepositioningSignal[] = [
      "benchmark_identity",
      "dataset_release_manifest",
      "train_test_split_manifest",
      "metric_owner"
    ];
    const mirageEvidenceIds = mirageSignals.map((signal) => `ariasha-mirage-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 16),
        trustTier: "OBSERVED" as const
      })),
      ...mirageEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `ariasha-mirage-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ariasha-mirage-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 16),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "drug-repositioning-agent",
        runId: "run-ariasha-mirage-incomplete",
        ts: Date.UTC(2026, 5, 16),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMirageDrugRepositioningProof: true,
        mirageDrugRepositioningChecks: mirageSignals.map((signal, index) => ({
          mirageDrugRepositioningSignalId: mirageEvidenceIds[index]!.replace("ariasha-mirage-missing-", ""),
          mirageDrugRepositioningSignalType: signal,
          covered: true,
          evidenceRefs: [mirageEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_identity" ? ["ariasha-mirage-drug-repositioning"] : undefined,
          datasetIds: signal === "dataset_release_manifest" ? ["mirage-ddc-synthetic-release"] : undefined,
          splitIds: signal === "train_test_split_manifest" ? [] : undefined,
          owner: signal === "metric_owner" ? "AMC Drug Repositioning Metric Owner" : undefined
        })),
        sourceRefs: ["https://github.com/ARIASHA/MiRAGE"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      mirageDrugRepositioningSampleSize: 4
    });
    expect(report.rows[0]?.mirageDrugRepositioningCoverage).toBeCloseTo(2 / 15, 6);
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("dataset_release_manifest");
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("negative_sampling_protocol");
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("score_calculation_manifest");
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("evaluation_report");
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("case_study_validation");
    expect(report.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("mirage drug repositioning coverage");
    expect(report.evalPack.rows[0]?.mirageDrugRepositioningCoverage).toBeCloseTo(2 / 15, 6);
    expect(report.evalPack.rows[0]?.mirageDrugRepositioningMissingSignals).toContain("similarity_matrix_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds NIKA-style network troubleshooting benchmark validity to scenarios, topologies, incidents, tools, metrics, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const networkSignals: MetricValidationNetworkTroubleshootingSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "network_scenario_manifest",
      "topology_tier_manifest",
      "incident_catalog_manifest",
      "fault_injection_manifest",
      "session_trace_manifest",
      "agent_interface_manifest",
      "mcp_tool_manifest",
      "environment_runtime_manifest",
      "evaluation_metric_manifest",
      "judge_config_manifest",
      "batch_summary_artifact",
      "root_cause_ground_truth",
      "localization_ground_truth",
      "traffic_workload_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const networkEvidenceIds = networkSignals.map((signal) => `nika-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...networkEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `nika-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `nika-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "network-troubleshooting-agent",
        runId: "run-nika-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireNetworkTroubleshootingProof: true,
        networkTroubleshootingChecks: networkSignals.map((signal, index) => ({
          networkTroubleshootingSignalId: networkEvidenceIds[index]!.replace("nika-", ""),
          networkTroubleshootingSignalType: signal,
          covered: true,
          evidenceRefs: [networkEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["nika-network-arena"] : undefined,
          scenarioIds: signal === "network_scenario_manifest" || signal === "traffic_workload_manifest"
            ? ["dc-clos-bgp", "campus-ospf", "wan-edge"]
            : undefined,
          topologyTiers: signal === "topology_tier_manifest" ? ["small", "medium", "large", "xlarge"] : undefined,
          issueTypes: [
            "incident_catalog_manifest",
            "fault_injection_manifest",
            "root_cause_ground_truth",
            "localization_ground_truth"
          ].includes(signal)
            ? ["link_failure", "route_leak", "resource_contention"]
            : undefined,
          agentIds: signal === "session_trace_manifest" || signal === "agent_interface_manifest"
            ? ["mock-cli-agent", "react-troubleshooter"]
            : undefined,
          toolNames: signal === "mcp_tool_manifest" ? ["inspect_routes", "ping_host", "check_logs"] : undefined,
          metricNames: [
            "evaluation_metric_manifest",
            "judge_config_manifest",
            "batch_summary_artifact"
          ].includes(signal)
            ? ["detect_issue", "localize_fault", "root_cause", "repair_success"]
            : undefined,
          incidentCount: [
            "incident_catalog_manifest",
            "fault_injection_manifest",
            "root_cause_ground_truth",
            "localization_ground_truth"
          ].includes(signal)
            ? 640
            : undefined,
          owner: signal === "metric_owner" ? "AMC Network Troubleshooting Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 640 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 72,
                upper: 82,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/sands-lab/nika", "https://arxiv.org/abs/2512.16381"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      networkTroubleshootingCoverage: 1,
      networkTroubleshootingSampleSize: 18,
      networkTroubleshootingMissingSignals: [],
      networkTroubleshootingIncidentCount: 640
    });
    expect(report.rows[0]?.networkTroubleshootingBenchmarkIds).toEqual(["nika-network-arena"]);
    expect(report.rows[0]?.networkTroubleshootingScenarioIds).toEqual(["dc-clos-bgp", "campus-ospf", "wan-edge"]);
    expect(report.rows[0]?.networkTroubleshootingTopologyTiers).toEqual(["small", "medium", "large", "xlarge"]);
    expect(report.rows[0]?.networkTroubleshootingToolNames).toEqual(["inspect_routes", "ping_host", "check_logs"]);
    expect(report.rows[0]?.networkTroubleshootingMetricNames).toEqual(["detect_issue", "localize_fault", "root_cause", "repair_success"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      networkTroubleshootingCoverage: 1,
      networkTroubleshootingSampleSize: 18,
      networkTroubleshootingMissingSignals: [],
      networkTroubleshootingIncidentCount: 640
    });
    expect(report.evalPack.rows[0]?.networkTroubleshootingReportArtifactHashes.length).toBe(16);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...networkEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/sands-lab/nika");
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2512.16381");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when NIKA-style network troubleshooting validity lacks incident, tool, ground-truth, batch, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const networkSignals: MetricValidationNetworkTroubleshootingSignal[] = [
      "benchmark_manifest",
      "network_scenario_manifest",
      "topology_tier_manifest",
      "incident_catalog_manifest",
      "evaluation_metric_manifest",
      "metric_owner"
    ];
    const networkEvidenceIds = networkSignals.map((signal) => `nika-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...networkEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `nika-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `nika-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "network-troubleshooting-agent",
        runId: "run-nika-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireNetworkTroubleshootingProof: true,
        networkTroubleshootingChecks: networkSignals.map((signal, index) => ({
          networkTroubleshootingSignalId: networkEvidenceIds[index]!.replace("nika-missing-", ""),
          networkTroubleshootingSignalType: signal,
          covered: true,
          evidenceRefs: [networkEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["nika-network-arena"] : undefined,
          scenarioIds: signal === "network_scenario_manifest" ? ["dc-clos-bgp"] : undefined,
          topologyTiers: signal === "topology_tier_manifest" ? ["small"] : undefined,
          issueTypes: signal === "incident_catalog_manifest" ? ["link_failure"] : undefined,
          incidentCount: signal === "incident_catalog_manifest" ? 2 : undefined,
          metricNames: signal === "evaluation_metric_manifest" ? ["detect_issue"] : undefined,
          owner: signal === "metric_owner" ? "AMC Network Troubleshooting Eval" : undefined
        })),
        sourceRefs: ["https://github.com/sands-lab/nika", "https://arxiv.org/abs/2512.16381"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      networkTroubleshootingSampleSize: 6
    });
    expect(report.rows[0]?.networkTroubleshootingCoverage).toBeCloseTo(5 / 18, 6);
    expect(report.rows[0]?.networkTroubleshootingMissingSignals).toContain("mcp_tool_manifest");
    expect(report.rows[0]?.networkTroubleshootingMissingSignals).toContain("root_cause_ground_truth");
    expect(report.rows[0]?.networkTroubleshootingMissingSignals).toContain("batch_summary_artifact");
    expect(report.rows[0]?.networkTroubleshootingMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("network troubleshooting coverage");
    expect(report.evalPack.rows[0]?.networkTroubleshootingCoverage).toBeCloseTo(5 / 18, 6);
    expect(report.evalPack.rows[0]?.networkTroubleshootingMissingSignals).toContain("localization_ground_truth");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds InferenceBench-style inference optimization validity to scenarios, hardware, gates, relaunch, latency, throughput, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const inferenceSignals: MetricValidationInferenceOptimizationSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "scenario_objective_manifest",
      "hardware_budget_manifest",
      "server_contract_manifest",
      "runtime_backend_manifest",
      "search_space_manifest",
      "baseline_comparison_manifest",
      "quality_gate_result",
      "integrity_gate_result",
      "supervised_relaunch_result",
      "latency_throughput_metrics",
      "tail_latency_metrics",
      "exploration_trace_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const inferenceEvidenceIds = inferenceSignals.map((signal) => `inferencebench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...inferenceEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `inferencebench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `inferencebench-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "inference-optimization-agent",
        runId: "run-inferencebench-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireInferenceOptimizationProof: true,
        inferenceOptimizationChecks: inferenceSignals.map((signal, index) => ({
          inferenceOptimizationSignalId: inferenceEvidenceIds[index]!.replace("inferencebench-", ""),
          inferenceOptimizationSignalType: signal,
          covered: true,
          evidenceRefs: [inferenceEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" || signal === "paper_or_source_reference"
            ? ["inferencebench-open-ended-inference-optimization"]
            : undefined,
          scenarioIds: signal === "scenario_objective_manifest"
            ? ["prefill-latency", "decode-latency", "high-load-throughput", "multi-objective-geomean"]
            : undefined,
          hardwareProfileIds: signal === "hardware_budget_manifest" ? ["single-h100-wall-clock-budget"] : undefined,
          backendIds: signal === "runtime_backend_manifest" || signal === "search_space_manifest"
            ? ["vllm", "sglang", "tgi", "pytorch"]
            : undefined,
          searchSpaceIds: signal === "search_space_manifest"
            ? ["framework-attention-quantization-kv-cache-scheduler"]
            : undefined,
          gateIds: [
            "quality_gate_result",
            "integrity_gate_result",
            "supervised_relaunch_result"
          ].includes(signal)
            ? ["quality-threshold", "integrity-reward-hack-check", "fresh-container-relaunch"]
            : undefined,
          agentIds: signal === "exploration_trace_manifest"
            ? ["agent-a", "agent-b", "agent-c", "agent-d", "agent-e"]
            : undefined,
          metricNames: [
            "baseline_comparison_manifest",
            "latency_throughput_metrics",
            "tail_latency_metrics"
          ].includes(signal)
            ? ["ttft", "tpot", "request-throughput", "geomean", "p50", "p90", "p99"]
            : undefined,
          runCount: signal === "exploration_trace_manifest" ? 8 : undefined,
          owner: signal === "metric_owner" ? "AMC Inference Optimization Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 8 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 73,
                upper: 83,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/aisa-group/InferenceBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      inferenceOptimizationCoverage: 1,
      inferenceOptimizationSampleSize: 16,
      inferenceOptimizationMissingSignals: [],
      inferenceOptimizationRunCount: 8
    });
    expect(report.rows[0]?.inferenceOptimizationBenchmarkIds).toEqual(["inferencebench-open-ended-inference-optimization"]);
    expect(report.rows[0]?.inferenceOptimizationScenarioIds).toEqual(["prefill-latency", "decode-latency", "high-load-throughput", "multi-objective-geomean"]);
    expect(report.rows[0]?.inferenceOptimizationHardwareProfileIds).toEqual(["single-h100-wall-clock-budget"]);
    expect(report.rows[0]?.inferenceOptimizationBackendIds).toEqual(["vllm", "sglang", "tgi", "pytorch"]);
    expect(report.rows[0]?.inferenceOptimizationSearchSpaceIds).toEqual(["framework-attention-quantization-kv-cache-scheduler"]);
    expect(report.rows[0]?.inferenceOptimizationGateIds).toEqual(["quality-threshold", "integrity-reward-hack-check", "fresh-container-relaunch"]);
    expect(report.rows[0]?.inferenceOptimizationMetricNames).toEqual(["ttft", "tpot", "request-throughput", "geomean", "p50", "p90", "p99"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      inferenceOptimizationCoverage: 1,
      inferenceOptimizationSampleSize: 16,
      inferenceOptimizationMissingSignals: [],
      inferenceOptimizationRunCount: 8
    });
    expect(report.evalPack.rows[0]?.inferenceOptimizationReportArtifactHashes.length).toBe(14);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...inferenceEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/aisa-group/InferenceBench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when InferenceBench-style inference optimization validity lacks gates, relaunch, tail metrics, exploration, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const inferenceSignals: MetricValidationInferenceOptimizationSignal[] = [
      "benchmark_manifest",
      "scenario_objective_manifest",
      "hardware_budget_manifest",
      "runtime_backend_manifest",
      "baseline_comparison_manifest",
      "metric_owner"
    ];
    const inferenceEvidenceIds = inferenceSignals.map((signal) => `inferencebench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...inferenceEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `inferencebench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `inferencebench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "inference-optimization-agent",
        runId: "run-inferencebench-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireInferenceOptimizationProof: true,
        inferenceOptimizationChecks: inferenceSignals.map((signal, index) => ({
          inferenceOptimizationSignalId: inferenceEvidenceIds[index]!.replace("inferencebench-missing-", ""),
          inferenceOptimizationSignalType: signal,
          covered: true,
          evidenceRefs: [inferenceEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["inferencebench-open-ended-inference-optimization"] : undefined,
          scenarioIds: signal === "scenario_objective_manifest" ? ["prefill-latency"] : undefined,
          hardwareProfileIds: signal === "hardware_budget_manifest" ? ["single-h100-wall-clock-budget"] : undefined,
          backendIds: signal === "runtime_backend_manifest" ? ["vllm"] : undefined,
          metricNames: signal === "baseline_comparison_manifest" ? ["aggregate-speedup"] : undefined,
          owner: signal === "metric_owner" ? "AMC Inference Optimization Eval" : undefined
        })),
        sourceRefs: ["https://github.com/aisa-group/InferenceBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      inferenceOptimizationSampleSize: 6
    });
    expect(report.rows[0]?.inferenceOptimizationCoverage).toBeCloseTo(6 / 16, 6);
    expect(report.rows[0]?.inferenceOptimizationMissingSignals).toContain("quality_gate_result");
    expect(report.rows[0]?.inferenceOptimizationMissingSignals).toContain("integrity_gate_result");
    expect(report.rows[0]?.inferenceOptimizationMissingSignals).toContain("supervised_relaunch_result");
    expect(report.rows[0]?.inferenceOptimizationMissingSignals).toContain("tail_latency_metrics");
    expect(report.rows[0]?.inferenceOptimizationMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("inference optimization coverage");
    expect(report.evalPack.rows[0]?.inferenceOptimizationCoverage).toBeCloseTo(6 / 16, 6);
    expect(report.evalPack.rows[0]?.inferenceOptimizationMissingSignals).toContain("exploration_trace_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds Agent Bench-style Java coding-agent validity to YAML benchmarks, sandboxes, judges, Maven/JUnit/JaCoCo, result metrics, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const javaCodingSignals: MetricValidationJavaCodingAgentSignal[] = [
      "benchmark_manifest",
      "source_repository_license",
      "java_task_manifest",
      "yaml_benchmark_manifest",
      "workspace_template_manifest",
      "isolated_sandbox_manifest",
      "provide_lifecycle_trace",
      "setup_post_script_manifest",
      "cli_agent_config",
      "cascaded_jury_manifest",
      "judge_tier_policy",
      "maven_build_check",
      "junit_test_result",
      "jacoco_coverage_report",
      "result_json_manifest",
      "accuracy_pass_at_k_metric",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const javaCodingEvidenceIds = javaCodingSignals.map((signal) => `java-agent-validity-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...javaCodingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `java-agent-validity-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `java-agent-validity-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "java-coding-agent",
        runId: "run-java-coding-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireJavaCodingAgentProof: true,
        javaCodingAgentChecks: javaCodingSignals.map((signal, index) => ({
          javaCodingAgentSignalId: javaCodingEvidenceIds[index]!.replace("java-agent-validity-", ""),
          javaCodingAgentSignalType: signal,
          covered: true,
          evidenceRefs: [javaCodingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: [
            "benchmark_manifest",
            "source_repository_license",
            "yaml_benchmark_manifest"
          ].includes(signal)
            ? ["amc-java-coding-benchmark-v1"]
            : undefined,
          taskIds: signal === "java_task_manifest" ? ["amc-java-coverage-task-v1"] : undefined,
          taskTypes: signal === "java_task_manifest" ? ["enterprise-java-coding"] : undefined,
          javaProjectIds: signal === "java_task_manifest" ? ["amc-synthetic-java-service"] : undefined,
          sandboxIds: [
            "workspace_template_manifest",
            "isolated_sandbox_manifest",
            "provide_lifecycle_trace",
            "setup_post_script_manifest"
          ].includes(signal)
            ? ["amc-isolated-java-workspace"]
            : undefined,
          agentConfigIds: signal === "cli_agent_config" ? ["amc-cli-agent-contract"] : undefined,
          judgeTierIds: [
            "cascaded_jury_manifest",
            "judge_tier_policy"
          ].includes(signal)
            ? ["compile-tier", "test-tier", "coverage-tier"]
            : undefined,
          checkTypes: signal === "maven_build_check"
            ? ["maven-build"]
            : signal === "junit_test_result"
              ? ["junit-test"]
              : signal === "jacoco_coverage_report"
                ? ["jacoco-coverage"]
                : undefined,
          metricNames: signal === "result_json_manifest"
            ? ["trial-result", "benchmark-result"]
            : signal === "accuracy_pass_at_k_metric"
              ? ["accuracy", "pass@k", "coverage-delta"]
              : undefined,
          trialCount: signal === "accuracy_pass_at_k_metric" ? 6 : undefined,
          owner: signal === "metric_owner" ? "AMC Java Coding Agent Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 6 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 78,
                upper: 86,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/spring-ai-community/agent-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      javaCodingAgentCoverage: 1,
      javaCodingAgentSampleSize: 18,
      javaCodingAgentMissingSignals: [],
      javaCodingAgentTrialCount: 6
    });
    expect(report.rows[0]?.javaCodingAgentBenchmarkIds).toEqual(["amc-java-coding-benchmark-v1"]);
    expect(report.rows[0]?.javaCodingAgentTaskIds).toEqual(["amc-java-coverage-task-v1"]);
    expect(report.rows[0]?.javaCodingAgentTaskTypes).toEqual(["enterprise-java-coding"]);
    expect(report.rows[0]?.javaCodingAgentJavaProjectIds).toEqual(["amc-synthetic-java-service"]);
    expect(report.rows[0]?.javaCodingAgentSandboxIds).toEqual(["amc-isolated-java-workspace"]);
    expect(report.rows[0]?.javaCodingAgentAgentConfigIds).toEqual(["amc-cli-agent-contract"]);
    expect(report.rows[0]?.javaCodingAgentJudgeTierIds).toEqual(["compile-tier", "test-tier", "coverage-tier"]);
    expect(report.rows[0]?.javaCodingAgentCheckTypes).toEqual(["maven-build", "junit-test", "jacoco-coverage"]);
    expect(report.rows[0]?.javaCodingAgentMetricNames).toEqual(["trial-result", "benchmark-result", "accuracy", "pass@k", "coverage-delta"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("java coding-agent coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      javaCodingAgentCoverage: 1,
      javaCodingAgentSampleSize: 18,
      javaCodingAgentMissingSignals: [],
      javaCodingAgentTrialCount: 6
    });
    expect(report.evalPack.rows[0]?.javaCodingAgentReportArtifactHashes.length).toBe(16);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...javaCodingEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/spring-ai-community/agent-bench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Agent Bench-style Java coding-agent validity lacks sandbox, judge, Maven, result, pass@k, or CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const javaCodingSignals: MetricValidationJavaCodingAgentSignal[] = [
      "benchmark_manifest",
      "source_repository_license",
      "java_task_manifest",
      "yaml_benchmark_manifest",
      "cli_agent_config",
      "metric_owner"
    ];
    const javaCodingEvidenceIds = javaCodingSignals.map((signal) => `java-agent-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...javaCodingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `java-agent-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `java-agent-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "java-coding-agent",
        runId: "run-java-coding-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireJavaCodingAgentProof: true,
        javaCodingAgentChecks: javaCodingSignals.map((signal, index) => ({
          javaCodingAgentSignalId: javaCodingEvidenceIds[index]!.replace("java-agent-incomplete-", ""),
          javaCodingAgentSignalType: signal,
          covered: true,
          evidenceRefs: [javaCodingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: [
            "benchmark_manifest",
            "source_repository_license",
            "yaml_benchmark_manifest"
          ].includes(signal)
            ? ["amc-java-coding-benchmark-v1"]
            : undefined,
          taskIds: signal === "java_task_manifest" ? ["amc-java-coverage-task-v1"] : undefined,
          taskTypes: signal === "java_task_manifest" ? ["enterprise-java-coding"] : undefined,
          javaProjectIds: signal === "java_task_manifest" ? ["amc-synthetic-java-service"] : undefined,
          agentConfigIds: signal === "cli_agent_config" ? ["amc-cli-agent-contract"] : undefined,
          owner: signal === "metric_owner" ? "AMC Java Coding Agent Eval" : undefined
        })),
        sourceRefs: ["https://github.com/spring-ai-community/agent-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      javaCodingAgentSampleSize: 6
    });
    expect(report.rows[0]?.javaCodingAgentCoverage).toBeCloseTo(6 / 18, 6);
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("isolated_sandbox_manifest");
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("cascaded_jury_manifest");
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("maven_build_check");
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("result_json_manifest");
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("accuracy_pass_at_k_metric");
    expect(report.rows[0]?.javaCodingAgentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("java coding-agent coverage");
    expect(report.evalPack.rows[0]?.javaCodingAgentCoverage).toBeCloseTo(6 / 18, 6);
    expect(report.evalPack.rows[0]?.javaCodingAgentMissingSignals).toContain("jacoco_coverage_report");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds Tavily-style web eval dataset generation proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const webEvalSignals: MetricValidationWebEvalDatasetSignal[] = [
      "benchmark_manifest",
      "source_repository_reference",
      "subject_manifest",
      "generated_query_manifest",
      "search_provider_config",
      "retrieved_document_manifest",
      "document_filter_manifest",
      "qa_generation_manifest",
      "reference_answer_manifest",
      "dataset_export_manifest",
      "output_target_manifest",
      "validation_report_artifact",
      "freshness_snapshot",
      "provider_diversity_metric",
      "source_coverage_metric",
      "answer_grounding_metric",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const webEvalEvidenceIds = webEvalSignals.map((signal) => `web-eval-dataset-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...webEvalEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `web-eval-dataset-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `web-eval-dataset-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "web-eval-dataset-agent",
        runId: "run-web-eval-dataset-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireWebEvalDatasetProof: true,
        webEvalDatasetChecks: webEvalSignals.map((signal, index) => ({
          webEvalDatasetSignalId: webEvalEvidenceIds[index]!.replace("web-eval-dataset-", ""),
          webEvalDatasetSignalType: signal,
          covered: true,
          evidenceRefs: [webEvalEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["amc-web-eval-dataset-v1"] : undefined,
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/Eyalbenba/tavily-web-eval-generator"]
            : undefined,
          subjectIds: signal === "subject_manifest" ? ["amc-web-eval-basic-research-subjects"] : undefined,
          querySetIds: [
            "generated_query_manifest",
            "freshness_snapshot"
          ].includes(signal)
            ? ["amc-web-eval-query-set-v1"]
            : undefined,
          searchProviderIds: signal === "search_provider_config" ? ["tavily", "secondary-search"] : undefined,
          documentSetIds: signal === "retrieved_document_manifest" ? ["amc-web-eval-documents-v1"] : undefined,
          filterPolicyIds: signal === "document_filter_manifest" ? ["amc-web-eval-filter-policy-v1"] : undefined,
          qaGenerationIds: signal === "qa_generation_manifest" ? ["amc-web-eval-qa-generation-v1"] : undefined,
          referenceAnswerSetIds: signal === "reference_answer_manifest" ? ["amc-web-eval-reference-answers-v1"] : undefined,
          datasetExportIds: signal === "dataset_export_manifest" ? ["amc-web-eval-export-v1"] : undefined,
          outputTargets: signal === "output_target_manifest" ? ["local", "langsmith"] : undefined,
          metricNames: signal === "validation_report_artifact"
            ? ["source-coverage", "answer-grounding", "freshness-hours"]
            : undefined,
          questionCount: [
            "generated_query_manifest",
            "qa_generation_manifest",
            "reference_answer_manifest"
          ].includes(signal)
            ? 24
            : undefined,
          documentCount: signal === "retrieved_document_manifest" ? 12 : undefined,
          providerDiversityCount: signal === "provider_diversity_metric" ? 2 : undefined,
          datasetFreshnessHours: signal === "freshness_snapshot" ? 4 : undefined,
          maxFreshnessHours: signal === "freshness_snapshot" ? 24 : undefined,
          sourceCoverage: signal === "source_coverage_metric" ? 0.92 : undefined,
          answerGrounding: signal === "answer_grounding_metric" ? 0.9 : undefined,
          owner: signal === "metric_owner" ? "AMC Web Eval Dataset Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 84,
                upper: 90,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/Eyalbenba/tavily-web-eval-generator"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      webEvalDatasetCoverage: 1,
      webEvalDatasetSampleSize: 18,
      webEvalDatasetMissingSignals: [],
      webEvalDatasetQuestionCount: 24,
      webEvalDatasetDocumentCount: 12,
      webEvalDatasetProviderDiversityCount: 2,
      webEvalDatasetFreshnessHours: 4,
      webEvalDatasetSourceCoverage: 0.92,
      webEvalDatasetAnswerGrounding: 0.9
    });
    expect(report.rows[0]?.webEvalDatasetBenchmarkIds).toEqual(["amc-web-eval-dataset-v1"]);
    expect(report.rows[0]?.webEvalDatasetRepositoryRefs).toEqual(["https://github.com/Eyalbenba/tavily-web-eval-generator"]);
    expect(report.rows[0]?.webEvalDatasetSearchProviderIds).toEqual(["tavily", "secondary-search"]);
    expect(report.rows[0]?.webEvalDatasetOutputTargets).toEqual(["local", "langsmith"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("web eval dataset coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      webEvalDatasetCoverage: 1,
      webEvalDatasetSampleSize: 18,
      webEvalDatasetMissingSignals: [],
      webEvalDatasetQuestionCount: 24,
      webEvalDatasetDocumentCount: 12
    });
    expect(report.evalPack.rows[0]?.webEvalDatasetReportArtifactHashes.length).toBe(16);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...webEvalEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/Eyalbenba/tavily-web-eval-generator");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when web eval dataset generation proof lacks query, search, document, QA, export, freshness, grounding, or CI evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const webEvalSignals: MetricValidationWebEvalDatasetSignal[] = [
      "benchmark_manifest",
      "source_repository_reference",
      "subject_manifest",
      "generated_query_manifest",
      "search_provider_config",
      "retrieved_document_manifest",
      "qa_generation_manifest",
      "answer_grounding_metric",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const webEvalEvidenceIds = webEvalSignals.map((signal) => `web-eval-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...webEvalEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `web-eval-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `web-eval-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "web-eval-dataset-agent",
        runId: "run-web-eval-dataset-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireWebEvalDatasetProof: true,
        webEvalDatasetChecks: webEvalSignals.map((signal, index) => ({
          webEvalDatasetSignalId: webEvalEvidenceIds[index]!.replace("web-eval-incomplete-", ""),
          webEvalDatasetSignalType: signal,
          covered: true,
          evidenceRefs: [webEvalEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["amc-web-eval-dataset-v1"] : undefined,
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/Eyalbenba/tavily-web-eval-generator"]
            : undefined,
          subjectIds: signal === "subject_manifest" ? ["amc-web-eval-basic-research-subjects"] : undefined,
          querySetIds: signal === "generated_query_manifest" ? [] : undefined,
          searchProviderIds: signal === "search_provider_config" ? [] : undefined,
          documentSetIds: signal === "retrieved_document_manifest" ? [] : undefined,
          qaGenerationIds: signal === "qa_generation_manifest" ? [] : undefined,
          questionCount: [
            "generated_query_manifest",
            "qa_generation_manifest"
          ].includes(signal)
            ? 3
            : undefined,
          documentCount: signal === "retrieved_document_manifest" ? 3 : undefined,
          answerGrounding: signal === "answer_grounding_metric" ? 0.2 : undefined,
          owner: signal === "metric_owner" ? "AMC Web Eval Dataset Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 95,
                marginOfError: 27.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/Eyalbenba/tavily-web-eval-generator"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      webEvalDatasetSampleSize: 10
    });
    expect(report.rows[0]?.webEvalDatasetCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("generated_query_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("search_provider_config");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("retrieved_document_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("document_filter_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("qa_generation_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("reference_answer_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("dataset_export_manifest");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("freshness_snapshot");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("answer_grounding_metric");
    expect(report.rows[0]?.webEvalDatasetMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("web eval dataset coverage");
    expect(report.evalPack.rows[0]?.webEvalDatasetCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.evalPack.rows[0]?.webEvalDatasetMissingSignals).toContain("output_target_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds Parallel research-skill metric validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const parallelSignals: MetricValidationParallelResearchSkillSignal[] = [
      "source_repository_reference",
      "license_boundary",
      "skill_manifest",
      "api_surface_manifest",
      "search_mode_manifest",
      "deep_research_task_manifest",
      "chat_grounding_manifest",
      "extract_content_manifest",
      "citation_provenance_report",
      "source_policy_manifest",
      "batch_execution_manifest",
      "monitoring_manifest",
      "security_boundary",
      "dependency_lock",
      "benchmark_claim_validation_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const parallelEvidenceIds = parallelSignals.map((signal) => `parallel-skill-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...parallelEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `parallel-skill-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `parallel-skill-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "parallel-research-agent",
        runId: "run-parallel-research-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireParallelResearchSkillProof: true,
        parallelResearchSkillChecks: parallelSignals.map((signal, index) => ({
          parallelResearchSignalId: parallelEvidenceIds[index]!.replace("parallel-skill-", ""),
          parallelResearchSignalType: signal,
          covered: true,
          evidenceRefs: [parallelEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : `d${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/mvanhorn/clawdbot-skill-parallel/tree/acf4f9997eda895028df68c2e9b9f3c25e3116c4"]
            : undefined,
          licenseRefs: signal === "license_boundary" ? ["README:MIT", "SKILL.md:MIT"] : undefined,
          skillManifestIds: signal === "skill_manifest" ? ["parallel-skill-v3.0.0"] : undefined,
          apiSurfaceIds: [
            "api_surface_manifest",
            "search_mode_manifest",
            "deep_research_task_manifest",
            "chat_grounding_manifest",
            "extract_content_manifest"
          ].includes(signal)
            ? ["search", "extract", "task", "chat", "findall", "monitor", "task_groups"]
            : undefined,
          searchModeIds: signal === "search_mode_manifest" ? ["one-shot", "fast", "agentic"] : undefined,
          processorTiers: signal === "deep_research_task_manifest"
            ? ["lite", "base", "core", "core2x", "ultra", "ultra2x", "ultra4x", "ultra8x"]
            : undefined,
          citationCoverage0to1: signal === "citation_provenance_report" ? 0.93 : undefined,
          sourcePolicyCoverage0to1: signal === "source_policy_manifest" ? 0.91 : undefined,
          batchTaskLimit: signal === "batch_execution_manifest" ? 1000 : undefined,
          monitoringCoverage0to1: signal === "monitoring_manifest" ? 0.9 : undefined,
          securityBoundaryRefs: signal === "security_boundary"
            ? ["env-key-only", "json-injection-escaping", "authenticated-source-disclosure"]
            : undefined,
          dependencyLockIds: signal === "dependency_lock" ? ["requirements.txt"] : undefined,
          metricNames: signal === "benchmark_claim_validation_report"
            ? ["citation-coverage", "source-policy-coverage", "monitoring-coverage"]
            : undefined,
          owner: signal === "metric_owner" ? "AMC Parallel Research Skill Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 86,
                upper: 91,
                marginOfError: 2.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/mvanhorn/clawdbot-skill-parallel"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      parallelResearchSkillCoverage: 1,
      parallelResearchSkillSampleSize: 17,
      parallelResearchSkillMissingSignals: [],
      parallelResearchSkillCitationCoverage0to1: 0.93,
      parallelResearchSkillSourcePolicyCoverage0to1: 0.91,
      parallelResearchSkillBatchTaskLimit: 1000,
      parallelResearchSkillMonitoringCoverage0to1: 0.9
    });
    expect(report.rows[0]?.parallelResearchSkillRepositoryRefs).toEqual([
      "https://github.com/mvanhorn/clawdbot-skill-parallel/tree/acf4f9997eda895028df68c2e9b9f3c25e3116c4"
    ]);
    expect(report.rows[0]?.parallelResearchSkillApiSurfaceIds).toEqual([
      "search",
      "extract",
      "task",
      "chat",
      "findall",
      "monitor",
      "task_groups"
    ]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("parallel research-skill coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      parallelResearchSkillCoverage: 1,
      parallelResearchSkillSampleSize: 17,
      parallelResearchSkillMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.parallelResearchSkillReportArtifactHashes.length).toBe(15);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...parallelEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Parallel research-skill proof is metadata-only or missing reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const incompleteSignals: MetricValidationParallelResearchSkillSignal[] = [
      "source_repository_reference",
      "skill_manifest",
      "api_surface_manifest",
      "citation_provenance_report",
      "metric_owner"
    ];
    const evidenceIds = incompleteSignals.map((signal) => `parallel-incomplete-${signal}`);

    const report = buildMetricValidationReport(
      {
        agentId: "parallel-research-agent",
        runId: "run-parallel-research-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: [
          ...questionScores.map((row, index) => ({
            evidenceId: row.evidenceEventIds[0]!,
            eventHash: `${index}`.repeat(64).slice(0, 64),
            writerSig: `writer-sig-${index}`,
            eventType: "audit" as const,
            sessionId: `session-${index}`,
            ts: Date.UTC(2026, 5, 19),
            trustTier: "OBSERVED" as const
          }))
        ],
        requireParallelResearchSkillProof: true,
        parallelResearchSkillChecks: incompleteSignals.map((signal, index) => ({
          parallelResearchSignalId: evidenceIds[index]!.replace("parallel-incomplete-", ""),
          parallelResearchSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : `e${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/mvanhorn/clawdbot-skill-parallel"]
            : undefined,
          skillManifestIds: signal === "skill_manifest" ? ["README-only"] : undefined,
          apiSurfaceIds: signal === "api_surface_manifest" ? ["search"] : undefined,
          citationCoverage0to1: signal === "citation_provenance_report" ? 0.4 : undefined,
          owner: signal === "metric_owner" ? "AMC Parallel Research Skill Validity" : undefined
        })),
        sourceRefs: ["https://github.com/mvanhorn/clawdbot-skill-parallel"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      parallelResearchSkillSampleSize: 5
    });
    expect(report.rows[0]?.parallelResearchSkillCoverage).toBeCloseTo(4 / 17, 6);
    expect(report.rows[0]?.parallelResearchSkillMissingSignals).toContain("license_boundary");
    expect(report.rows[0]?.parallelResearchSkillMissingSignals).toContain("source_policy_manifest");
    expect(report.rows[0]?.parallelResearchSkillMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("parallel research-skill coverage");
    expect(report.evalPack.rows[0]?.parallelResearchSkillCoverage).toBeCloseTo(4 / 17, 6);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds resume RAG evaluator metric validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const resumeSignals: MetricValidationResumeRagEvaluatorSignal[] = [
      "source_repository_reference",
      "license_boundary",
      "resume_upload_manifest",
      "resume_parser_manifest",
      "job_description_manifest",
      "rag_strategy_manifest",
      "query_expansion_manifest",
      "retrieval_config_manifest",
      "vector_store_manifest",
      "ollama_model_manifest",
      "embedding_model_manifest",
      "evaluation_endpoint_manifest",
      "candidate_rating_report",
      "batch_evaluation_manifest",
      "privacy_boundary",
      "dependency_lock",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const resumeEvidenceIds = resumeSignals.map((signal) => `resume-rag-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...resumeEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `resume-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `resume-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "resume-rag-evaluator",
        runId: "run-resume-rag-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireResumeRagEvaluatorProof: true,
        resumeRagEvaluatorChecks: resumeSignals.map((signal, index) => ({
          resumeRagSignalId: resumeEvidenceIds[index]!.replace("resume-rag-", ""),
          resumeRagSignalType: signal,
          covered: true,
          evidenceRefs: [resumeEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : `f${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/punyaa18/ollama-resume-parser/tree/ff77385b80edb2af9a835fcf77cf3444efaa4592"]
            : undefined,
          licenseRefs: signal === "license_boundary" ? ["NO_LICENSE_FILE", "GITHUB_API_LICENSE_NULL"] : undefined,
          resumeInputFormats: ["resume_upload_manifest", "resume_parser_manifest"].includes(signal)
            ? ["pdf", "txt"]
            : undefined,
          ragStrategyIds: signal === "rag_strategy_manifest"
            ? ["similarity", "mmr", "hybrid"]
            : undefined,
          queryExpansionIds: signal === "query_expansion_manifest" ? ["query-expansion-enabled"] : undefined,
          retrievalKMin: signal === "retrieval_config_manifest" ? 2 : undefined,
          retrievalKMax: signal === "retrieval_config_manifest" ? 10 : undefined,
          vectorStoreIds: signal === "vector_store_manifest" ? ["faiss"] : undefined,
          ollamaModelIds: signal === "ollama_model_manifest" ? ["llama3"] : undefined,
          embeddingModelIds: signal === "embedding_model_manifest" ? ["nomic-embed-text"] : undefined,
          evaluationEndpointIds: signal === "evaluation_endpoint_manifest"
            ? ["POST /evaluate", "POST /evaluate/<filename>"]
            : undefined,
          candidateRatingScale: signal === "candidate_rating_report" ? "0-10" : undefined,
          batchModeIds: signal === "batch_evaluation_manifest" ? ["automatic", "individual", "bulk"] : undefined,
          privacyBoundaryRefs: signal === "privacy_boundary" ? ["local-ollama", "resume-upload-boundary"] : undefined,
          dependencyLockIds: signal === "dependency_lock" ? ["requirements.txt"] : undefined,
          metricNames: signal === "candidate_rating_report"
            ? ["skill-match-rating", "evaluation-grounding", "parser-coverage"]
            : undefined,
          parserCoverage0to1: signal === "resume_parser_manifest" ? 0.92 : undefined,
          evaluationGrounding0to1: signal === "candidate_rating_report" ? 0.9 : undefined,
          owner: signal === "metric_owner" ? "AMC Resume RAG Evaluator Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 18 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 82,
                upper: 89,
                marginOfError: 3.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/punyaa18/ollama-resume-parser"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      resumeRagEvaluatorCoverage: 1,
      resumeRagEvaluatorSampleSize: 18,
      resumeRagEvaluatorMissingSignals: [],
      resumeRagEvaluatorParserCoverage0to1: 0.92,
      resumeRagEvaluatorEvaluationGrounding0to1: 0.9,
      resumeRagEvaluatorCandidateRatingScale: "0-10"
    });
    expect(report.rows[0]?.resumeRagEvaluatorRepositoryRefs).toEqual([
      "https://github.com/punyaa18/ollama-resume-parser/tree/ff77385b80edb2af9a835fcf77cf3444efaa4592"
    ]);
    expect(report.rows[0]?.resumeRagEvaluatorRagStrategyIds).toEqual(["similarity", "mmr", "hybrid"]);
    expect(report.rows[0]?.resumeRagEvaluatorOllamaModelIds).toEqual(["llama3"]);
    expect(report.rows[0]?.resumeRagEvaluatorEmbeddingModelIds).toEqual(["nomic-embed-text"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("resume RAG evaluator coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      resumeRagEvaluatorCoverage: 1,
      resumeRagEvaluatorSampleSize: 18,
      resumeRagEvaluatorMissingSignals: []
    });
    expect(report.evalPack.rows[0]?.resumeRagEvaluatorReportArtifactHashes.length).toBe(16);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when resume RAG evaluator proof is metadata-only or missing reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const incompleteSignals: MetricValidationResumeRagEvaluatorSignal[] = [
      "source_repository_reference",
      "resume_parser_manifest",
      "rag_strategy_manifest",
      "candidate_rating_report",
      "metric_owner"
    ];
    const evidenceIds = incompleteSignals.map((signal) => `resume-rag-incomplete-${signal}`);

    const report = buildMetricValidationReport(
      {
        agentId: "resume-rag-evaluator",
        runId: "run-resume-rag-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: [
          ...questionScores.map((row, index) => ({
            evidenceId: row.evidenceEventIds[0]!,
            eventHash: `${index}`.repeat(64).slice(0, 64),
            writerSig: `writer-sig-${index}`,
            eventType: "audit" as const,
            sessionId: `session-${index}`,
            ts: Date.UTC(2026, 5, 19),
            trustTier: "OBSERVED" as const
          }))
        ],
        requireResumeRagEvaluatorProof: true,
        resumeRagEvaluatorChecks: incompleteSignals.map((signal, index) => ({
          resumeRagSignalId: evidenceIds[index]!.replace("resume-rag-incomplete-", ""),
          resumeRagSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : `a${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/punyaa18/ollama-resume-parser"]
            : undefined,
          resumeInputFormats: signal === "resume_parser_manifest" ? ["pdf", "txt"] : undefined,
          parserCoverage0to1: signal === "resume_parser_manifest" ? 0.91 : undefined,
          ragStrategyIds: signal === "rag_strategy_manifest" ? ["similarity", "mmr", "hybrid"] : undefined,
          candidateRatingScale: signal === "candidate_rating_report" ? "0-10" : undefined,
          evaluationGrounding0to1: signal === "candidate_rating_report" ? 0.4 : undefined,
          owner: signal === "metric_owner" ? "AMC Resume RAG Evaluator Validity" : undefined
        })),
        sourceRefs: ["https://github.com/punyaa18/ollama-resume-parser"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      resumeRagEvaluatorSampleSize: 5
    });
    expect(report.rows[0]?.resumeRagEvaluatorCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.rows[0]?.resumeRagEvaluatorMissingSignals).toContain("license_boundary");
    expect(report.rows[0]?.resumeRagEvaluatorMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("resume RAG evaluator coverage");
    expect(report.evalPack.rows[0]?.resumeRagEvaluatorCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds ChipBenchmark hardware benchmark metric validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const chipSignals: MetricValidationChipBenchmarkSignal[] = [
      "source_repository_reference",
      "license_boundary",
      "benchmark_manifest",
      "hardware_profile_manifest",
      "model_family_manifest",
      "precision_mode_manifest",
      "environment_setup_script",
      "benchmark_runner_script",
      "serving_backend_script",
      "benchmark_result_dataset",
      "frontend_synced_dataset",
      "pricing_dataset",
      "throughput_metric",
      "latency_metric",
      "cost_metric",
      "regression_threshold",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const chipEvidenceIds = chipSignals.map((signal) => `chipbenchmark-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...chipEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `chipbenchmark-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `chipbenchmark-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "chipbenchmark-agent",
        runId: "run-chipbenchmark-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireChipBenchmarkProof: true,
        chipBenchmarkChecks: chipSignals.map((signal, index) => ({
          chipBenchmarkSignalId: chipEvidenceIds[index]!.replace("chipbenchmark-", ""),
          chipBenchmarkSignalType: signal,
          covered: true,
          evidenceRefs: [chipEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : `b${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/wafer-ai/chipbenchmark/tree/c6744a0fa6b083e73e305d7d931ed29ab8cd4b43"]
            : undefined,
          licenseRefs: signal === "license_boundary"
            ? ["GITHUB_API_LICENSE_NULL", "NO_LICENSE_FILE_AT_SNAPSHOT"]
            : undefined,
          benchmarkIds: signal === "benchmark_manifest" ? ["chipbenchmark-main-2025-07-19"] : undefined,
          hardwareProfileIds: signal === "hardware_profile_manifest" ? ["H100", "A100", "MI300X"] : undefined,
          modelFamilyIds: signal === "model_family_manifest" ? ["Llama-3.1", "Qwen2", "Qwen3"] : undefined,
          precisionModeIds: signal === "precision_mode_manifest" ? ["BF16", "FP8"] : undefined,
          environmentIds: signal === "environment_setup_script" ? ["init-env.sh"] : undefined,
          runnerScriptIds: signal === "benchmark_runner_script" ? ["bench.sh", "sync-benchmark-data.mjs"] : undefined,
          servingBackendIds: signal === "serving_backend_script" ? ["serve.sh"] : undefined,
          datasetIds: signal === "benchmark_result_dataset"
            ? ["benchmarks/data.json", "benchmarks/hardware.json"]
            : undefined,
          frontendDatasetIds: signal === "frontend_synced_dataset"
            ? ["frontend/public/data/benchmarks"]
            : undefined,
          pricingRefs: signal === "pricing_dataset" ? ["frontend/public/data/pricing/data.ts"] : undefined,
          metricNames: [
            "throughput_metric",
            "latency_metric",
            "cost_metric"
          ].includes(signal)
            ? ["tokens_per_second", "latency_ms", "cost_per_million_tokens"]
            : undefined,
          regressionThresholdIds: signal === "regression_threshold" ? ["chipbenchmark-ci-thresholds-v1"] : undefined,
          resultRowCount: signal === "benchmark_result_dataset" ? 18 : undefined,
          throughputCoverage0to1: signal === "throughput_metric" ? 0.92 : undefined,
          latencyCoverage0to1: signal === "latency_metric" ? 0.9 : undefined,
          costCoverage0to1: signal === "cost_metric" ? 0.88 : undefined,
          owner: signal === "metric_owner" ? "AMC ChipBenchmark Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 18 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 82,
                upper: 88,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/wafer-ai/chipbenchmark"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      chipBenchmarkCoverage: 1,
      chipBenchmarkSampleSize: 18,
      chipBenchmarkMissingSignals: [],
      chipBenchmarkResultRowCount: 18,
      chipBenchmarkThroughputCoverage0to1: 0.92,
      chipBenchmarkLatencyCoverage0to1: 0.9,
      chipBenchmarkCostCoverage0to1: 0.88
    });
    expect(report.rows[0]?.chipBenchmarkRepositoryRefs).toEqual([
      "https://github.com/wafer-ai/chipbenchmark/tree/c6744a0fa6b083e73e305d7d931ed29ab8cd4b43"
    ]);
    expect(report.rows[0]?.chipBenchmarkLicenseRefs).toEqual(["GITHUB_API_LICENSE_NULL", "NO_LICENSE_FILE_AT_SNAPSHOT"]);
    expect(report.rows[0]?.chipBenchmarkHardwareProfileIds).toEqual(["H100", "A100", "MI300X"]);
    expect(report.rows[0]?.chipBenchmarkModelFamilyIds).toEqual(["Llama-3.1", "Qwen2", "Qwen3"]);
    expect(report.rows[0]?.chipBenchmarkPrecisionModeIds).toEqual(["BF16", "FP8"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("ChipBenchmark coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      chipBenchmarkCoverage: 1,
      chipBenchmarkSampleSize: 18,
      chipBenchmarkMissingSignals: [],
      chipBenchmarkResultRowCount: 18
    });
    expect(report.evalPack.rows[0]?.chipBenchmarkReportArtifactHashes.length).toBe(16);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...chipEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/wafer-ai/chipbenchmark");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when ChipBenchmark proof is metadata-only or lacks reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const incompleteSignals: MetricValidationChipBenchmarkSignal[] = [
      "source_repository_reference",
      "benchmark_manifest",
      "hardware_profile_manifest",
      "throughput_metric",
      "metric_owner"
    ];
    const evidenceIds = incompleteSignals.map((signal) => `chipbenchmark-incomplete-${signal}`);

    const report = buildMetricValidationReport(
      {
        agentId: "chipbenchmark-agent",
        runId: "run-chipbenchmark-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: [
          ...questionScores.map((row, index) => ({
            evidenceId: row.evidenceEventIds[0]!,
            eventHash: `${index}`.repeat(64).slice(0, 64),
            writerSig: `writer-sig-${index}`,
            eventType: "audit" as const,
            sessionId: `session-${index}`,
            ts: Date.UTC(2026, 5, 19),
            trustTier: "OBSERVED" as const
          }))
        ],
        requireChipBenchmarkProof: true,
        chipBenchmarkChecks: incompleteSignals.map((signal, index) => ({
          chipBenchmarkSignalId: evidenceIds[index]!.replace("chipbenchmark-incomplete-", ""),
          chipBenchmarkSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : `c${index.toString(16)}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference"
            ? ["https://github.com/wafer-ai/chipbenchmark"]
            : undefined,
          benchmarkIds: signal === "benchmark_manifest" ? ["chipbenchmark-main-2025-07-19"] : undefined,
          hardwareProfileIds: signal === "hardware_profile_manifest" ? ["H100"] : undefined,
          metricNames: signal === "throughput_metric" ? ["tokens_per_second"] : undefined,
          throughputCoverage0to1: signal === "throughput_metric" ? 0.42 : undefined,
          owner: signal === "metric_owner" ? "AMC ChipBenchmark Validity" : undefined
        })),
        sourceRefs: ["https://github.com/wafer-ai/chipbenchmark"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      chipBenchmarkSampleSize: 5
    });
    expect(report.rows[0]?.chipBenchmarkCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("license_boundary");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("model_family_manifest");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("precision_mode_manifest");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("benchmark_result_dataset");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("pricing_dataset");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("latency_metric");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("cost_metric");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("regression_threshold");
    expect(report.rows[0]?.chipBenchmarkMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("ChipBenchmark coverage");
    expect(report.evalPack.rows[0]?.chipBenchmarkCoverage).toBeCloseTo(4 / 18, 6);
    expect(report.evalPack.rows[0]?.chipBenchmarkMissingSignals).toContain("frontend_synced_dataset");
    expect(report.evalPack.replayable).toBe(false);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds Agentest-style scenario testing proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const scenarioSignals: MetricValidationAgentScenarioTestSignal[] = [
      "benchmark_manifest",
      "source_repository_license",
      "agent_endpoint_contract",
      "scenario_manifest",
      "simulated_user_persona_manifest",
      "goal_knowledge_manifest",
      "tool_mock_manifest",
      "scripted_turn_manifest",
      "trajectory_assertion_manifest",
      "llm_judge_metric_manifest",
      "comparison_run_manifest",
      "ci_reporter_manifest",
      "result_artifact_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const scenarioEvidenceIds = scenarioSignals.map((signal) => `agent-scenario-test-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...scenarioEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `agent-scenario-test-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `agent-scenario-test-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "scenario-test-agent",
        runId: "run-agent-scenario-test-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireAgentScenarioTestProof: true,
        agentScenarioTestChecks: scenarioSignals.map((signal, index) => ({
          agentScenarioTestSignalId: scenarioEvidenceIds[index]!.replace("agent-scenario-test-", ""),
          agentScenarioTestSignalType: signal,
          covered: true,
          evidenceRefs: [scenarioEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["amc-agent-scenario-test-v1"] : undefined,
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/r-prem/agentest"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          agentIds: [
            "agent_endpoint_contract",
            "comparison_run_manifest"
          ].includes(signal)
            ? ["synthetic-support-agent"]
            : undefined,
          scenarioIds: signal === "scenario_manifest" ? ["booking-basic", "policy-followup"] : undefined,
          scenarioCount: signal === "scenario_manifest" ? 6 : undefined,
          personaIds: signal === "simulated_user_persona_manifest" ? ["persona-busy-operator"] : undefined,
          goalIds: signal === "goal_knowledge_manifest" ? ["complete-basic-research-task"] : undefined,
          knowledgeSetIds: signal === "goal_knowledge_manifest" ? ["support-policy-kb-v1"] : undefined,
          toolMockIds: signal === "tool_mock_manifest" ? ["search-tool-mock", "ticket-tool-mock"] : undefined,
          toolCallCount: signal === "tool_mock_manifest" ? 8 : undefined,
          turnCount: signal === "scripted_turn_manifest" ? 12 : undefined,
          trajectoryAssertionIds: signal === "trajectory_assertion_manifest" ? ["assert-goal-complete", "assert-no-unsafe-tool"] : undefined,
          judgeIds: signal === "llm_judge_metric_manifest" ? ["amc-judge-v1"] : undefined,
          metricNames: [
            "llm_judge_metric_manifest",
            "result_artifact_manifest"
          ].includes(signal)
            ? ["helpfulness", "coherence", "goal_completion"]
            : undefined,
          comparisonIds: signal === "comparison_run_manifest" ? ["candidate-vs-baseline-2026-06-15"] : undefined,
          reporterFormats: signal === "ci_reporter_manifest" ? ["json", "github_actions"] : undefined,
          owner: signal === "metric_owner" ? "AMC Scenario Test Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 15 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 86,
                upper: 92,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/r-prem/agentest"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      agentScenarioTestCoverage: 1,
      agentScenarioTestSampleSize: 15,
      agentScenarioTestMissingSignals: [],
      agentScenarioTestScenarioCount: 6,
      agentScenarioTestTurnCount: 12,
      agentScenarioTestToolCallCount: 8
    });
    expect(report.rows[0]?.agentScenarioTestBenchmarkIds).toEqual(["amc-agent-scenario-test-v1"]);
    expect(report.rows[0]?.agentScenarioTestRepositoryRefs).toEqual(["https://github.com/r-prem/agentest"]);
    expect(report.rows[0]?.agentScenarioTestLicenseRefs).toEqual(["MIT"]);
    expect(report.rows[0]?.agentScenarioTestPersonaIds).toEqual(["persona-busy-operator"]);
    expect(report.rows[0]?.agentScenarioTestToolMockIds).toEqual(["search-tool-mock", "ticket-tool-mock"]);
    expect(report.rows[0]?.agentScenarioTestJudgeIds).toEqual(["amc-judge-v1"]);
    expect(report.rows[0]?.agentScenarioTestReporterFormats).toEqual(["json", "github_actions"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("agent scenario-test coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      agentScenarioTestCoverage: 1,
      agentScenarioTestSampleSize: 15,
      agentScenarioTestMissingSignals: [],
      agentScenarioTestScenarioCount: 6,
      agentScenarioTestTurnCount: 12,
      agentScenarioTestToolCallCount: 8
    });
    expect(report.evalPack.rows[0]?.agentScenarioTestReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...scenarioEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/r-prem/agentest");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Agentest-style scenario testing proof lacks scenarios, mocks, trajectories, judge, CI, or result evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const scenarioSignals: MetricValidationAgentScenarioTestSignal[] = [
      "benchmark_manifest",
      "source_repository_license",
      "agent_endpoint_contract",
      "scenario_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const scenarioEvidenceIds = scenarioSignals.map((signal) => `agent-scenario-test-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...scenarioEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `agent-scenario-test-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `agent-scenario-test-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "scenario-test-agent",
        runId: "run-agent-scenario-test-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireAgentScenarioTestProof: true,
        agentScenarioTestChecks: scenarioSignals.map((signal, index) => ({
          agentScenarioTestSignalId: scenarioEvidenceIds[index]!.replace("agent-scenario-test-incomplete-", ""),
          agentScenarioTestSignalType: signal,
          covered: true,
          evidenceRefs: [scenarioEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" ? ["amc-agent-scenario-test-v1"] : undefined,
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/r-prem/agentest"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          agentIds: signal === "agent_endpoint_contract" ? ["synthetic-support-agent"] : undefined,
          scenarioIds: signal === "scenario_manifest" ? [] : undefined,
          scenarioCount: signal === "scenario_manifest" ? 2 : undefined,
          owner: signal === "metric_owner" ? "AMC Scenario Test Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 95,
                marginOfError: 27.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/r-prem/agentest"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      agentScenarioTestSampleSize: 6
    });
    expect(report.rows[0]?.agentScenarioTestCoverage).toBeCloseTo(4 / 15, 6);
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("scenario_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("tool_mock_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("trajectory_assertion_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("llm_judge_metric_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("comparison_run_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("ci_reporter_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("result_artifact_manifest");
    expect(report.rows[0]?.agentScenarioTestMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("agent scenario-test coverage");
    expect(report.evalPack.rows[0]?.agentScenarioTestCoverage).toBeCloseTo(4 / 15, 6);
    expect(report.evalPack.rows[0]?.agentScenarioTestMissingSignals).toContain("simulated_user_persona_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds OpenCode-lab-style reliability proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const openCodeSignals: MetricValidationOpenCodeLabSignal[] = [
      "source_repository_reference",
      "lab_benchmark_manifest",
      "agent_context_manifest",
      "prompt_variant_manifest",
      "tool_description_manifest",
      "agents_policy_manifest",
      "repeated_run_trace",
      "fork_agreement_report",
      "model_variance_report",
      "ground_truth_correction_manifest",
      "metric_definition_manifest",
      "ci_reporter_manifest",
      "result_artifact_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const openCodeEvidenceIds = openCodeSignals.map((signal) => `opencode-lab-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...openCodeEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `opencode-lab-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `opencode-lab-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "opencode-lab-agent",
        runId: "run-opencode-lab-validity",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.95
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireOpenCodeLabProof: true,
        openCodeLabChecks: openCodeSignals.map((signal, index) => ({
          openCodeLabSignalId: openCodeEvidenceIds[index]!.replace("opencode-lab-", ""),
          openCodeLabSignalType: signal,
          covered: true,
          evidenceRefs: [openCodeEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference" ? ["https://github.com/criterium/opencode-lab"] : undefined,
          benchmarkIds: signal === "lab_benchmark_manifest" ? ["amc-opencode-lab-validity-v1"] : undefined,
          agentContextIds: signal === "agent_context_manifest" ? ["agent-context-open-code-basic"] : undefined,
          promptVariantIds: signal === "prompt_variant_manifest" ? ["prompt-variant-basic-research-v1"] : undefined,
          toolDescriptionIds: signal === "tool_description_manifest" ? ["tool-descriptions-open-code-v1"] : undefined,
          policyIds: signal === "agents_policy_manifest" ? ["agents-policy-synthetic-basic-v1"] : undefined,
          runTraceIds: signal === "repeated_run_trace" ? ["trace-run-1", "trace-run-2", "trace-run-3"] : undefined,
          runCount: signal === "repeated_run_trace" ? 8 : undefined,
          forkIds: signal === "fork_agreement_report" ? ["fork-a", "fork-b", "fork-c"] : undefined,
          forkAgreement0to1: signal === "fork_agreement_report" ? 0.96 : undefined,
          minForkAgreement0to1: signal === "fork_agreement_report" ? 0.9 : undefined,
          modelIds: signal === "model_variance_report" ? ["model-a", "model-b", "model-c"] : undefined,
          modelVariance0to1: signal === "model_variance_report" ? 0.04 : undefined,
          maxModelVariance0to1: signal === "model_variance_report" ? 0.1 : undefined,
          groundTruthIds: signal === "ground_truth_correction_manifest" ? ["ground-truth-corrections-basic-v1"] : undefined,
          metricNames: [
            "metric_definition_manifest",
            "result_artifact_manifest"
          ].includes(signal)
            ? ["task_completion", "tool_accuracy", "context_adherence"]
            : undefined,
          reporterFormats: signal === "ci_reporter_manifest" ? ["json", "github_actions"] : undefined,
          resultArtifactIds: signal === "result_artifact_manifest" ? ["opencode-lab-results-2026-06-17"] : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 15 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 88,
                upper: 94,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/criterium/opencode-lab"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      openCodeLabCoverage: 1,
      openCodeLabSampleSize: 15,
      openCodeLabMissingSignals: [],
      openCodeLabRunCount: 8,
      openCodeLabForkAgreement0to1: 0.96,
      openCodeLabModelVariance0to1: 0.04
    });
    expect(report.rows[0]?.openCodeLabBenchmarkIds).toEqual(["amc-opencode-lab-validity-v1"]);
    expect(report.rows[0]?.openCodeLabRepositoryRefs).toEqual(["https://github.com/criterium/opencode-lab"]);
    expect(report.rows[0]?.openCodeLabAgentContextIds).toEqual(["agent-context-open-code-basic"]);
    expect(report.rows[0]?.openCodeLabPromptVariantIds).toEqual(["prompt-variant-basic-research-v1"]);
    expect(report.rows[0]?.openCodeLabToolDescriptionIds).toEqual(["tool-descriptions-open-code-v1"]);
    expect(report.rows[0]?.openCodeLabPolicyIds).toEqual(["agents-policy-synthetic-basic-v1"]);
    expect(report.rows[0]?.openCodeLabRunTraceIds).toEqual(["trace-run-1", "trace-run-2", "trace-run-3"]);
    expect(report.rows[0]?.openCodeLabGroundTruthIds).toEqual(["ground-truth-corrections-basic-v1"]);
    expect(report.rows[0]?.openCodeLabMetricNames).toEqual(["task_completion", "tool_accuracy", "context_adherence"]);
    expect(report.rows[0]?.openCodeLabReporterFormats).toEqual(["json", "github_actions"]);
    expect(report.rows[0]?.openCodeLabResultArtifactIds).toEqual(["opencode-lab-results-2026-06-17"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("opencode-lab coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      openCodeLabCoverage: 1,
      openCodeLabSampleSize: 15,
      openCodeLabMissingSignals: [],
      openCodeLabRunCount: 8,
      openCodeLabForkAgreement0to1: 0.96,
      openCodeLabModelVariance0to1: 0.04
    });
    expect(report.evalPack.rows[0]?.openCodeLabReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...openCodeEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/criterium/opencode-lab");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when OpenCode-lab-style metric validity lacks determinism, agreement, variance, owner, CI, or artifact proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const openCodeSignals: MetricValidationOpenCodeLabSignal[] = [
      "source_repository_reference",
      "lab_benchmark_manifest",
      "repeated_run_trace",
      "fork_agreement_report",
      "model_variance_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const openCodeEvidenceIds = openCodeSignals.map((signal) => `opencode-lab-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...openCodeEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `opencode-lab-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `opencode-lab-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "opencode-lab-agent",
        runId: "run-opencode-lab-incomplete",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.95
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireOpenCodeLabProof: true,
        openCodeLabChecks: openCodeSignals.map((signal, index) => ({
          openCodeLabSignalId: openCodeEvidenceIds[index]!.replace("opencode-lab-incomplete-", ""),
          openCodeLabSignalType: signal,
          covered: true,
          evidenceRefs: [openCodeEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_reference" ? ["https://github.com/criterium/opencode-lab"] : undefined,
          benchmarkIds: signal === "lab_benchmark_manifest" ? ["amc-opencode-lab-validity-v1"] : undefined,
          runTraceIds: signal === "repeated_run_trace" ? ["trace-run-1"] : undefined,
          runCount: signal === "repeated_run_trace" ? 2 : undefined,
          forkIds: signal === "fork_agreement_report" ? ["fork-a", "fork-b"] : undefined,
          forkAgreement0to1: signal === "fork_agreement_report" ? 0.6 : undefined,
          minForkAgreement0to1: signal === "fork_agreement_report" ? 0.9 : undefined,
          modelIds: signal === "model_variance_report" ? ["model-a", "model-b"] : undefined,
          modelVariance0to1: signal === "model_variance_report" ? 0.4 : undefined,
          maxModelVariance0to1: signal === "model_variance_report" ? 0.1 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 95,
                marginOfError: 27.5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/criterium/opencode-lab"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      openCodeLabSampleSize: 7
    });
    expect(report.rows[0]?.openCodeLabCoverage).toBeCloseTo(2 / 15, 6);
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("agent_context_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("prompt_variant_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("tool_description_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("agents_policy_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("repeated_run_trace");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("fork_agreement_report");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("model_variance_report");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("ground_truth_correction_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("metric_definition_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("ci_reporter_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("result_artifact_manifest");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.openCodeLabMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("opencode-lab coverage");
    expect(report.evalPack.rows[0]?.openCodeLabCoverage).toBeCloseTo(2 / 15, 6);
    expect(report.evalPack.rows[0]?.openCodeLabMissingSignals).toContain("repeated_run_trace");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds cc-plugin-eval-style component trigger reliability proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ccSignals: MetricValidationCcPluginEvalSignal[] = [
      "source_repository_license",
      "plugin_manifest",
      "component_inventory",
      "trigger_phrase_manifest",
      "scenario_generation_manifest",
      "scenario_type_coverage",
      "execution_transcript_bundle",
      "programmatic_detection_report",
      "llm_judge_calibration",
      "conflict_detection_report",
      "checkpoint_resume_state",
      "cost_estimate_report",
      "ci_reporter_manifest",
      "result_artifact_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const componentTypes: MetricValidationCcPluginEvalComponentType[] = ["skill", "agent", "command", "hook", "mcp_server"];
    const scenarioTypes: MetricValidationCcPluginEvalScenarioType[] = ["direct", "paraphrased", "edge_case", "negative", "semantic"];
    const detectionModes: MetricValidationCcPluginEvalDetectionMode[] = ["programmatic_first"];
    const ccEvidenceIds = ccSignals.map((signal) => `cc-plugin-eval-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...ccEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `cc-plugin-eval-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `cc-plugin-eval-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "cc-plugin-eval-agent",
        runId: "run-cc-plugin-eval-validity",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.96
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireCcPluginEvalProof: true,
        ccPluginEvalChecks: ccSignals.map((signal, index) => ({
          ccPluginEvalSignalId: ccEvidenceIds[index]!.replace("cc-plugin-eval-", ""),
          ccPluginEvalSignalType: signal,
          covered: true,
          evidenceRefs: [ccEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/sjnims/cc-plugin-eval"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          pluginManifestIds: signal === "plugin_manifest" ? ["amc-cc-plugin-fixture-manifest-v1"] : undefined,
          componentTypes: signal === "component_inventory" ? componentTypes : undefined,
          componentCount: signal === "component_inventory" ? 5 : undefined,
          triggerManifestIds: signal === "trigger_phrase_manifest" ? ["trigger-phrase-manifest-v1"] : undefined,
          scenarioManifestIds: [
            "scenario_generation_manifest",
            "scenario_type_coverage"
          ].includes(signal)
            ? ["scenario-generation-manifest-v1"]
            : undefined,
          scenarioTypes: signal === "scenario_type_coverage" ? scenarioTypes : undefined,
          scenarioCount: [
            "scenario_type_coverage",
            "execution_transcript_bundle"
          ].includes(signal)
            ? 20
            : undefined,
          transcriptIds: signal === "execution_transcript_bundle" ? ["transcript-bundle-2026-06-17"] : undefined,
          detectionReportIds: signal === "programmatic_detection_report" ? ["programmatic-detection-report-v1"] : undefined,
          detectionModes: signal === "programmatic_detection_report" ? detectionModes : undefined,
          triggerAccuracy0to1: signal === "programmatic_detection_report" ? 0.94 : undefined,
          falsePositiveRate0to1: signal === "programmatic_detection_report" ? 0.02 : undefined,
          falseNegativeRate0to1: signal === "programmatic_detection_report" ? 0.04 : undefined,
          judgeIds: signal === "llm_judge_calibration" ? ["trigger-accuracy-judge-v1"] : undefined,
          calibrationIds: signal === "llm_judge_calibration" ? ["human-label-calibration-v1"] : undefined,
          conflictReportIds: signal === "conflict_detection_report" ? ["conflict-detection-report-v1"] : undefined,
          checkpointStateIds: signal === "checkpoint_resume_state" ? ["resume-state-run-cc-plugin-eval-validity"] : undefined,
          costEstimateIds: signal === "cost_estimate_report" ? ["cost-estimate-run-cc-plugin-eval-validity"] : undefined,
          reporterFormats: signal === "ci_reporter_manifest" ? ["json", "junit_xml", "github_actions"] : undefined,
          resultArtifactIds: signal === "result_artifact_manifest" ? ["cc-plugin-eval-results-2026-06-17"] : undefined,
          metricNames: signal === "result_artifact_manifest"
            ? ["trigger_accuracy", "false_positive_rate", "false_negative_rate"]
            : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 20 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 90,
                upper: 96,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/sjnims/cc-plugin-eval"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ccPluginEvalCoverage: 1,
      ccPluginEvalSampleSize: 16,
      ccPluginEvalMissingSignals: [],
      ccPluginEvalTriggerAccuracy0to1: 0.94,
      ccPluginEvalFalsePositiveRate0to1: 0.02,
      ccPluginEvalFalseNegativeRate0to1: 0.04,
      ccPluginEvalComponentCount: 5,
      ccPluginEvalScenarioCount: 20
    });
    expect(report.rows[0]?.ccPluginEvalRepositoryRefs).toEqual(["https://github.com/sjnims/cc-plugin-eval"]);
    expect(report.rows[0]?.ccPluginEvalLicenseRefs).toEqual(["MIT"]);
    expect(report.rows[0]?.ccPluginEvalComponentTypes).toEqual(componentTypes);
    expect(report.rows[0]?.ccPluginEvalScenarioTypes).toEqual(scenarioTypes);
    expect(report.rows[0]?.ccPluginEvalDetectionModes).toEqual(detectionModes);
    expect(report.rows[0]?.ccPluginEvalMetricNames).toEqual(["trigger_accuracy", "false_positive_rate", "false_negative_rate"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("cc-plugin-eval coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      ccPluginEvalCoverage: 1,
      ccPluginEvalSampleSize: 16,
      ccPluginEvalMissingSignals: [],
      ccPluginEvalTriggerAccuracy0to1: 0.94
    });
    expect(report.evalPack.rows[0]?.ccPluginEvalReportArtifactHashes.length).toBe(14);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...ccEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/sjnims/cc-plugin-eval");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when cc-plugin-eval-style proof lacks component coverage, reliable detection, owner, CI, or artifacts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ccSignals: MetricValidationCcPluginEvalSignal[] = [
      "source_repository_license",
      "plugin_manifest",
      "component_inventory",
      "programmatic_detection_report",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const ccEvidenceIds = ccSignals.map((signal) => `cc-plugin-eval-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...ccEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `cc-plugin-eval-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `cc-plugin-eval-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "cc-plugin-eval-agent",
        runId: "run-cc-plugin-eval-incomplete",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.96
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireCcPluginEvalProof: true,
        ccPluginEvalChecks: ccSignals.map((signal, index) => ({
          ccPluginEvalSignalId: ccEvidenceIds[index]!.replace("cc-plugin-eval-incomplete-", ""),
          ccPluginEvalSignalType: signal,
          covered: true,
          evidenceRefs: [ccEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/sjnims/cc-plugin-eval"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          pluginManifestIds: signal === "plugin_manifest" ? ["amc-cc-plugin-fixture-manifest-v1"] : undefined,
          componentTypes: signal === "component_inventory" ? ["skill"] : undefined,
          componentCount: signal === "component_inventory" ? 1 : undefined,
          detectionReportIds: signal === "programmatic_detection_report" ? ["programmatic-detection-report-v1"] : undefined,
          detectionModes: signal === "programmatic_detection_report" ? ["llm_only"] : undefined,
          triggerAccuracy0to1: signal === "programmatic_detection_report" ? 0.62 : undefined,
          falsePositiveRate0to1: signal === "programmatic_detection_report" ? 0.25 : undefined,
          falseNegativeRate0to1: signal === "programmatic_detection_report" ? 0.22 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 40,
                upper: 92,
                marginOfError: 26
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/sjnims/cc-plugin-eval"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ccPluginEvalSampleSize: 6
    });
    expect(report.rows[0]?.ccPluginEvalCoverage).toBeCloseTo(2 / 16, 6);
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("component_inventory");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("trigger_phrase_manifest");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("scenario_generation_manifest");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("scenario_type_coverage");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("execution_transcript_bundle");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("programmatic_detection_report");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("llm_judge_calibration");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("conflict_detection_report");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("checkpoint_resume_state");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("cost_estimate_report");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("ci_reporter_manifest");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("result_artifact_manifest");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.ccPluginEvalMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("cc-plugin-eval coverage");
    expect(report.evalPack.rows[0]?.ccPluginEvalCoverage).toBeCloseTo(2 / 16, 6);
    expect(report.evalPack.rows[0]?.ccPluginEvalMissingSignals).toContain("programmatic_detection_report");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates Realign-style simulation metric validity with config, scenarios, judges, statistics, CI, and result proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const realignSignals: MetricValidationRealignSimulationSignal[] = [
      "source_repository_license",
      "yaml_config_manifest",
      "app_under_test_manifest",
      "dataset_manifest",
      "scenario_manifest",
      "synthetic_user_persona_manifest",
      "evaluator_registry_manifest",
      "evaluator_target_manifest",
      "simulation_run_trace",
      "repeated_run_trace",
      "judge_calibration_report",
      "statistical_rigor_report",
      "ci_regression_manifest",
      "experiment_tracking_manifest",
      "result_artifact_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const realignEvidenceIds = realignSignals.map((signal) => `realign-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...realignEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `realign-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `realign-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "realign-agent",
        runId: "run-realign-validity",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.96
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRealignSimulationProof: true,
        realignSimulationChecks: realignSignals.map((signal, index) => ({
          realignSimulationSignalId: realignEvidenceIds[index]!.replace("realign-", ""),
          realignSimulationSignalType: signal,
          covered: true,
          evidenceRefs: [realignEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/honeyhiveai/realign"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          configIds: signal === "yaml_config_manifest" ? ["realign-amc-simulation-config-v1"] : undefined,
          appIds: signal === "app_under_test_manifest" ? ["amc-agent-under-test-v1"] : undefined,
          datasetIds: signal === "dataset_manifest" ? ["realign-fixture-dataset-v1"] : undefined,
          scenarioIds: signal === "scenario_manifest" ? ["scenario-set-realign-v1"] : undefined,
          scenarioCount: ["scenario_manifest", "simulation_run_trace"].includes(signal) ? 24 : undefined,
          personaIds: signal === "synthetic_user_persona_manifest" ? ["synthetic-user-persona-set-v1"] : undefined,
          evaluatorIds: signal === "evaluator_registry_manifest" ? ["deterministic-checker", "llm-rating-judge", "pairwise-judge"] : undefined,
          evaluatorCount: signal === "evaluator_registry_manifest" ? 3 : undefined,
          targetIds: signal === "evaluator_target_manifest" ? ["target-range-quality-v1"] : undefined,
          metricNames: ["evaluator_target_manifest", "result_artifact_manifest"].includes(signal)
            ? ["scenario_pass_rate", "judge_agreement", "regression_pass_rate"]
            : undefined,
          runTraceIds: signal === "simulation_run_trace" ? ["simulation-run-trace-2026-06-17"] : undefined,
          repeatedRunTraceIds: signal === "repeated_run_trace" ? ["repeat-trace-a", "repeat-trace-b", "repeat-trace-c"] : undefined,
          repeatCount: signal === "repeated_run_trace" ? 3 : undefined,
          judgeIds: signal === "judge_calibration_report" ? ["llm-quality-judge-v1"] : undefined,
          calibrationIds: signal === "judge_calibration_report" ? ["human-calibration-v1"] : undefined,
          judgeAgreement0to1: signal === "judge_calibration_report" ? 0.91 : undefined,
          statisticsReportIds: signal === "statistical_rigor_report" ? ["hypothesis-sweep-report-v1"] : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["realign-ci-gate-v1"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.96 : undefined,
          experimentIds: signal === "experiment_tracking_manifest" ? ["honeyhive-experiment-run-v1"] : undefined,
          resultArtifactIds: signal === "result_artifact_manifest" ? ["realign-simulation-results-2026-06-17"] : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 24 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 91,
                upper: 97,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/honeyhiveai/realign"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      realignSimulationCoverage: 1,
      realignSimulationSampleSize: 17,
      realignSimulationMissingSignals: [],
      realignSimulationJudgeAgreement0to1: 0.91,
      realignSimulationRegressionPassRate0to1: 0.96,
      realignSimulationScenarioCount: 24,
      realignSimulationEvaluatorCount: 3,
      realignSimulationRepeatCount: 3
    });
    expect(report.rows[0]?.realignSimulationRepositoryRefs).toEqual(["https://github.com/honeyhiveai/realign"]);
    expect(report.rows[0]?.realignSimulationConfigIds).toEqual(["realign-amc-simulation-config-v1"]);
    expect(report.rows[0]?.realignSimulationMetricNames).toEqual(["scenario_pass_rate", "judge_agreement", "regression_pass_rate"]);
    expect(report.rows[0]?.warnings.join(" ")).not.toContain("realign simulation coverage");
    expect(report.evalPack.rows[0]).toMatchObject({
      realignSimulationCoverage: 1,
      realignSimulationMissingSignals: [],
      realignSimulationJudgeAgreement0to1: 0.91,
      realignSimulationRegressionPassRate0to1: 0.96
    });
    expect(report.evalPack.rows[0]?.realignSimulationReportArtifactHashes.length).toBe(15);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...realignEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/honeyhiveai/realign");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Realign-style simulation proof lacks scenario, judge, statistics, CI, owner, or sample evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const realignSignals: MetricValidationRealignSimulationSignal[] = [
      "source_repository_license",
      "yaml_config_manifest",
      "scenario_manifest",
      "evaluator_registry_manifest",
      "judge_calibration_report",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const realignEvidenceIds = realignSignals.map((signal) => `realign-incomplete-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED" as const
      })),
      ...realignEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `realign-incomplete-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `realign-incomplete-session-${index}`,
        ts: Date.UTC(2026, 5, 17),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "realign-agent",
        runId: "run-realign-incomplete",
        ts: Date.UTC(2026, 5, 17),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.96
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRealignSimulationProof: true,
        realignSimulationChecks: realignSignals.map((signal, index) => ({
          realignSimulationSignalId: realignEvidenceIds[index]!.replace("realign-incomplete-", ""),
          realignSimulationSignalType: signal,
          covered: true,
          evidenceRefs: [realignEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 1).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/honeyhiveai/realign"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          configIds: signal === "yaml_config_manifest" ? ["realign-amc-simulation-config-v1"] : undefined,
          scenarioIds: signal === "scenario_manifest" ? ["too-small-scenario-set"] : undefined,
          scenarioCount: signal === "scenario_manifest" ? 2 : undefined,
          evaluatorIds: signal === "evaluator_registry_manifest" ? ["single-evaluator"] : undefined,
          evaluatorCount: signal === "evaluator_registry_manifest" ? 1 : undefined,
          judgeIds: signal === "judge_calibration_report" ? ["llm-quality-judge-v1"] : undefined,
          calibrationIds: signal === "judge_calibration_report" ? ["human-calibration-v1"] : undefined,
          judgeAgreement0to1: signal === "judge_calibration_report" ? 0.62 : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["realign-ci-gate-v1"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.72 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 35,
                upper: 91,
                marginOfError: 28
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/honeyhiveai/realign"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      realignSimulationSampleSize: 8
    });
    expect(report.rows[0]?.realignSimulationCoverage).toBeCloseTo(2 / 17, 6);
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("app_under_test_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("dataset_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("scenario_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("synthetic_user_persona_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("evaluator_registry_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("simulation_run_trace");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("repeated_run_trace");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("judge_calibration_report");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("statistical_rigor_report");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("result_artifact_manifest");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.realignSimulationMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("realign simulation coverage");
    expect(report.evalPack.rows[0]?.realignSimulationCoverage).toBeCloseTo(2 / 17, 6);
    expect(report.evalPack.rows[0]?.realignSimulationMissingSignals).toContain("judge_calibration_report");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds AcademiClaw academic-task validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const academiSignals: MetricValidationAcademiClawSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_citation_manifest",
      "task_corpus_manifest",
      "bilingual_task_manifest",
      "workspace_query_manifest",
      "docker_environment_manifest",
      "evaluation_rubric_manifest",
      "eval_task_runner_manifest",
      "openclaw_result_manifest",
      "conversation_trace_manifest",
      "meta_eval_manifest",
      "model_roster_manifest",
      "metric_definition_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const academiEvidenceIds = academiSignals.map((signal) => `academiclaw-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...academiEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `academiclaw-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `academiclaw-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "academic-task-agent",
        runId: "run-academiclaw-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireAcademiClawProof: true,
        academiClawChecks: academiSignals.map((signal, index) => ({
          academiClawSignalId: academiEvidenceIds[index]!.replace("academiclaw-", ""),
          academiClawSignalType: signal,
          covered: true,
          evidenceRefs: [academiEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 60).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/GAIR-NLP/AcademiClaw"]
            : undefined,
          licenseRefs: signal === "source_repository_license"
            ? ["NOASSERTION", "LICENSE@428c0bb8ddb17397d671ca1ee56e1fc7af3749f6"]
            : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["037659120e0f2e7d3b7b35ce4c2d31850e4794c2"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["037659120e0f2e7d3b7b35ce4c2d31850e4794c2", "academiclaw@7f01c15c53013d4904b4d56001b7b29e86c2354f"]
            : undefined,
          readmeBlobRefs: signal === "readme_citation_manifest"
            ? ["README.md@78c3b4f40d941f3c8478563b8a93a3dc47bf5135"]
            : undefined,
          citationRefs: signal === "readme_citation_manifest"
            ? ["CITATION.cff@dc8bf840d9d91265685faaa459306ad849515fb4"]
            : undefined,
          taskCorpusRefs: signal === "task_corpus_manifest"
            ? ["academiclaw@7f01c15c53013d4904b4d56001b7b29e86c2354f", "QUERY_CATALOG.md@b7ffea4655f48523ca0b4f1312b0b647882f4525"]
            : undefined,
          taskCount: [
            "task_corpus_manifest",
            "workspace_query_manifest",
            "docker_environment_manifest",
            "evaluation_rubric_manifest",
            "eval_task_runner_manifest"
          ].includes(signal) ? 80 : undefined,
          languageIds: signal === "bilingual_task_manifest" ? ["en", "zh"] : undefined,
          languageCount: signal === "bilingual_task_manifest" ? 2 : undefined,
          workspaceQueryIds: signal === "workspace_query_manifest" ? ["workspace/query.md@80"] : undefined,
          dockerImageIds: signal === "docker_environment_manifest" ? ["Dockerfile@80", "build_all_images.sh@40537b879137576cafa378f68db8b105bacb1db7"] : undefined,
          rubricIds: signal === "evaluation_rubric_manifest" ? ["eval/rubric.py@80"] : undefined,
          rubricCount: signal === "evaluation_rubric_manifest" ? 80 : undefined,
          evalTaskRunnerIds: signal === "eval_task_runner_manifest"
            ? ["eval_task.py@61f33bfe6594a60a02b0172f0291e7e8a4b6e3a8"]
            : undefined,
          resultManifestIds: signal === "openclaw_result_manifest" ? ["openclaw-results@80-tasks"] : undefined,
          conversationTraceIds: signal === "conversation_trace_manifest" ? ["conversation_log.json@480"] : undefined,
          traceCount: signal === "conversation_trace_manifest" ? 480 : undefined,
          metaEvalIds: signal === "meta_eval_manifest" ? ["meta_eval.json@481"] : undefined,
          metaEvalCount: signal === "meta_eval_manifest" ? 481 : undefined,
          modelIds: signal === "model_roster_manifest"
            ? ["MiniMax-M2.7", "Qwen3.5-397B-A17B", "claude-opus-4-6", "claude-sonnet-4-6", "gemini-3.1-pro-preview", "gpt-5.4"]
            : undefined,
          modelCount: signal === "model_roster_manifest" ? 6 : undefined,
          metricNames: ["metric_definition_manifest", "openclaw_result_manifest"].includes(signal)
            ? ["task_success", "rubric_score", "meta_eval_score"]
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["academiclaw-metric-ci-2026-06-19"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.96 : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 80 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 83,
                upper: 89,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/GAIR-NLP/AcademiClaw"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      academiClawCoverage: 1,
      academiClawSampleSize: 17,
      academiClawMissingSignals: [],
      academiClawTaskCount: 80,
      academiClawLanguageCount: 2,
      academiClawRubricCount: 80,
      academiClawTraceCount: 480,
      academiClawMetaEvalCount: 481,
      academiClawModelCount: 6,
      academiClawRegressionPassRate0to1: 0.96
    });
    expect(report.rows[0]?.academiClawRepositoryRefs).toEqual(["https://github.com/GAIR-NLP/AcademiClaw"]);
    expect(report.rows[0]?.academiClawCommitRefs).toEqual(["037659120e0f2e7d3b7b35ce4c2d31850e4794c2"]);
    expect(report.rows[0]?.academiClawTaskCorpusRefs).toContain("academiclaw@7f01c15c53013d4904b4d56001b7b29e86c2354f");
    expect(report.rows[0]?.academiClawMetricNames).toEqual(["task_success", "rubric_score", "meta_eval_score"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      academiClawCoverage: 1,
      academiClawMissingSignals: [],
      academiClawRegressionPassRate0to1: 0.96
    });
    expect(report.evalPack.rows[0]?.academiClawReportArtifactHashes.length).toBe(15);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...academiEvidenceIds
    ]);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/GAIR-NLP/AcademiClaw");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when AcademiClaw proof lacks bilingual tasks, rubrics, traces, meta evals, CI, or owner evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const academiSignals: MetricValidationAcademiClawSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_citation_manifest",
      "task_corpus_manifest",
      "workspace_query_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const academiEvidenceIds = academiSignals.map((signal) => `academiclaw-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...academiEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `academiclaw-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `academiclaw-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "academic-task-agent",
        runId: "run-academiclaw-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireAcademiClawProof: true,
        academiClawChecks: academiSignals.map((signal, index) => ({
          academiClawSignalId: academiEvidenceIds[index]!.replace("academiclaw-missing-", ""),
          academiClawSignalType: signal,
          covered: true,
          evidenceRefs: [academiEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 90).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/GAIR-NLP/AcademiClaw"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["NOASSERTION"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot" ? ["037659120e0f2e7d3b7b35ce4c2d31850e4794c2"] : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["academiclaw@7f01c15c53013d4904b4d56001b7b29e86c2354f"] : undefined,
          readmeBlobRefs: signal === "readme_citation_manifest" ? ["README.md@78c3b4f40d941f3c8478563b8a93a3dc47bf5135"] : undefined,
          citationRefs: signal === "readme_citation_manifest" ? ["CITATION.cff"] : undefined,
          taskCorpusRefs: signal === "task_corpus_manifest" ? ["academiclaw@7f01c15c53013d4904b4d56001b7b29e86c2354f"] : undefined,
          taskCount: ["task_corpus_manifest", "workspace_query_manifest"].includes(signal) ? 3 : undefined,
          workspaceQueryIds: signal === "workspace_query_manifest" ? ["workspace/query.md@3"] : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["academiclaw-metric-ci-weak"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.6 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 35,
                upper: 95,
                marginOfError: 30
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/GAIR-NLP/AcademiClaw"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      academiClawSampleSize: 8
    });
    expect(report.rows[0]?.academiClawCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.rows[0]?.academiClawMissingSignals).toContain("bilingual_task_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("docker_environment_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("evaluation_rubric_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("conversation_trace_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("meta_eval_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.academiClawMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("AcademiClaw coverage");
    expect(report.evalPack.rows[0]?.academiClawCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.evalPack.rows[0]?.academiClawMissingSignals).toContain("evaluation_rubric_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds IBM RAG chunking technique validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragChunkingSignals: MetricValidationRagChunkingTechniqueSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "policy_corpus_manifest",
      "simple_rag_notebook_manifest",
      "smart_chunking_notebook_manifest",
      "rag_evaluation_notebook_manifest",
      "chunking_strategy_manifest",
      "retrieval_pipeline_manifest",
      "embedding_vectorstore_manifest",
      "evaluation_dataset_manifest",
      "metric_definition_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const ragChunkingEvidenceIds = ragChunkingSignals.map((signal) => `rag-chunking-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...ragChunkingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `rag-chunking-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `rag-chunking-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "rag-chunking-agent",
        runId: "run-rag-chunking-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagChunkingTechniqueProof: true,
        ragChunkingTechniqueChecks: ragChunkingSignals.map((signal, index) => ({
          ragChunkingTechniqueSignalId: ragChunkingEvidenceIds[index]!.replace("rag-chunking-", ""),
          ragChunkingTechniqueSignalType: signal,
          covered: true,
          evidenceRefs: [ragChunkingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 120).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/IBM/rag-chunking-techniques"]
            : undefined,
          licenseRefs: signal === "source_repository_license"
            ? ["Apache-2.0", "LICENSE@261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64"]
            : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["b3eec36d6c36e829ebbe60b7a280386ff85f69d0"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["b3eec36d6c36e829ebbe60b7a280386ff85f69d0", "data@bf787fdbb73948fa3f29746e5c43d1e88586b3d6"]
            : undefined,
          readmeBlobRefs: signal === "readme_manifest"
            ? ["README.md@0930ceeea0e92d8f1266b5f3e4746766da2e1826"]
            : undefined,
          policyCorpusRefs: signal === "policy_corpus_manifest"
            ? ["data@bf787fdbb73948fa3f29746e5c43d1e88586b3d6"]
            : undefined,
          policyDocumentCount: ["policy_corpus_manifest", "evaluation_dataset_manifest"].includes(signal) ? 7 : undefined,
          notebookIds: signal.endsWith("_notebook_manifest")
            ? [`${signal}@IBM/rag-chunking-techniques`]
            : undefined,
          notebookCount: signal.endsWith("_notebook_manifest") ? 3 : undefined,
          chunkingStrategyIds: signal === "chunking_strategy_manifest"
            ? ["baseline-fixed-policy-chunks", "smart-policy-chunks"]
            : undefined,
          chunkingStrategyCount: signal === "chunking_strategy_manifest" ? 2 : undefined,
          retrievalPipelineIds: signal === "retrieval_pipeline_manifest" ? ["policy-rag-pipeline@main"] : undefined,
          embeddingVectorstoreIds: signal === "embedding_vectorstore_manifest" ? ["policy-vector-index@main"] : undefined,
          evaluationDatasetIds: signal === "evaluation_dataset_manifest" ? ["company-policy-eval@data-tree"] : undefined,
          evaluationQuestionCount: signal === "evaluation_dataset_manifest" ? 12 : undefined,
          metricNames: signal === "metric_definition_manifest"
            ? ["answer_correctness", "retrieval_relevance"]
            : undefined,
          metricCount: signal === "metric_definition_manifest" ? 2 : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["rag-chunking-metric-ci-2026-06-19"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.95 : undefined,
          owner: signal === "metric_owner" ? "AMC RAG Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 12 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 82,
                upper: 88,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/IBM/rag-chunking-techniques"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ragChunkingTechniqueCoverage: 1,
      ragChunkingTechniqueSampleSize: 15,
      ragChunkingTechniqueMissingSignals: [],
      ragChunkingTechniquePolicyDocumentCount: 7,
      ragChunkingTechniqueNotebookCount: 3,
      ragChunkingTechniqueChunkingStrategyCount: 2,
      ragChunkingTechniqueEvaluationQuestionCount: 12,
      ragChunkingTechniqueMetricCount: 2,
      ragChunkingTechniqueRegressionPassRate0to1: 0.95
    });
    expect(report.rows[0]?.ragChunkingTechniqueRepositoryRefs).toEqual(["https://github.com/IBM/rag-chunking-techniques"]);
    expect(report.rows[0]?.ragChunkingTechniqueCommitRefs).toEqual(["b3eec36d6c36e829ebbe60b7a280386ff85f69d0"]);
    expect(report.rows[0]?.ragChunkingTechniquePolicyCorpusRefs).toContain("data@bf787fdbb73948fa3f29746e5c43d1e88586b3d6");
    expect(report.rows[0]?.ragChunkingTechniqueMetricNames).toEqual(["answer_correctness", "retrieval_relevance"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      ragChunkingTechniqueCoverage: 1,
      ragChunkingTechniqueMissingSignals: [],
      ragChunkingTechniqueRegressionPassRate0to1: 0.95
    });
    expect(report.evalPack.rows[0]?.ragChunkingTechniqueReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/IBM/rag-chunking-techniques");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when IBM RAG chunking proof lacks notebook, chunking, dataset, CI, owner, or interval evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ragChunkingSignals: MetricValidationRagChunkingTechniqueSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "policy_corpus_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const ragChunkingEvidenceIds = ragChunkingSignals.map((signal) => `rag-chunking-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...ragChunkingEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `rag-chunking-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `rag-chunking-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "rag-chunking-agent",
        runId: "run-rag-chunking-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRagChunkingTechniqueProof: true,
        ragChunkingTechniqueChecks: ragChunkingSignals.map((signal, index) => ({
          ragChunkingTechniqueSignalId: ragChunkingEvidenceIds[index]!.replace("rag-chunking-missing-", ""),
          ragChunkingTechniqueSignalType: signal,
          covered: true,
          evidenceRefs: [ragChunkingEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 150).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/IBM/rag-chunking-techniques"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["Apache-2.0"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot" ? ["b3eec36d6c36e829ebbe60b7a280386ff85f69d0"] : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["data@bf787fdbb73948fa3f29746e5c43d1e88586b3d6"] : undefined,
          readmeBlobRefs: signal === "readme_manifest" ? ["README.md@0930ceeea0e92d8f1266b5f3e4746766da2e1826"] : undefined,
          policyCorpusRefs: signal === "policy_corpus_manifest" ? ["data@bf787fdbb73948fa3f29746e5c43d1e88586b3d6"] : undefined,
          policyDocumentCount: signal === "policy_corpus_manifest" ? 2 : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["rag-chunking-metric-ci-weak"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.55 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 30,
                upper: 96,
                marginOfError: 33
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/IBM/rag-chunking-techniques"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ragChunkingTechniqueSampleSize: 7
    });
    expect(report.rows[0]?.ragChunkingTechniqueCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("simple_rag_notebook_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("smart_chunking_notebook_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("rag_evaluation_notebook_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("chunking_strategy_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("evaluation_dataset_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.ragChunkingTechniqueMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("RAG chunking technique coverage");
    expect(report.evalPack.rows[0]?.ragChunkingTechniqueCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds k8s-ai operational-agent validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const k8sSignals: MetricValidationKubernetesOperationalAgentSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "release_asset_manifest",
      "build_workflow_manifest",
      "agent_module_manifest",
      "mcp_server_manifest",
      "kubernetes_tool_inventory",
      "diagnostic_capability_manifest",
      "resource_monitoring_manifest",
      "log_analysis_manifest",
      "metric_definition_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = k8sSignals.map((signal) => `k8s-ai-${signal}`);
    const toolCategoryIds = [
      "configmaps-secrets",
      "deployments",
      "events",
      "health",
      "helm",
      "jobs",
      "network",
      "nodes",
      "pods",
      "resource-management",
      "scheduling",
      "services",
      "storage"
    ];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `k8s-ai-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `k8s-ai-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "k8s-operational-agent",
        runId: "run-k8s-ai-validity",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireKubernetesOperationalAgentProof: true,
        kubernetesOperationalAgentChecks: k8sSignals.map((signal, index) => ({
          kubernetesOperationalAgentSignalId: evidenceIds[index]!.replace("k8s-ai-", ""),
          kubernetesOperationalAgentSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 180).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/hariohmprasath/k8s-ai"]
            : undefined,
          licenseRefs: signal === "source_repository_license"
            ? ["MIT", "LICENSE@6a4ea5f03c31b2c33718089d075df8c28a8a0cd3"]
            : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["6942254bf11312c1d895945f163628fc961dc08f"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["0173e2dc108ac1c047fa60599c970c83663b06c8"]
            : undefined,
          readmeBlobRefs: signal === "readme_manifest"
            ? ["README.md@ffa10e5b50bc8951d24ec351f0ec580d5aa84b4f"]
            : undefined,
          releaseRefs: signal === "release_asset_manifest"
            ? ["v1.0-20250330032642", "agent-1.0-SNAPSHOT-fat.jar", "mcp-server-1.0-SNAPSHOT.jar"]
            : undefined,
          buildWorkflowRefs: signal === "build_workflow_manifest"
            ? [".github/workflows/release.yml@835cf4b3ac26b9ee924b22ddea209717d78b0799"]
            : undefined,
          agentModuleRefs: signal === "agent_module_manifest"
            ? ["agent/pom.xml@0102290632443aff62bb6a4d67055ed1640427e8", "agent/src/main/kotlin/com/k8s/agent/K8sAgentService.kt@34144356d14566cafba90402ff07be1995bc33b9"]
            : undefined,
          mcpServerModuleRefs: signal === "mcp_server_manifest"
            ? ["mcp-server/pom.xml@1d3f74a75c96cc99a9c5aa2f411bdc09adeaa233", "mcp-server/src/main/kotlin/com/mcp/server/K8sMcpServer.kt@f306955673599f13a056de896d9025f14bc2fc86"]
            : undefined,
          toolModuleRefs: signal === "kubernetes_tool_inventory"
            ? ["tools/src/main/kotlin/com/k8s/tools@13-kotlin-tool-files"]
            : undefined,
          toolCategoryIds: signal === "kubernetes_tool_inventory" ? toolCategoryIds : undefined,
          toolCategoryCount: signal === "kubernetes_tool_inventory" ? toolCategoryIds.length : undefined,
          diagnosticCapabilityIds: signal === "diagnostic_capability_manifest"
            ? ["cluster-health", "event-diagnostics", "workload-triage"]
            : undefined,
          diagnosticCapabilityCount: signal === "diagnostic_capability_manifest" ? 3 : undefined,
          resourceMetricIds: signal === "resource_monitoring_manifest"
            ? ["pod-status", "deployment-rollout", "node-health", "storage-state"]
            : undefined,
          resourceMetricCount: signal === "resource_monitoring_manifest" ? 4 : undefined,
          logAnalysisIds: signal === "log_analysis_manifest" ? ["event-log-triage"] : undefined,
          logAnalysisCount: signal === "log_analysis_manifest" ? 1 : undefined,
          metricNames: signal === "metric_definition_manifest"
            ? ["diagnostic_precision", "resource_monitoring_recall", "log_triage_grounding"]
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["k8s-operational-agent-ci-2026-06-20"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.94 : undefined,
          owner: signal === "metric_owner" ? "AMC Kubernetes Operational Agent Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 10 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 78,
                upper: 84,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/hariohmprasath/k8s-ai"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      kubernetesOperationalAgentCoverage: 1,
      kubernetesOperationalAgentSampleSize: 15,
      kubernetesOperationalAgentMissingSignals: [],
      kubernetesOperationalAgentToolCategoryCount: 13,
      kubernetesOperationalAgentDiagnosticCapabilityCount: 3,
      kubernetesOperationalAgentResourceMetricCount: 4,
      kubernetesOperationalAgentLogAnalysisCount: 1,
      kubernetesOperationalAgentRegressionPassRate0to1: 0.94
    });
    expect(report.rows[0]?.kubernetesOperationalAgentRepositoryRefs).toEqual(["https://github.com/hariohmprasath/k8s-ai"]);
    expect(report.rows[0]?.kubernetesOperationalAgentCommitRefs).toEqual(["6942254bf11312c1d895945f163628fc961dc08f"]);
    expect(report.rows[0]?.kubernetesOperationalAgentReleaseRefs).toContain("v1.0-20250330032642");
    expect(report.rows[0]?.kubernetesOperationalAgentToolCategoryIds).toContain("pods");
    expect(report.rows[0]?.kubernetesOperationalAgentMetricNames).toEqual([
      "diagnostic_precision",
      "resource_monitoring_recall",
      "log_triage_grounding"
    ]);
    expect(report.evalPack.rows[0]).toMatchObject({
      kubernetesOperationalAgentCoverage: 1,
      kubernetesOperationalAgentMissingSignals: [],
      kubernetesOperationalAgentRegressionPassRate0to1: 0.94
    });
    expect(report.evalPack.rows[0]?.kubernetesOperationalAgentReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/hariohmprasath/k8s-ai");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when k8s-ai operational-agent proof is metadata-only or lacks reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const k8sSignals: MetricValidationKubernetesOperationalAgentSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = k8sSignals.map((signal) => `k8s-ai-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `k8s-ai-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `k8s-ai-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "k8s-operational-agent",
        runId: "run-k8s-ai-incomplete",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireKubernetesOperationalAgentProof: true,
        kubernetesOperationalAgentChecks: k8sSignals.map((signal, index) => ({
          kubernetesOperationalAgentSignalId: evidenceIds[index]!.replace("k8s-ai-missing-", ""),
          kubernetesOperationalAgentSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 210).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/hariohmprasath/k8s-ai"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot" ? ["6942254bf11312c1d895945f163628fc961dc08f"] : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["0173e2dc108ac1c047fa60599c970c83663b06c8"] : undefined,
          readmeBlobRefs: signal === "readme_manifest" ? ["README.md@ffa10e5b50bc8951d24ec351f0ec580d5aa84b4f"] : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["k8s-operational-agent-ci-weak"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.5 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 20,
                upper: 92,
                marginOfError: 36
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/hariohmprasath/k8s-ai"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      kubernetesOperationalAgentSampleSize: 6
    });
    expect(report.rows[0]?.kubernetesOperationalAgentCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("release_asset_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("build_workflow_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("agent_module_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("mcp_server_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("kubernetes_tool_inventory");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("diagnostic_capability_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("resource_monitoring_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("log_analysis_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("metric_definition_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.kubernetesOperationalAgentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("Kubernetes operational-agent coverage");
    expect(report.evalPack.rows[0]?.kubernetesOperationalAgentCoverage).toBeCloseTo(3 / 15, 6);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates SecureVibeBench secure-coding benchmark proof with source, dataset, runners, adapters, scripts, CI, owner, and confidence receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const secureVibeBenchSignals: MetricValidationSecureVibeBenchSignal[] = [
      "source_repository_license_homepage",
      "default_branch_snapshot",
      "readme_manifest",
      "results_manifest",
      "dataset_manifest",
      "format_example_manifest",
      "evaluation_runner_manifest",
      "agent_adapter_roster",
      "vulnerability_scenario_manifest",
      "test_script_manifest",
      "parser_utility_manifest",
      "patch_diff_utility_manifest",
      "metric_definition_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = secureVibeBenchSignals.map((signal) => `securevibebench-${signal}`);
    const agentAdapterIds = ["aider", "claudecode", "codex", "openhands", "sweagent"];
    const vulnerabilityScenarioIds = Array.from({ length: 120 }, (_, index) => `svb-scenario-${index + 1}`);
    const testScriptIds = Array.from({ length: 80 }, (_, index) => `svb-test-script-${index + 1}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `d${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `securevibebench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `securevibebench-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "secure-vibe-bench-agent",
        runId: "run-securevibebench-validity",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireSecureVibeBenchProof: true,
        secureVibeBenchChecks: secureVibeBenchSignals.map((signal, index) => ({
          secureVibeBenchSignalId: evidenceIds[index]!.replace("securevibebench-", ""),
          secureVibeBenchSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 240).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license_homepage"
            ? ["https://github.com/iCSawyer/SecureVibeBench"]
            : undefined,
          licenseRefs: signal === "source_repository_license_homepage"
            ? ["MIT", "LICENSE@b5a56aba2d9f8b304eb7b397830468c0a401fdaa"]
            : undefined,
          homepageRefs: signal === "source_repository_license_homepage" ? ["https://arxiv.org/abs/2509.22097"] : undefined,
          arxivRefs: signal === "source_repository_license_homepage" ? ["https://arxiv.org/abs/2509.22097"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["1aa1728de55a7d30ecfa8371e835ed6c2d22e954"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["fcad75a92afe9538d4d596d2356c3786d869006a"]
            : undefined,
          readmeBlobRefs: signal === "readme_manifest"
            ? ["README.md@d3cb5e7020741955db3de28c078b52b8297e15f2"]
            : undefined,
          resultsBlobRefs: signal === "results_manifest"
            ? ["assets/results.md@5f214f9f4c48c3a06b5929744e6048c4422826b9"]
            : undefined,
          datasetRefs: signal === "dataset_manifest"
            ? ["data/full_dataset.zip@d9f65f59e5e4d82afc4d342a3ffcf185434fe5ac"]
            : undefined,
          formatExampleRefs: signal === "format_example_manifest"
            ? ["data/format_example.json@6e0009b46b1aa827b384015f3f12970cf4e99a86"]
            : undefined,
          evaluationRunnerRefs: signal === "evaluation_runner_manifest"
            ? [
                "evaluation/run.sh@dad2d3a7ac8af46d3b0cceb7bc4483ef4b3503ec",
                "evaluation/run_instance.sh@88fbbebbbb8b214f7cc10fbc00414220c2a8d364"
              ]
            : undefined,
          agentAdapterIds: signal === "agent_adapter_roster" ? agentAdapterIds : undefined,
          agentAdapterCount: signal === "agent_adapter_roster" ? agentAdapterIds.length : undefined,
          vulnerabilityScenarioIds: signal === "vulnerability_scenario_manifest" ? vulnerabilityScenarioIds : undefined,
          scenarioCount: signal === "vulnerability_scenario_manifest" ? vulnerabilityScenarioIds.length : undefined,
          testScriptIds: signal === "test_script_manifest" ? testScriptIds : undefined,
          testScriptCount: signal === "test_script_manifest" ? testScriptIds.length : undefined,
          parserUtilityRefs: signal === "parser_utility_manifest"
            ? [
                "evaluation/my_utils/extract_info.py@a3ee8a6bf5c933e4c514198465425d7724ad55c3",
                "evaluation/my_utils/extract_info_hf.py@a467f0bfe94dce452abf15abdd40366b80bc7500",
                "evaluation/my_utils/parse_test_report.py@04440f4500fe601eadd54f1de876d3886d8e9ddc"
              ]
            : undefined,
          patchDiffUtilityRefs: signal === "patch_diff_utility_manifest"
            ? ["evaluation/my_utils/patch_diff.py@276ef894fa89bb22a5b67fb1582de7bc99595754"]
            : undefined,
          metricNames: signal === "metric_definition_manifest"
            ? ["secure_vibe_success_rate", "vulnerability_reconstruction_pass_rate", "test_regression_pass_rate"]
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["securevibebench-ci-2026-06-20"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.93 : undefined,
          owner: signal === "metric_owner" ? "AMC SecureVibeBench Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 16 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 82,
                upper: 88,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/iCSawyer/SecureVibeBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      secureVibeBenchCoverage: 1,
      secureVibeBenchSampleSize: 16,
      secureVibeBenchMissingSignals: [],
      secureVibeBenchAgentAdapterCount: 5,
      secureVibeBenchScenarioCount: 120,
      secureVibeBenchTestScriptCount: 80,
      secureVibeBenchRegressionPassRate0to1: 0.93
    });
    expect(report.rows[0]?.secureVibeBenchRepositoryRefs).toEqual(["https://github.com/iCSawyer/SecureVibeBench"]);
    expect(report.rows[0]?.secureVibeBenchCommitRefs).toEqual(["1aa1728de55a7d30ecfa8371e835ed6c2d22e954"]);
    expect(report.rows[0]?.secureVibeBenchDatasetRefs).toContain("data/full_dataset.zip@d9f65f59e5e4d82afc4d342a3ffcf185434fe5ac");
    expect(report.rows[0]?.secureVibeBenchAgentAdapterIds).toContain("openhands");
    expect(report.rows[0]?.secureVibeBenchMetricNames).toEqual([
      "secure_vibe_success_rate",
      "vulnerability_reconstruction_pass_rate",
      "test_regression_pass_rate"
    ]);
    expect(report.evalPack.rows[0]).toMatchObject({
      secureVibeBenchCoverage: 1,
      secureVibeBenchMissingSignals: [],
      secureVibeBenchRegressionPassRate0to1: 0.93
    });
    expect(report.evalPack.rows[0]?.secureVibeBenchReportArtifactHashes.length).toBe(14);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/iCSawyer/SecureVibeBench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when SecureVibeBench proof is metadata-only or lacks secure-coding reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const secureVibeBenchSignals: MetricValidationSecureVibeBenchSignal[] = [
      "source_repository_license_homepage",
      "default_branch_snapshot",
      "readme_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = secureVibeBenchSignals.map((signal) => `securevibebench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `securevibebench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `securevibebench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "secure-vibe-bench-agent",
        runId: "run-securevibebench-incomplete",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.93
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireSecureVibeBenchProof: true,
        secureVibeBenchChecks: secureVibeBenchSignals.map((signal, index) => ({
          secureVibeBenchSignalId: evidenceIds[index]!.replace("securevibebench-missing-", ""),
          secureVibeBenchSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 280).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license_homepage"
            ? ["https://github.com/iCSawyer/SecureVibeBench"]
            : undefined,
          licenseRefs: signal === "source_repository_license_homepage" ? ["MIT"] : undefined,
          homepageRefs: signal === "source_repository_license_homepage" ? ["https://arxiv.org/abs/2509.22097"] : undefined,
          arxivRefs: signal === "source_repository_license_homepage" ? ["https://arxiv.org/abs/2509.22097"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["1aa1728de55a7d30ecfa8371e835ed6c2d22e954"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["fcad75a92afe9538d4d596d2356c3786d869006a"]
            : undefined,
          readmeBlobRefs: signal === "readme_manifest"
            ? ["README.md@d3cb5e7020741955db3de28c078b52b8297e15f2"]
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["securevibebench-ci-weak"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "ci_regression_manifest" ? 0.5 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 20,
                upper: 92,
                marginOfError: 36
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/iCSawyer/SecureVibeBench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      secureVibeBenchSampleSize: 6
    });
    expect(report.rows[0]?.secureVibeBenchCoverage).toBeCloseTo(3 / 16, 6);
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("results_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("dataset_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("format_example_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("evaluation_runner_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("agent_adapter_roster");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("vulnerability_scenario_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("test_script_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("parser_utility_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("patch_diff_utility_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("metric_definition_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.secureVibeBenchMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("SecureVibeBench coverage");
    expect(report.evalPack.rows[0]?.secureVibeBenchCoverage).toBeCloseTo(3 / 16, 6);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates RAViG-Bench metric-validity proof with source, visually-rich generation taxonomy, eval surfaces, CI, owner, and confidence receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ravigBenchSignals: MetricValidationRavigBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_legal_manifest",
      "environment_dependency_manifest",
      "configuration_manifest",
      "content_evaluation_manifest",
      "design_evaluation_manifest",
      "execution_evaluation_manifest",
      "function_scoring_manifest",
      "dataset_manifest",
      "test_case_manifest",
      "model_result_manifest",
      "visual_rich_generation_taxonomy",
      "rag_retrieval_context_manifest",
      "multi_modal_evaluator_manifest",
      "screenshot_evaluation_manifest",
      "run_script_manifest",
      "metric_definition_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = ravigBenchSignals.map((signal) => `ravig-bench-${signal}`);
    const taxonomyIds = ["content-grounding", "visual-layout", "chart-table-rendering", "html-execution"];
    const retrievalContextIds = ["visual-rich-benchmark-v0", "ravig-rag-context-v0"];
    const multiModalEvaluatorIds = ["content-evaluator", "design-evaluator", "execution-evaluator"];
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `a${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `ravig-bench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ravig-bench-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ravig-bench-agent",
        runId: "run-ravig-bench-validity",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.92
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRavigBenchProof: true,
        ravigBenchChecks: ravigBenchSignals.map((signal, index) => ({
          ravigBenchSignalId: evidenceIds[index]!.replace("ravig-bench-", ""),
          ravigBenchSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 320).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/antgroup/ravig-bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license"
            ? ["Apache-2.0", "LICENSE@fa1269b209ee7e24bf94eef9573be3a23e28654f"]
            : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["a282c4533496ffed33be591d776f8a3b843f0774"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["c0736ae37fd809714e7324c842d391bf375cb237"]
            : undefined,
          readmeBlobRefs: signal === "readme_legal_manifest"
            ? ["README.md@eaaf23b9e88164660ed5b85b66a33b7a5bdc66fc"]
            : undefined,
          legalBlobRefs: signal === "readme_legal_manifest"
            ? ["LEGAL.md@f96892081dd58b22ee2199adffd7b188b79e7e7f"]
            : undefined,
          environmentRefs: signal === "environment_dependency_manifest"
            ? [
                "requirements.txt@ad6c37d7a8cc1e36706d6ec32294fc25c119ba4c",
                "environment.yml@1c7cf764e959fcc676011e6b4a7d13c9d769823c"
              ]
            : undefined,
          configurationRefs: signal === "configuration_manifest"
            ? ["config@a3f53383fbe28ad5eebeb91e0666b6ccf6ac8d0d"]
            : undefined,
          contentEvaluationRefs: signal === "content_evaluation_manifest"
            ? ["content_eval@385ae07d65859466569695fc97d120c0db3673d4"]
            : undefined,
          designEvaluationRefs: signal === "design_evaluation_manifest"
            ? ["design_eval@4dc4edc6bc056bf8d2103b4aad6ba71cb02c09fb"]
            : undefined,
          executionEvaluationRefs: signal === "execution_evaluation_manifest"
            ? ["execution_eval@b5db8d180c5ca69442fe77ad2a567e17fc6aa91f"]
            : undefined,
          functionScoringRefs: signal === "function_scoring_manifest"
            ? ["functions/compute_score.py@473bc0b74426859752118491c32ec9a08ad50085"]
            : undefined,
          datasetRefs: signal === "dataset_manifest"
            ? ["data/dataset/visual_rich_benchmark_v0.jsonl@11924b52af47fcda72ef0c9b6a59b4cb447930f8"]
            : undefined,
          datasetCaseCount: signal === "dataset_manifest" ? 51 : undefined,
          testCaseRefs: signal === "test_case_manifest"
            ? ["data/test_case/visual_rich_benchmark_test_case.jsonl@2e1a5ad1dd917ff5eac8ffabf385425f192cc405"]
            : undefined,
          modelResultRefs: signal === "model_result_manifest"
            ? ["data/models_infer_results/ravig_bench_v0_10_models_infer_result.jsonl@0fb51f68fbc916e670ed29ed9a50b62460d72ae2"]
            : undefined,
          taxonomyIds: signal === "visual_rich_generation_taxonomy" ? taxonomyIds : undefined,
          retrievalContextIds: signal === "rag_retrieval_context_manifest" ? retrievalContextIds : undefined,
          multiModalEvaluatorIds: signal === "multi_modal_evaluator_manifest" ? multiModalEvaluatorIds : undefined,
          evaluatorCount: signal === "multi_modal_evaluator_manifest" ? multiModalEvaluatorIds.length : undefined,
          screenshotEvaluationRefs: signal === "screenshot_evaluation_manifest"
            ? ["run_screenshot.sh@d127e0cdb72b54030f59437e9637ce1f5d61b019"]
            : undefined,
          runScriptRefs: signal === "run_script_manifest"
            ? [
                "run_eval.sh@890c4b17d65c930948bb79de9cb3b1fa0c809e91",
                "run_eval_demo.sh@049a8d5e2b0fd593ac5c37163bab0af5caef802c"
              ]
            : undefined,
          metricNames: signal === "metric_definition_manifest"
            ? ["content_faithfulness", "design_occlusion", "execution_html_validity"]
            : undefined,
          visualDesignCheckCount: signal === "design_evaluation_manifest" ? 7 : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["ravig-bench-ci-2026-06-20"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          validationPassRate0to1: signal === "ci_regression_manifest" ? 0.94 : undefined,
          owner: signal === "metric_owner" ? "AMC RAViG-Bench Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 21 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 88,
                upper: 94,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/antgroup/ravig-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      ravigBenchCoverage: 1,
      ravigBenchSampleSize: 21,
      ravigBenchMissingSignals: [],
      ravigBenchDatasetCaseCount: 51,
      ravigBenchVisualDesignCheckCount: 7,
      ravigBenchEvaluatorCount: 3,
      ravigBenchValidationPassRate0to1: 0.94
    });
    expect(report.rows[0]?.ravigBenchRepositoryRefs).toEqual(["https://github.com/antgroup/ravig-bench"]);
    expect(report.rows[0]?.ravigBenchCommitRefs).toEqual(["a282c4533496ffed33be591d776f8a3b843f0774"]);
    expect(report.rows[0]?.ravigBenchDatasetRefs).toContain("data/dataset/visual_rich_benchmark_v0.jsonl@11924b52af47fcda72ef0c9b6a59b4cb447930f8");
    expect(report.rows[0]?.ravigBenchTaxonomyIds).toEqual(taxonomyIds);
    expect(report.rows[0]?.ravigBenchMultiModalEvaluatorIds).toEqual(multiModalEvaluatorIds);
    expect(report.rows[0]?.ravigBenchMetricNames).toEqual([
      "content_faithfulness",
      "design_occlusion",
      "execution_html_validity"
    ]);
    expect(report.evalPack.rows[0]).toMatchObject({
      ravigBenchCoverage: 1,
      ravigBenchMissingSignals: [],
      ravigBenchValidationPassRate0to1: 0.94
    });
    expect(report.evalPack.rows[0]?.ravigBenchReportArtifactHashes.length).toBe(19);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/antgroup/ravig-bench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when RAViG-Bench proof is metadata-only or lacks visually-rich generation reliability receipts", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const ravigBenchSignals: MetricValidationRavigBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_legal_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const evidenceIds = ravigBenchSignals.map((signal) => `ravig-bench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED" as const
      })),
      ...evidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `ravig-bench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `ravig-bench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "ravig-bench-agent",
        runId: "run-ravig-bench-incomplete",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.92
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireRavigBenchProof: true,
        ravigBenchChecks: ravigBenchSignals.map((signal, index) => ({
          ravigBenchSignalId: evidenceIds[index]!.replace("ravig-bench-missing-", ""),
          ravigBenchSignalType: signal,
          covered: true,
          evidenceRefs: [evidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 360).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/antgroup/ravig-bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license" ? ["Apache-2.0"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["a282c4533496ffed33be591d776f8a3b843f0774"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["c0736ae37fd809714e7324c842d391bf375cb237"]
            : undefined,
          readmeBlobRefs: signal === "readme_legal_manifest"
            ? ["README.md@eaaf23b9e88164660ed5b85b66a33b7a5bdc66fc"]
            : undefined,
          legalBlobRefs: signal === "readme_legal_manifest"
            ? ["LEGAL.md@f96892081dd58b22ee2199adffd7b188b79e7e7f"]
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["ravig-bench-ci-weak"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          validationPassRate0to1: signal === "ci_regression_manifest" ? 0.5 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 20,
                upper: 92,
                marginOfError: 36
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/antgroup/ravig-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      ravigBenchSampleSize: 6
    });
    expect(report.rows[0]?.ravigBenchCoverage).toBeCloseTo(3 / 21, 6);
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("environment_dependency_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("configuration_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("content_evaluation_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("design_evaluation_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("execution_evaluation_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("function_scoring_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("dataset_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("test_case_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("model_result_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("visual_rich_generation_taxonomy");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("rag_retrieval_context_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("multi_modal_evaluator_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("screenshot_evaluation_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("run_script_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("metric_definition_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.ravigBenchMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("RAViG-Bench coverage");
    expect(report.evalPack.rows[0]?.ravigBenchCoverage).toBeCloseTo(3 / 21, 6);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds HumanStudy-Bench participant-simulation validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const humanStudySignals: MetricValidationHumanStudyBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "study_config_manifest",
      "participant_background_manifest",
      "human_response_manifest",
      "agent_response_manifest",
      "evaluator_registry_manifest",
      "metric_definition_manifest",
      "response_validator_manifest",
      "scorer_standardizer_manifest",
      "inter_rater_agreement_report",
      "test_retest_reliability_report",
      "validation_pipeline_manifest",
      "result_artifact_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const humanStudyEvidenceIds = humanStudySignals.map((signal) => `humanstudy-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...humanStudyEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `b${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `humanstudy-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `humanstudy-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "participant-simulation-agent",
        runId: "run-humanstudybench-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireHumanStudyBenchProof: true,
        humanStudyBenchChecks: humanStudySignals.map((signal, index) => ({
          humanStudyBenchSignalId: humanStudyEvidenceIds[index]!.replace("humanstudy-", ""),
          humanStudyBenchSignalType: signal,
          covered: true,
          evidenceRefs: [humanStudyEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 10).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/AISmithLab/HumanStudy-Bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["paper"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["6b693023131238a74e09f38971ed001c328b419c"]
            : undefined,
          studyConfigIds: signal === "study_config_manifest"
            ? ["study_001", "study_006", "study_012"]
            : undefined,
          studyCount: signal === "study_config_manifest" ? 12 : undefined,
          backgroundDatasetIds: signal === "participant_background_manifest"
            ? ["data/backgrounds@37e62b2cda7547dd5ba663f3325bb4a5a9e8fb52"]
            : undefined,
          participantCount: signal === "participant_background_manifest" ? 144 : undefined,
          humanResponseDatasetIds: signal === "human_response_manifest" ? ["human-response-export-v1"] : undefined,
          agentResponseDatasetIds: signal === "agent_response_manifest" ? ["agent-response-export-v1"] : undefined,
          responseCount: ["human_response_manifest", "agent_response_manifest"].includes(signal) ? 144 : undefined,
          evaluatorIds: signal === "evaluator_registry_manifest"
            ? ["metrics.py", "scorer.py", "response_validator.py"]
            : undefined,
          evaluatorCount: signal === "evaluator_registry_manifest" ? 3 : undefined,
          metricNames: ["metric_definition_manifest", "result_artifact_manifest"].includes(signal)
            ? ["participant_alignment", "response_validity", "finding_consistency"]
            : undefined,
          validatorIds: signal === "response_validator_manifest"
            ? ["src/evaluation/response_validator.py@c526564ab33dce5ea83b39f7dcd95f83bcabfaf7"]
            : undefined,
          scorerIds: signal === "scorer_standardizer_manifest"
            ? ["src/evaluation/scorer.py@f9deb60bc3cfbff4223949f24cbee582b17f846c"]
            : undefined,
          standardizerIds: signal === "scorer_standardizer_manifest"
            ? ["src/evaluation/standardizers.py@b0178a0fc7507f4205a8ebdcc2bd1e5f896cfb5b"]
            : undefined,
          reliabilityReportIds: ["inter_rater_agreement_report", "test_retest_reliability_report"].includes(signal)
            ? [`humanstudybench-${signal}-2026-06-19`]
            : undefined,
          interRaterAgreement0to1: signal === "inter_rater_agreement_report" ? 0.88 : undefined,
          testRetestReliability0to1: signal === "test_retest_reliability_report" ? 0.86 : undefined,
          validationPipelineIds: signal === "validation_pipeline_manifest"
            ? ["validation_pipeline/pipeline.py@1d3e2d7fdbd488dba17d9e33bcfaacbfc87829b0"]
            : undefined,
          validationPassRate0to1: ["validation_pipeline_manifest", "ci_regression_manifest"].includes(signal)
            ? 0.97
            : undefined,
          resultArtifactIds: signal === "result_artifact_manifest" ? ["humanstudybench-results-2026-06-19"] : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["humanstudybench-ci-gate-v1"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json", "github_actions"] : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 144 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 84,
                upper: 90,
                marginOfError: 3
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/AISmithLab/HumanStudy-Bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      humanStudyBenchCoverage: 1,
      humanStudyBenchSampleSize: 17,
      humanStudyBenchMissingSignals: [],
      humanStudyBenchStudyCount: 12,
      humanStudyBenchParticipantCount: 144,
      humanStudyBenchResponseCount: 144,
      humanStudyBenchEvaluatorCount: 3,
      humanStudyBenchInterRaterAgreement0to1: 0.88,
      humanStudyBenchTestRetestReliability0to1: 0.86,
      humanStudyBenchValidationPassRate0to1: 0.97
    });
    expect(report.rows[0]?.humanStudyBenchRepositoryRefs).toEqual(["https://github.com/AISmithLab/HumanStudy-Bench"]);
    expect(report.rows[0]?.humanStudyBenchBranchRefs).toEqual(["paper"]);
    expect(report.rows[0]?.humanStudyBenchCommitRefs).toEqual(["6b693023131238a74e09f38971ed001c328b419c"]);
    expect(report.rows[0]?.humanStudyBenchMetricNames).toEqual([
      "participant_alignment",
      "response_validity",
      "finding_consistency"
    ]);
    expect(report.evalPack.rows[0]).toMatchObject({
      humanStudyBenchCoverage: 1,
      humanStudyBenchMissingSignals: [],
      humanStudyBenchValidationPassRate0to1: 0.97
    });
    expect(report.evalPack.rows[0]?.humanStudyBenchReportArtifactHashes.length).toBe(15);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...humanStudyEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/AISmithLab/HumanStudy-Bench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when HumanStudy-Bench proof lacks response, evaluator, reliability, CI, or owner evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const humanStudySignals: MetricValidationHumanStudyBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "study_config_manifest",
      "participant_background_manifest",
      "evaluator_registry_manifest",
      "metric_definition_manifest",
      "inter_rater_agreement_report",
      "test_retest_reliability_report",
      "validation_pipeline_manifest",
      "ci_regression_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const humanStudyEvidenceIds = humanStudySignals.map((signal) => `humanstudy-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...humanStudyEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `c${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `humanstudy-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `humanstudy-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "participant-simulation-agent",
        runId: "run-humanstudybench-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireHumanStudyBenchProof: true,
        humanStudyBenchChecks: humanStudySignals.map((signal, index) => ({
          humanStudyBenchSignalId: humanStudyEvidenceIds[index]!.replace("humanstudy-missing-", ""),
          humanStudyBenchSignalType: signal,
          covered: true,
          evidenceRefs: [humanStudyEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 20).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/AISmithLab/HumanStudy-Bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["paper"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["6b693023131238a74e09f38971ed001c328b419c"]
            : undefined,
          studyConfigIds: signal === "study_config_manifest" ? ["study_001"] : undefined,
          studyCount: signal === "study_config_manifest" ? 3 : undefined,
          backgroundDatasetIds: signal === "participant_background_manifest" ? ["too-small-background-set"] : undefined,
          participantCount: signal === "participant_background_manifest" ? 3 : undefined,
          evaluatorIds: signal === "evaluator_registry_manifest" ? ["single-evaluator"] : undefined,
          evaluatorCount: signal === "evaluator_registry_manifest" ? 1 : undefined,
          metricNames: signal === "metric_definition_manifest" ? ["participant_alignment"] : undefined,
          reliabilityReportIds: ["inter_rater_agreement_report", "test_retest_reliability_report"].includes(signal)
            ? [`humanstudybench-weak-${signal}`]
            : undefined,
          interRaterAgreement0to1: signal === "inter_rater_agreement_report" ? 0.51 : undefined,
          testRetestReliability0to1: signal === "test_retest_reliability_report" ? 0.5 : undefined,
          validationPipelineIds: signal === "validation_pipeline_manifest" ? ["validation-pipeline-weak"] : undefined,
          validationPassRate0to1: ["validation_pipeline_manifest", "ci_regression_manifest"].includes(signal)
            ? 0.6
            : undefined,
          ciReporterIds: signal === "ci_regression_manifest" ? ["humanstudybench-ci-gate-v1"] : undefined,
          reporterFormats: signal === "ci_regression_manifest" ? ["json"] : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 3 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 30,
                upper: 92,
                marginOfError: 31
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/AISmithLab/HumanStudy-Bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      humanStudyBenchSampleSize: 12
    });
    expect(report.rows[0]?.humanStudyBenchCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("human_response_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("agent_response_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("response_validator_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("scorer_standardizer_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("inter_rater_agreement_report");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("test_retest_reliability_report");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("validation_pipeline_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("ci_regression_manifest");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.humanStudyBenchMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("humanstudy-bench coverage");
    expect(report.evalPack.rows[0]?.humanStudyBenchCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.evalPack.rows[0]?.humanStudyBenchMissingSignals).toContain("response_validator_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("binds Legacy-Bench legacy-software validity proof into metric validation rows", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const legacyBenchSignals: MetricValidationLegacyBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "task_corpus_manifest",
      "legacy_language_manifest",
      "environment_manifest",
      "harness_runner_manifest",
      "agent_task_manifest",
      "patch_submission_manifest",
      "test_oracle_manifest",
      "evaluator_registry_manifest",
      "scoring_metric_manifest",
      "regression_ci_manifest",
      "result_artifact_manifest",
      "replay_command_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const legacyBenchEvidenceIds = legacyBenchSignals.map((signal) => `legacybench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...legacyBenchEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `e${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `legacybench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `legacybench-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "legacy-software-agent",
        runId: "run-legacybench-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLegacyBenchProof: true,
        legacyBenchChecks: legacyBenchSignals.map((signal, index) => ({
          legacyBenchSignalId: legacyBenchEvidenceIds[index]!.replace("legacybench-", ""),
          legacyBenchSignalType: signal,
          covered: true,
          evidenceRefs: [legacyBenchEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 30).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/Factory-AI/legacy-bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license" ? ["Apache-2.0"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["12fa7cf969b7a253183388040d566fb353a1ab31"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot"
            ? ["ed3f7f054fb99829956293aaebf164a310d3f414"]
            : undefined,
          readmeBlobRefs: signal === "readme_manifest"
            ? ["README.md@93b3acc22ac8e149cf49486b99d93c068bcd5785"]
            : undefined,
          taskCorpusRefs: signal === "task_corpus_manifest"
            ? ["tasks@bb5018e8ba4f53306d7b6567906e4d75c02fd316"]
            : undefined,
          taskCount: ["task_corpus_manifest", "agent_task_manifest", "test_oracle_manifest"].includes(signal)
            ? 10
            : undefined,
          legacyLanguageIds: signal === "legacy_language_manifest"
            ? ["COBOL", "Java", "Fortran", "Assembly", "C"]
            : undefined,
          languageCount: signal === "legacy_language_manifest" ? 5 : undefined,
          environmentIds: signal === "environment_manifest" ? ["docker-environments@10"] : undefined,
          environmentCount: signal === "environment_manifest" ? 10 : undefined,
          harnessRunnerIds: signal === "harness_runner_manifest" ? ["task.toml", "tests/test.sh"] : undefined,
          agentTaskIds: signal === "agent_task_manifest" ? ["10-public-sample-tasks"] : undefined,
          patchSubmissionIds: signal === "patch_submission_manifest" ? ["solution/solve.sh@10"] : undefined,
          testOracleIds: signal === "test_oracle_manifest" ? ["tests/test_outputs.py@10"] : undefined,
          testOracleCount: signal === "test_oracle_manifest" ? 10 : undefined,
          evaluatorIds: signal === "evaluator_registry_manifest" ? ["deterministic-tests"] : undefined,
          evaluatorCount: signal === "evaluator_registry_manifest" ? 1 : undefined,
          metricNames: ["scoring_metric_manifest", "result_artifact_manifest"].includes(signal)
            ? ["task_pass_rate", "oracle_pass_rate", "replay_pass_rate"]
            : undefined,
          ciReporterIds: signal === "regression_ci_manifest" ? ["legacybench-ci-gate-v1"] : undefined,
          reporterFormats: signal === "regression_ci_manifest" ? ["json", "github_actions"] : undefined,
          regressionPassRate0to1: signal === "regression_ci_manifest" ? 0.96 : undefined,
          resultArtifactIds: signal === "result_artifact_manifest" ? ["legacybench-results-2026-06-19"] : undefined,
          replayCommandIds: signal === "replay_command_manifest" ? ["legacybench-replay-main-12fa7cf"] : undefined,
          replayPassRate0to1: signal === "replay_command_manifest" ? 0.95 : undefined,
          owner: signal === "metric_owner" ? "AMC Metric Validity" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 10 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 88,
                upper: 96,
                marginOfError: 4
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/Factory-AI/legacy-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      legacyBenchCoverage: 1,
      legacyBenchSampleSize: 17,
      legacyBenchMissingSignals: [],
      legacyBenchTaskCount: 10,
      legacyBenchLanguageCount: 5,
      legacyBenchEnvironmentCount: 10,
      legacyBenchTestOracleCount: 10,
      legacyBenchEvaluatorCount: 1,
      legacyBenchRegressionPassRate0to1: 0.96,
      legacyBenchReplayPassRate0to1: 0.95
    });
    expect(report.rows[0]?.legacyBenchRepositoryRefs).toEqual(["https://github.com/Factory-AI/legacy-bench"]);
    expect(report.rows[0]?.legacyBenchBranchRefs).toEqual(["main"]);
    expect(report.rows[0]?.legacyBenchCommitRefs).toEqual(["12fa7cf969b7a253183388040d566fb353a1ab31"]);
    expect(report.rows[0]?.legacyBenchTaskCorpusRefs).toEqual(["tasks@bb5018e8ba4f53306d7b6567906e4d75c02fd316"]);
    expect(report.rows[0]?.legacyBenchLegacyLanguageIds).toEqual(["COBOL", "Java", "Fortran", "Assembly", "C"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      legacyBenchCoverage: 1,
      legacyBenchMissingSignals: [],
      legacyBenchRegressionPassRate0to1: 0.96,
      legacyBenchReplayPassRate0to1: 0.95
    });
    expect(report.evalPack.rows[0]?.legacyBenchReportArtifactHashes.length).toBe(15);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...legacyBenchEvidenceIds
    ]);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/Factory-AI/legacy-bench");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when Legacy-Bench proof lacks corpus, oracle, replay, CI, or owner evidence", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const legacyBenchSignals: MetricValidationLegacyBenchSignal[] = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_manifest",
      "task_corpus_manifest",
      "legacy_language_manifest",
      "regression_ci_manifest",
      "replay_command_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const legacyBenchEvidenceIds = legacyBenchSignals.map((signal) => `legacybench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED" as const
      })),
      ...legacyBenchEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `legacybench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `legacybench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "legacy-software-agent",
        runId: "run-legacybench-incomplete",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireLegacyBenchProof: true,
        legacyBenchChecks: legacyBenchSignals.map((signal, index) => ({
          legacyBenchSignalId: legacyBenchEvidenceIds[index]!.replace("legacybench-missing-", ""),
          legacyBenchSignalType: signal,
          covered: true,
          evidenceRefs: [legacyBenchEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : (index + 50).toString(16).repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license"
            ? ["https://github.com/Factory-AI/legacy-bench"]
            : undefined,
          licenseRefs: signal === "source_repository_license" ? ["Apache-2.0"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot"
            ? ["12fa7cf969b7a253183388040d566fb353a1ab31"]
            : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["ed3f7f054fb99829956293aaebf164a310d3f414"] : undefined,
          readmeBlobRefs: signal === "readme_manifest" ? ["README.md@93b3acc22ac8e149cf49486b99d93c068bcd5785"] : undefined,
          taskCorpusRefs: signal === "task_corpus_manifest" ? ["tasks@bb5018e8ba4f53306d7b6567906e4d75c02fd316"] : undefined,
          taskCount: signal === "task_corpus_manifest" ? 2 : undefined,
          legacyLanguageIds: signal === "legacy_language_manifest" ? ["COBOL"] : undefined,
          languageCount: signal === "legacy_language_manifest" ? 1 : undefined,
          ciReporterIds: signal === "regression_ci_manifest" ? ["legacybench-ci-gate-v1"] : undefined,
          reporterFormats: signal === "regression_ci_manifest" ? ["json"] : undefined,
          regressionPassRate0to1: signal === "regression_ci_manifest" ? 0.62 : undefined,
          replayCommandIds: signal === "replay_command_manifest" ? ["legacybench-replay-main-12fa7cf"] : undefined,
          replayPassRate0to1: signal === "replay_command_manifest" ? 0.65 : undefined,
          owner: signal === "metric_owner" ? "" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 2 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 20,
                upper: 92,
                marginOfError: 36
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/Factory-AI/legacy-bench"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      legacyBenchSampleSize: 9
    });
    expect(report.rows[0]?.legacyBenchCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("task_corpus_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("legacy_language_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("environment_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("test_oracle_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("regression_ci_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("replay_command_manifest");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("metric_owner");
    expect(report.rows[0]?.legacyBenchMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("Legacy-Bench coverage");
    expect(report.evalPack.rows[0]?.legacyBenchCoverage).toBeCloseTo(3 / 17, 6);
    expect(report.evalPack.rows[0]?.legacyBenchMissingSignals).toContain("test_oracle_manifest");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("passes MobileBench-style mobile-agent validity when environment, app, API, UI, checkpoint, and license evidence is complete", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const mobileSignals: MetricValidationMobileAgentSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "mobile_environment_manifest",
      "app_inventory_manifest",
      "api_catalog_manifest",
      "ui_automation_trace",
      "task_dataset_manifest",
      "task_complexity_manifest",
      "multi_app_task_manifest",
      "checkpoint_metric_rubric",
      "checkpoint_result_artifact",
      "environment_reset_policy",
      "device_state_fixture",
      "result_report_artifact",
      "dataset_license_boundary",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const mobileEvidenceIds = mobileSignals.map((signal) => `mobilebench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...mobileEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `mobilebench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `mobilebench-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mobile-agent",
        runId: "run-mobilebench-validity",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMobileAgentProof: true,
        mobileAgentChecks: mobileSignals.map((signal, index) => ({
          mobileAgentSignalId: mobileEvidenceIds[index]!.replace("mobilebench-", ""),
          mobileAgentSignalType: signal,
          covered: true,
          evidenceRefs: [mobileEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" || signal === "sample_size_confidence_interval"
            ? undefined
            : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" || signal === "paper_or_source_reference"
            ? ["mobile-agent-benchmark-v1"]
            : undefined,
          environmentIds: [
            "mobile_environment_manifest",
            "environment_reset_policy",
            "device_state_fixture"
          ].includes(signal)
            ? ["android-runtime-fixture", "emulator-reset-policy"]
            : undefined,
          appIds: signal === "app_inventory_manifest" ? ["calendar-fixture", "notes-fixture", "messaging-fixture"] : undefined,
          apiCatalogIds: signal === "api_catalog_manifest" ? ["mobile-api-catalog-v1"] : undefined,
          uiTraceIds: signal === "ui_automation_trace" ? ["ui-trajectory-pack-v1"] : undefined,
          taskSetIds: signal === "task_dataset_manifest" || signal === "multi_app_task_manifest"
            ? ["mobile-task-pack-v1", "multi-app-collaboration-pack-v1"]
            : undefined,
          taskComplexityGroups: signal === "task_complexity_manifest" ? ["single-app", "single-app-multi-turn", "multi-app"] : undefined,
          metricNames: [
            "checkpoint_metric_rubric",
            "checkpoint_result_artifact",
            "result_report_artifact"
          ].includes(signal)
            ? ["task_success", "checkpoint_pass_rate", "api_use_accuracy", "ui_trace_completion"]
            : undefined,
          licenseBoundaryRefs: signal === "dataset_license_boundary" ? ["mobilebench-dataset-noncommercial-boundary"] : undefined,
          trialCount: [
            "checkpoint_result_artifact",
            "result_report_artifact"
          ].includes(signal)
            ? 96
            : undefined,
          owner: signal === "metric_owner" ? "AMC Mobile Agent Eval" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 96 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval"
            ? {
                level: 0.95,
                lower: 68,
                upper: 78,
                marginOfError: 5
              }
            : undefined
        })),
        sourceRefs: ["https://github.com/XiaoMi/MobileBench", "https://arxiv.org/abs/2407.00993"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "pass",
      mobileAgentCoverage: 1,
      mobileAgentSampleSize: 17,
      mobileAgentMissingSignals: [],
      mobileAgentTrialCount: 96
    });
    expect(report.rows[0]?.mobileAgentBenchmarkIds).toEqual(["mobile-agent-benchmark-v1"]);
    expect(report.rows[0]?.mobileAgentEnvironmentIds).toEqual(["android-runtime-fixture", "emulator-reset-policy"]);
    expect(report.rows[0]?.mobileAgentAppIds).toEqual(["calendar-fixture", "notes-fixture", "messaging-fixture"]);
    expect(report.rows[0]?.mobileAgentApiCatalogIds).toEqual(["mobile-api-catalog-v1"]);
    expect(report.rows[0]?.mobileAgentTaskComplexityGroups).toEqual(["single-app", "single-app-multi-turn", "multi-app"]);
    expect(report.rows[0]?.mobileAgentLicenseBoundaryRefs).toEqual(["mobilebench-dataset-noncommercial-boundary"]);
    expect(report.evalPack.rows[0]).toMatchObject({
      mobileAgentCoverage: 1,
      mobileAgentSampleSize: 17,
      mobileAgentMissingSignals: [],
      mobileAgentTrialCount: 96
    });
    expect(report.evalPack.rows[0]?.mobileAgentReportArtifactHashes.length).toBe(13);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...mobileEvidenceIds
    ]);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/XiaoMi/MobileBench");
    expect(report.evalPack.sourceRefs).toContain("https://arxiv.org/abs/2407.00993");
    expect(report.ciGate.passed).toBe(true);
  });

  test("fails closed when MobileBench-style mobile-agent validity lacks environment, checkpoint, and license proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const mobileSignals: MetricValidationMobileAgentSignal[] = [
      "benchmark_manifest",
      "paper_or_source_reference",
      "app_inventory_manifest",
      "api_catalog_manifest",
      "ui_automation_trace",
      "task_dataset_manifest",
      "task_complexity_manifest",
      "metric_owner"
    ];
    const mobileEvidenceIds = mobileSignals.map((signal) => `mobilebench-missing-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED" as const
      })),
      ...mobileEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `f${index.toString(16)}`.repeat(64).slice(0, 64),
        writerSig: `mobilebench-missing-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `mobilebench-missing-session-${index}`,
        ts: Date.UTC(2026, 5, 15),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "mobile-agent",
        runId: "run-mobilebench-incomplete",
        ts: Date.UTC(2026, 5, 15),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireMobileAgentProof: true,
        mobileAgentChecks: mobileSignals.map((signal, index) => ({
          mobileAgentSignalId: mobileEvidenceIds[index]!.replace("mobilebench-missing-", ""),
          mobileAgentSignalType: signal,
          covered: true,
          evidenceRefs: [mobileEvidenceIds[index]!],
          artifactHash: signal === "metric_owner" ? undefined : index.toString(16).repeat(64).slice(0, 64),
          benchmarkIds: signal === "benchmark_manifest" || signal === "paper_or_source_reference"
            ? ["mobile-agent-benchmark-v1"]
            : undefined,
          appIds: signal === "app_inventory_manifest" ? ["calendar-fixture"] : undefined,
          apiCatalogIds: signal === "api_catalog_manifest" ? ["mobile-api-catalog-v1"] : undefined,
          uiTraceIds: signal === "ui_automation_trace" ? ["ui-trajectory-pack-v1"] : undefined,
          taskSetIds: signal === "task_dataset_manifest" ? ["mobile-task-pack-v1"] : undefined,
          taskComplexityGroups: signal === "task_complexity_manifest" ? ["single-app"] : undefined,
          owner: signal === "metric_owner" ? "AMC Mobile Agent Eval" : undefined
        })),
        sourceRefs: ["https://github.com/XiaoMi/MobileBench", "https://arxiv.org/abs/2407.00993"],
        gateMode: "ci"
      },
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 7), 4.01)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      status: "fail",
      mobileAgentSampleSize: 8
    });
    expect(report.rows[0]?.mobileAgentCoverage).toBeCloseTo(8 / 17, 6);
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("mobile_environment_manifest");
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("multi_app_task_manifest");
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("checkpoint_metric_rubric");
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("checkpoint_result_artifact");
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("dataset_license_boundary");
    expect(report.rows[0]?.mobileAgentMissingSignals).toContain("sample_size_confidence_interval");
    expect(report.rows[0]?.warnings.join(" ")).toContain("mobile-agent coverage");
    expect(report.evalPack.rows[0]?.mobileAgentCoverage).toBeCloseTo(8 / 17, 6);
    expect(report.evalPack.rows[0]?.mobileAgentMissingSignals).toContain("environment_reset_policy");
    expect(report.evalPack.replayable).toBe(true);
    expect(report.ciGate.failClosed).toBe(true);
    expect(report.ciGate.failedMetricIds).toContain("overall_maturity_score");
  });

  test("validates Hermes Bench metric validity with source, runner, judge, UI, regression, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const hermesSignals = [
      "source_repository_license",
      "default_branch_snapshot",
      "readme_build_spec_manifest",
      "backend_runner_manifest",
      "judge_calibration_manifest",
      "task_registry_manifest",
      "model_server_config_manifest",
      "adapter_coverage_manifest",
      "result_schema_manifest",
      "frontend_result_review_manifest",
      "backend_regression_manifest",
      "frontend_regression_manifest",
      "docker_runtime_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const hermesEvidenceIds = hermesSignals.map((signal) => `hermesbench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      })),
      ...hermesEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: (index % 16).toString(16).repeat(64),
        writerSig: `hermesbench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `hermesbench-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "hermesbench-agent",
        runId: "run-hermesbench-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireHermesBenchProof: true,
        hermesBenchChecks: hermesSignals.map((signal, index) => ({
          metricId: "overall_maturity_score",
          hermesBenchSignalType: signal,
          hermesBenchSignalId: `hermesbench-${signal}`,
          covered: true,
          evidenceRefs: [hermesEvidenceIds[index]!],
          artifactHash: (index % 16).toString(16).repeat(64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/Bent-Solutions/hermes-bench"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["MIT"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot" ? ["bef1884dd1312d6f1a8fd9676637d2aedffc1995"] : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["git-tree:bef1884dd1312d6f1a8fd9676637d2aedffc1995:recursive-untruncated"] : undefined,
          readmeBlobRefs: signal === "readme_build_spec_manifest" ? ["README.md@949c0fcf0f54a228c95a6158fabad50c92f3daea"] : undefined,
          buildSpecRefs: signal === "readme_build_spec_manifest" ? ["HERMES_BENCH_BUILD_SPEC.md@35dae9fe7166c50d34d9e2205982d51c98a46eaf"] : undefined,
          backendTreeRefs: signal === "backend_runner_manifest" ? ["backend@32c9ab8ad08522a27dc32a78b90e992fcc03c48e"] : undefined,
          runnerIds: signal === "backend_runner_manifest" ? ["backend/engine/benchmark_runner.py@3a730a972a14db9d0b8f64c311ee9afcb7692dd0"] : undefined,
          judgeIds: signal === "judge_calibration_manifest" ? ["backend/engine/judge.py@17247b27461b983a3478f6574a1207781c92e950"] : undefined,
          taskRegistryIds: signal === "task_registry_manifest" ? ["backend/engine/task_registry.py@956681be21650498b73e5675eb6ab727ce2ebe14"] : undefined,
          serverConfigIds: signal === "model_server_config_manifest" ? [
            "backend/config.py@8f21b5f8b77498f242bec27a41a2483c2c9a3f21",
            "backend/models/server_config.py@6e90d29080fd11d20c804b73a7c7b324fe8867cd"
          ] : undefined,
          adapterIds: signal === "adapter_coverage_manifest" ? [
            "backend/engine/hermes_adapter.py@e8ae1f57c243b977a3bbbdc939436765dcf1e679",
            "backend/engine/llamacpp_adapter.py@7102671cc2632d9ca65b8e1856d0443690ce5116"
          ] : undefined,
          resultSchemaIds: signal === "result_schema_manifest" ? [
            "backend/models/result.py@a5bfada38a2c1147b55803502ec385d04d4d52c9",
            "backend/models/judge_score.py@f2ba8e31b1d68551e12255b8fe216821d5bc5a30",
            "backend/models/benchmark.py@62dfe8d8b4ba93b59710e33636f28cb59d47760e"
          ] : undefined,
          frontendTreeRefs: signal === "frontend_result_review_manifest" ? ["frontend@00fcc687131e87e09e88b601c335312c94d4ffc3"] : undefined,
          frontendComponentIds: signal === "frontend_result_review_manifest" ? [
            "BenchmarkRunner.jsx@8901e75c20a011587519b4399e1cb0ec9385d24d",
            "ResultDetail.jsx@7e269920b46281ff7507e74798b6dff2b168c036",
            "ComparisonView.jsx@9e0a4f988881155909c2d9848aab12afb672fdbe"
          ] : undefined,
          backendTestIds: signal === "backend_regression_manifest" ? [
            "test_benchmark_runner.py@82dd92eee06ef3889ce00facc1c60dbe9cc14eae",
            "test_database.py@09ccd7006b5c345ff49a38909195119b8a390ec7",
            "test_hermes_adapter.py@921cdc5f0948079873603478aa5828d90113d98b",
            "test_integration.py@9ff280b30c2f42d438089ebecf0e679a56443597",
            "test_judge.py@3b8b0a81b8542044db5e8349ac7799d6dcd17ea5",
            "test_llamacpp_adapter.py@e206d538397c06ba5bbcf85a54697cdeac67bfe6",
            "test_routers.py@f26334130a35f5de80264832bf6fd5d6aaba4337",
            "test_session_manager.py@f1245b7e70b35b772a3d32814b5e06d35326047c"
          ] : undefined,
          frontendTestIds: signal === "frontend_regression_manifest" ? [
            "BenchmarkRunner.test.jsx@85173f42300bec31e4a54c174faf547bdbd791b5",
            "ComparisonView.test.jsx@c4ce0eb64472acc051a6ae72d96d5f1b207fb96a",
            "Layout.test.jsx@a2a2a44946a4d4756fe94bb39ff0bdf9522ebdf1",
            "ModelManager.test.jsx@d2b05a8ab7a764c2dc96183ee4e5527ba3f8e000"
          ] : undefined,
          dockerRuntimeIds: signal === "docker_runtime_manifest" ? [
            "Dockerfile@321d1138efc68d6012a9f027ec8fb45fdf263f08",
            "docker-compose.yml@0872144a289ef8ac0d6a915ccaca8d76209f3957",
            "start.sh@67036eb9edd64b1c4191db2b96e2a5ec35ded38b"
          ] : undefined,
          metricNames: signal === "result_schema_manifest" ? ["judge_score", "latency_ms", "tokens_per_second"] : undefined,
          taskCount: ["task_registry_manifest", "sample_size_confidence_interval"].includes(signal) ? 5 : undefined,
          adapterCount: ["adapter_coverage_manifest", "sample_size_confidence_interval"].includes(signal) ? 2 : undefined,
          backendTestCount: ["backend_regression_manifest", "sample_size_confidence_interval"].includes(signal) ? 8 : undefined,
          frontendTestCount: ["frontend_regression_manifest", "sample_size_confidence_interval"].includes(signal) ? 4 : undefined,
          judgeAgreement0to1: signal === "judge_calibration_manifest" ? 0.86 : undefined,
          regressionPassRate0to1: ["backend_regression_manifest", "frontend_regression_manifest"].includes(signal) ? 1 : undefined,
          owner: signal === "metric_owner" ? "AMC Benchmark Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 8 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval" ? { level: 0.95, lower: 0.82, upper: 0.88, marginOfError: 0.03 } : undefined
        })),
        sourceRefs: ["https://github.com/Bent-Solutions/hermes-bench"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      hermesBenchCoverage: 1,
      hermesBenchSampleSize: 15,
      hermesBenchMissingSignals: [],
      hermesBenchTaskCount: 5,
      hermesBenchAdapterCount: 2,
      hermesBenchBackendTestCount: 8,
      hermesBenchFrontendTestCount: 4,
      hermesBenchJudgeAgreement0to1: 0.86,
      hermesBenchRegressionPassRate0to1: 1
    });
    expect((report.rows[0] as any)?.hermesBenchRepositoryRefs).toEqual(["https://github.com/Bent-Solutions/hermes-bench"]);
    expect((report.rows[0] as any)?.hermesBenchCommitRefs).toContain("bef1884dd1312d6f1a8fd9676637d2aedffc1995");
    expect((report.rows[0] as any)?.hermesBenchReportArtifactHashes.length).toBe(13);
    expect((report.rows[0] as any)?.warnings.join(" ")).not.toContain("Hermes Bench coverage");
    expect((report.evalPack.rows[0] as any)?.hermesBenchCoverage).toBe(1);
    expect((report.evalPack.rows[0] as any)?.hermesBenchMissingSignals).toEqual([]);
    expect(report.evalPack.rows[0]?.rowHash).toHaveLength(64);
    expect(report.evalPack.replayable).toBe(true);
  });

  test("fails closed when Hermes Bench proof is only a repository label", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "hermesbench-agent",
        runId: "run-hermesbench-missing-proof",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit" as const,
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 19),
          trustTier: "OBSERVED_HARDENED" as const
        })),
        requireHermesBenchProof: true,
        hermesBenchChecks: [],
        sourceRefs: ["https://github.com/Bent-Solutions/hermes-bench"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect((report.rows[0] as any)?.hermesBenchCoverage).toBe(0);
    expect((report.rows[0] as any)?.hermesBenchMissingSignals).toContain("source_repository_license");
    expect((report.rows[0] as any)?.hermesBenchMissingSignals).toContain("backend_runner_manifest");
    expect((report.rows[0] as any)?.hermesBenchMissingSignals).toContain("judge_calibration_manifest");
    expect((report.rows[0] as any)?.warnings.join(" ")).toContain("Hermes Bench coverage");
    expect((report.evalPack.rows[0] as any)?.hermesBenchMissingSignals).toContain("frontend_regression_manifest");
  });

  test("validates CooperBench metric validity with source, dataset, runner, team harness, CI, release, and report proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const cooperSignals = [
      "source_repository_license_release",
      "default_branch_snapshot",
      "readme_changelog_manifest",
      "dataset_task_manifest",
      "feature_conflict_manifest",
      "runner_coop_manifest",
      "eval_backend_manifest",
      "team_harness_manifest",
      "agent_adapter_manifest",
      "ci_workflow_manifest",
      "package_lock_manifest",
      "report_publication_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const cooperEvidenceIds = cooperSignals.map((signal) => `cooperbench-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      })),
      ...cooperEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: (index % 16).toString(16).repeat(64),
        writerSig: `cooperbench-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `cooperbench-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "cooperbench-agent",
        runId: "run-cooperbench-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireCooperBenchProof: true,
        cooperBenchChecks: cooperSignals.map((signal, index) => ({
          metricId: "overall_maturity_score",
          cooperBenchSignalType: signal,
          cooperBenchSignalId: `cooperbench-${signal}`,
          covered: true,
          evidenceRefs: [cooperEvidenceIds[index]!],
          artifactHash: (index % 16).toString(16).repeat(64),
          repositoryRefs: ["https://github.com/cooperbench/CooperBench"],
          licenseRefs: ["no-github-license"],
          releaseRefs: ["v0.0.19@d46d9e73fa64159e0428b480f293623de90be1ad"],
          branchRefs: ["main"],
          commitRefs: ["d46d9e73fa64159e0428b480f293623de90be1ad"],
          treeRefs: ["7ca5c3a0a6cac5c2533ce058cf04cad3b5dcf3ef"],
          readmeBlobRefs: ["README.md@d486acdd2fa4936f2c426277031cfb363de190e1"],
          changelogRefs: ["CHANGELOG.md@a0004f7e8acf969d502e23d152bb7c838db62d11"],
          datasetTreeRefs: ["dataset@fd4bf0313e6a8d76d4aef56a9b4c1c09353214c1"],
          datasetReadmeRefs: ["dataset/README.md@8d1d421e2cbdc957ca19700422c1e2d96329cf23"],
          runnerIds: [
            "runner@d21226e2c9e194721b41d1b9d820969a31351923",
            "coop.py@304766f9b79a3f976c124d7036e4c90524a4ae0d"
          ],
          evalBackendIds: [
            "eval@7528413540ad07352dd2b86e262a28adb764c53c",
            "sandbox.py@cb4e742eff173c2d135aaaa38a8babc6400d480c"
          ],
          teamHarnessIds: [
            "team_harness@cdad5c173e8cf592a54fafad7b84c346166d14ff",
            "protocol.py@05b4b71078e4d591ed131d7bb99baa55915673ec",
            "metrics.py@4b898531d38ade466fdd083ee2a48554cbda890c"
          ],
          agentAdapterIds: [
            "agents@692b647b7a956a6e1096ac16e16b5541e6845cef",
            "claude_code",
            "codex",
            "mini_swe_agent_v2"
          ],
          ciWorkflowIds: [
            "test.yml@e685fd99993e540804dd9d12e354b41bb605ab28",
            "publish.yml@8af3b5a9c6f53ee277a374d5a694787364dc513a"
          ],
          packageLockRefs: [
            "pyproject.toml@94259bc94de0c20b09b19649cbb14a4e180547a4",
            "uv.lock@2b9f1cbdb2880e92c9d6d1d1325ae386ef3f2a59"
          ],
          reportPublicationRefs: ["https://cooperbench-reports.pages.dev"],
          metricNames: ["cooperation_score", "conflict_resolution_rate"],
          taskCount: 30,
          featureCount: 199,
          agentAdapterCount: 4,
          testCount: 61,
          cooperationScore0to1: 0.84,
          conflictResolutionRate0to1: 0.82,
          regressionPassRate0to1: 1,
          owner: signal === "metric_owner" ? "AMC Benchmark Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 8 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval" ? { level: 0.95, lower: 0.79, upper: 0.86, marginOfError: 0.035 } : undefined
        })),
        sourceRefs: ["https://github.com/cooperbench/CooperBench"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      cooperBenchCoverage: 1,
      cooperBenchSampleSize: 14,
      cooperBenchMissingSignals: [],
      cooperBenchTaskCount: 30,
      cooperBenchFeatureCount: 199,
      cooperBenchAgentAdapterCount: 4,
      cooperBenchTestCount: 61,
      cooperBenchCooperationScore0to1: 0.84,
      cooperBenchConflictResolutionRate0to1: 0.82,
      cooperBenchRegressionPassRate0to1: 1
    });
    expect((report.rows[0] as any)?.cooperBenchRepositoryRefs).toEqual(["https://github.com/cooperbench/CooperBench"]);
    expect((report.rows[0] as any)?.cooperBenchLicenseRefs).toEqual(["no-github-license"]);
    expect((report.rows[0] as any)?.cooperBenchReleaseRefs).toContain("v0.0.19@d46d9e73fa64159e0428b480f293623de90be1ad");
    expect((report.rows[0] as any)?.cooperBenchReportArtifactHashes.length).toBe(12);
    expect((report.rows[0] as any)?.warnings.join(" ")).not.toContain("CooperBench coverage");
    expect((report.evalPack.rows[0] as any)?.cooperBenchCoverage).toBe(1);
    expect((report.evalPack.rows[0] as any)?.cooperBenchMissingSignals).toEqual([]);
    expect((report.evalPack.rows[0] as any)?.cooperBenchCiWorkflowIds).toContain("test.yml@e685fd99993e540804dd9d12e354b41bb605ab28");
    expect(report.evalPack.rows[0]?.rowHash).toHaveLength(64);
    expect(report.evalPack.replayable).toBe(true);
  });

  test("fails closed when CooperBench proof is only a repository label", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "cooperbench-agent",
        runId: "run-cooperbench-missing-proof",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit" as const,
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 19),
          trustTier: "OBSERVED_HARDENED" as const
        })),
        requireCooperBenchProof: true,
        cooperBenchChecks: [],
        sourceRefs: ["https://github.com/cooperbench/CooperBench"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect((report.rows[0] as any)?.cooperBenchCoverage).toBe(0);
    expect((report.rows[0] as any)?.cooperBenchMissingSignals).toContain("source_repository_license_release");
    expect((report.rows[0] as any)?.cooperBenchMissingSignals).toContain("dataset_task_manifest");
    expect((report.rows[0] as any)?.cooperBenchMissingSignals).toContain("team_harness_manifest");
    expect((report.rows[0] as any)?.warnings.join(" ")).toContain("CooperBench coverage");
    expect((report.evalPack.rows[0] as any)?.cooperBenchMissingSignals).toContain("ci_workflow_manifest");
  });

  test("validates CoderCup metric validity with source, suite, runner, score ledger, live artifact, and methodology proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const coderCupSignals: MetricValidationCoderCupSignal[] = [
      "source_repository_license_homepage",
      "default_branch_snapshot",
      "readme_contributing_manifest",
      "ci_workflow_manifest",
      "package_lock_manifest",
      "task_spec_manifest",
      "testsuite_manifest",
      "runner_contract_manifest",
      "score_ledger_manifest",
      "live_artifact_manifest",
      "methodology_reference_manifest",
      "cost_accounting_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ];
    const coderCupEvidenceIds = coderCupSignals.map((signal) => `codercup-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      })),
      ...coderCupEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: (index % 16).toString(16).repeat(64),
        writerSig: `codercup-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `codercup-session-${index}`,
        ts: Date.UTC(2026, 5, 20),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "codercup-agent",
        runId: "run-codercup-validity",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireCoderCupProof: true,
        coderCupChecks: coderCupSignals.map((signal, index) => ({
          metricId: "overall_maturity_score",
          coderCupSignalType: signal,
          coderCupSignalId: `codercup-${signal}`,
          covered: true,
          evidenceRefs: [coderCupEvidenceIds[index]!],
          artifactHash: (index % 16).toString(16).repeat(64),
          repositoryRefs: ["https://github.com/TestSprite/CoderCup"],
          licenseRefs: ["Apache-2.0:LICENSE@d645695673349e3947e8e5ae42332d0ac3164cd7"],
          homepageRefs: ["https://codercup.ai"],
          branchRefs: ["main"],
          commitRefs: ["d066f16f99c3bb83919d5325f42f81b83a10d827"],
          treeRefs: ["8458d478feb0644545006192cf5a91c2b51bf2dc:recursive-untruncated:509"],
          readmeBlobRefs: ["README.md@83588bc1df595ec36e777f63de63d634bf4147ad"],
          contributingRefs: ["CONTRIBUTING.md@c7470576ca473c2711c1cb6d093eba9001ed438b"],
          ciWorkflowIds: [".github/workflows/ci.yml@39819135d4cae10a101bced4a7d467493463b332"],
          packageManifestRefs: ["package.json@e6441cd35c96c51207088e001f5aa794ba7bdb6a"],
          packageLockRefs: ["package-lock.json@404a71d24196c9a5674efd94e5e686e834facd6e"],
          taskSpecRefs: [
            "task-spec@c3d336ce3fa99a21e9616f0efce4de6a45c837ef",
            "task-spec/world-cup-2026-v3.md@ea9a89957800fa22a5fdaef14fcf9f538984fbff"
          ],
          testSuiteRefs: ["tests/world-cup-2026-v3@1097400ef2d24618002e651566a013616d69d70e"],
          suiteIndexRefs: [
            "phase-1/suite-index.json@4f1cfb739d57232a3e0bfae5e9aac586281fb691",
            "phase-2/suite-index.json@27430b5951c220d770d6c3d52581d6990b7ea4db",
            "phase-3/suite-index.json@b219b8b5e0e8c2733e3d7967f5835db83ba81dbc",
            "phase-4/suite-index.json@1072f5f60d98c153cbe7dce0f03d21ad3e2ce754",
            "phase-5/suite-index.json@18b4100bc8497c1978fc1204dd5aed6c57033aa3",
            "phase-6/suite-index.json@a78c4ab2c80ff5afda85bda61b5910fe48ac97af",
            "phase-7/suite-index.json@b350ca182ea40c27566330e20d248da7990cc7b0",
            "phase-8/suite-index.json@f09b5ce9bb24022f05b97baaf71d23707ca84029",
            "phase-9/suite-index.json@fee26e9ea9fd647257e40e16ea735c4ea4fbe873",
            "phase-10/suite-index.json@36e992bd83ee4f98aa4bfbb18c979d1fb46b7e33"
          ],
          runnerIds: [
            "runners/antigravity/driver.ts@34a19dab0aaf346cec7dc807c7465c423a9914f3",
            "runners/claude_code/driver.ts@7018a91cb12bfc7c4a7f05c96c7d7ace78e4033b",
            "runners/codex/driver.ts@2afef7d0a19ce8caa1b6f677f2af65db36de8673",
            "runners/kimi/driver.ts@2096c8ba000eeaf4375b8453e950a8164a3a254c"
          ],
          runnerContractRefs: [
            "runners/README.md@4159bc70074440fbdf3d30d1a9d77d3f948ff2ce",
            "runners/contract/schema.ts@2bf5ae263127678dbe422e4793787b86aabb3bde",
            "scripts/run-agent-v3.sh@0a5cf31ca7b1db250563bcbd85ce0392914cf9f8"
          ],
          scoreLedgerRefs: [
            "scores/world-cup-2026-v3.json@ecb555bf0eab00cbc1bcca63f59c0aba2f20c55a",
            "scores/world-cup-2026-v3.verdicts.json@e5b0006a4d55ade3d2aef73af8d4fcc6471e3069",
            "scores/world-cup-2026-v3.phase-history.json@57c038e18b37275bc131fe711caf5027a9ff5ee3",
            "scores/kimi-cumulative-verdicts.json@625928cf395e43459bdd5507b3c90ad4916ac0de",
            "scores/kimi-trajectory-clean.json@23ebef34a7f0f759c75a3056c420455abde60b92"
          ],
          liveArtifactRefs: [
            "app/live/LiveClient.tsx@4a631ffa294cb221c1873eff17c7a0a8effc8be4",
            "app/live/LiveClient.test.tsx@1e828ff496bfb2f290b87f6abada5c8729f86c66",
            "app/live/live-emit.test.ts@1a496a0a1e1557494ab6b7cacdf9f664919029d9"
          ],
          methodologyRefs: [
            "app/methodology/MethodologyClient.tsx@9b114fcbef26965fc2dd49ce302bb374ffdd430e",
            "docs/cost-methodology.md@6c4ec84e3f4964cb84f898ae163b05fa598e1aa6"
          ],
          referenceRefs: ["app/reference/ReferenceClient.tsx@9f3e61c901acbd8697f2b6faec9df26d4e494509"],
          costMethodologyRefs: ["docs/cost-methodology.md@6c4ec84e3f4964cb84f898ae163b05fa598e1aa6"],
          publicFixtureRefs: [
            "public/fixtures/leaderboard.json@eb587d5624cbf2bd81661c29b081f5b56c364cfe",
            "public/fixtures/live/world-cup-2026.json@c19bd0d00c5787b7a89784f0fb42a1fc6a587b17"
          ],
          metricNames: ["composite_score", "phase_verdict_pass_rate", "cost_adjusted_score"],
          phaseCount: ["task_spec_manifest", "testsuite_manifest", "sample_size_confidence_interval"].includes(signal) ? 10 : undefined,
          testPlanCount: ["testsuite_manifest", "sample_size_confidence_interval"].includes(signal) ? 192 : undefined,
          runnerCount: ["runner_contract_manifest", "sample_size_confidence_interval"].includes(signal) ? 4 : undefined,
          scoreLedgerCount: ["score_ledger_manifest", "sample_size_confidence_interval"].includes(signal) ? 5 : undefined,
          liveSurfaceCount: ["live_artifact_manifest", "sample_size_confidence_interval"].includes(signal) ? 5 : undefined,
          interRaterAgreement0to1: signal === "sample_size_confidence_interval" ? 0.91 : undefined,
          testRetestReliability0to1: signal === "sample_size_confidence_interval" ? 0.9 : undefined,
          regressionPassRate0to1: signal === "ci_workflow_manifest" ? 1 : undefined,
          owner: signal === "metric_owner" ? "AMC CoderCup Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 10 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval" ? { level: 0.95, lower: 0.81, upper: 0.87, marginOfError: 0.03 } : undefined
        })),
        sourceRefs: ["https://github.com/TestSprite/CoderCup", "https://codercup.ai"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      coderCupCoverage: 1,
      coderCupSampleSize: 14,
      coderCupMissingSignals: [],
      coderCupPhaseCount: 10,
      coderCupTestPlanCount: 192,
      coderCupRunnerCount: 4,
      coderCupScoreLedgerCount: 5,
      coderCupLiveSurfaceCount: 5,
      coderCupInterRaterAgreement0to1: 0.91,
      coderCupTestRetestReliability0to1: 0.9,
      coderCupRegressionPassRate0to1: 1
    });
    expect((report.rows[0] as any)?.coderCupRepositoryRefs).toEqual(["https://github.com/TestSprite/CoderCup"]);
    expect((report.rows[0] as any)?.coderCupCommitRefs).toContain("d066f16f99c3bb83919d5325f42f81b83a10d827");
    expect((report.rows[0] as any)?.coderCupSuiteIndexRefs.length).toBe(10);
    expect((report.rows[0] as any)?.coderCupReportArtifactHashes.length).toBe(12);
    expect((report.rows[0] as any)?.warnings.join(" ")).not.toContain("CoderCup coverage");
    expect((report.evalPack.rows[0] as any)?.coderCupCoverage).toBe(1);
    expect((report.evalPack.rows[0] as any)?.coderCupMissingSignals).toEqual([]);
    expect((report.evalPack.rows[0] as any)?.coderCupScoreLedgerRefs).toContain("scores/world-cup-2026-v3.json@ecb555bf0eab00cbc1bcca63f59c0aba2f20c55a");
    expect(report.evalPack.rows[0]?.rowHash).toHaveLength(64);
    expect(report.evalPack.replayable).toBe(true);
  });

  test("fails closed when CoderCup proof is only a repository label", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "codercup-agent",
        runId: "run-codercup-missing-proof",
        ts: Date.UTC(2026, 5, 20),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit" as const,
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 20),
          trustTier: "OBSERVED_HARDENED" as const
        })),
        requireCoderCupProof: true,
        coderCupChecks: [],
        sourceRefs: ["https://github.com/TestSprite/CoderCup"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect((report.rows[0] as any)?.coderCupCoverage).toBe(0);
    expect((report.rows[0] as any)?.coderCupMissingSignals).toContain("source_repository_license_homepage");
    expect((report.rows[0] as any)?.coderCupMissingSignals).toContain("testsuite_manifest");
    expect((report.rows[0] as any)?.coderCupMissingSignals).toContain("score_ledger_manifest");
    expect((report.rows[0] as any)?.warnings.join(" ")).toContain("CoderCup coverage");
    expect((report.evalPack.rows[0] as any)?.coderCupMissingSignals).toContain("methodology_reference_manifest");
  });

  test("validates Agentic Graph RAG metric validity with source, graph, RAG, vector-store, evaluation, experiment, UI, and dependency proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const graphRagSignals = [
      "source_repository_no_license",
      "default_branch_snapshot",
      "readme_project_manifest",
      "graph_orchestrator_manifest",
      "rag_pipeline_manifest",
      "database_vector_store_manifest",
      "evaluation_metric_manifest",
      "experiment_tracking_manifest",
      "ui_question_manifest",
      "dependency_lock_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const graphRagEvidenceIds = graphRagSignals.map((signal) => `agentic-graph-rag-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      })),
      ...graphRagEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: (index % 16).toString(16).repeat(64),
        writerSig: `agentic-graph-rag-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `agentic-graph-rag-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "agentic-graph-rag-agent",
        runId: "run-agentic-graph-rag-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireAgenticGraphRagProof: true,
        agenticGraphRagChecks: graphRagSignals.map((signal, index) => ({
          metricId: "overall_maturity_score",
          agenticGraphRagSignalType: signal,
          agenticGraphRagSignalId: `agentic-graph-rag-${signal}`,
          covered: true,
          evidenceRefs: [graphRagEvidenceIds[index]!],
          artifactHash: (index % 16).toString(16).repeat(64),
          repositoryRefs: ["https://github.com/mlvanguards/agentic-graph-rag-evaluation-cometml"],
          licenseRefs: ["no-github-license:github-api-null"],
          branchRefs: ["main"],
          commitRefs: ["98dfb36169be05981acd72940116b0e5999d5c3a"],
          treeRefs: ["fcbbee6f5abca9d39be7354ec0ca769df93fb1b7"],
          readmeBlobRefs: ["readme.md@2c096ccc4a940540de98118d5197d47b71ea27fd"],
          graphWorkflowIds: [
            "src/core/graph.py@ed35a8105c3f266441fa30f24007ef7eedf44434",
            "src/core/state.py@848d632bc8f3467b77e1645e8e86ffae1120a6ca"
          ],
          orchestratorIds: ["src/orchestrator/coordinator.py@9dee8ceae583d0cda902f5511e66ec624ed44a49"],
          ragPipelineIds: [
            "src/components/rag/indexing.py@289073753ba623420ddccea1d6a7ac3e472f2adc",
            "src/components/rag/tool.py@28e88cdbb664070abf29cc2401c84da8370f2e02"
          ],
          databaseIds: [
            "src/components/database/neo4j_client.py@fd64de97619fd85c83b6cfed76971aa9140a795c",
            "src/components/database/ingest.py@62db9ed8a3aa30d758ffdce00a8b2cb0374c9c9a"
          ],
          vectorStoreIds: ["src/components/database/vector_store.py@36fdd37dfbdb0e4228d07c98a122c8960ee6fc2a"],
          evaluationIds: [
            "src/components/evaluation/custom_metric.py@4db36a1b4d399e9fd6e6397a36c7ef4dbc10ed3c",
            "src/components/evaluation/opik_evaluator.py@ea1cfc2c3bfe667c724fc008cea06eaac2501b63"
          ],
          experimentTrackerIds: ["src/components/evaluation/experiment_tracker.py@6ba3aa2d80a6974e87a8abb41e8ecb54c26429e9"],
          uiComponentIds: [
            "src/streamlit/predefined_questions.py@72912bb9380bd823ca7cc9cf7347033092b593a1",
            "src/streamlit/main.py@bd6d6585184ce274b2b2a0364dc420dbf971e3a7"
          ],
          dependencyLockRefs: [
            "pyproject.toml@c40ddede823556abb5b1b6086dc852ddd1270540",
            "requirements.txt@3dcb183e499d30bc7a6f1337e175ab45c46e055c",
            "poetry.lock@df7b3c274241fc251d63b288e4496c4d833dc2d9"
          ],
          metricNames: ["graph_rag_retrieval_grounding", "opik_custom_metric"],
          graphNodeCount: 5,
          graphEdgeCount: 7,
          evaluationMetricCount: 2,
          experimentCount: 1,
          retrievalGroundingScore0to1: 0.86,
          regressionPassRate0to1: 0.93,
          owner: signal === "metric_owner" ? "AMC Agentic Graph RAG Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 8 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval" ? { level: 0.95, lower: 0.81, upper: 0.89, marginOfError: 0.04 } : undefined
        })),
        sourceRefs: ["https://github.com/mlvanguards/agentic-graph-rag-evaluation-cometml"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      agenticGraphRagCoverage: 1,
      agenticGraphRagSampleSize: 12,
      agenticGraphRagMissingSignals: [],
      agenticGraphRagGraphNodeCount: 5,
      agenticGraphRagEvaluationMetricCount: 2,
      agenticGraphRagExperimentCount: 1,
      agenticGraphRagRetrievalGroundingScore0to1: 0.86,
      agenticGraphRagRegressionPassRate0to1: 0.93
    });
    expect((report.rows[0] as any)?.agenticGraphRagRepositoryRefs).toEqual(["https://github.com/mlvanguards/agentic-graph-rag-evaluation-cometml"]);
    expect((report.rows[0] as any)?.agenticGraphRagLicenseRefs).toEqual(["no-github-license:github-api-null"]);
    expect((report.rows[0] as any)?.agenticGraphRagReportArtifactHashes.length).toBe(10);
    expect((report.rows[0] as any)?.warnings.join(" ")).not.toContain("Agentic Graph RAG coverage");
    expect((report.evalPack.rows[0] as any)?.agenticGraphRagCoverage).toBe(1);
    expect((report.evalPack.rows[0] as any)?.agenticGraphRagMissingSignals).toEqual([]);
    expect((report.evalPack.rows[0] as any)?.agenticGraphRagExperimentTrackerIds).toContain("src/components/evaluation/experiment_tracker.py@6ba3aa2d80a6974e87a8abb41e8ecb54c26429e9");
    expect(report.evalPack.rows[0]?.rowHash).toHaveLength(64);
    expect(report.evalPack.replayable).toBe(true);
  });

  test("fails closed when Agentic Graph RAG proof is only a repository label", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "agentic-graph-rag-agent",
        runId: "run-agentic-graph-rag-missing-proof",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit" as const,
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 19),
          trustTier: "OBSERVED_HARDENED" as const
        })),
        requireAgenticGraphRagProof: true,
        agenticGraphRagChecks: [],
        sourceRefs: ["https://github.com/mlvanguards/agentic-graph-rag-evaluation-cometml"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect((report.rows[0] as any)?.agenticGraphRagCoverage).toBe(0);
    expect((report.rows[0] as any)?.agenticGraphRagMissingSignals).toContain("source_repository_no_license");
    expect((report.rows[0] as any)?.agenticGraphRagMissingSignals).toContain("graph_orchestrator_manifest");
    expect((report.rows[0] as any)?.agenticGraphRagMissingSignals).toContain("evaluation_metric_manifest");
    expect((report.rows[0] as any)?.warnings.join(" ")).toContain("Agentic Graph RAG coverage");
    expect((report.evalPack.rows[0] as any)?.agenticGraphRagMissingSignals).toContain("dependency_lock_manifest");
  });

  test("validates SubtleMemory metric validity with source, dataset, relation, staged eval, reliability, and CI proof", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const subtleMemorySignals = [
      "source_repository_license",
      "default_branch_snapshot",
      "arxiv_paper_version",
      "huggingface_dataset_release",
      "persona_split_manifest",
      "bench_instance_manifest",
      "history_session_manifest",
      "relation_taxonomy_manifest",
      "construction_pipeline_manifest",
      "staged_evaluation_protocol",
      "adapter_roster_manifest",
      "judge_evaluator_config",
      "score_summary_report",
      "diagnostic_protocol_report",
      "ci_validation_manifest",
      "metric_owner",
      "sample_size_confidence_interval"
    ] as const;
    const subtleMemoryEvidenceIds = subtleMemorySignals.map((signal) => `subtlememory-${signal}`);
    const signedEvidenceRefs = [
      ...questionScores.map((row, index) => ({
        evidenceId: row.evidenceEventIds[0]!,
        eventHash: `${index}`.repeat(64).slice(0, 64),
        writerSig: `writer-sig-${index}`,
        eventType: "audit" as const,
        sessionId: `session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      })),
      ...subtleMemoryEvidenceIds.map((evidenceId, index) => ({
        evidenceId,
        eventHash: `s${index}`.repeat(64).slice(0, 64),
        writerSig: `subtlememory-writer-sig-${index}`,
        eventType: "metric" as const,
        sessionId: `subtlememory-session-${index}`,
        ts: Date.UTC(2026, 5, 19),
        trustTier: "OBSERVED_HARDENED" as const
      }))
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "subtlememory-agent",
        runId: "run-subtlememory-validity",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs,
        requireSubtleMemoryProof: true,
        subtleMemoryChecks: subtleMemorySignals.map((signal, index) => ({
          metricId: "overall_maturity_score",
          subtleMemorySignalType: signal,
          subtleMemorySignalId: `subtlememory-${signal}`,
          covered: true,
          evidenceRefs: [subtleMemoryEvidenceIds[index]!],
          artifactHash: `${index}`.repeat(64).slice(0, 64),
          repositoryRefs: signal === "source_repository_license" ? ["https://github.com/Yummytanmo/SubtleMemory"] : undefined,
          licenseRefs: signal === "source_repository_license" ? ["Apache-2.0"] : undefined,
          branchRefs: signal === "default_branch_snapshot" ? ["main"] : undefined,
          commitRefs: signal === "default_branch_snapshot" ? ["e4c30d231bf29e19f2ae7a84736f72ed0a95c7ed"] : undefined,
          treeRefs: signal === "default_branch_snapshot" ? ["git-tree:1084-paths"] : undefined,
          arxivRefs: signal === "arxiv_paper_version" ? ["arxiv:2606.05761v2"] : undefined,
          datasetRefs: signal === "huggingface_dataset_release" ? ["hf:Yummytanmo/SubtleMemory@d7a479e1d39c035314084efc991406cf501ee107"] : undefined,
          personaIds: signal === "persona_split_manifest" ? Array.from({ length: 10 }, (_, persona) => `persona_${persona}`) : undefined,
          benchInstanceManifestIds: signal === "bench_instance_manifest" ? ["bench_instances:10-splits"] : undefined,
          historySessionManifestIds: signal === "history_session_manifest" ? ["history_sessions:10-splits"] : undefined,
          relationTypes: signal === "relation_taxonomy_manifest" ? ["complementary", "nuanced", "contradictory"] : undefined,
          constructionPipelineIds: signal === "construction_pipeline_manifest" ? ["subtlememory-five-stage-construction"] : undefined,
          evaluationStageIds: signal === "staged_evaluation_protocol" ? ["add", "finalize", "search", "answer", "evaluate"] : undefined,
          adapterIds: signal === "adapter_roster_manifest" ? ["mem0", "memos", "zep", "openclaw-mem0", "openclaw-memos", "oracle-context"] : undefined,
          judgeIds: signal === "judge_evaluator_config" ? ["subtlememory-llm-judge"] : undefined,
          evaluatorIds: signal === "judge_evaluator_config" ? ["exact_match", "classification_match", "hybrid", "llm_judge"] : undefined,
          metricNames: signal === "score_summary_report" ? ["relation_accuracy", "retrieval_recall", "answer_correctness"] : undefined,
          scoreSummaryIds: signal === "score_summary_report" ? ["score_summary.json"] : undefined,
          diagnosticProtocolIds: signal === "diagnostic_protocol_report" ? ["memory_preservation", "retrieval", "downstream_reasoning"] : undefined,
          ciReporterIds: signal === "ci_validation_manifest" ? ["evaluation.validate_run"] : undefined,
          reporterFormats: signal === "ci_validation_manifest" ? ["jsonl", "json"] : undefined,
          personaCount: ["persona_split_manifest", "sample_size_confidence_interval"].includes(signal) ? 10 : undefined,
          benchInstanceCount: ["bench_instance_manifest", "sample_size_confidence_interval"].includes(signal) ? 1522 : undefined,
          historyCount: ["history_session_manifest", "sample_size_confidence_interval"].includes(signal) ? 10 : undefined,
          memoryVariantSetCount: signal === "relation_taxonomy_manifest" ? 1090 : undefined,
          relationTypeCount: signal === "relation_taxonomy_manifest" ? 3 : undefined,
          evaluationStageCount: signal === "staged_evaluation_protocol" ? 5 : undefined,
          adapterCount: signal === "adapter_roster_manifest" ? 6 : undefined,
          judgeAgreement0to1: signal === "judge_evaluator_config" ? 0.88 : undefined,
          validationPassRate0to1: signal === "ci_validation_manifest" ? 0.96 : undefined,
          owner: signal === "metric_owner" ? "AMC Memory Metric Owner" : undefined,
          sampleSize: signal === "sample_size_confidence_interval" ? 1522 : undefined,
          confidenceInterval: signal === "sample_size_confidence_interval" ? { level: 0.95, lower: 0.82, upper: 0.87, marginOfError: 0.025 } : undefined
        })),
        sourceRefs: [
          "https://github.com/Yummytanmo/SubtleMemory",
          "https://arxiv.org/abs/2606.05761",
          "https://huggingface.co/datasets/Yummytanmo/SubtleMemory"
        ],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(false);
    expect(report.rows[0]).toMatchObject({
      subtleMemoryCoverage: 1,
      subtleMemorySampleSize: 17,
      subtleMemoryMissingSignals: [],
      subtleMemoryPersonaCount: 10,
      subtleMemoryBenchInstanceCount: 1522,
      subtleMemoryMemoryVariantSetCount: 1090,
      subtleMemoryRelationTypeCount: 3,
      subtleMemoryEvaluationStageCount: 5,
      subtleMemoryAdapterCount: 6,
      subtleMemoryJudgeAgreement0to1: 0.88,
      subtleMemoryValidationPassRate0to1: 0.96
    });
    expect((report.rows[0] as any)?.subtleMemoryRelationTypes).toEqual(["complementary", "nuanced", "contradictory"]);
    expect((report.rows[0] as any)?.subtleMemoryReportArtifactHashes.length).toBe(15);
    expect((report.rows[0] as any)?.warnings.join(" ")).not.toContain("SubtleMemory coverage");
    expect((report.evalPack.rows[0] as any)?.subtleMemoryCoverage).toBe(1);
    expect((report.evalPack.rows[0] as any)?.subtleMemoryMissingSignals).toEqual([]);
    expect(report.evalPack.rows[0]?.evidenceRefs).toEqual([
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...subtleMemoryEvidenceIds
    ]);
  });

  test("fails closed when SubtleMemory proof is only a source label and aggregate memory score", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];

    const report = buildMetricValidationReport(
      {
        agentId: "subtlememory-agent",
        runId: "run-subtlememory-missing-proof",
        ts: Date.UTC(2026, 5, 19),
        trustLabel: "HIGH TRUST",
        integrityIndex: 1,
        evidenceCoverage: 1,
        correlationRatio: 1,
        unsupportedClaimCount: 0,
        layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
        questionScores,
        confidenceSummary: {
          lowConfidenceFindings: 0,
          highUncertaintyFindings: 0,
          downgradedFindings: 0,
          autoFixBlockedRecommendations: 0,
          averageEvidenceSufficiency: 1,
          averageJudgeAgreement: 0.94
        },
        questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
        signedEvidenceRefs: questionScores.map((row, index) => ({
          evidenceId: row.evidenceEventIds[0]!,
          eventHash: `${index}`.repeat(64).slice(0, 64),
          writerSig: `writer-sig-${index}`,
          eventType: "audit" as const,
          sessionId: `session-${index}`,
          ts: Date.UTC(2026, 5, 19),
          trustTier: "OBSERVED_HARDENED" as const
        })),
        requireSubtleMemoryProof: true,
        subtleMemoryChecks: [],
        sourceRefs: ["https://github.com/Yummytanmo/SubtleMemory"],
        gateMode: "ci"
      } as any,
      [
        prior("run-1", Date.UTC(2026, 5, 1), 4),
        prior("run-2", Date.UTC(2026, 5, 10), 4.02)
      ]
    );

    expect(report.failClosed).toBe(true);
    expect((report.rows[0] as any)?.subtleMemoryCoverage).toBe(0);
    expect((report.rows[0] as any)?.subtleMemoryMissingSignals).toContain("source_repository_license");
    expect((report.rows[0] as any)?.subtleMemoryMissingSignals).toContain("relation_taxonomy_manifest");
    expect((report.rows[0] as any)?.warnings.join(" ")).toContain("SubtleMemory coverage");
    expect((report.evalPack.rows[0] as any)?.subtleMemoryMissingSignals).toContain("ci_validation_manifest");
  });

  test("maps comparative RAG and agent framework benchmarks to existing metric validity checks", () => {
    const questionScores = [
      score("AMC-1.1", 4),
      score("AMC-1.2", 4),
      score("AMC-1.3", 4),
      score("AMC-1.4", 4),
      score("AMC-1.5", 4),
      score("AMC-1.6", 4)
    ];
    const facetIds = [
      "facet-throughput",
      "facet-latency",
      "facet-resource-usage",
      "facet-rag-pipeline",
      "facet-agent-resiliency"
    ];
    const confounderIds = [
      "confounder-framework-runtime",
      "confounder-local-ollama-backend",
      "confounder-dataset-corpus",
      "confounder-concurrency-level",
      "confounder-dependency-versions"
    ];
    const outcomeIds = [
      "outcome-production-latency",
      "outcome-throughput-capacity",
      "outcome-memory-budget",
      "outcome-error-recovery",
      "outcome-cost-efficiency"
    ];
    const processIds = [
      "process-paired-go-python-scenario",
      "process-stepwise-run-command",
      "process-result-artifact",
      "process-repeatable-local-backend",
      "process-summary-table"
    ];
    const safetyUtilityIds = [
      "safety-timeout-behavior",
      "safety-tool-failure-behavior",
      "safety-parser-failure-behavior",
      "safety-resource-pressure",
      "safety-observability-overhead"
    ];
    const lifecycleIds = [
      "watch-baseline-latency",
      "watch-p95-p99-tail",
      "watch-cpu-memory-drift",
      "watch-error-rate",
      "watch-gpu-saturation"
    ];
    const evidenceIds = [
      ...questionScores.map((row) => row.evidenceEventIds[0]!),
      ...facetIds,
      ...confounderIds,
      ...outcomeIds,
      ...processIds,
      ...safetyUtilityIds,
      ...lifecycleIds
    ];
    const baseInput = {
      agentId: "comparative-framework-agent",
      runId: "run-langchain-framework-benchmark",
      ts: Date.UTC(2026, 5, 20),
      trustLabel: "HIGH TRUST" as const,
      integrityIndex: 1,
      evidenceCoverage: 1,
      correlationRatio: 1,
      unsupportedClaimCount: 0,
      layerScores: [{ layerName, avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
      questionScores,
      confidenceSummary: {
        lowConfidenceFindings: 0,
        highUncertaintyFindings: 0,
        downgradedFindings: 0,
        autoFixBlockedRecommendations: 0,
        averageEvidenceSufficiency: 1,
        averageJudgeAgreement: 0.93
      },
      questions: questionScores.map((row) => ({ id: row.questionId, layerName })),
      validationFacetChecks: facetIds.map((facetId) => ({ facetId, covered: true, evidenceRefs: [facetId] })),
      confounderControlChecks: confounderIds.map((confounderId) => ({
        confounderId,
        controlled: true,
        evidenceRefs: [confounderId]
      })),
      outcomeAlignmentChecks: outcomeIds.map((outcomeId) => ({ outcomeId, aligned: true, evidenceRefs: [outcomeId] })),
      processEvidenceChecks: processIds.map((processEvidenceId) => ({
        processEvidenceId,
        covered: true,
        evidenceRefs: [processEvidenceId]
      })),
      safetyUtilityChecks: safetyUtilityIds.map((safetyUtilityId) => ({
        safetyUtilityId,
        covered: true,
        evidenceRefs: [safetyUtilityId]
      })),
      lifecycleObservabilityChecks: lifecycleIds.map((lifecycleSignalId) => ({
        lifecycleSignalId,
        covered: true,
        evidenceRefs: [lifecycleSignalId]
      })),
      sourceRefs: ["https://github.com/FareedKhan-dev/langchain-go-vs-python"],
      gateMode: "ci" as const
    };
    const signedEvidenceRefs = evidenceIds.map((evidenceId, index) => ({
      evidenceId,
      eventHash: `${index % 10}`.repeat(64).slice(0, 64),
      writerSig: `writer-sig-${index}`,
      eventType: "audit" as const,
      sessionId: `session-${index}`,
      ts: Date.UTC(2026, 5, 20),
      trustTier: "OBSERVED_HARDENED" as const
    }));

    const report = buildMetricValidationReport(
      { ...baseInput, signedEvidenceRefs },
      [prior("run-1", Date.UTC(2026, 5, 1), 4), prior("run-2", Date.UTC(2026, 5, 10), 4.01)]
    );

    expect(report.failClosed).toBe(false);
    expect(report.evalPack.replayable).toBe(true);
    expect(report.evalPack.sourceRefs).toContain("https://github.com/FareedKhan-dev/langchain-go-vs-python");
    expect(report.rows[0]).toMatchObject({
      metricId: "overall_maturity_score",
      validationFacetCoverage: 1,
      confounderControlCoverage: 1,
      outcomeAlignment: 1,
      processEvidenceCoverage: 1,
      safetyUtilityCoverage: 1,
      lifecycleObservabilityCoverage: 1,
      status: "pass"
    });

    const metadataOnlyReport = buildMetricValidationReport(
      baseInput,
      [prior("run-1", Date.UTC(2026, 5, 1), 4), prior("run-2", Date.UTC(2026, 5, 10), 4.01)]
    );

    expect(metadataOnlyReport.evalPack.replayable).toBe(false);
    expect(metadataOnlyReport.failClosed).toBe(true);
    expect(metadataOnlyReport.ciGate.failClosed).toBe(true);
    expect(metadataOnlyReport.ciGate.failedMetricIds).toContain("overall_maturity_score");
    expect(metadataOnlyReport.ciGate.summary).toContain("eval pack is not replayable");
    expect(metadataOnlyReport.warnings).toContain(
      "metric validation eval pack is not replayable; signed evidence refs are required for all row evidence refs"
    );
  });
});
