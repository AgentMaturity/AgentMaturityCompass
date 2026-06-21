import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runReplayBenchmarkCorpus,
  type ReplayBenchmarkCorpusInput,
} from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOI = "https://doi.org/10.1021/acs.jproteome.5c00984";
const OPENALEX = "https://openalex.org/W7118933147";
const CROSSREF = "https://api.crossref.org/works/10.1021/acs.jproteome.5c00984";
const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0665-vibe-coding-omics-replay-corpus.md";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function replayInput(signed: boolean): ReplayBenchmarkCorpusInput {
  return {
    agentId: "gap-0665-vibe-coding-omics-agent",
    corpusId: "gap-0665-amc-owned-replay-corpus",
    corpusVersion: "2026.06.21",
    baselineRunId: "baseline-gap-0665",
    candidateRunId: "candidate-gap-0665",
    gateMode: "ci",
    now: new Date("2026-06-21T04:55:27.000Z"),
    sourceRefs: [DOI, OPENALEX, CROSSREF],
    rows: [
      {
        rowId: "gap-0665-amc-owned-row-1",
        surfaces: ["Score", "Shield", "Watch"],
        fixture: {
          task: "Replay an AMC-owned scientific-analysis app fixture without copying source paper content, omics data, or upstream application code.",
          inputHash: hash("a"),
          expectedHash: hash("b"),
          seed: 665,
          fixtureHash: hash("c"),
          runtime: {
            kind: "custom",
            version: "amc-owned-vibe-coding-omics-boundary-2026.06.21",
            commandHash: hash("d"),
            dependencyHash: hash("e"),
            sandboxProfile: "amc-owned-no-paper-or-omics-copy",
          },
          outputArtifactHashes: [hash("f")],
          metadata: {
            sourceReviewBoundary: "metadata-only DOI/OpenAlex/Crossref records are not replay evidence",
            noPaperContentCopied: true,
            noOmicsDatasetCopied: true,
            noApplicationCodeCopied: true,
          },
        },
        baseline: {
          score0to1: 0.83,
          evidenceRefs: ["ev-gap0665-baseline"],
          signedEvidenceRefs: signed ? ["ledger-gap0665-baseline"] : [],
        },
        candidate: {
          score0to1: 0.88,
          evidenceRefs: ["ev-gap0665-candidate"],
          signedEvidenceRefs: signed ? ["ledger-gap0665-candidate"] : [],
        },
      },
    ],
  };
}

describe("GAP-0665 vibe-coding omics replay-corpus source review", () => {
  it("documents live DOI/OpenAlex/Crossref metadata hashes and the no-bloat relevance decision", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("## Live metadata verification");
    expect(doc).toContain("W7118933147");
    expect(doc).toContain("10.1021/acs.jproteome.5c00984");
    expect(doc).toContain("Crossref Works metadata SHA-256: `eebaf0718abf19b9d4e83c0cc637ead8759732ac474cfb87b6a6721903fe9e4e`");
    expect(doc).toContain("OpenAlex metadata SHA-256: `ddce5c094355a6c62f78da4c2d4952523ae15f8d72a37e48c544931c7925e8ac`");
    expect(doc).toContain("DOI CSL metadata SHA-256: `9b42d902ec03b552b148187711a4548233121480e674fd0f9671f5d86c930f09`");
    expect(doc).toContain("Relevant, but only as source-review context for AMC's existing replayable benchmark corpus");
    expect(doc).toContain("Metadata-only DOI/OpenAlex/Crossref citation remains rejected");
    expect(doc).toContain("does **not** add an omics subsystem, vibe-coding subsystem");
    expect(doc).toContain("No paper prose, abstract text, figures, tables, datasets, code, benchmark rows");
  });

  it("fails closed on metadata-only citation and becomes ready only with AMC-owned signed replay evidence", () => {
    const metadataOnly = buildEvalReplayCorpusEvidenceReceipt(
      runReplayBenchmarkCorpus(replayInput(false)),
    );

    expect(metadataOnly.status).toBe("fail_closed");
    expect(metadataOnly.failClosed).toBe(true);
    expect(metadataOnly.sourceRefs).toEqual([DOI, OPENALEX, CROSSREF]);
    expect(metadataOnly.surfaces).toEqual(expect.arrayContaining(["Score", "Shield", "Watch"]));
    expect(metadataOnly.signedEvidenceRefCount).toBe(0);
    expect(metadataOnly.issues.join("\n")).toContain("signed evidence");
    expect(metadataOnly.recommendation).toContain("Fail closed");

    const signedReplay = buildEvalReplayCorpusEvidenceReceipt(
      runReplayBenchmarkCorpus(replayInput(true)),
    );

    expect(signedReplay.status).toBe("ready");
    expect(signedReplay.failClosed).toBe(false);
    expect(signedReplay.sourceRefs).toEqual([DOI, OPENALEX, CROSSREF]);
    expect(signedReplay.surfaces).toEqual(expect.arrayContaining(["Score", "Shield", "Watch"]));
    expect(signedReplay.signedEvidenceRefCount).toBe(2);
    expect(signedReplay.replayManifestPresent).toBe(true);
    expect(signedReplay.fixtureHashPresent).toBe(true);
    expect(signedReplay.ciReceiptPresent).toBe(true);
    expect(signedReplay.scoreDelta0to1).toBeCloseTo(0.05, 5);
    expect(signedReplay.recommendation).toContain("Eval replay corpus evidence is bound to manifest");
  });
});
