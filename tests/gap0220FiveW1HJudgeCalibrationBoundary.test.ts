import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0220-five-w1h-judge-calibration.md";
const TITLE = "Benchmarking LLM-as-a-Judge Models for 5W1H Extraction Evaluation";
const DOI = "https://doi.org/10.3390/electronics15030659";
const MDPI = "https://www.mdpi.com/2079-9292/15/3/659";
const MDPI_PDF = "https://www.mdpi.com/2079-9292/15/3/659/pdf";
const OPENALEX = "https://openalex.org/W7127357507";
const OPENALEX_API = "https://api.openalex.org/works/W7127357507";
const IDENTIFIER = "five_w1h_judge_calibration";

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
  ts: Date.UTC(2026, 5, 26),
  trustTier: "OBSERVED_HARDENED",
});

describe("GAP-0220 5W1H judge-calibration boundary", () => {
  it("documents live MDPI/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0220");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(MDPI_PDF);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain("Electronics");
    expect(doc).toContain("publication_date `2026-02-03`");
    expect(doc).toContain("cited_by_count `1`");
    expect(doc).toContain("referenced_works_count `25`");
    expect(doc).toContain("open_access status `gold`");
    expect(doc).toContain("cc-by");
    expect(doc).toContain("5W1H");
    expect(doc).toContain("LLM-as-a-Judge");
    expect(doc).toContain("Factual Accuracy");
    expect(doc).toContain("Completeness");
    expect(doc).toContain("Relevance and Conciseness");
    expect(doc).toContain("Clarity and Readability");
    expect(doc).toContain("Faithfulness to Source");
    expect(doc).toContain("Overall Coherence");
    expect(doc).toContain("calibration session");
    expect(doc).toContain("Inter-Annotator Agreement");
    expect(doc).toContain("Cohen");
    expect(doc).toContain("Judgment Acceptance Rate");
    expect(doc).toContain("Explanatory Utility Index");
    expect(doc).toContain("score distribution patterns");
    expect(doc).toContain("criterion-level variance");
    expect(doc).toContain("rubric version");
    expect(doc).toContain("calibration set");
    expect(doc).toContain("disagreement metric");
    expect(doc).toContain("appeal outcome");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts 5W1H LLM-as-a-judge context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0220-five-w1h-reviewed-agent",
      runId: "run-gap-0220-judge-calibration",
      generatedAt: "2026-06-26T09:20:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-five-w1h-judge-rubric",
        version: "2026.06",
        criteria: [
          "factual-accuracy",
          "completeness",
          "relevance-conciseness",
          "clarity-readability",
          "faithfulness-to-source",
          "overall-coherence",
        ],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0220-amc-owned-five-w1h-judge-calibration",
        version: "v1",
        rows: [
          {
            itemId: "gap0220-item-who-what",
            expectedScore0to1: 0.9,
            taskCategory: "5w1h-extraction-evaluation",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: [DOI, MDPI, OPENALEX],
            evidenceRefs: ["ev-gap0220-cal-1"],
            signedEvidenceRefs: [signedRef("ev-gap0220-cal-1", "a")],
          },
          {
            itemId: "gap0220-item-when-where",
            expectedScore0to1: 0.72,
            taskCategory: "5w1h-extraction-evaluation",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: [MDPI, OPENALEX_API],
            evidenceRefs: ["ev-gap0220-cal-2"],
            signedEvidenceRefs: [signedRef("ev-gap0220-cal-2", "b")],
          },
          {
            itemId: "gap0220-item-why-how",
            expectedScore0to1: 0.43,
            taskCategory: "appeal-resolution-review",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: [DOI, MDPI_PDF],
            evidenceRefs: ["ev-gap0220-cal-3"],
            signedEvidenceRefs: [signedRef("ev-gap0220-cal-3", "c")],
          },
        ],
      },
      judgments: [
        { itemId: "gap0220-item-who-what", judgeId: "judge-a", score0to1: 0.89, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0220-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0220-j-1a", "d")] },
        { itemId: "gap0220-item-who-what", judgeId: "judge-b", score0to1: 0.91, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0220-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0220-j-1b", "e")] },
        { itemId: "gap0220-item-when-where", judgeId: "judge-a", score0to1: 0.71, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0220-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0220-j-2a", "f")] },
        { itemId: "gap0220-item-when-where", judgeId: "judge-b", score0to1: 0.73, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0220-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0220-j-2b", "9")] },
        { itemId: "gap0220-item-why-how", judgeId: "judge-a", score0to1: 0.42, promptHash: "9".repeat(64), outputHash: "a".repeat(64), evidenceRefs: ["ev-gap0220-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0220-j-3a", "1")] },
        { itemId: "gap0220-item-why-how", judgeId: "judge-b", score0to1: 0.44, promptHash: "b".repeat(64), outputHash: "c".repeat(64), evidenceRefs: ["ev-gap0220-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0220-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0220-appeal-1",
          itemId: "gap0220-item-when-where",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "d".repeat(64),
          evidenceRefs: ["ev-gap0220-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0220-appeal-1", "3")],
        },
      ],
      sourceRefs: [DOI, MDPI, MDPI_PDF, OPENALEX, OPENALEX_API],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([DOI, MDPI, MDPI_PDF, OPENALEX, OPENALEX_API]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when MDPI/OpenAlex metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0220-metadata-only-agent",
      runId: "run-gap-0220-metadata-only",
      generatedAt: "2026-06-26T09:20:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-five-w1h-judge-rubric",
        version: "2026.06",
        criteria: ["5w1h", "llm-as-a-judge"],
      },
      calibrationSet: {
        setId: "gap-0220-metadata-only",
        version: "v1",
        rows: [
          {
            itemId: "metadata-only-item",
            expectedScore0to1: 0.9,
            sourceRefs: [DOI, MDPI, OPENALEX],
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
          appealId: "gap0220-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0220-open-appeal"],
          signedEvidenceRefs: [],
        },
      ],
      sourceRefs: [DOI, MDPI, OPENALEX],
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

  it("does not add 5W1H paper identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7127357507");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
