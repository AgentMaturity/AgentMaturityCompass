import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0957-honeyhive-public-methodology.md";
const URL = "https://www.honeyhive.ai";
const DOCS = "https://docs.honeyhive.ai/v2/introduction/what-is-hhai";
const EVALUATION = "https://www.honeyhive.ai/evaluation";
const OBSERVABILITY = "https://www.honeyhive.ai/observability";
const PROMPT_MANAGEMENT = "https://www.honeyhive.ai/playground";
const CLI_REPO = "https://github.com/honeyhiveai/honeyhive-cli";
const SELF_HOSTED = "https://docs.honeyhive.ai/v2/setup/self-hosted";
const IDENTIFIER = "honeyhive_public_methodology";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0957 HoneyHive public-methodology boundary", () => {
  it("documents live HoneyHive metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0957");
    expect(doc).toContain(URL);
    expect(doc).toContain(DOCS);
    expect(doc).toContain(EVALUATION);
    expect(doc).toContain(OBSERVABILITY);
    expect(doc).toContain(PROMPT_MANAGEMENT);
    expect(doc).toContain(CLI_REPO);
    expect(doc).toContain(SELF_HOSTED);
    expect(doc).toContain("The observability layer for production agents");
    expect(doc).toContain("continuous improvement loop");
    expect(doc).toContain("Traces");
    expect(doc).toContain("Trajectories");
    expect(doc).toContain("Experiments");
    expect(doc).toContain("Dashboard");
    expect(doc).toContain("Alerts");
    expect(doc).toContain("Playground");
    expect(doc).toContain("Annotations");
    expect(doc).toContain("OpenTelemetry-native");
    expect(doc).toContain("Online Evaluation");
    expect(doc).toContain("Session Replays");
    expect(doc).toContain("Graph and Timeline View");
    expect(doc).toContain("LLM-as-a-judge");
    expect(doc).toContain("Regression Detection");
    expect(doc).toContain("CI/CD Integration");
    expect(doc).toContain("Custom Rubrics");
    expect(doc).toContain("Audit Trail");
    expect(doc).toContain("Evaluator Alignment");
    expect(doc).toContain("signed manifests");
    expect(doc).toContain("OIDC");
    expect(doc).toContain("RBAC");
    expect(doc).toContain("SSO & SAML");
    expect(doc).toContain("SOC 2");
    expect(doc).toContain("GDPR");
    expect(doc).toContain("HIPAA");
    expect(doc).toContain("Evaluation-Driven Development");
    expect(doc).toContain("Open Standards, Open Ecosystem");
    expect(doc).toContain("Run Your First Eval");
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

  it("keeps HoneyHive platform metadata out of public methodology semantics for this gap", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("HoneyHive platform metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain("HoneyHive");
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain(IDENTIFIER);
  });

  it("keeps source-specific HoneyHive identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("HoneyHive");
      expect(source).not.toContain(URL);
      expect(source).not.toContain(IDENTIFIER);
    }
  });
});
