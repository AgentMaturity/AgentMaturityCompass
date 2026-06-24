import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0749-chateval-public-methodology.md";
const SOURCE = "https://github.com/thunlp/ChatEval";
const README = "https://github.com/thunlp/ChatEval/blob/main/README.md";
const ARXIV = "https://arxiv.org/abs/2308.07201";
const REPO = "thunlp/ChatEval";
const TITLE = "ChatEval: Towards Better LLM-based Evaluators through Multi-Agent Debate";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0749 ChatEval public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0749");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(REPO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("public, unarchived");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("LLM-based evaluators");
    expect(doc).toContain("human evaluation on generated text");
    expect(doc).toContain("roles acted by LLMs");
    expect(doc).toContain("autonomous debate");
    expect(doc).toContain("assigned personas");
    expect(doc).toContain("transparent referee process");
    expect(doc).toContain("FastChat-based arena-style demo");
    expect(doc).toContain("multiple LLM referees");
    expect(doc).toContain("OpenAI API");
    expect(doc).toContain("agentverse/tasks/llm_eval/data/faireval/preprocessed_data/test.json");
    expect(doc).toContain("custom debater agent configuration");
    expect(doc).toContain("prompt_template");
    expect(doc).toContain("config.yaml");
    expect(doc).toContain("one-by-one communication");
    expect(doc).toContain("2` agent roles");
    expect(doc).toContain("2` discussion turns");
    expect(doc).toContain("Chi-Min Chan");
    expect(doc).toContain("Zhiyuan Liu");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("does not create an AMC public-methodology version bump from repository metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No ChatEval runner, multi-agent debate evaluator");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain("chateval_public_methodology");
    expect(manifestText).not.toContain("multi_agent_debate_evaluator");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("chateval_public_methodology");
      expect(source).not.toContain("multi_agent_debate_evaluator");
    }
  });
});
