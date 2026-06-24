import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0804-cloud-edge-iot-replay-corpus-unavailable.md";
const DOI = "10.5281/zenodo.20591968";
const OPENALEX = "W7163927672";
const TITLE = "Multi-agent LLMs on the Cloud-Edge-IoT Continuum: A Systematic Mapping Study on Architectures, Deployment, and Evaluation";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0804 cloud-edge-IoT replay-corpus unavailable-source boundary", () => {
  it("documents failed live retrieval and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0804");
    expect(doc).toContain(TITLE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain("source unavailable");
    expect(doc).toContain("exact-title search");
    expect(doc).toContain("DOI search");
    expect(doc).toContain("Zenodo search");
    expect(doc).toContain("OpenAlex search");
    expect(doc).toContain("No abstract in OpenAlex metadata");
    expect(doc).toContain("cloud-edge-IoT continuum");
    expect(doc).toContain("systematic mapping study");
    expect(doc).toContain("architectures");
    expect(doc).toContain("deployment");
    expect(doc).toContain("evaluation");
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

  it("accepts cloud-edge-IoT context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0804-cloud-edge-iot-context",
      corpusId: "gap-0804-amc-owned-cloud-edge-iot-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0804-baseline",
      candidateRunId: "gap-0804-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T22:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0804-owned-cloud-edge-iot-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned cloud-edge-IoT replay fixture with source availability noted and no copied upstream mapping-study data",
            inputHash: hash("p"),
            expectedHash: hash("q"),
            fixtureHash: hash("r"),
            seed: 804,
            metadata: { sourceReview: "GAP-0804", primarySourceAvailable: false, copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.65,
            evidenceRefs: ["ev-gap0804-baseline"],
            signedEvidenceRefs: ["ledger-gap0804-baseline", "ledger-gap0804-baseline-ci"],
          },
          candidate: {
            score0to1: 0.76,
            evidenceRefs: ["ev-gap0804-candidate"],
            signedEvidenceRefs: ["ledger-gap0804-candidate", "ledger-gap0804-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.11);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when source metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0804-metadata-only-agent",
      corpusId: "gap-0804-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0804-baseline",
      candidateRunId: "gap-0804-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T22:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0804-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "DOI, OpenAlex id, and cloud-edge-IoT title without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [`https://doi.org/${DOI}`],
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

  it("does not add cloud-edge-IoT identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("cloud_edge_iot_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
