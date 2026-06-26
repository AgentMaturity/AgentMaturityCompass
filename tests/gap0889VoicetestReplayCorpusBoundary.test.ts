import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0889-voicetest-replay-corpus.md";
const REPO = "voicetestdev/voicetest";
const URL = "https://github.com/voicetestdev/voicetest";
const TITLE = "voicetest";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0889 voicetest replay-corpus boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0889");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 24");
    expect(doc).toContain("Fork 3");
    expect(doc).toContain("Issues 4");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("118 Commits");
    expect(doc).toContain("Releases 47");
    expect(doc).toContain("v0.49");
    expect(doc).toContain("Jun 7, 2026");
    expect(doc).toContain("Python 79.6%");
    expect(doc).toContain("Svelte 13.2%");
    expect(doc).toContain("TypeScript 7.2%");
    expect(doc).toContain(".claude-plugin");
    expect(doc).toContain(".github/ workflows");
    expect(doc).toContain("claude-plugin");
    expect(doc).toContain("docs");
    expect(doc).toContain("scripts");
    expect(doc).toContain("tests");
    expect(doc).toContain("web");
    expect(doc).toContain(".env.example");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("Test harness for voice agents");
    expect(doc).toContain("Retell");
    expect(doc).toContain("VAPI");
    expect(doc).toContain("Bland");
    expect(doc).toContain("Telnyx");
    expect(doc).toContain("LiveKit");
    expect(doc).toContain("autonomous simulations");
    expect(doc).toContain("LLM judges");
    expect(doc).toContain("unified AgentGraph");
    expect(doc).toContain("real-time streaming transcripts");
    expect(doc).toContain("run history");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("GROQ_API_KEY");
    expect(doc).toContain("max_turns");
    expect(doc).toContain("audio_eval");
    expect(doc).toContain("streaming");
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

  it("accepts voicetest context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0889-voice-agent-reviewed-agent",
      corpusId: "gap-0889-amc-owned-voice-agent-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0889-baseline",
      candidateRunId: "gap-0889-candidate",
      sourceRefs: [URL],
      now: new Date("2026-06-22T19:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0889-owned-voice-agent-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned voice-agent replay fixture with no copied voicetest workflows, platform configs, prompts, transcripts, judges, API keys, sample agents, or UI assets",
            inputHash: hash("v"),
            expectedHash: hash("w"),
            fixtureHash: hash("x"),
            seed: 889,
            metadata: { sourceReview: "GAP-0889", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.51,
            evidenceRefs: ["ev-gap0889-baseline"],
            signedEvidenceRefs: ["ledger-gap0889-baseline", "ledger-gap0889-baseline-ci"],
          },
          candidate: {
            score0to1: 0.72,
            evidenceRefs: ["ev-gap0889-candidate"],
            signedEvidenceRefs: ["ledger-gap0889-candidate", "ledger-gap0889-candidate-ci"],
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

  it("fails closed when voicetest metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0889-metadata-only-agent",
      corpusId: "gap-0889-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0889-baseline",
      candidateRunId: "gap-0889-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T19:25:00.000Z"),
      rows: [
        {
          rowId: "gap-0889-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "voicetest, Retell, VAPI, Bland, Telnyx, LiveKit, autonomous simulations, LLM judges, AgentGraph, Web UI, REST API, and CI/CD metadata without an AMC-owned replay fixture",
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

  it("does not add voicetest identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("voicetest_replay_corpus");
      expect(source).not.toContain("voicetestdev");
    }
  });
});
