import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0964-prompt-native-semantic-runtime-replay-corpus.md";
const DOI = "https://doi.org/10.5281/zenodo.19059674";
const ZENODO = "https://zenodo.org/records/19059674";
const OPENALEX = "https://openalex.org/W7138396142";
const OPENALEX_API = "https://api.openalex.org/works/W7138396142";
const TITLE = "Prompt-Native Semantic Runtimes for Language Models: Inference-Time Semantic Governance, Provenance, Compression, and Document-Level Process Teaching";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0964 prompt-native semantic runtime replay-corpus boundary", () => {
  it("documents unavailable Zenodo source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0964");
    expect(doc).toContain(DOI);
    expect(doc).toContain(ZENODO);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("Zenodo record returned HTTP/1.1 410 GONE");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("OpenAlex 2026 metadata");
    expect(doc).toContain("Prompt-Native Semantic Runtimes");
    expect(doc).toContain("Inference-Time Semantic Governance");
    expect(doc).toContain("Provenance");
    expect(doc).toContain("Compression");
    expect(doc).toContain("Document-Level Process Teaching");
    expect(doc).toContain("Computer science");
    expect(doc).toContain("Software portability");
    expect(doc).toContain("Programming language");
    expect(doc).toContain("Semantic computing");
    expect(doc).toContain("Natural language processing");
    expect(doc).toContain("Semantics");
    expect(doc).toContain("Process");
    expect(doc).toContain("replay manifest");
    expect(doc).toContain("fixture hash");
    expect(doc).toContain("fixed seed");
    expect(doc).toContain("score delta");
    expect(doc).toContain("CI receipt");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("accepts prompt-native runtime context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0964-prompt-native-runtime-reviewed-agent",
      corpusId: "gap-0964-amc-owned-semantic-runtime-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0964-baseline",
      candidateRunId: "gap-0964-candidate",
      sourceRefs: [DOI, OPENALEX, OPENALEX_API],
      now: new Date("2026-06-22T23:57:00.000Z"),
      rows: [
        {
          rowId: "gap-0964-owned-semantic-runtime-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned semantic governance replay fixture with no copied Zenodo paper text, process-teaching examples, runtime prompts, provenance tables, compression examples, datasets, figures, or benchmark outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 964,
            metadata: { sourceReview: "GAP-0964", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.54,
            evidenceRefs: ["ev-gap0964-baseline"],
            signedEvidenceRefs: ["ledger-gap0964-baseline", "ledger-gap0964-baseline-ci"],
          },
          candidate: {
            score0to1: 0.82,
            evidenceRefs: ["ev-gap0964-candidate"],
            signedEvidenceRefs: ["ledger-gap0964-candidate", "ledger-gap0964-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, OPENALEX, OPENALEX_API]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.28);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when prompt-native runtime metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0964-metadata-only-agent",
      corpusId: "gap-0964-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0964-baseline",
      candidateRunId: "gap-0964-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:57:00.000Z"),
      rows: [
        {
          rowId: "gap-0964-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Prompt-native semantic runtime title, DOI, Zenodo 410 status, OpenAlex metadata, semantic governance, provenance, compression, and process-teaching terms without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [DOI],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [OPENALEX],
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

  it("does not add prompt-native runtime identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.5281/zenodo.19059674");
      expect(source).not.toContain("W7138396142");
      expect(source).not.toContain("prompt_native_semantic_runtime_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
