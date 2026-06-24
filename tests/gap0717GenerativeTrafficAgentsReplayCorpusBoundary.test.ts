import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0717-generative-traffic-agents-replay-corpus.md";
const ARXIV = "https://arxiv.org/abs/2601.16778";
const DOI = "10.1145/3772318.3790772";
const OPENALEX = "W7125674531";
const TITLE = "GTA: Generative Traffic Agents for Simulating Realistic Mobility Behavior";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0717 Generative Traffic Agents replay-corpus boundary", () => {
  it("documents live arXiv metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0717");
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("arXiv `2601.16778`");
    expect(doc).toContain("Simon Laemmer");
    expect(doc).toContain("Mark Colley");
    expect(doc).toContain("Patrick Ebel");
    expect(doc).toContain("2026-01-23");
    expect(doc).toContain("persona-based agents");
    expect(doc).toContain("census-based sociodemographic data");
    expect(doc).toContain("artificial populations");
    expect(doc).toContain("activity schedules");
    expect(doc).toContain("mode-choice simulation");
    expect(doc).toContain("Berlin-scale experiments");
    expect(doc).toContain("empirical comparisons");
    expect(doc).toContain("modal split");
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

  it("accepts mobility-agent context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0717-mobility-agent-context",
      corpusId: "gap-0717-amc-owned-mobility-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0717-baseline",
      candidateRunId: "gap-0717-candidate",
      sourceRefs: [ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T19:35:00.000Z"),
      rows: [
        {
          rowId: "gap-0717-owned-mobility-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned mobility-agent replay fixture with no copied upstream census, persona, or trip data",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 717,
            metadata: { sourceReview: "GAP-0717", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.69,
            evidenceRefs: ["ev-gap0717-baseline"],
            signedEvidenceRefs: ["ledger-gap0717-baseline", "ledger-gap0717-baseline-ci"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["ev-gap0717-candidate"],
            signedEvidenceRefs: ["ledger-gap0717-candidate", "ledger-gap0717-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([ARXIV, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0717-metadata-only-agent",
      corpusId: "gap-0717-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0717-baseline",
      candidateRunId: "gap-0717-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T19:35:00.000Z"),
      rows: [
        {
          rowId: "gap-0717-metadata-only-row",
          surfaces: ["Watch"],
          fixture: {
            task: "Source title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: [ARXIV, `https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.8,
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

  it("does not add GTA identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("generative_traffic_agents_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
