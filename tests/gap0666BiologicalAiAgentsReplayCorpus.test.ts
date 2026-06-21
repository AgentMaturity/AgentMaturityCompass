import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildReplayBenchmarkWatchAlerts,
  runReplayBenchmarkCorpus,
  verifyReplayBenchmarkCorpusReceipt,
  type ReplayBenchmarkCorpusInput,
} from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOI = "https://doi.org/10.1093/bib/bbag075";
const OPENALEX = "https://openalex.org/W7131698947";
const SOURCE_REVIEW_DOC = "docs/source-reviews/GAP-0666-biological-ai-agents-replay-corpus.md";

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

function replayInput(signed: boolean): ReplayBenchmarkCorpusInput {
  return {
    agentId: "gap-0666-biological-research-agent",
    corpusId: "gap-0666-amc-owned-biological-replay-corpus",
    corpusVersion: "2026.06.21",
    baselineRunId: "baseline-gap-0666",
    candidateRunId: "candidate-gap-0666",
    sourceRefs: [DOI, OPENALEX],
    now: new Date("2026-06-21T04:54:49.000Z"),
    rows: [
      {
        rowId: "gap-0666-biological-agent-row-1",
        surfaces: ["Score", "Shield", "Watch"],
        fixture: {
          task: "AMC-owned biological-research-agent replay fixture; no survey content copied",
          inputHash: hash("a"),
          expectedHash: hash("b"),
          seed: 666,
          fixtureHash: hash("c"),
          runtime: {
            kind: "python",
            version: "3.12",
            commandHash: hash("d"),
            dependencyHash: hash("e"),
            sandboxProfile: "amc-owned-no-biological-survey-copy",
          },
          outputArtifactHashes: [hash("f")],
          metadata: {
            sourceReviewBoundary: "DOI/OpenAlex metadata is background only",
            noUpstreamSurveyCopy: true,
            noBiologicalDatasetMirror: true,
          },
        },
        baseline: {
          score0to1: 0.82,
          evidenceRefs: ["ev-gap0666-baseline"],
          signedEvidenceRefs: signed ? ["ledger-gap0666-baseline"] : [],
        },
        candidate: {
          score0to1: 0.88,
          evidenceRefs: ["ev-gap0666-candidate"],
          signedEvidenceRefs: signed ? ["ledger-gap0666-candidate"] : [],
        },
      },
    ],
  };
}

describe("GAP-0666 biological AI agents survey replay-corpus boundary", () => {
  it("documents live DOI/OpenAlex metadata and the no-bloat relevance decision", () => {
    const doc = readFileSync(SOURCE_REVIEW_DOC, "utf8");

    expect(doc).toContain("## Live metadata verification");
    expect(doc).toContain("W7131698947");
    expect(doc).toContain("10.1093/bib/bbag075");
    expect(doc).toContain("Artificial Intelligence agents for biological research: a survey");
    expect(doc).toContain("OpenAlex metadata SHA-256 | `25fff36622fe5e9a9fa713d5044a109890b6603a18f7f75371981a327fffceb0`");
    expect(doc).toContain("DOI CSL metadata SHA-256 | `cd9c74c1ea4b8ce2801cfd4cab850f1ca109d261c48956360f0be0eaa39dc542`");
    expect(doc).toContain("Relevant only as background source-review context");
    expect(doc).toContain("Metadata-only DOI/OpenAlex citation remains rejected");
    expect(doc).toContain("No biological research subsystem, importer, dataset mirror, survey-content corpus");
  });

  it("fails closed for metadata-only survey claims and passes only with AMC-owned signed replay evidence", () => {
    const metadataOnly = runReplayBenchmarkCorpus(replayInput(false));
    const metadataReceipt = buildEvalReplayCorpusEvidenceReceipt(metadataOnly);
    const metadataVerification = verifyReplayBenchmarkCorpusReceipt(metadataOnly.manifest, metadataOnly.ciReceipt);
    const metadataAlerts = buildReplayBenchmarkWatchAlerts(metadataOnly.manifest, metadataOnly.ciReceipt);

    expect(metadataVerification.valid).toBe(true);
    expect(metadataReceipt.status).toBe("fail_closed");
    expect(metadataReceipt.sourceRefs).toEqual([DOI, OPENALEX]);
    expect(metadataReceipt.issues.join("\n")).toContain("signed evidence");
    expect(metadataReceipt.recommendation).toContain("Fail closed");
    expect(metadataAlerts).toHaveLength(1);
    expect(metadataAlerts[0]?.message).toContain("signed evidence refs below threshold");

    const signedReplay = runReplayBenchmarkCorpus(replayInput(true));
    const signedReceipt = buildEvalReplayCorpusEvidenceReceipt(signedReplay);
    const signedVerification = verifyReplayBenchmarkCorpusReceipt(signedReplay.manifest, signedReplay.ciReceipt);

    expect(signedVerification.valid).toBe(true);
    expect(signedReceipt.status).toBe("ready");
    expect(signedReceipt.surfaces).toEqual(expect.arrayContaining(["Score", "Shield", "Watch"]));
    expect(signedReceipt.sourceRefs).toEqual([DOI, OPENALEX]);
    expect(signedReceipt.signedEvidenceRefCount).toBe(2);
    expect(signedReplay.manifest.rows[0]?.fixtureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(signedReplay.manifest.rows[0]?.rowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(buildReplayBenchmarkWatchAlerts(signedReplay.manifest, signedReplay.ciReceipt)).toHaveLength(0);
  });
});
