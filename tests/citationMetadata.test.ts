import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const readProjectFile = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("citation metadata", () => {
  test("whitepaper exposes truthful citable metadata without an unsupported arXiv claim", () => {
    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");

    expect(whitepaper).toContain("## Cite This Work");
    expect(whitepaper).toContain("@techreport{polaris2026agentmaturitycompass");
    expect(whitepaper).toContain("arXiv identifier not assigned as of 2026-06-16");
    expect(whitepaper).toContain("url = {https://github.com/AgentMaturity/AgentMaturityCompass}");
    expect(whitepaper).not.toContain("A preprint is available at arXiv");
  });

  test("whitepaper does not ship placeholder citations or unsupported industry-report claims", () => {
    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");

    expect(whitepaper).not.toContain("[CITATION:");
    expect(whitepaper).not.toContain("McKinsey's 2025 Global AI Survey reported");
    expect(whitepaper).not.toContain("Gartner predicts that by 2027");
    expect(whitepaper).not.toContain("The State of AI in 2025: Agentic AI Crosses the Enterprise Threshold");
    expect(whitepaper).not.toContain("Gartner Top Strategic Technology Trends for 2025: Agentic AI");
    expect(whitepaper).toContain("New tools for building agents");
    expect(whitepaper).toContain("https://openai.com/index/new-tools-for-building-agents/");
  });

  test("RFC exposes a companion BibTeX citation", () => {
    const rfc = readProjectFile("docs/AMC_STANDARD_RFC.md");

    expect(rfc).toContain("11. [Citation](#11-citation)");
    expect(rfc).toContain("## 11. Citation");
    expect(rfc).toContain("@misc{amcstandard2026");
    expect(rfc).toContain("AMC_STANDARD_RFC.md");
    expect(rfc).toContain("DOI and arXiv identifier not assigned as of 2026-06-16");
  });

  test("whitepaper sector-pack totals match the current compiled catalog claim", () => {
    const whitepaper = readProjectFile("whitepaper/AMC_WHITEPAPER_v1.md");

    expect(whitepaper).toContain("41 industry-specific sector packs");
    expect(whitepaper).toContain("600 sector-specific diagnostic questions");
    expect(whitepaper).toContain("844 questions (244 default + 600 sector-specific)");
    expect(whitepaper).not.toContain("40 industry-specific sector packs");
    expect(whitepaper).not.toContain("593 sector-specific diagnostic questions");
    expect(whitepaper).not.toContain("740 questions (140 core + 600 sector-specific)");
  });
});
