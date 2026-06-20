import { describe, expect, test } from "vitest";
import {
  buildJudgeCalibrationWatchAlerts,
  buildJudgeCalibrationReceipt,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef
} from "../src/eval/judgeCalibration.js";

const signedRef = (id: string, seed: string): JudgeCalibrationSignedEvidenceRef => ({
  evidenceId: id,
  eventHash: seed.repeat(64).slice(0, 64),
  writerSig: `sig-${id}`,
  eventType: "audit",
  sessionId: `session-${id}`,
  ts: Date.UTC(2026, 5, 13),
  trustTier: "OBSERVED"
});

describe("judge calibration receipts", () => {
  test("builds a replayable receipt with rubric version, calibration set, disagreement metrics, and appeal outcome", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "agent-a",
      runId: "judge-run-1",
      generatedAt: "2026-06-13T00:00:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-judge-rubric",
        version: "2026.06",
        criteria: ["factuality", "completeness", "faithfulness"],
        owner: "AMC Eval"
      },
      calibrationSet: {
        setId: "5w1h-calibration",
        version: "v1",
        rows: [
          {
            itemId: "item-1",
            expectedScore0to1: 0.91,
            subjectiveExpectedScore0to1: 0.9,
            objectiveExpectedScore0to1: 0.92,
            taskCategory: "prompt-artifact-alignment",
            promptArtifactHash: "f".repeat(64),
            outputArtifactHash: "0".repeat(64),
            sourceRefs: ["amc:calibration:item-1"],
            evidenceRefs: ["ev-cal-1"],
            signedEvidenceRefs: [signedRef("ev-cal-1", "a")]
          },
          {
            itemId: "item-2",
            expectedScore0to1: 0.72,
            sourceRefs: ["amc:calibration:item-2"],
            evidenceRefs: ["ev-cal-2"],
            signedEvidenceRefs: [signedRef("ev-cal-2", "b")]
          },
          {
            itemId: "item-3",
            expectedScore0to1: 0.44,
            sourceRefs: ["amc:calibration:item-3"],
            evidenceRefs: ["ev-cal-3"],
            signedEvidenceRefs: [signedRef("ev-cal-3", "c")]
          }
        ]
      },
      judgments: [
        { itemId: "item-1", judgeId: "judge-a", score0to1: 0.9, subjectiveScore0to1: 0.89, objectiveScore0to1: 0.91, judgeMemoryRef: "memory://atelier/judge-a", promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-j-1a"], signedEvidenceRefs: [signedRef("ev-j-1a", "d")] },
        { itemId: "item-1", judgeId: "judge-b", score0to1: 0.92, subjectiveScore0to1: 0.91, objectiveScore0to1: 0.93, judgeMemoryRef: "memory://atelier/judge-b", promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-j-1b"], signedEvidenceRefs: [signedRef("ev-j-1b", "e")] },
        { itemId: "item-2", judgeId: "judge-a", score0to1: 0.71, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-j-2a"], signedEvidenceRefs: [signedRef("ev-j-2a", "f")] },
        { itemId: "item-2", judgeId: "judge-b", score0to1: 0.73, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-j-2b"], signedEvidenceRefs: [signedRef("ev-j-2b", "9")] },
        { itemId: "item-3", judgeId: "judge-a", score0to1: 0.45, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-j-3a"], signedEvidenceRefs: [signedRef("ev-j-3a", "1")] },
        { itemId: "item-3", judgeId: "judge-b", score0to1: 0.43, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-j-3b"], signedEvidenceRefs: [signedRef("ev-j-3b", "2")] }
      ],
      appeals: [
        {
          appealId: "appeal-1",
          itemId: "item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-appeal-1", "3")]
        }
      ],
      sourceRefs: ["https://www.mdpi.com/2079-9292/15/3/659"]
    });

    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.rubric.rubricHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.calibrationSet.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.disagreement.subjectiveMeanAbsoluteError0to1).toBeLessThan(0.01);
    expect(receipt.disagreement.objectiveMeanAbsoluteError0to1).toBeLessThan(0.01);
    expect(receipt.disagreement.taskCategoryDistribution["prompt-artifact-alignment"]).toBeCloseTo(1 / 3);
    expect(receipt.calibrationSet.rows[0]).toMatchObject({
      taskCategory: "prompt-artifact-alignment",
      promptArtifactHash: "f".repeat(64),
      outputArtifactHash: "0".repeat(64),
    });
    expect(receipt.judgments[0]).toMatchObject({
      subjectiveScore0to1: 0.89,
      objectiveScore0to1: 0.91,
      judgeMemoryRef: "memory://atelier/judge-a",
    });
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  test("binds AgentStock future-outcome ranking proof into judge calibration appeal receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "agentstock-arena-agent",
      runId: "agentstock-judge-run-1",
      generatedAt: "2026-06-20T00:00:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "agentstock-future-outcome-rubric",
        version: "2026.06",
        criteria: ["ranking-accuracy", "future-outcome-grounding", "pnl-accounting", "appeal-resolution"],
        owner: "AMC Eval"
      },
      calibrationSet: {
        setId: "agentstock-sp500-calibration",
        version: "v1",
        rows: [
          {
            itemId: "agentstock-row-1",
            expectedScore0to1: 0.86,
            taskCategory: "sp500-ranking",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"],
            evidenceRefs: ["ev-agentstock-cal-1"],
            signedEvidenceRefs: [signedRef("ev-agentstock-cal-1", "a")]
          },
          {
            itemId: "agentstock-row-2",
            expectedScore0to1: 0.74,
            taskCategory: "pnl-accounting",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"],
            evidenceRefs: ["ev-agentstock-cal-2"],
            signedEvidenceRefs: [signedRef("ev-agentstock-cal-2", "b")]
          },
          {
            itemId: "agentstock-row-3",
            expectedScore0to1: 0.62,
            taskCategory: "appeal-review",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"],
            evidenceRefs: ["ev-agentstock-cal-3"],
            signedEvidenceRefs: [signedRef("ev-agentstock-cal-3", "c")]
          }
        ]
      },
      judgments: [
        { itemId: "agentstock-row-1", judgeId: "judge-a", score0to1: 0.86, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-agentstock-j-1a"], signedEvidenceRefs: [signedRef("ev-agentstock-j-1a", "d")] },
        { itemId: "agentstock-row-1", judgeId: "judge-b", score0to1: 0.87, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-agentstock-j-1b"], signedEvidenceRefs: [signedRef("ev-agentstock-j-1b", "e")] },
        { itemId: "agentstock-row-2", judgeId: "judge-a", score0to1: 0.74, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-agentstock-j-2a"], signedEvidenceRefs: [signedRef("ev-agentstock-j-2a", "f")] },
        { itemId: "agentstock-row-2", judgeId: "judge-b", score0to1: 0.75, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-agentstock-j-2b"], signedEvidenceRefs: [signedRef("ev-agentstock-j-2b", "9")] },
        { itemId: "agentstock-row-3", judgeId: "judge-a", score0to1: 0.62, promptHash: "9".repeat(64), outputHash: "a".repeat(64), evidenceRefs: ["ev-agentstock-j-3a"], signedEvidenceRefs: [signedRef("ev-agentstock-j-3a", "1")] },
        { itemId: "agentstock-row-3", judgeId: "judge-b", score0to1: 0.61, promptHash: "b".repeat(64), outputHash: "c".repeat(64), evidenceRefs: ["ev-agentstock-j-3b"], signedEvidenceRefs: [signedRef("ev-agentstock-j-3b", "2")] }
      ],
      appeals: [
        {
          appealId: "agentstock-appeal-1",
          itemId: "agentstock-row-3",
          status: "overturned",
          submittedBy: "eval-owner",
          reviewer: "market-reviewer",
          outcomeReasonHash: "d".repeat(64),
          evidenceRefs: ["ev-agentstock-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-agentstock-appeal-1", "3")]
        }
      ],
      agentStockBenchmarkProof: {
        benchmarkId: "agentstock-sp500-daily-arena",
        benchmarkVersion: "2026.06.16",
        sourceRepository: "https://github.com/xsunsim/AgentStockBenchmarkResults",
        sourceCommit: "9f6cc89af052e4903feab99851809748bf74a84d",
        sourceTreeHash: "d23aeed71ef3cf5d3b1b8553e726ac11fa747976",
        licenseRefHash: "9844180ce4cd878d0174ee11b50ea7dfd0552177",
        readmeBlobHash: "702714fce4a1ff01538c5721713c86a59162f204",
        pyprojectHash: "db7eb398e66ef127b184b134b3163c949f0a08e8",
        accountingMetricsHash: "0a271d272a4a4583baf04d855169f979388754d9",
        leaderboardHash: "0a271d272a4a4583baf04d855169f979388754d9",
        leaderboardMarkdownHash: "69a1d71cf07600a8ad2e5431a20881fbeddfa053",
        strategyManifestHash: "bd28c574fd8ff2facd8aadd5f12857fee267499d",
        promptsTreeHash: "4a538f3b6c31600a852aa250551470b37b8ba566",
        rankingsTreeHash: "3ea023727722c20c7d457f704275df9cbcba392f",
        portfolioTreeHash: "bfd8969316d57fdeb72124e5b59bb70c0bd16e6f",
        strategyTreeHash: "969863caf4b0453f25e3b34592d320760e413564",
        dataRawTreeHash: "b1f26c6bcaac391ed59f040f74f7a661def5fd2a",
        dataParquetTreeHash: "a853fb02ef935eae8a68f9b8940b3e08fa21700a",
        scriptsTreeHash: "e5d164b01ff31af20eb32a7ac2936e502d003660",
        dailyDigestTreeHash: "2a7135e0ecb2cd12196f3d9aa3542f9ca068a485",
        benchmarkDate: "2026-06-16",
        marketUniverse: "sp500",
        agentRosterHash: "4".repeat(64),
        predictionPromptHash: "5".repeat(64),
        futureOutcomeWindowHash: "6".repeat(64),
        groundTruthPriceDataHash: "7".repeat(64),
        rankingResultHash: "8".repeat(64),
        pnlMetricHash: "9".repeat(64),
        appealWorkflowHash: "a".repeat(64),
        replayCommandHash: "b".repeat(64),
        ciReceiptHash: "c".repeat(64),
        rankedAgentCount: 16,
        tickerCount: 500,
        tradingDayCount: 45,
        futureOutcomeCoverage0to1: 1,
        leaderboardCoverage0to1: 1,
        appealResolutionCoverage0to1: 1,
        replayPassRate0to1: 1,
        evidenceRefs: ["ev-agentstock-proof"],
        signedEvidenceRefs: [signedRef("ev-agentstock-proof", "4")]
      },
      sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.agentStockBenchmarkProof?.proofHash).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.agentStockBenchmarkProof).toMatchObject({
      benchmarkId: "agentstock-sp500-daily-arena",
      marketUniverse: "sp500",
      futureOutcomeCoverage0to1: 1,
      leaderboardCoverage0to1: 1,
      appealResolutionCoverage0to1: 1,
      replayPassRate0to1: 1,
      failed: false
    });
    expect(receipt.evidenceRefs).toContain("ev-agentstock-proof");
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  test("fails closed for AgentStock metadata-only judge claims without future outcome, leaderboard, and appeal evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "agentstock-arena-agent",
      runId: "agentstock-judge-run-fail",
      generatedAt: "2026-06-20T00:00:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "agentstock-future-outcome-rubric",
        version: "2026.06",
        criteria: ["ranking-accuracy"]
      },
      calibrationSet: {
        setId: "agentstock-small",
        version: "v1",
        rows: [
          {
            itemId: "agentstock-row-1",
            expectedScore0to1: 0.86,
            sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"],
            evidenceRefs: ["ev-agentstock-cal-1"],
            signedEvidenceRefs: [signedRef("ev-agentstock-cal-1", "a")]
          }
        ]
      },
      judgments: [
        { itemId: "agentstock-row-1", judgeId: "judge-a", score0to1: 0.2, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-agentstock-j-1a"], signedEvidenceRefs: [signedRef("ev-agentstock-j-1a", "b")] },
        { itemId: "agentstock-row-1", judgeId: "judge-b", score0to1: 0.9, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-agentstock-j-1b"], signedEvidenceRefs: [signedRef("ev-agentstock-j-1b", "c")] }
      ],
      agentStockBenchmarkProof: {
        benchmarkId: "agentstock-sp500-daily-arena",
        benchmarkVersion: "2026.06.16",
        sourceRepository: "https://github.com/xsunsim/AgentStockBenchmarkResults",
        sourceCommit: "main",
        sourceTreeHash: "d23aeed71ef3cf5d3b1b8553e726ac11fa747976",
        licenseRefHash: "",
        readmeBlobHash: "702714fce4a1ff01538c5721713c86a59162f204",
        pyprojectHash: "db7eb398e66ef127b184b134b3163c949f0a08e8",
        accountingMetricsHash: "",
        leaderboardHash: "",
        leaderboardMarkdownHash: "",
        strategyManifestHash: "",
        promptsTreeHash: "",
        rankingsTreeHash: "",
        portfolioTreeHash: "",
        strategyTreeHash: "",
        dataRawTreeHash: "",
        dataParquetTreeHash: "",
        scriptsTreeHash: "",
        dailyDigestTreeHash: "",
        benchmarkDate: "2026-06-16",
        marketUniverse: "sp500",
        agentRosterHash: "not-a-hash",
        predictionPromptHash: "5".repeat(64),
        futureOutcomeWindowHash: "",
        groundTruthPriceDataHash: "",
        rankingResultHash: "",
        pnlMetricHash: "",
        appealWorkflowHash: "",
        replayCommandHash: "",
        ciReceiptHash: "",
        rankedAgentCount: 1,
        tickerCount: 3,
        tradingDayCount: 1,
        futureOutcomeCoverage0to1: 0.4,
        leaderboardCoverage0to1: 0,
        appealResolutionCoverage0to1: 0,
        replayPassRate0to1: 0.5,
        evidenceRefs: [],
        signedEvidenceRefs: []
      },
      thresholds: {
        minCalibrationRows: 1,
        minJudgesPerItem: 2,
        minInterJudgeAgreement0to1: 0.8,
        maxMeanAbsoluteError0to1: 0.15,
        maxScoreVariance0to1: 0.05,
        requireResolvedAppealsForFailedRows: false
      },
      sourceRefs: ["https://github.com/xsunsim/AgentStockBenchmarkResults"]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.replayable).toBe(false);
    expect(receipt.agentStockBenchmarkProof?.failed).toBe(true);
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("AgentStock source snapshot");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("future outcome coverage");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("leaderboard coverage");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("appeal resolution coverage");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("AgentStock signed evidence");
    expect(buildJudgeCalibrationWatchAlerts(receipt).map((alert) => alert.metricId)).toEqual([
      "judgeDisagreement",
      "judgeError",
      "judgeVariance",
      "agentStockSourceEvidence",
      "agentStockFutureOutcomeEvidence",
      "agentStockLeaderboardEvidence",
      "agentStockAppealEvidence",
      "signedEvidenceRefs",
    ]);
  });

  test("fails closed for weak calibration evidence, judge disagreement, and unresolved appeals", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "agent-a",
      runId: "judge-run-fail",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rubric: {
        rubricId: "amc-judge-rubric",
        version: "2026.06",
        criteria: ["factuality"]
      },
      calibrationSet: {
        setId: "small-set",
        version: "v1",
        rows: [
          {
            itemId: "item-1",
            expectedScore0to1: 0.9,
            sourceRefs: ["amc:calibration:item-1"],
            evidenceRefs: ["ev-cal-1"],
            signedEvidenceRefs: [signedRef("ev-cal-1", "a")]
          }
        ]
      },
      judgments: [
        { itemId: "item-1", judgeId: "judge-a", score0to1: 0.1, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-j-1a"], signedEvidenceRefs: [signedRef("ev-j-1a", "b")] },
        { itemId: "item-1", judgeId: "judge-b", score0to1: 0.95, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-j-1b"], signedEvidenceRefs: [signedRef("ev-j-1b", "c")] }
      ],
      appeals: [
        {
          appealId: "appeal-open",
          itemId: "item-1",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-appeal-open"],
          signedEvidenceRefs: [signedRef("ev-appeal-open", "d")]
        }
      ]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.ciGate.passed).toBe(false);
    expect(receipt.ciGate.failedItemIds).toContain("item-1");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("calibration set row count");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("inter-judge agreement");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("unresolved appeal");
    expect(receipt.replayable).toBe(false);
    expect(buildJudgeCalibrationWatchAlerts(receipt).map((alert) => alert.metricId)).toContain("judgeDisagreement");
    expect(verifyJudgeCalibrationReceipt({ ...receipt, receiptHash: "bad" }).valid).toBe(false);
  });

  test("binds stability-aware checkpoint ranking evidence into judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "checkpoint-selector",
      runId: "judge-run-stability",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rubric: {
        rubricId: "checkpoint-selection-rubric",
        version: "2026.05",
        criteria: ["pointwise-quality", "listwise-ranking", "pairwise-preference", "ocr-readability"]
      },
      calibrationSet: {
        setId: "mllm-checkpoint-calibration",
        version: "v1",
        rows: [
          { itemId: "ocr-item-1", expectedScore0to1: 0.82, evidenceRefs: ["ev-cal-ocr-1"], signedEvidenceRefs: [signedRef("ev-cal-ocr-1", "a")] },
          { itemId: "ocr-item-2", expectedScore0to1: 0.78, evidenceRefs: ["ev-cal-ocr-2"], signedEvidenceRefs: [signedRef("ev-cal-ocr-2", "b")] },
          { itemId: "ocr-item-3", expectedScore0to1: 0.68, evidenceRefs: ["ev-cal-ocr-3"], signedEvidenceRefs: [signedRef("ev-cal-ocr-3", "c")] }
        ]
      },
      judgments: [
        { itemId: "ocr-item-1", judgeId: "judge-a", score0to1: 0.82, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-j-ocr-1a"], signedEvidenceRefs: [signedRef("ev-j-ocr-1a", "d")] },
        { itemId: "ocr-item-1", judgeId: "judge-b", score0to1: 0.83, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-j-ocr-1b"], signedEvidenceRefs: [signedRef("ev-j-ocr-1b", "e")] },
        { itemId: "ocr-item-2", judgeId: "judge-a", score0to1: 0.77, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-j-ocr-2a"], signedEvidenceRefs: [signedRef("ev-j-ocr-2a", "f")] },
        { itemId: "ocr-item-2", judgeId: "judge-b", score0to1: 0.79, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-j-ocr-2b"], signedEvidenceRefs: [signedRef("ev-j-ocr-2b", "9")] },
        { itemId: "ocr-item-3", judgeId: "judge-a", score0to1: 0.68, promptHash: "9".repeat(64), outputHash: "a".repeat(64), evidenceRefs: ["ev-j-ocr-3a"], signedEvidenceRefs: [signedRef("ev-j-ocr-3a", "1")] },
        { itemId: "ocr-item-3", judgeId: "judge-b", score0to1: 0.69, promptHash: "b".repeat(64), outputHash: "c".repeat(64), evidenceRefs: ["ev-j-ocr-3b"], signedEvidenceRefs: [signedRef("ev-j-ocr-3b", "2")] }
      ],
      stabilityChecks: [
        {
          itemId: "ocr-item-1",
          checkpointId: "checkpoint-a",
          stage: "pointwise",
          subsampleCount: 8,
          rankingStability0to1: 0.88,
          percentileScore0to1: 0.84,
          tailFailureRate0to1: 0.08,
          dataQuality0to1: 0.86,
          ocrReadability0to1: 0.91,
          pointwiseRank: 1,
          evidenceRefs: ["ev-stability-1"],
          signedEvidenceRefs: [signedRef("ev-stability-1", "3")]
        },
        {
          itemId: "ocr-item-2",
          checkpointId: "checkpoint-a",
          stage: "listwise",
          subsampleCount: 8,
          rankingStability0to1: 0.86,
          percentileScore0to1: 0.8,
          tailFailureRate0to1: 0.1,
          dataQuality0to1: 0.84,
          ocrReadability0to1: 0.89,
          listwiseRank: 2,
          evidenceRefs: ["ev-stability-2"],
          signedEvidenceRefs: [signedRef("ev-stability-2", "4")]
        },
        {
          itemId: "ocr-item-3",
          checkpointId: "checkpoint-a",
          stage: "pairwise",
          subsampleCount: 8,
          rankingStability0to1: 0.9,
          percentileScore0to1: 0.72,
          tailFailureRate0to1: 0.12,
          dataQuality0to1: 0.82,
          ocrReadability0to1: 0.87,
          pairwiseWinRate0to1: 0.68,
          evidenceRefs: ["ev-stability-3"],
          signedEvidenceRefs: [signedRef("ev-stability-3", "5")]
        }
      ],
      sourceRefs: ["https://arxiv.org/abs/2605.18852"]
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.stabilitySummary).toMatchObject({
      checkCount: 3,
      failedItemIds: [],
      meanRankingStability0to1: 0.88,
      meanDataQuality0to1: 0.84,
      meanOcrReadability0to1: 0.89,
      maxTailFailureRate0to1: 0.12,
    });
    expect(receipt.stabilitySummary.stageDistribution).toEqual({
      listwise: 0.333333,
      pairwise: 0.333333,
      pointwise: 0.333333,
    });
    expect(receipt.stabilityChecks[0]).toMatchObject({
      itemId: "ocr-item-1",
      checkpointId: "checkpoint-a",
      stage: "pointwise",
      subsampleCount: 8,
      rankingStability0to1: 0.88,
      failed: false,
    });
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  test("fails closed when checkpoint ranking is unstable or OCR data quality is weak", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "checkpoint-selector",
      runId: "judge-run-stability-fail",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rubric: {
        rubricId: "checkpoint-selection-rubric",
        version: "2026.05",
        criteria: ["pointwise-quality", "ocr-readability"]
      },
      calibrationSet: {
        setId: "mllm-checkpoint-calibration",
        version: "v1",
        rows: [
          { itemId: "ocr-item-unstable", expectedScore0to1: 0.75, evidenceRefs: ["ev-cal-unstable"], signedEvidenceRefs: [signedRef("ev-cal-unstable", "a")] }
        ]
      },
      judgments: [
        { itemId: "ocr-item-unstable", judgeId: "judge-a", score0to1: 0.75, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-j-unstable"], signedEvidenceRefs: [signedRef("ev-j-unstable", "b")] }
      ],
      stabilityChecks: [
        {
          itemId: "ocr-item-unstable",
          checkpointId: "checkpoint-b",
          stage: "pointwise",
          subsampleCount: 2,
          rankingStability0to1: 0.52,
          percentileScore0to1: 0.7,
          tailFailureRate0to1: 0.42,
          dataQuality0to1: 0.55,
          ocrReadability0to1: 0.58,
          pointwiseRank: 1,
          evidenceRefs: ["ev-stability-unstable"],
          signedEvidenceRefs: [signedRef("ev-stability-unstable", "c")]
        }
      ],
      thresholds: {
        minCalibrationRows: 1,
        minJudgesPerItem: 1,
        minInterJudgeAgreement0to1: 0,
        maxMeanAbsoluteError0to1: 0.2,
        maxSubjectiveMeanAbsoluteError0to1: 0.2,
        maxObjectiveMeanAbsoluteError0to1: 0.2,
        maxScoreVariance0to1: 1,
        minStabilitySubsampleCount: 5,
        minRankingStability0to1: 0.75,
        maxTailFailureRate0to1: 0.2,
        minDataQuality0to1: 0.7,
        minOcrReadability0to1: 0.7,
        requireResolvedAppealsForFailedRows: false
      },
      sourceRefs: ["https://arxiv.org/abs/2605.18852"]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.replayable).toBe(false);
    expect(receipt.ciGate.failedItemIds).toEqual(["ocr-item-unstable"]);
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("subsample count");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("ranking stability");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("tail failure rate");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("data quality");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("ocr readability");
    expect(buildJudgeCalibrationWatchAlerts(receipt).map((alert) => alert.metricId)).toEqual([
      "rankingStability",
      "dataQuality",
    ]);
  });

  test("fails closed when prompt-artifact hashes or subjective and objective judge calibration drift", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "t2i-prompter-agent",
      runId: "judge-run-atelier-fail",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rubric: {
        rubricId: "atelier-judge-rubric",
        version: "2026.05",
        criteria: ["prompt-artifact-alignment", "subjective-quality", "objective-quality"]
      },
      calibrationSet: {
        setId: "atelier-calibration",
        version: "v1",
        rows: [
          {
            itemId: "atelier-item-1",
            expectedScore0to1: 0.85,
            subjectiveExpectedScore0to1: 0.9,
            objectiveExpectedScore0to1: 0.88,
            taskCategory: "visual-reasoning",
            promptArtifactHash: "not-a-hash",
            outputArtifactHash: "a".repeat(64),
            sourceRefs: ["https://arxiv.org/abs/2605.22645"],
            evidenceRefs: ["ev-atelier-cal-1"],
            signedEvidenceRefs: [signedRef("ev-atelier-cal-1", "4")]
          }
        ]
      },
      judgments: [
        {
          itemId: "atelier-item-1",
          judgeId: "atelier-judge",
          score0to1: 0.84,
          subjectiveScore0to1: 0.52,
          objectiveScore0to1: 0.48,
          judgeMemoryRef: "memory://atelier/skill-state",
          promptHash: "5".repeat(64),
          outputHash: "6".repeat(64),
          evidenceRefs: ["ev-atelier-judge-1"],
          signedEvidenceRefs: [signedRef("ev-atelier-judge-1", "5")]
        }
      ],
      thresholds: {
        minCalibrationRows: 1,
        minJudgesPerItem: 1,
        minInterJudgeAgreement0to1: 0,
        maxMeanAbsoluteError0to1: 0.2,
        maxSubjectiveMeanAbsoluteError0to1: 0.15,
        maxObjectiveMeanAbsoluteError0to1: 0.15,
        maxScoreVariance0to1: 1,
        requireResolvedAppealsForFailedRows: false
      },
      sourceRefs: ["https://arxiv.org/abs/2605.22645"]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.replayable).toBe(false);
    expect(receipt.disagreement.subjectiveMeanAbsoluteError0to1).toBe(0.38);
    expect(receipt.disagreement.objectiveMeanAbsoluteError0to1).toBe(0.4);
    expect(receipt.disagreement.itemSummaries[0]).toMatchObject({
      taskCategory: "visual-reasoning",
      subjectiveMeanAbsoluteError0to1: 0.38,
      objectiveMeanAbsoluteError0to1: 0.4,
    });
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("subjective mean absolute error");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("objective mean absolute error");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("artifact hash");

    const alerts = buildJudgeCalibrationWatchAlerts(receipt);
    expect(alerts.map((alert) => alert.metricId)).toEqual([
      "subjectiveJudgeError",
      "objectiveJudgeError",
      "artifactHash",
    ]);
  });

  test("fails closed when graph-eval judge proof is required but branch, cache, cost, and report evidence are incomplete", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "rag-release-agent",
      runId: "judge-run-graph-eval-fail",
      generatedAt: "2026-06-13T00:00:00.000Z",
      rubric: {
        rubricId: "graph-eval-judge-rubric",
        version: "2026.06",
        criteria: ["relevance", "grounding", "safety", "rubric-alignment"]
      },
      calibrationSet: {
        setId: "rag-judge-calibration",
        version: "v1",
        rows: [
          { itemId: "rag-item-1", expectedScore0to1: 0.9, evidenceRefs: ["ev-graph-cal-1"], signedEvidenceRefs: [signedRef("ev-graph-cal-1", "a")] },
          { itemId: "rag-item-2", expectedScore0to1: 0.75, evidenceRefs: ["ev-graph-cal-2"], signedEvidenceRefs: [signedRef("ev-graph-cal-2", "b")] },
          { itemId: "rag-item-3", expectedScore0to1: 0.6, evidenceRefs: ["ev-graph-cal-3"], signedEvidenceRefs: [signedRef("ev-graph-cal-3", "c")] }
        ]
      },
      judgments: [
        { itemId: "rag-item-1", judgeId: "judge-a", score0to1: 0.9, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-graph-j-1a"], signedEvidenceRefs: [signedRef("ev-graph-j-1a", "d")] },
        { itemId: "rag-item-1", judgeId: "judge-b", score0to1: 0.91, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-graph-j-1b"], signedEvidenceRefs: [signedRef("ev-graph-j-1b", "e")] },
        { itemId: "rag-item-2", judgeId: "judge-a", score0to1: 0.75, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-graph-j-2a"], signedEvidenceRefs: [signedRef("ev-graph-j-2a", "f")] },
        { itemId: "rag-item-2", judgeId: "judge-b", score0to1: 0.74, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-graph-j-2b"], signedEvidenceRefs: [signedRef("ev-graph-j-2b", "9")] },
        { itemId: "rag-item-3", judgeId: "judge-a", score0to1: 0.6, promptHash: "9".repeat(64), outputHash: "a".repeat(64), evidenceRefs: ["ev-graph-j-3a"], signedEvidenceRefs: [signedRef("ev-graph-j-3a", "1")] },
        { itemId: "rag-item-3", judgeId: "judge-b", score0to1: 0.59, promptHash: "b".repeat(64), outputHash: "c".repeat(64), evidenceRefs: ["ev-graph-j-3b"], signedEvidenceRefs: [signedRef("ev-graph-j-3b", "2")] }
      ],
      graphProof: {
        graphId: "amc-rag-judge-graph",
        graphVersion: "2026.06",
        nodeGraphHash: "d".repeat(64),
        scanNodeHash: "e".repeat(64),
        metricNodeHashes: ["f".repeat(64), "not-a-hash"],
        aggregationNodeHash: "3".repeat(64),
        reportArtifactHash: "4".repeat(64),
        cacheKeyHash: "5".repeat(64),
        modelRoutingHash: "6".repeat(64),
        promptVersionHash: "7".repeat(64),
        parserVersionHash: "8".repeat(64),
        costEstimateHash: "9".repeat(64),
        caseReportManifestHash: "a".repeat(64),
        datasetAdapterHash: "b".repeat(64),
        executionPlanHash: "c".repeat(64),
        structuredOutputSchemaHash: "d".repeat(64),
        requiredMetricBranches: ["relevance", "grounding", "redteam", "geval"],
        executedMetricBranches: ["relevance", "grounding"],
        perCaseReportCoverage0to1: 0.5,
        cacheHitRate0to1: 0.4,
        estimatedCostUsd: 1,
        actualCostUsd: 1.8,
        evidenceRefs: ["ev-graph-proof"],
        signedEvidenceRefs: [signedRef("ev-graph-proof", "3")]
      },
      thresholds: {
        requireGraphProofForLlmJudge: true,
        minGraphMetricBranchCoverage0to1: 1,
        minGraphPerCaseReportCoverage0to1: 0.95,
        maxGraphCostEstimateDriftRatio: 0.25
      },
      sourceRefs: ["https://github.com/harnexa/nexa-gauge"]
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.replayable).toBe(false);
    expect(receipt.graphProof?.metricBranchCoverage0to1).toBe(0.5);
    expect(receipt.graphProof?.costEstimateDriftRatio).toBe(0.8);
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("graph metric branch coverage");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("per-case report coverage");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("cost estimate drift");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("graph proof artifact hash");
    expect(buildJudgeCalibrationWatchAlerts(receipt).map((alert) => alert.metricId)).toEqual([
      "graphMetricBranchCoverage",
      "graphReportCoverage",
      "graphCostEstimateDrift",
      "graphProof",
    ]);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
  });
});
