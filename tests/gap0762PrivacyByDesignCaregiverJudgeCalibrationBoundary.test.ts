import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0762-privacy-by-design-caregiver-judge-calibration.md";
const SOURCE = "https://www.mdpi.com/2076-3417/16/4/2157";
const DOI = "10.3390/app16042157";
const OPENALEX = "W7131070396";
const TITLE = "Privacy-by-Design in AI-Assisted Systems for Caregivers of Children with Autism: A Secure Multi-Agent Architecture";

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

describe("GAP-0762 privacy-by-design caregiver AI judge-calibration boundary", () => {
  it("documents live MDPI metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0762");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Applied Sciences");
    expect(doc).toContain("volume `16`, issue `4`, article `2157`");
    expect(doc).toContain("23 February 2026");
    expect(doc).toContain("Sophia Zacharaki");
    expect(doc).toContain("Irene Pappou");
    expect(doc).toContain("Giorgos Giannakopoulos");
    expect(doc).toContain("Grigorios Tsoumakas");
    expect(doc).toContain("Autism Spectrum Disorder");
    expect(doc).toContain("privacy-by-design");
    expect(doc).toContain("PbD MAS");
    expect(doc).toContain("consent-aware");
    expect(doc).toContain("data loss prevention");
    expect(doc).toContain("auditing and provenance");
    expect(doc).toContain("KB-only answer constraints");
    expect(doc).toContain("trace_id");
    expect(doc).toContain("policy_version");
    expect(doc).toContain("consent_version");
    expect(doc).toContain("RAGAs evaluation");
    expect(doc).toContain("LLM-as-a-Judge");
    expect(doc).toContain("Llama 3 8B");
    expect(doc).toContain("250` QA pairs");
    expect(doc).toContain("C1-C7");
    expect(doc).toContain("30` access-control cases");
    expect(doc).toContain("0.767");
    expect(doc).toContain("0.742");
    expect(doc).toContain("0.631");
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

  it("accepts privacy-sensitive caregiver-AI context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0762-privacy-reviewed-agent",
      runId: "run-gap-0762-judge-calibration",
      generatedAt: "2026-06-21T23:02:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-privacy-sensitive-judge-rubric",
        version: "2026.06",
        criteria: ["privacy-grounding", "consent-awareness", "appeal-resolution"],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0762-amc-owned-privacy-judge-calibration",
        version: "v1",
        rows: [
          {
            itemId: "gap0762-item-1",
            expectedScore0to1: 0.91,
            taskCategory: "privacy-sensitive-caregiver-ai",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: [SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
            evidenceRefs: ["ev-gap0762-cal-1"],
            signedEvidenceRefs: [signedRef("ev-gap0762-cal-1", "a")],
          },
          {
            itemId: "gap0762-item-2",
            expectedScore0to1: 0.74,
            taskCategory: "privacy-sensitive-caregiver-ai",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: [SOURCE],
            evidenceRefs: ["ev-gap0762-cal-2"],
            signedEvidenceRefs: [signedRef("ev-gap0762-cal-2", "b")],
          },
          {
            itemId: "gap0762-item-3",
            expectedScore0to1: 0.42,
            taskCategory: "privacy-sensitive-caregiver-ai",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: [`https://doi.org/${DOI}`],
            evidenceRefs: ["ev-gap0762-cal-3"],
            signedEvidenceRefs: [signedRef("ev-gap0762-cal-3", "c")],
          },
        ],
      },
      judgments: [
        { itemId: "gap0762-item-1", judgeId: "judge-a", score0to1: 0.90, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0762-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0762-j-1a", "d")] },
        { itemId: "gap0762-item-1", judgeId: "judge-b", score0to1: 0.92, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0762-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0762-j-1b", "e")] },
        { itemId: "gap0762-item-2", judgeId: "judge-a", score0to1: 0.73, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0762-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0762-j-2a", "f")] },
        { itemId: "gap0762-item-2", judgeId: "judge-b", score0to1: 0.75, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0762-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0762-j-2b", "9")] },
        { itemId: "gap0762-item-3", judgeId: "judge-a", score0to1: 0.41, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-gap0762-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0762-j-3a", "1")] },
        { itemId: "gap0762-item-3", judgeId: "judge-b", score0to1: 0.43, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-gap0762-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0762-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0762-appeal-1",
          itemId: "gap0762-item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-gap0762-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0762-appeal-1", "3")],
        },
      ],
      sourceRefs: [SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when MDPI metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0762-metadata-only-agent",
      runId: "run-gap-0762-metadata-only",
      generatedAt: "2026-06-21T23:02:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-privacy-judge-rubric",
        version: "2026.06",
        criteria: ["privacy-grounding", "consent-awareness"],
      },
      calibrationSet: {
        setId: "gap-0762-metadata-only",
        version: "v1",
        rows: [
          {
            itemId: "metadata-only-item",
            expectedScore0to1: 0.9,
            sourceRefs: [SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
            evidenceRefs: [SOURCE],
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
          appealId: "gap0762-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0762-open-appeal"],
          signedEvidenceRefs: [],
        },
      ],
      sourceRefs: [SOURCE],
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

  it("does not add source-specific identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("privacy_by_design_caregiver_judge_calibration");
      expect(source).not.toContain(TITLE);
    }
  });
});
