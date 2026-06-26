import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0890-dingus-replay-corpus.md";
const REPO = "dingus-technology/DINGUS";
const URL = "https://github.com/dingus-technology/DINGUS";
const TITLE = "Dingus";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0890 DINGUS replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0890");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("GPL-3.0 license");
    expect(doc).toContain("Star 23");
    expect(doc).toContain("Fork 1");
    expect(doc).toContain("Issues 2");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("150 Commits");
    expect(doc).toContain("1 tags");
    expect(doc).toContain("Python 97.1%");
    expect(doc).toContain("Shell 1.7%");
    expect(doc).toContain("Dockerfile 1.2%");
    expect(doc).toContain(".github");
    expect(doc).toContain(".kube");
    expect(doc).toContain("assets");
    expect(doc).toContain("docs");
    expect(doc).toContain("scripts");
    expect(doc).toContain("src");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("sample.env");
    expect(doc).toContain("Cleaner and quicker production debugging");
    expect(doc).toContain("production logs");
    expect(doc).toContain("readable actions");
    expect(doc).toContain("logs, metrics, code, commits");
    expect(doc).toContain("root");
    expect(doc).toContain("practical fixes");
    expect(doc).toContain("Helm");
    expect(doc).toContain("Docker");
    expect(doc).toContain("K8s cluster");
    expect(doc).toContain("docker compose");
    expect(doc).toContain("simulation repo");
    expect(doc).toContain("Docker Hub");
    expect(doc).toContain("Grafana");
    expect(doc).toContain("Loki");
    expect(doc).toContain("Prometheus");
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

  it("accepts DINGUS context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0890-dingus-reviewed-agent",
      corpusId: "gap-0890-amc-owned-production-debugging-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0890-baseline",
      candidateRunId: "gap-0890-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-22T19:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0890-owned-production-debugging-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned operational-debugging replay fixture with no copied DINGUS logs, Kubernetes configs, Helm charts, Docker Compose files, dashboard assets, prompts, generated actions, or simulation repo data",
            inputHash: hash("d"),
            expectedHash: hash("e"),
            fixtureHash: hash("f"),
            seed: 890,
            metadata: { sourceReview: "GAP-0890", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.58,
            evidenceRefs: ["ev-gap0890-baseline"],
            signedEvidenceRefs: ["ledger-gap0890-baseline", "ledger-gap0890-baseline-ci"],
          },
          candidate: {
            score0to1: 0.79,
            evidenceRefs: ["ev-gap0890-candidate"],
            signedEvidenceRefs: ["ledger-gap0890-candidate", "ledger-gap0890-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([URL]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.21);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when DINGUS metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0890-metadata-only-agent",
      corpusId: "gap-0890-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0890-baseline",
      candidateRunId: "gap-0890-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T19:45:00.000Z"),
      rows: [
        {
          rowId: "gap-0890-metadata-only-row",
          surfaces: ["Watch"],
          fixture: {
            task: "DINGUS, production logs, readable actions, Helm, Docker, K8s, Grafana, Loki, Prometheus, SRE, simulation repo, and README metadata without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [URL],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [URL],
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

  it("does not add DINGUS identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("dingus_replay_corpus");
      expect(source).not.toContain("dingus-technology");
    }
  });
});
