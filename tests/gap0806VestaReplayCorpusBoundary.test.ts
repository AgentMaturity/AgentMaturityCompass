import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0806-vesta-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2606.08531";
const OPENALEX = "W7164234055";
const TITLE = "VESTA: A Fully Automated Scenario Generation and Safety Evaluation Framework for LLM Agents";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0806 VESTA replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0806");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("Sun Jun 7 09:23:38 2026");
    expect(doc).toContain("Lu Jia");
    expect(doc).toContain("Haibo Tong");
    expect(doc).toContain("Feifei Zhao");
    expect(doc).toContain("Jindong Li");
    expect(doc).toContain("Dongqi Liang");
    expect(doc).toContain("Ping Wu");
    expect(doc).toContain("Qian Zhang");
    expect(doc).toContain("Yi Zeng");
    expect(doc).toContain("five risk dimensions");
    expect(doc).toContain("1,072 measurable evaluation scenarios");
    expect(doc).toContain("12 LLM agents");
    expect(doc).toContain("two authority contexts");
    expect(doc).toContain("average ASR of 47.1%");
    expect(doc).toContain("process-level evaluation");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts VESTA safety context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0806-vesta-context",
      corpusId: "gap-0806-amc-owned-vesta-style-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0806-baseline",
      candidateRunId: "gap-0806-candidate",
      sourceRefs: [ARXIV, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T22:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0806-owned-safety-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned safety replay fixture with no copied upstream VESTA scenarios, prompts, or labels",
            inputHash: hash("s"),
            expectedHash: hash("t"),
            fixtureHash: hash("u"),
            seed: 806,
            metadata: { sourceReview: "GAP-0806", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0806-baseline"],
            signedEvidenceRefs: ["ledger-gap0806-baseline", "ledger-gap0806-baseline-ci"],
          },
          candidate: {
            score0to1: 0.73,
            evidenceRefs: ["ev-gap0806-candidate"],
            signedEvidenceRefs: ["ledger-gap0806-candidate", "ledger-gap0806-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.15);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0806-metadata-only-agent",
      corpusId: "gap-0806-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0806-baseline",
      candidateRunId: "gap-0806-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T22:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0806-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "arXiv title, VESTA scenario count, and ASR claim without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [ARXIV],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [`https://openalex.org/${OPENALEX}`],
            signedEvidenceRefs: [],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("fail_closed");
    expect(receipt.failClosed).toBe(true);
    expect(receipt.issues).toEqual(expect.arrayContaining([
      "eval replay corpus must cover Score, Shield, and Watch surfaces",
      "eval replay corpus source refs missing",
      "eval replay corpus signed evidence missing",
    ]));
    expect(receipt.recommendation).toContain("Fail closed");
  });

  it("does not add VESTA identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("vesta_replay_corpus");
      expect(source).not.toContain("1,072 measurable evaluation scenarios");
    }
  });
});
