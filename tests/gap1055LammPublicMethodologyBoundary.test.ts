import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1055-lamm-public-methodology.md";
const REPO_NAME = "OpenGVLab/LAMM";
const REPO = "https://github.com/OpenGVLab/LAMM";
const API = "https://api.github.com/repos/OpenGVLab/LAMM";
const README_API = "https://api.github.com/repos/OpenGVLab/LAMM/readme";
const README = "https://raw.githubusercontent.com/OpenGVLab/LAMM/main/README.md";
const PROJECT_PAGE = "https://openlamm.github.io/";
const ARXIV = "https://arxiv.org/abs/2306.06687";
const ARXIV_API = "https://export.arxiv.org/api/query?id_list=2306.06687";
const ARXIV_PDF = "https://arxiv.org/pdf/2306.06687v3";
const RELEASE = "https://github.com/OpenGVLab/LAMM/releases/tag/llama1_lamm";
const HEAD = "ea571363883ceba58a0f724ef197ed7205e07465";
const TAG = "llama1_lamm";
const TAG_SHA = "e9237c4f18707b22f7a8280e0380e70fba01e6c8";
const TITLE = "LAMM: Language-Assisted Multi-Modal Instruction-Tuning Dataset, Framework, and Benchmark";
const IDENTIFIER = "lamm_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1055 LAMM public-methodology boundary", () => {
  it("documents live LAMM metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1055");
    expect(doc).toContain(REPO_NAME);
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(PROJECT_PAGE);
    expect(doc).toContain(ARXIV);
    expect(doc).toContain(ARXIV_API);
    expect(doc).toContain(ARXIV_PDF);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(TAG);
    expect(doc).toContain(TAG_SHA);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("NeurIPS 2023 Datasets and Benchmarks Track");
    expect(doc).toContain("primary language `Python`");
    expect(doc).toContain("Stars `317`");
    expect(doc).toContain("Forks `16`");
    expect(doc).toContain("Watchers API total `7`");
    expect(doc).toContain("watchers_count `317`");
    expect(doc).toContain("open issues `9`");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("main branch protected `true`");
    expect(doc).toContain("commit date `2024-03-29T08:27:38Z`");
    expect(doc).toContain("verification reason `valid`");
    expect(doc).toContain("README sha `1805668101d78b7b360d609512d3af0850062d2c`");
    expect(doc).toContain("licenseInfo `null`");
    expect(doc).toContain("README states `CC BY NC 4.0`");
    expect(doc).toContain("release tag `llama1_lamm`");
    expect(doc).toContain("published_at `2023-09-05T19:07:25Z`");
    expect(doc).toContain("Python, Shell, and Cython");
    expect(doc).toContain("GitHub repo returned HTTP/2 200");
    expect(doc).toContain("raw README returned HTTP/2 200");
    expect(doc).toContain("content-length: 5700");
    expect(doc).toContain("arXiv returned HTTP/2 200");
    expect(doc).toContain("arXiv API totalResults `1`");
    expect(doc).toContain("published `2023-06-11T14:01:17Z`");
    expect(doc).toContain("updated `2023-11-06T07:02:19Z`");
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

  it("keeps LAMM benchmark metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain("LAMM benchmark metadata alone cannot justify an AMC public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO_NAME);
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(ARXIV);
    expect(manifestText).not.toContain(TITLE);
    expect(manifestText).not.toContain("Language-Assisted Multi-Modal");
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific LAMM identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO_NAME);
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(ARXIV);
      expect(source).not.toContain(TITLE);
      expect(source).not.toContain("Language-Assisted Multi-Modal");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
