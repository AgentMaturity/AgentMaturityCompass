import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0988-virtual-expert-judge-calibration.md";
const OPENALEX = "https://openalex.org/W7131834192";
const OPENALEX_API = "https://api.openalex.org/works/W7131834192";
const DOI = "https://doi.org/10.59543/mmhqdg22";
const PUBLISHER = "https://israj.org/index.php/israj/article/view/29";
const PDF = "https://israj.org/index.php/israj/article/download/29/9";
const CROSSREF = "https://api.crossref.org/works/10.59543/mmhqdg22";
const TITLE = "LLM-Assisted Virtual Expert Weight Elicitation in Pharmaceutical Supply Chains: A Z-Number Multi-Agent Framework";
const IDENTIFIER = "virtual_expert_judge_calibration";

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
  ts: Date.UTC(2026, 5, 24),
  trustTier: "OBSERVED_HARDENED",
});

describe("GAP-0988 virtual expert judge-calibration boundary", () => {
  it("documents live virtual-expert source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0988");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(DOI);
    expect(doc).toContain(PUBLISHER);
    expect(doc).toContain(PDF);
    expect(doc).toContain(CROSSREF);
    expect(doc).toContain("Intelligent Systems Research and Applications");
    expect(doc).toContain("Nexora Academic Press");
    expect(doc).toContain("publication_date `2026-01-10`");
    expect(doc).toContain("referenced_works_count `0`");
    expect(doc).toContain("cited_by_count `4`");
    expect(doc).toContain("open_access status `hybrid`");
    expect(doc).toContain("Badi-3-ISRAJ-2026-v2.pdf");
    expect(doc).toContain("Jamal Musbah");
    expect(doc).toContain("Ibrahim Badi");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Pairwise comparison");
    expect(doc).toContain("Expert elicitation");
    expect(doc).toContain("Preference elicitation");
    expect(doc).toContain("Fuzzy logic");
    expect(doc).toContain("Multi-Criteria Decision Making");
    expect(doc).toContain("Z-Numbers");
    expect(doc).toContain("Pharmaceutical Supply Chain");
    expect(doc).toContain("Virtual Expert Agents");
    expect(doc).toContain("Vendor Managed Inventory");
    expect(doc).toContain("Consistency Ratios");
    expect(doc).toContain("CRITIC weights");
    expect(doc).toContain("Agents LLM1, LLM2, and LLM3");
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

  it("accepts virtual-expert context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0988-virtual-expert-reviewed-agent",
      runId: "run-gap-0988-judge-calibration",
      generatedAt: "2026-06-24T12:12:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-virtual-expert-judge-rubric",
        version: "2026.06",
        criteria: ["pairwise-consistency", "preference-elicitation", "appeal-resolution"],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0988-amc-owned-virtual-expert-judge-calibration",
        version: "v1",
        rows: [
          {
            itemId: "gap0988-item-1",
            expectedScore0to1: 0.89,
            taskCategory: "virtual-expert-weight-elicitation",
            promptArtifactHash: "a".repeat(64),
            outputArtifactHash: "b".repeat(64),
            sourceRefs: [DOI, PUBLISHER, OPENALEX],
            evidenceRefs: ["ev-gap0988-cal-1"],
            signedEvidenceRefs: [signedRef("ev-gap0988-cal-1", "a")],
          },
          {
            itemId: "gap0988-item-2",
            expectedScore0to1: 0.72,
            taskCategory: "judge-consistency-review",
            promptArtifactHash: "c".repeat(64),
            outputArtifactHash: "d".repeat(64),
            sourceRefs: [DOI, CROSSREF],
            evidenceRefs: ["ev-gap0988-cal-2"],
            signedEvidenceRefs: [signedRef("ev-gap0988-cal-2", "b")],
          },
          {
            itemId: "gap0988-item-3",
            expectedScore0to1: 0.41,
            taskCategory: "appeal-resolution-review",
            promptArtifactHash: "e".repeat(64),
            outputArtifactHash: "f".repeat(64),
            sourceRefs: [OPENALEX_API, PDF],
            evidenceRefs: ["ev-gap0988-cal-3"],
            signedEvidenceRefs: [signedRef("ev-gap0988-cal-3", "c")],
          },
        ],
      },
      judgments: [
        { itemId: "gap0988-item-1", judgeId: "judge-a", score0to1: 0.88, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0988-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0988-j-1a", "d")] },
        { itemId: "gap0988-item-1", judgeId: "judge-b", score0to1: 0.90, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0988-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0988-j-1b", "e")] },
        { itemId: "gap0988-item-2", judgeId: "judge-a", score0to1: 0.71, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0988-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0988-j-2a", "f")] },
        { itemId: "gap0988-item-2", judgeId: "judge-b", score0to1: 0.73, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0988-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0988-j-2b", "9")] },
        { itemId: "gap0988-item-3", judgeId: "judge-a", score0to1: 0.40, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-gap0988-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0988-j-3a", "1")] },
        { itemId: "gap0988-item-3", judgeId: "judge-b", score0to1: 0.42, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-gap0988-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0988-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0988-appeal-1",
          itemId: "gap0988-item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-gap0988-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0988-appeal-1", "3")],
        },
      ],
      sourceRefs: [OPENALEX, OPENALEX_API, DOI, PUBLISHER, PDF, CROSSREF],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([OPENALEX, OPENALEX_API, DOI, PUBLISHER, PDF, CROSSREF]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when virtual-expert metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0988-metadata-only-agent",
      runId: "run-gap-0988-metadata-only",
      generatedAt: "2026-06-24T12:12:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-virtual-expert-judge-rubric",
        version: "2026.06",
        criteria: ["pairwise-comparison", "expert-elicitation"],
      },
      calibrationSet: {
        setId: "gap-0988-metadata-only",
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
          judgeId: "virtual-expert-title-only",
          score0to1: 0.9,
          promptHash: "",
          outputHash: "",
          evidenceRefs: [TITLE],
          signedEvidenceRefs: [],
        },
      ],
      appeals: [
        {
          appealId: "gap0988-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0988-open-appeal"],
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

  it("does not add virtual-expert identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain("W7131834192");
      expect(source).not.toContain(IDENTIFIER);
      expect(source).not.toContain(TITLE);
    }
  });
});
