import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";

const DOC = "docs/source-reviews/GAP-0908-ragnarok-public-methodology.md";
const REPO = "2501Pr0ject/RAGnarok-AI";
const URL = "https://github.com/2501Pr0ject/RAGnarok-AI";
const TITLE = "RAGnarok-AI";

const implementationFiles = [
  "src/methodology/publicMethodology.ts",
  "src/diagnostic/methodologyVersioning.ts",
  "docs/SCORING_METHODOLOGY.md",
  "src/badge/badgeCli.ts",
];

describe("GAP-0908 RAGnarok-AI public-methodology boundary", () => {
  it("documents live GitHub metadata and required source-review sections", () => {
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-0908");
    expect(doc).toContain(REPO);
    expect(doc).toContain(URL);
    expect(doc).toContain(TITLE);
    expect(doc).toContain("live GitHub repository page");
    expect(doc).toContain("README.md");
    expect(doc).toContain("AGPL-3.0 license");
    expect(doc).toContain("Star 16");
    expect(doc).toContain("Fork 2");
    expect(doc).toContain("Issues 1");
    expect(doc).toContain("Pull requests 5");
    expect(doc).toContain("205 Commits");
    expect(doc).toContain(".github");
    expect(doc).toContain("assets");
    expect(doc).toContain("benchmarks");
    expect(doc).toContain("docs");
    expect(doc).toContain("examples");
    expect(doc).toContain("helm/ ragnarok-ai");
    expect(doc).toContain("src/ ragnarok_ai");
    expect(doc).toContain("tests");
    expect(doc).toContain(".dockerignore");
    expect(doc).toContain(".pre-commit-config.yaml");
    expect(doc).toContain(".python-version");
    expect(doc).toContain("CHANGELOG.md");
    expect(doc).toContain("CODE_OF_CONDUCT.md");
    expect(doc).toContain("CONTRIBUTING-ADAPTERS.md");
    expect(doc).toContain("CONTRIBUTING.md");
    expect(doc).toContain("Dockerfile");
    expect(doc).toContain("LICENSE-COMMERCIAL.md");
    expect(doc).toContain("NOTICE");
    expect(doc).toContain("SECURITY.md");
    expect(doc).toContain("STABILITY.md");
    expect(doc).toContain("docker-compose.yml");
    expect(doc).toContain("mkdocs.yml");
    expect(doc).toContain("pyproject.toml");
    expect(doc).toContain("uv.lock");
    expect(doc).toContain("Local-first RAG evaluation framework");
    expect(doc).toContain("100% locally");
    expect(doc).toContain("no API keys");
    expect(doc).toContain("Ollama");
    expect(doc).toContain("checkpointing");
    expect(doc).toContain("LangChain");
    expect(doc).toContain("LangGraph");
    expect(doc).toContain("CI/CD");
    expect(doc).toContain("Production Monitoring");
    expect(doc).toContain("Prometheus metrics");
    expect(doc).toContain("LLM-as-Judge");
    expect(doc).toContain("Prometheus 2");
    expect(doc).toContain("Cost Tracking");
    expect(doc).toContain("Jupyter Integration");
    expect(doc).toContain("Framework Agnostic");
    expect(doc).toContain("Kubernetes Helm charts");
    expect(doc).toContain("air-gapped deployment");
    expect(doc).toContain("data sovereignty");
    expect(doc).toContain("Retrieval P@10");
    expect(doc).toContain("Faithfulness");
    expect(doc).toContain("Relevance");
    expect(doc).toContain("Hallucination");
    expect(doc).toContain("Precision@K");
    expect(doc).toContain("Recall@K");
    expect(doc).toContain("MRR");
    expect(doc).toContain("NDCG");
    expect(doc).toContain("Medical Mode");
    expect(doc).toContain("Webhook and Slack adapters");
    expect(doc).toContain("OpenTelemetry");
    expect(doc).toContain("Qdrant");
    expect(doc).toContain("ChromaDB");
    expect(doc).toContain("FAISS");
    expect(doc).toContain("DSPy");
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

  it("keeps RAGnarok-AI metadata out of public methodology semantics", () => {
    const doc = readFileSync(DOC, "utf8");
    const manifestText = JSON.stringify(getPublicMethodologyManifest());

    expect(doc).toContain("No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed");
    expect(doc).toContain("RAGnarok-AI local RAG-evaluation metadata alone cannot justify a public methodology version bump");
    expect(doc).toContain("No public methodology version bump");

    expect(manifestText).not.toContain(REPO);
    expect(manifestText).not.toContain(URL);
    expect(manifestText).not.toContain("ragnarok_public_methodology");
    expect(manifestText).not.toContain(TITLE);
  });

  it("keeps source-specific identifiers out of public methodology implementation modules", () => {
    for (const path of implementationFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain(REPO);
      expect(source).not.toContain(URL);
      expect(source).not.toContain("ragnarok_public_methodology");
    }
  });
});
