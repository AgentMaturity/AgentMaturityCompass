import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0791-vibe-design-replay-corpus-unavailable.md";
const DOI = "10.2139/ssrn.6297816";
const OPENALEX = "W7131234329";
const TITLE = "Vibe Design: Human-in-the-loop Agentic Framework for UI Design with Large Language Models";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0791 Vibe Design replay-corpus unavailable-source boundary", () => {
  it("documents unavailable paper metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0791");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, SSRN, and OpenAlex work searches returned no reachable primary source");
    expect(doc).toContain("unavailable-source replay-corpus boundary");
    expect(doc).toContain("human-in-the-loop");
    expect(doc).toContain("agentic framework");
    expect(doc).toContain("UI design");
    expect(doc).toContain("large language models");
    expect(doc).toContain("usability");
    expect(doc).toContain("pluralistic walkthrough");
    expect(doc).toContain("persona");
    expect(doc).toContain("user experience design");
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

  it("accepts UI-design context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0791-vibe-design-context-agent",
      corpusId: "gap-0791-amc-owned-ui-design-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0791-baseline",
      candidateRunId: "gap-0791-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T19:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0791-owned-ui-design-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned UI-design replay fixture with no copied Vibe Design paper content, prompts, personas, or walkthrough artifacts",
            inputHash: hash("m"),
            expectedHash: hash("n"),
            fixtureHash: hash("o"),
            seed: 791,
            metadata: {
              sourceReview: "GAP-0791",
              workloadClass: "ui-design-agent-replay",
              primarySourceAvailable: false,
              copiedUpstreamArtifacts: false,
            },
          },
          baseline: {
            score0to1: 0.62,
            evidenceRefs: ["ev-gap0791-baseline"],
            signedEvidenceRefs: ["ledger-gap0791-baseline", "ledger-gap0791-baseline-ci"],
          },
          candidate: {
            score0to1: 0.75,
            evidenceRefs: ["ev-gap0791-candidate"],
            signedEvidenceRefs: ["ledger-gap0791-candidate", "ledger-gap0791-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`]);
    expect(receipt.replayManifestPresent).toBe(true);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeGreaterThan(0.1);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when DOI/OpenAlex/title metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0791-metadata-only-agent",
      corpusId: "gap-0791-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0791-baseline",
      candidateRunId: "gap-0791-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T19:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0791-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Vibe Design title and DOI without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.70,
            evidenceRefs: [`https://doi.org/${DOI}`],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.84,
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
      expect(source).not.toContain("vibe_design_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
