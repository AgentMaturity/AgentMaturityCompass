import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0738-diliconsult-replay-corpus-unavailable.md";
const DOI = "10.1002/phar.70131";
const OPENALEX = "W7135207744";
const TITLE = "DILIConsult: A Multi-Agent Large Language Model Framework for Evaluating Drug-Induced Liver Injury in ICU Settings";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0738 DILIConsult replay-corpus unavailable-source boundary", () => {
  it("documents unavailable primary-source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0738");
    expect(doc).toContain(DOI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("exact-title, DOI, OpenAlex, Wiley publisher-domain");
    expect(doc).toContain("did not surface a reachable primary source");
    expect(doc).toContain("replayable benchmark corpus");
    expect(doc).toContain("Drug-Induced Liver Injury");
    expect(doc).toContain("ICU");
    expect(doc).toContain("clinical decision support");
    expect(doc).toContain("medicine");
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

  it("accepts DILIConsult context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0738-diliconsult-context-agent",
      corpusId: "gap-0738-amc-owned-clinical-risk-replay-corpus",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0738-baseline",
      candidateRunId: "gap-0738-candidate",
      sourceRefs: [`https://doi.org/${DOI}`, `https://openalex.org/${OPENALEX}`],
      now: new Date("2026-06-21T20:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0738-owned-clinical-risk-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned clinical-risk replay fixture with no copied clinical cases, patient data, or DILIConsult outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 738,
            metadata: { sourceReview: "GAP-0738", copiedUpstreamArtifacts: false, medicalClaim: false },
          },
          baseline: {
            score0to1: 0.64,
            evidenceRefs: ["ev-gap0738-baseline"],
            signedEvidenceRefs: ["ledger-gap0738-baseline", "ledger-gap0738-baseline-ci"],
          },
          candidate: {
            score0to1: 0.8,
            evidenceRefs: ["ev-gap0738-candidate"],
            signedEvidenceRefs: ["ledger-gap0738-candidate", "ledger-gap0738-candidate-ci"],
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
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when DILIConsult metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0738-metadata-only-agent",
      corpusId: "gap-0738-metadata-only",
      corpusVersion: "2026.06.21",
      baselineRunId: "gap-0738-baseline",
      candidateRunId: "gap-0738-candidate",
      sourceRefs: [],
      now: new Date("2026-06-21T20:55:00.000Z"),
      rows: [
        {
          rowId: "gap-0738-metadata-only-row",
          surfaces: ["Shield"],
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

  it("does not add DILIConsult identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(DOI);
      expect(source).not.toContain(OPENALEX);
      expect(source).not.toContain("diliconsult_replay_corpus");
      expect(source).not.toContain("Drug-Induced Liver Injury");
    }
  });
});
