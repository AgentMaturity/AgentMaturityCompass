import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0665-vibe-coding-omics-replay-corpus.md";
const DOI = "10.1021/acs.jproteome.5c00984";
const OPENALEX = "W7118933147";
const ARXIV = "https://arxiv.org/abs/2510.09804";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0665 vibe-coding omics replay-corpus boundary", () => {
  it("documents source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0665");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain("Rapid Development of Omics Data Analysis Applications through Vibe Coding");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts only AMC-owned replay rows through the existing eval replay receipt", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0665-vibe-coding-review-agent",
      corpusId: "gap-0665-amc-owned-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0665-baseline",
      candidateRunId: "gap-0665-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`, ARXIV],
      now: new Date("2026-06-21T05:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0665-owned-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned omics-app replay fixture with no upstream data copy",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 665,
            metadata: { sourceReview: "GAP-0665", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.82,
            evidenceRefs: ["ev-gap0665-baseline"],
            signedEvidenceRefs: ["ledger-gap0665-baseline", "ledger-gap0665-baseline-ci"],
          },
          candidate: {
            score0to1: 0.91,
            evidenceRefs: ["ev-gap0665-candidate"],
            signedEvidenceRefs: ["ledger-gap0665-candidate", "ledger-gap0665-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`, ARXIV]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when only metadata-style source refs are present", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0665-metadata-only-agent",
      corpusId: "gap-0665-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0665-baseline",
      candidateRunId: "gap-0665-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T05:00:00.000Z"),
      rows: [
        {
          rowId: "gap-0665-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Source title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.8,
            evidenceRefs: [`https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: [ARXIV],
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
});
