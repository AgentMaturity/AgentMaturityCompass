import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runReplayBenchmarkCorpus } from "../src/benchmarks/replayBenchmarkCorpus.js";
import { buildEvalReplayCorpusEvidenceReceipt } from "../src/eval/replayCorpusEvidenceReceipt.js";

const DOC = "docs/source-reviews/GAP-0959-prompt-injection-replay-corpus.md";
const DOI = "https://doi.org/10.3390/info17010054";
const MDPI = "https://www.mdpi.com/2078-2489/17/1/54";
const OPENALEX = "https://openalex.org/W7118532765";
const OPENALEX_API = "https://api.openalex.org/works/W7118532765";
const TITLE = "Prompt Injection Attacks in Large Language Models and AI Agent Systems: A Comprehensive Review of Vulnerabilities, Attack Vectors, and Defense Mechanisms";

const implementationFiles = [
  "src/benchmarks/replayBenchmarkCorpus.ts",
  "src/eval/replayCorpusEvidenceReceipt.ts",
  "src/diagnostic/evalReplayCorpusBoundary.ts",
];

const hash = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("GAP-0959 prompt-injection replay-corpus boundary", () => {
  it("documents live MDPI/DOI/OpenAlex metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0959");
    expect(doc).toContain(DOI);
    expect(doc).toContain(MDPI);
    expect(doc).toContain(OPENALEX);
    expect(doc).toContain(OPENALEX_API);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("DOI returned HTTP/2 302");
    expect(doc).toContain("MDPI article page opened successfully through the web channel");
    expect(doc).toContain("OpenAlex API HEAD returned HTTP/2 200");
    expect(doc).toContain("Information 2026, 17(1), 54");
    expect(doc).toContain("7 January 2026");
    expect(doc).toContain("Review");
    expect(doc).toContain("Open Access");
    expect(doc).toContain("Saidakhror Gulyamov");
    expect(doc).toContain("Andrey Rodionov");
    expect(doc).toContain("Akmaljon Rakhimjonov");
    expect(doc).toContain("Emerging Trends in AI-Driven Cyber Security and Digital Forensics");
    expect(doc).toContain("prompt injection attacks");
    expect(doc).toContain("large language models");
    expect(doc).toContain("AI agents");
    expect(doc).toContain("retrieval-augmented generation");
    expect(doc).toContain("OWASP Top 10 for LLM Applications 2025");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("direct jailbreaking");
    expect(doc).toContain("indirect injection");
    expect(doc).toContain("RAG poisoning");
    expect(doc).toContain("GitHub Copilot");
    expect(doc).toContain("CVE-2025-53773");
    expect(doc).toContain("ChatGPT Windows license key exposure");
    expect(doc).toContain("PALADIN");
    expect(doc).toContain("defense-in-depth");
    expect(doc).toContain("stochastic nature problem");
    expect(doc).toContain("alignment paradox");
    expect(doc).toContain("taxonomy of prompt injection attacks");
    expect(doc).toContain("AI agent systems");
    expect(doc).toContain("RAG System Vulnerabilities");
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

  it("accepts prompt-injection paper context only through existing eval replay corpus receipts", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0959-prompt-injection-reviewed-agent",
      corpusId: "gap-0959-amc-owned-prompt-injection-replay-corpus",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0959-baseline",
      candidateRunId: "gap-0959-candidate",
      sourceRefs: [DOI, MDPI, OPENALEX, OPENALEX_API],
      now: new Date("2026-06-22T23:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0959-owned-prompt-injection-replay-row",
          surfaces: ["Score", "Shield", "Watch"],
          fixture: {
            task: "AMC-owned prompt-injection replay fixture with no copied MDPI paper text, attack prompts, exploit examples, RAG poisoning examples, incident rows, defense tables, datasets, figures, or benchmark outputs",
            inputHash: hash("a"),
            expectedHash: hash("b"),
            fixtureHash: hash("c"),
            seed: 959,
            metadata: { sourceReview: "GAP-0959", copiedUpstreamArtifacts: false },
          },
          baseline: {
            score0to1: 0.49,
            evidenceRefs: ["ev-gap0959-baseline"],
            signedEvidenceRefs: ["ledger-gap0959-baseline", "ledger-gap0959-baseline-ci"],
          },
          candidate: {
            score0to1: 0.84,
            evidenceRefs: ["ev-gap0959-candidate"],
            signedEvidenceRefs: ["ledger-gap0959-candidate", "ledger-gap0959-candidate-ci"],
          },
        },
      ],
    });

    const receipt = buildEvalReplayCorpusEvidenceReceipt(result);

    expect(receipt.status).toBe("ready");
    expect(receipt.failClosed).toBe(false);
    expect(receipt.surfaces).toEqual(["Score", "Shield", "Watch"]);
    expect(receipt.sourceRefs).toEqual([DOI, MDPI, OPENALEX, OPENALEX_API]);
    expect(receipt.signedEvidenceRefCount).toBe(4);
    expect(receipt.fixtureHashPresent).toBe(true);
    expect(receipt.scoreDelta0to1).toBeCloseTo(0.35);
    expect(receipt.recommendation).toContain("Eval replay corpus evidence is bound");
  });

  it("fails closed when prompt-injection paper metadata replaces AMC-owned replay evidence", () => {
    const result = runReplayBenchmarkCorpus({
      agentId: "gap-0959-metadata-only-agent",
      corpusId: "gap-0959-metadata-only",
      corpusVersion: "2026.06.22",
      baselineRunId: "gap-0959-baseline",
      candidateRunId: "gap-0959-candidate",
      sourceRefs: [],
      now: new Date("2026-06-22T23:40:00.000Z"),
      rows: [
        {
          rowId: "gap-0959-metadata-only-row",
          surfaces: ["Score"],
          fixture: {
            task: "Prompt injection paper title, DOI, MDPI article, OpenAlex metadata, OWASP, MCP, direct jailbreak, indirect injection, RAG poisoning, and defense-in-depth terms without an AMC-owned replay fixture",
            inputHash: "metadata-only",
          },
          baseline: {
            score0to1: 0.7,
            evidenceRefs: [DOI],
            signedEvidenceRefs: [],
          },
          candidate: {
            score0to1: 0.7,
            evidenceRefs: [MDPI],
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

  it("does not add prompt-injection paper identifiers to replay corpus implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("10.3390/info17010054");
      expect(source).not.toContain("W7118532765");
      expect(source).not.toContain("prompt_injection_replay_corpus");
      expect(source).not.toContain(TITLE);
    }
  });
});
