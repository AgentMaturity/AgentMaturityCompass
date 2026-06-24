import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0757-hacksynth-public-methodology.md";
const SOURCE = "https://github.com/aielte-research/HackSynth";
const README = "https://github.com/aielte-research/HackSynth/blob/main/README.md";
const ARXIV = "https://arxiv.org/abs/2412.01778";
const REPO = "aielte-research/HackSynth";
const TITLE = "HackSynth: LLM Agent and Evaluation Framework for Autonomous Penetration Testing";

const methodologyFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "src/badge/badgeCli.ts",
];

describe("GAP-0757 HackSynth public-methodology boundary", () => {
  it("documents GitHub source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0757");
    expect(doc).toContain(SOURCE);
    expect(doc).toContain(README);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(REPO);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("Planner and Summarizer");
    expect(doc).toContain("PicoCTF");
    expect(doc).toContain("OverTheWire");
    expect(doc).toContain("two hundred challenges");
    expect(doc).toContain("Hugging Face");
    expect(doc).toContain("Neptune.ai");
    expect(doc).toContain("CUDA-device");
    expect(doc).toContain("Docker/container");
    expect(doc).toContain("command logs");
    expect(doc).toContain("token counts");
    expect(doc).toContain("success flags");
    expect(doc).toContain("AGPLv3");
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

  it("does not create an AMC public-methodology version bump from HackSynth metadata", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code");
    expect(doc).toContain("labels are not accepted as public methodology proof without AMC-owned methodology receipts");
    expect(doc).toContain("No HackSynth runner, autonomous-pentest agent, CTF benchmark harness");

    expect(manifestText).not.toContain(SOURCE);
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain("hacksynth_public_methodology");
    expect(manifestText).not.toContain("autonomous_pentest_evaluation");
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of methodologyFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(SOURCE);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain("hacksynth_public_methodology");
      expect(source).not.toContain("autonomous_pentest_evaluation");
    }
  });
});
