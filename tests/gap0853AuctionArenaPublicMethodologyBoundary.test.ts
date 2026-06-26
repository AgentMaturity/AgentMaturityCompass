import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0853-auction-arena-public-methodology.md";
const REPO = "jiangjiechen/auction-arena";
const URL = "https://github.com/jiangjiechen/auction-arena";
const PROJECT_PAGE = "https://auction-arena.github.io/";
const DEMO = "https://huggingface.co/spaces/jiangjiechen/Auction-Arena-Demo";
const ARXIV = "https://arxiv.org/abs/2310.05746";
const TITLE = "Auction Arena";
const PAPER = "Put Your Money Where Your Mouth Is: Evaluating Strategic Planning and Execution of LLM Agents in an Auction Arena";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0853 Auction Arena public-methodology boundary", () => {
  it("documents live source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0853");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(PROJECT_PAGE);
    expect(doc).toContain(DEMO);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(TITLE);
    expect(doc).toContain(PAPER);
    expect(doc).toContain("HTTP/2 200");
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("Apache-2.0 license");
    expect(doc).toContain("Star 49");
    expect(doc).toContain("Fork 5");
    expect(doc).toContain("Issues 0");
    expect(doc).toContain("Pull requests 0");
    expect(doc).toContain("5 Commits");
    expect(doc).toContain("No releases published");
    expect(doc).toContain("Python 91.7%");
    expect(doc).toContain("app_modules");
    expect(doc).toContain("assets");
    expect(doc).toContain("data");
    expect(doc).toContain("src");
    expect(doc).toContain("app.py");
    expect(doc).toContain("auction_workflow.py");
    expect(doc).toContain("requirements.txt");
    expect(doc).toContain("AucArena");
    expect(doc).toContain("simulated multi-agent battleground");
    expect(doc).toContain("strategic");
    expect(doc).toContain("unpredictable");
    expect(doc).toContain("resource and risk management");
    expect(doc).toContain("DEMO System");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic");
    expect(doc).toContain("Google");
    expect(doc).toContain("items_demo.jsonl");
    expect(doc).toContain("bidders_demo.jsonl");
    expect(doc).toContain("planning, bidding, belief update, and replanning");
    expect(doc).toContain("Belief-Desire-Intention");
    expect(doc).toContain("TrueSkill");
    expect(doc).toContain("Failed Bids");
    expect(doc).toContain("Belief Errors");
    expect(doc).toContain("heuristic baselines");
    expect(doc).toContain("human agents");
    expect(doc).toContain("public methodology versioning");
    expect(doc).toContain("methodology version");
    expect(doc).toContain("changelog");
    expect(doc).toContain("deprecation notice");
    expect(doc).toContain("migration guidance");
    expect(doc).toContain("No public methodology version bump");
    expect(doc).toContain("skipped as public-methodology implementation evidence");
    expect(doc).toContain("## Relevance decision");
    expect(doc).toContain("## AMC/8 surface check");
    expect(doc).toContain("## Product closure");
    expect(doc).toContain("## Fail-closed rule");
    expect(doc).toContain("## No-bloat boundary");
    expect(doc).toContain("## Verification");
  });

  it("keeps Auction Arena metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("Auction Arena metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("auction_arena_public_methodology");
    expect(manifestText).not.toContain(TITLE);
    expect(manifestText).not.toContain(PAPER);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain(PROJECT_PAGE);
      expect(source).not.toContain("auction_arena_public_methodology");
    }
  });
});
