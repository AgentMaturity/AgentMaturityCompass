import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0955-epistemic-failure-modes-judge-calibration.md";
const DOI = "https://doi.org/10.5281/zenodo.19042469";
const ZENODO = "https://zenodo.org/records/19042469";
const ZENODO_API = "https://zenodo.org/api/records/19042469";
const OPENALEX = "https://openalex.org/W7136127232";
const OPENALEX_API = "https://api.openalex.org/works/W7136127232";
const TITLE = "A Taxonomy of Epistemic Failure Modes in Large Language Models";

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
  ts: Date.UTC(2026, 5, 22),
  trustTier: "OBSERVED_HARDENED",
});

describe("GAP-0955 epistemic failure modes judge-calibration boundary", () => {
  it("documents live DOI/OpenAlex/Zenodo metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0955");
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(ZENODO_API);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("Zenodo record returned HTTP/1.1 200 OK");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("A Taxonomy of Epistemic Failure Modes in Large Language Models - Bosch 2026.pdf");
    expect(doc).toContain("Creative Commons Attribution 4.0");
    expect(doc).toContain("ScholarlyArticle");
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

  it("accepts epistemic-failure context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0955-epistemic-failure-reviewed-agent",
      runId: "run-gap-0955-judge-calibration",
      generatedAt: "2026-06-22T22:34:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-epistemic-failure-judge-rubric",
        version: "2026.06",
        criteria: ["epistemic-grounding", "contested-score-review", "appeal-resolution"],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0955-amc-owned-epistemic-failure-judge-calibration",
        version: "v1",
        rows: [
          {
            itemId: "gap0955-item-1",
            expectedScore0to1: 0.91,
            taskCategory: "epistemic-risk-evaluation",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: [DOI, ZENODO, OPENALEX],
            evidenceRefs: ["ev-gap0955-cal-1"],
            signedEvidenceRefs: [signedRef("ev-gap0955-cal-1", "a")],
          },
          {
            itemId: "gap0955-item-2",
            expectedScore0to1: 0.68,
            taskCategory: "epistemic-risk-evaluation",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: [DOI, ZENODO],
            evidenceRefs: ["ev-gap0955-cal-2"],
            signedEvidenceRefs: [signedRef("ev-gap0955-cal-2", "b")],
          },
          {
            itemId: "gap0955-item-3",
            expectedScore0to1: 0.37,
            taskCategory: "epistemic-risk-evaluation",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: [ZENODO_API, OPENALEX_API],
            evidenceRefs: ["ev-gap0955-cal-3"],
            signedEvidenceRefs: [signedRef("ev-gap0955-cal-3", "c")],
          },
        ],
      },
      judgments: [
        { itemId: "gap0955-item-1", judgeId: "judge-a", score0to1: 0.90, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0955-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0955-j-1a", "d")] },
        { itemId: "gap0955-item-1", judgeId: "judge-b", score0to1: 0.92, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0955-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0955-j-1b", "e")] },
        { itemId: "gap0955-item-2", judgeId: "judge-a", score0to1: 0.67, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0955-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0955-j-2a", "f")] },
        { itemId: "gap0955-item-2", judgeId: "judge-b", score0to1: 0.69, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0955-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0955-j-2b", "9")] },
        { itemId: "gap0955-item-3", judgeId: "judge-a", score0to1: 0.36, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-gap0955-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0955-j-3a", "1")] },
        { itemId: "gap0955-item-3", judgeId: "judge-b", score0to1: 0.38, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-gap0955-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0955-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0955-appeal-1",
          itemId: "gap0955-item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-gap0955-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0955-appeal-1", "3")],
        },
      ],
      sourceRefs: [DOI, ZENODO, ZENODO_API, OPENALEX, OPENALEX_API],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([DOI, ZENODO, ZENODO_API, OPENALEX, OPENALEX_API]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when DOI/OpenAlex metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0955-metadata-only-agent",
      runId: "run-gap-0955-metadata-only",
      generatedAt: "2026-06-22T22:34:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-epistemic-failure-judge-rubric",
        version: "2026.06",
        criteria: ["epistemic-grounding", "appeal-resolution"],
      },
      calibrationSet: {
        setId: "gap-0955-metadata-only",
        version: "v1",
        rows: [
          {
            itemId: "metadata-only-item",
            expectedScore0to1: 0.9,
            sourceRefs: [DOI, OPENALEX],
            evidenceRefs: [DOI],
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
          appealId: "gap0955-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0955-open-appeal"],
          signedEvidenceRefs: [],
        },
      ],
      sourceRefs: [DOI, OPENALEX],
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

  it("does not add epistemic-failure identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.5281/zenodo.19042469");
      expect(source).not.toContain("W7136127232");
      expect(source).not.toContain("epistemic_failure_modes_judge_calibration");
      expect(source).not.toContain(TITLE);
    }
  });
});
