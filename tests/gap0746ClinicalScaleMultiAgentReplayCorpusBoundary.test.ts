import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0746-clinical-scale-multi-agent-replay-corpus.md";
const SOURCE = "https://www.nature.com/articles/s44401-026-00077-0";
const DOI = "10.1038/s44401-026-00077-0";
const OPENALEX = "W7134248010";
const TITLE = "Orchestrated multi agents sustain accuracy under clinical-scale workloads compared to a single agent";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0746 clinical-scale multi-agent replay-corpus boundary", () => {
  it("documents live Nature metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0746");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("npj Health Systems");
    expect(doc).toContain("Brief Communication");
    expect(doc).toContain("09 March 2026");
    expect(doc).toContain("article `23`");
    expect(doc).toContain("Eyal Klang");
    expect(doc).toContain("Mahmud Omar");
    expect(doc).toContain("Reem Agbareia");
    expect(doc).toContain("Girish N. Nadkarni");
    expect(doc).toContain("single-agent versus orchestrated multi-agent execution");
    expect(doc).toContain("clinical-scale workloads");
    expect(doc).toContain("retrieval tasks");
    expect(doc).toContain("extraction tasks");
    expect(doc).toContain("dosing tasks");
    expect(doc).toContain("batch sizes from `5` to `80`");
    expect(doc).toContain("random seed `42`");
    expect(doc).toContain("234,650");
    expect(doc).toContain("331,793");
    expect(doc).toContain("20` dosing templates");
    expect(doc).toContain("90.6%");
    expect(doc).toContain("65.3%");
    expect(doc).toContain("73.1%");
    expect(doc).toContain("16.6%");
    expect(doc).toContain("65-fold");
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

  it("accepts clinical-scale workload context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0746-clinical-scale-reviewed-agent",
      corpusId: "gap-0746-amc-owned-clinical-scale-workload-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0746-single-agent-baseline",
      candidateRunId: "gap-0746-orchestrated-candidate",
      sourceRefs: [SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T21:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0746-owned-workload-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned clinical-scale workload replay fixture with no copied clinical data, prompts, dosing templates, or paper outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 42,
            metadata: {
              sourceReview: "GAP-0746",
              workloadClass: "retrieval-extraction-dosing",
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.49,
            evidenceRefs: ["ev-gap0746-single-agent-baseline"],
            signedEvidenceRefs: ["ledger-gap0746-baseline", "ledger-gap0746-baseline-ci"],
          },
          candidate: {
            score0to1: 0.77,
            evidenceRefs: ["ev-gap0746-orchestrated-candidate"],
            signedEvidenceRefs: ["ledger-gap0746-candidate", "ledger-gap0746-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([SOURCE, `https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0.2);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when Nature metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0746-metadata-only-agent",
      corpusId: "gap-0746-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0746-baseline",
      candidateRunId: "gap-0746-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T21:05:00.000Z"),
      rows: [
        {
          rowId: "gap-0746-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Nature clinical-scale multi-agent title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.73,
            evidenceRefs: [SOURCE, `https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.91,
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

  it("does not add source-specific identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("clinical_scale_multi_agent_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
