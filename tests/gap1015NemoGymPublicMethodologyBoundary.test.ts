import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-1015-nemo-gym-public-methodology.md";
const REPO = "https://github.com/NVIDIA-NeMo/Gym";
const API = "https://api.github.com/repos/NVIDIA-NeMo/Gym";
const README_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/readme";
const README = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/README.md";
const LICENSE_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/license";
const CONTENTS_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/contents?ref=main";
const COMMIT_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/commits/main";
const RELEASE_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/releases/latest";
const PYPROJECT = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/pyproject.toml";
const UNIT_TESTS = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/unit-tests.yml";
const FULL_TEST_SUITE = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/full-test-suite.yml";
const FERN_DOCS_CI = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/.github/workflows/fern-docs-ci.yml";
const DOCS_README = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/docs/README.md";
const PACKAGE_INFO = "https://raw.githubusercontent.com/NVIDIA-NeMo/Gym/main/nemo_gym/package_info.py";
const DOCS_SITE = "https://docs.nvidia.com/nemo/gym/main/about/";
const TAGS_API = "https://api.github.com/repos/NVIDIA-NeMo/Gym/tags?per_page=10";
const HEAD = "797db2912ced96991ae4944a3fffc9d9c445ece0";
const RELEASE = "v0.3.0";
const PACKAGE_VERSION = "0.4.0rc0";
const IDENTIFIER = "nemo_gym_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-1015 NeMo Gym public-methodology boundary", () => {
  it("documents live NeMo Gym source metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1015");
    expect(doc).toContain("NVIDIA-NeMo/Gym");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README_API);
    expect(doc).toContain(README);
    expect(doc).toContain(LICENSE_API);
    expect(doc).toContain(CONTENTS_API);
    expect(doc).toContain(COMMIT_API);
    expect(doc).toContain(RELEASE_API);
    expect(doc).toContain(PYPROJECT);
    expect(doc).toContain(UNIT_TESTS);
    expect(doc).toContain(FULL_TEST_SUITE);
    expect(doc).toContain(FERN_DOCS_CI);
    expect(doc).toContain(DOCS_README);
    expect(doc).toContain(PACKAGE_INFO);
    expect(doc).toContain(DOCS_SITE);
    expect(doc).toContain(TAGS_API);
    expect(doc).toContain(HEAD);
    expect(doc).toContain(RELEASE);
    expect(doc).toContain(PACKAGE_VERSION);
    expect(doc).toContain("Python");
    expect(doc).toContain("Apache License 2.0");
    expect(doc).toContain("default branch `main`");
    expect(doc).toContain("1,002 stars");
    expect(doc).toContain("198 forks");
    expect(doc).toContain("458 open issues");
    expect(doc).toContain("created_at `2025-08-25T21:37:55Z`");
    expect(doc).toContain("pushed_at `2026-06-24T16:03:21Z`");
    expect(doc).toContain("updated_at `2026-06-24T14:23:57Z`");
    expect(doc).toContain("README sha `71d6e511af50df3ec448b182feb210c48138afe6`");
    expect(doc).toContain("pyproject sha `c8d92ec2f87085f0b908b3c29d52fed343f7e27c`");
    expect(doc).toContain("package_info sha `c415008946ff52900bea634a3782a9e8531c2d7b`");
    expect(doc).toContain("docs README sha `03fb9cfdf3d9c05ff678c77b067c2fdd7fe6db85`");
    expect(doc).toContain("unit-tests workflow sha `810f75fcc82f2a0ba447674d77a6219b21371ad9`");
    expect(doc).toContain("full-test-suite workflow sha `de74b1ed466c3b8b122badd68ddb79fa3232ab05`");
    expect(doc).toContain("fern-docs-ci workflow sha `03d476cf33fa9857f8ffc7c3850c13afb1031718`");
    expect(doc).toContain("release `v0.3.0` published `2026-06-04T15:53:32Z`");
    expect(doc).toContain("docs site HTTP 200");
    expect(doc).toContain("Evaluate and improve models and agents using environments");
    expect(doc).toContain("reproducible evaluation");
    expect(doc).toContain("shared environments and verifiers");
    expect(doc).toContain("rollouts");
    expect(doc).toContain("aggregate metrics");
    expect(doc).toContain("Fern");
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

  it("keeps NeMo Gym repo evidence out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain(
      "No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed",
    );
    expect(doc).toContain(
      "NeMo Gym repo evidence alone cannot justify an AMC public methodology version bump",
    );
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("NVIDIA-NeMo/Gym");
    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(HEAD);
    expect(manifestText).not.toContain(RELEASE);
    expect(manifestText).not.toContain(PACKAGE_VERSION);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific NeMo Gym identifiers out of implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("NVIDIA-NeMo/Gym");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(HEAD);
      expect(source).not.toContain(RELEASE);
      expect(source).not.toContain(PACKAGE_VERSION);
      expect(source).not.toContain("NeMo Gym");
      expect(source).not.toContain("nemo-gym");
      expect(source).not.toContain("nemo_gym");
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
