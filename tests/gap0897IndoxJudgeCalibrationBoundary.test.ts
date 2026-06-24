import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildJudgeCalibrationReceipt,
  buildJudgeCalibrationWatchAlerts,
  verifyJudgeCalibrationReceipt,
  type JudgeCalibrationSignedEvidenceRef,
} from "../src/eval/judgeCalibration.js";

const DOC = "docs/source-reviews/GAP-0897-indox-judge-calibration.md";
const REPO = "osllmai/inDox";
const URL = "https://github.com/osllmai/inDox";
const TITLE = "Indox Ecosystem";

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

describe("GAP-0897 inDox judge-calibration boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0897");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Star 19");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 25");
    expect(doc).toContain("Pull requests 18");
    expect(doc).toContain("186 Commits");
    expect(doc).toContain("Releases 50");
    expect(doc).toContain("v0.1.21-Master");
    expect(doc).toContain("Mar 29, 2025");
    expect(doc).toContain("Jupyter Notebook 71.0%");
    expect(doc).toContain("Python 28.7%");
    expect(doc).toContain("Other 0.3%");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("cookbook");
    expect(doc).toContain("docs");
    expect(doc).toContain("libs");
    expect(doc).toContain("Branch_and_PR_Guidelines.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("IndoxArcg");
    expect(doc).toContain("IndoxMiner");
    expect(doc).toContain("IndoxJudge");
    expect(doc).toContain("IndoxGen");
    expect(doc).toContain("advanced retrieval");
    expect(doc).toContain("extraction");
    expect(doc).toContain("evaluation");
    expect(doc).toContain("generation");
    expect(doc).toContain("document formats");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Google");
    expect(doc).toContain("Mistral");
    expect(doc).toContain("HuggingFace");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Toxicity");
    expect(doc).toContain("BertScore");
    expect(doc).toContain("safety and bias assessment");
    expect(doc).toContain("multi-model comparison");
    expect(doc).toContain("RAG-specific evaluation metrics");
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

  it("accepts inDox context only through existing judge calibration receipts", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0897-indox-reviewed-agent",
      runId: "run-gap-0897-judge-calibration",
      generatedAt: "2026-06-22T20:20:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "amc-indox-judge-rubric",
        version: "2026.06",
        criteria: ["rag-evaluation-faithfulness", "bias-safety-review", "appeal-resolution"],
        owner: "AMC Eval",
      },
      calibrationSet: {
        setId: "gap-0897-amc-owned-indox-judge-calibration",
        version: "v1",
        rows: [
          { itemId: "gap0897-item-1", expectedScore0to1: 0.88, taskCategory: "rag-evaluation", promptArtifactHash: "a".repeat(64), outputArtifactHash: "b".repeat(64), sourceRefs: [URL], evidenceRefs: ["ev-gap0897-cal-1"], signedEvidenceRefs: [signedRef("ev-gap0897-cal-1", "a")] },
          { itemId: "gap0897-item-2", expectedScore0to1: 0.73, taskCategory: "safety-bias-evaluation", promptArtifactHash: "c".repeat(64), outputArtifactHash: "d".repeat(64), sourceRefs: [URL], evidenceRefs: ["ev-gap0897-cal-2"], signedEvidenceRefs: [signedRef("ev-gap0897-cal-2", "b")] },
          { itemId: "gap0897-item-3", expectedScore0to1: 0.42, taskCategory: "multi-model-evaluation", promptArtifactHash: "e".repeat(64), outputArtifactHash: "f".repeat(64), sourceRefs: [URL], evidenceRefs: ["ev-gap0897-cal-3"], signedEvidenceRefs: [signedRef("ev-gap0897-cal-3", "c")] },
        ],
      },
      judgments: [
        { itemId: "gap0897-item-1", judgeId: "judge-a", score0to1: 0.87, promptHash: "1".repeat(64), outputHash: "2".repeat(64), evidenceRefs: ["ev-gap0897-j-1a"], signedEvidenceRefs: [signedRef("ev-gap0897-j-1a", "d")] },
        { itemId: "gap0897-item-1", judgeId: "judge-b", score0to1: 0.89, promptHash: "3".repeat(64), outputHash: "4".repeat(64), evidenceRefs: ["ev-gap0897-j-1b"], signedEvidenceRefs: [signedRef("ev-gap0897-j-1b", "e")] },
        { itemId: "gap0897-item-2", judgeId: "judge-a", score0to1: 0.72, promptHash: "5".repeat(64), outputHash: "6".repeat(64), evidenceRefs: ["ev-gap0897-j-2a"], signedEvidenceRefs: [signedRef("ev-gap0897-j-2a", "f")] },
        { itemId: "gap0897-item-2", judgeId: "judge-b", score0to1: 0.74, promptHash: "7".repeat(64), outputHash: "8".repeat(64), evidenceRefs: ["ev-gap0897-j-2b"], signedEvidenceRefs: [signedRef("ev-gap0897-j-2b", "9")] },
        { itemId: "gap0897-item-3", judgeId: "judge-a", score0to1: 0.41, promptHash: "a".repeat(64), outputHash: "b".repeat(64), evidenceRefs: ["ev-gap0897-j-3a"], signedEvidenceRefs: [signedRef("ev-gap0897-j-3a", "1")] },
        { itemId: "gap0897-item-3", judgeId: "judge-b", score0to1: 0.43, promptHash: "c".repeat(64), outputHash: "d".repeat(64), evidenceRefs: ["ev-gap0897-j-3b"], signedEvidenceRefs: [signedRef("ev-gap0897-j-3b", "2")] },
      ],
      appeals: [
        {
          appealId: "gap0897-appeal-1",
          itemId: "gap0897-item-2",
          status: "upheld",
          submittedBy: "eval-owner",
          reviewer: "human-reviewer",
          outcomeReasonHash: "e".repeat(64),
          evidenceRefs: ["ev-gap0897-appeal-1"],
          signedEvidenceRefs: [signedRef("ev-gap0897-appeal-1", "3")],
        },
      ],
      sourceRefs: [URL],
    });

    expect(receipt.failClosed).toBe(false);
    expect(receipt.replayable).toBe(true);
    expect(receipt.ciGate.passed).toBe(true);
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.rubric.version).toBe("2026.06");
    expect(receipt.calibrationSet.rowCount).toBe(3);
    expect(receipt.disagreement.interJudgeAgreement0to1).toBeGreaterThan(0.95);
    expect(receipt.disagreement.meanAbsoluteError0to1).toBeLessThan(0.03);
    expect(receipt.appealOutcomes[0]?.status).toBe("upheld");
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyJudgeCalibrationReceipt(receipt).valid).toBe(true);
    expect(buildJudgeCalibrationWatchAlerts(receipt)).toEqual([]);
  });

  it("fails closed when inDox metadata replaces signed judge-calibration evidence", () => {
    const receipt = buildJudgeCalibrationReceipt({
      agentId: "gap-0897-metadata-only-agent",
      runId: "run-gap-0897-metadata-only",
      generatedAt: "2026-06-22T20:20:00.000Z",
      mode: "ci",
      rubric: {
        rubricId: "metadata-only-indox-judge-rubric",
        version: "2026.06",
        criteria: ["faithfulness", "toxicity"],
      },
      calibrationSet: {
        setId: "gap-0897-metadata-only",
        version: "v1",
        rows: [
          {
            itemId: "metadata-only-item",
            expectedScore0to1: 0.9,
            sourceRefs: [URL],
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
        ],
      },
      judgments: [
        {
          itemId: "metadata-only-item",
          judgeId: "indoxjudge-name-only",
          score0to1: 0.9,
          promptHash: "",
          outputHash: "",
          evidenceRefs: ["IndoxJudge"],
          signedEvidenceRefs: [],
        },
      ],
      appeals: [
        {
          appealId: "gap0897-open-appeal",
          itemId: "metadata-only-item",
          status: "open",
          submittedBy: "eval-owner",
          evidenceRefs: ["ev-gap0897-open-appeal"],
          signedEvidenceRefs: [],
        },
      ],
      sourceRefs: [URL],
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

  it("does not add inDox identifiers to judge calibration, Score, or Studio modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("indox_judge_calibration");
    }
  });
});
