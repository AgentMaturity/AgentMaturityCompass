import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0826-protea-judge-calibration.md";
const ARXIV = "https://arxiv.org/abs/2605.18032";
const DOI = "10.48550/arXiv.2605.18032";
const OPENALEX = "W7161674885";
const TITLE = "PROTEA: Offline Evaluation and Iterative Refinement for Multi-Agent LLM Workflows";

const implementationFiles = [
  "src/eval/judgeCalibration.ts",
  "src/score/index.ts",
  "src/studio/studioState.ts",
];

const signedRef = (id: string, seed: string): JudgeCalibrationSignedEvidenceRef => ({
  evidenceId: id,
  eventHash: seed.repeat(64).slice(0, 64),
  writerSig: `sig-${id}`,
  eventType: "audit",
  sessionId: `session-${id}`,
  ts: Date.UTC(2026, 5, 21),
  trustTier: "OBSERVED_HARDENED",
});

describe("GAP-0826 PROTEA judge-calibration boundary", () => {
  it("documents live arXiv/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0826");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("role-specific LLM calls");
    expect(doc).toContain("intermediate outputs");
    expect(doc).toContain("downstream nodes");
    expect(doc).toContain("configurable rubrics");
    expect(doc).toContain("workflow graph");
    expect(doc).toContain("backward node evaluation");
    expect(doc).toContain("judge calibration");
    expect(doc).toContain("appeal outcome");
    expect(doc).toContain("rubric version");
    expect(doc).toContain("calibration set");
    expect(doc).toContain("disagreement metric");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts PROTEA workflow context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0826-protea-reviewed-agent",
      runId: "run-gap-0826-judge-calibration",
      generatedAt: "2026-06-21T23:32:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-protea-workflow-judge-rubric",
        version: "2026.06",
        criteria: ["node-output-grounding", "workflow-consistency", "appeal-resolution"],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0826-amc-owned-protea-judge-calibration",
        version: "v1",
        rows: [
          {
            itemId: "gap0826-item-1",
            expectedScore0to1: 0.88,
            taskCategory: "multi-agent-workflow-evaluation",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
            evidenceRefs: ["ev-gap0826-cal-1"],
            signedEvidenceRefs: [signedRef("ev-gap0826-cal-1", "a")],
          },
          {
            itemId: "gap0826-item-2",
            expectedScore0to1: 0.71,
            taskCategory: "multi-agent-workflow-evaluation",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: [ARXIV],
            evidenceRefs: ["ev-gap0826-cal-2"],
            signedEvidenceRefs: [signedRef("ev-gap0826-cal-2", "b")],
          },
          {
            itemId: "gap0826-item-3",
            expectedScore0to1: 0.44,
            taskCategory: "multi-agent-workflow-evaluation",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: [`https://doi.org/${DOI}`],
            evidenceRefs: ["ev-gap0826-cal-3"],
            signedEvidenceRefs: [signedRef("ev-gap0826-cal-3", "c")],
          },
        ],
      },
      judgments: [
        { itemId: "gap0826-item-1", judgeId: "judge-a", score0to1: 0.87, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0826-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0826-j-1a", "d")] },
        { itemId: "gap0826-item-1", judgeId: "judge-b", score0to1: 0.89, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0826-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0826-j-1b", "e")] },
        { itemId: "gap0826-item-2", judgeId: "judge-a", score0to1: 0.70, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0826-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0826-j-2a", "f")] },
        { itemId: "gap0826-item-2", judgeId: "judge-b", score0to1: 0.72, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0826-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0826-j-2b", "9")] },
        { itemId: "gap0826-item-3", judgeId: "judge-a", score0to1: 0.43, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-gap0826-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0826-j-3a", "1")] },
        { itemId: "gap0826-item-3", judgeId: "judge-b", score0to1: 0.45, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-gap0826-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0826-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0826-appeal-1",
          itemId: "gap0826-item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-gap0826-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0826-appeal-1", "3")],
        },
      ],
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when paper metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0826-metadata-only-agent",
      runId: "run-gap-0826-metadata-only",
      generatedAt: "2026-06-21T23:32:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-protea-judge-rubric",
        version: "2026.06",
        criteria: ["node-output-grounding", "workflow-consistency"],
      },
      calibrationSet: {
        setId: "gap-0826-metadata-only",
        version: "v1",
        rows: [
          {
            itemId: "metadata-only-item",
            expectedScore0to1: 0.9,
            sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
            evidenceRefs: [ARXIV],
            signedEvidenceRefs: [],
          },
        ],
      },
      judgments: [
        {
          itemId: "metadata-only-item",
          judgeId: "paper-title-only-judge",
          score0to1: 0.9,
          promptHash: "",
          outputHash: "",
          evidenceRefs: [TITLE],
          signedEvidenceRefs: [],
        },
      ],
      appeals: [
        {
          appealId: "gap0826-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0826-open-appeal"],
          signedEvidenceRefs: [],
        },
      ],
      sourceRefs: [ARXIV],
    });

    expect(receipt.failClosed).toBe(true);
    expect(receipt.replayable).toBe(false);
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("calibration set row count");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("judge count");
    expect(receipt.ciGate.failedReasons.join(" ")).toContain("signed evidence");
    expect(buildJudgeCalibrationWatchAlerts(receipt).map((alert) => alert.metricId)).toEqual(expect.arrayContaining([
      "calibrationSet",
      "signedEvidenceRefs",
      "appealOutcome",
    ]));
  });

  it("does not add PROTEA identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("protea_judge_calibration");
      expect(source).not.toContain(TITLE);
    }
  });
});
