import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0744-graniet-llm-public-methodology.md";
const SOURCE = "https://github.com/graniet/llm";
const README = "https://github.com/graniet/llm/blob/main/README.md";
const REPO = "graniet/llm";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0744 graniet/llm public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0744");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(REPO);
    expect(doc).toContain("public, unarchived");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("Rust library and CLI");
    expect(doc).toContain("multiple LLM backends");
    expect(doc).toContain("unified API");
    expect(doc).toContain("OpenAI");
    expect(doc).toContain("Anthropic Claude");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("DeepSeek");
    expect(doc).toContain("xAI");
    expect(doc).toContain("Phind");
    expect(doc).toContain("Groq");
    expect(doc).toContain("Google");
    expect(doc).toContain("Cohere");
    expect(doc).toContain("Mistral");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("ElevenLabs");
    expect(doc).toContain("multi-step chains");
    expect(doc).toContain("validation");
    expect(doc).toContain("retry/backoff");
    expect(doc).toContain("parallel evaluation");
    expect(doc).toContain("REST API");
    expect(doc).toContain("speech-to-text");
    expect(doc).toContain("text-to-speech");
    expect(doc).toContain("shared memory");
    expect(doc).toContain("rustformers/llm");
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
    expect(doc).toContain("provider labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No Rust crate integration, LLM backend adapter, provider router, CLI wrapper");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain("graniet_llm_public_methodology");
    expect(manifestText).not.toContain("unified_backend_methodology");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("graniet_llm_public_methodology");
      expect(source).not.toContain("unified_backend_methodology");
    }
  });
});
