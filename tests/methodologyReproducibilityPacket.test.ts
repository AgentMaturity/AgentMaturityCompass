import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

import {
  getPublicMethodologyCaseStudyDataset,
  getPublicMethodologyReproducibilityPacket,
  renderPublicMethodologyCaseStudyDatasetMarkdown,
  renderPublicMethodologyReproducibilityMarkdown
} from "../src/methodology/publicMethodology.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-methodology-repro-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("methodology reproducibility packet", () => {
  test("exports full public question-bank metadata with stable content hashes", () => {
    const first = getPublicMethodologyReproducibilityPacket({
      generatedAt: "2026-06-16T00:00:00.000Z"
    });
    const second = getPublicMethodologyReproducibilityPacket({
      generatedAt: "2026-06-16T01:00:00.000Z"
    });

    expect(first.id).toBe("amc-methodology-reproducibility-packet");
    expect(first.questionBank.questionCount).toBe(244);
    expect(first.questionBank.questions).toHaveLength(244);
    expect(first.questionBank.layerDistribution).toEqual({
      "Culture & Alignment": 95,
      "Leadership & Autonomy": 23,
      Resilience: 55,
      Skills: 52,
      "Strategic Agent Operations": 19
    });
    expect(first.questionBank.questionBankSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.artifactReviewAlignment.map((row) => row.source)).toContain("ACM Artifact Review and Badging - Current");
    expect(first.fairAlignment.map((row) => row.principle)).toEqual([
      "Findable",
      "Accessible",
      "Interoperable",
      "Reusable"
    ]);
    expect(first.reproductionCommands).toContain("amc methodology --reproducibility --json");
  });

  test("renders an auditor-readable Markdown packet", () => {
    const packet = getPublicMethodologyReproducibilityPacket({
      generatedAt: "2026-06-16T00:00:00.000Z"
    });
    const markdown = renderPublicMethodologyReproducibilityMarkdown(packet);

    expect(markdown).toContain("# AMC Methodology Reproducibility Packet");
    expect(markdown).toContain("Question count: 244");
    expect(markdown).toContain("Question bank SHA-256");
    expect(markdown).toContain("ACM Artifact Review and Badging - Current");
    expect(markdown).toContain("GO FAIR");
    expect(markdown).toContain("| ID | Layer | Title | L0 label | L5 label |");
    expect(markdown).toContain("AMC-1.1");
  });

  test("built CLI writes JSON and Markdown reproducibility packets", () => {
    const root = tempRoot();
    const jsonOut = join(root, "amc-methodology-reproducibility.json");
    const markdownOut = join(root, "amc-methodology-reproducibility.md");

    const jsonResult = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "methodology",
      "--reproducibility",
      "--json",
      "--out",
      jsonOut
    ], { cwd: root, encoding: "utf8" });
    expect(jsonResult.status, jsonResult.stderr || jsonResult.stdout).toBe(0);
    expect(existsSync(jsonOut)).toBe(true);
    const jsonPacket = JSON.parse(readFileSync(jsonOut, "utf8")) as {
      id: string;
      questionBank: { questionCount: number };
    };
    expect(jsonPacket.id).toBe("amc-methodology-reproducibility-packet");
    expect(jsonPacket.questionBank.questionCount).toBe(244);

    const mdResult = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "methodology",
      "--reproducibility",
      "--format",
      "markdown",
      "--out",
      markdownOut
    ], { cwd: root, encoding: "utf8" });
    expect(mdResult.status, mdResult.stderr || mdResult.stdout).toBe(0);
    expect(readFileSync(markdownOut, "utf8")).toContain("Full Question Inventory");
  });

  test("exports a public synthetic sample case-study dataset with L0-L5 rows and dataset-card metadata", () => {
    const first = getPublicMethodologyCaseStudyDataset({
      generatedAt: "2026-06-16T00:00:00.000Z"
    });
    const second = getPublicMethodologyCaseStudyDataset({
      generatedAt: "2026-06-16T01:00:00.000Z"
    });

    expect(first.id).toBe("amc-public-methodology-case-study-dataset");
    expect(first.status).toBe("public-synthetic-sample");
    expect(first.datasetCard.prettyName).toBe("AMC Public Methodology Sample Case Studies");
    expect(first.datasetCard.rowCount).toBe(6);
    expect(first.cases.map((row) => row.maturityLevel)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(first.cases.every((row) => row.synthetic)).toBe(true);
    expect(first.methodology.questionBankSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.datasetCard.sources.map((source) => source.title)).toEqual(
      expect.arrayContaining(["Hugging Face Dataset Cards", "Datasheets for Datasets"])
    );
    expect(first.datasetCard.privacyAndSafety.join("\n")).toContain("no private customer evidence");
    expect(first.datasetCard.outOfScopeUses.join("\n")).toContain("empirical validation");
    expect(first.limitations.join("\n")).toContain("not DOI or arXiv assignment");

    const markdown = renderPublicMethodologyCaseStudyDatasetMarkdown(first);
    expect(markdown).toContain("# AMC Public Methodology Sample Case-Study Dataset");
    expect(markdown).toContain("## Dataset Card");
    expect(markdown).toContain("amc-sample-l5-controlled-improver");
    expect(markdown).toContain("public synthetic sample dataset");
  });

  test("built CLI writes JSON and Markdown sample case-study datasets", () => {
    const root = tempRoot();
    const jsonOut = join(root, "amc-methodology-case-studies.json");
    const markdownOut = join(root, "amc-methodology-case-studies.md");

    const jsonResult = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "methodology",
      "--sample-dataset",
      "--json",
      "--out",
      jsonOut
    ], { cwd: root, encoding: "utf8" });
    expect(jsonResult.status, jsonResult.stderr || jsonResult.stdout).toBe(0);
    expect(existsSync(jsonOut)).toBe(true);
    const dataset = JSON.parse(readFileSync(jsonOut, "utf8")) as {
      id: string;
      cases: Array<{ maturityLevel: number }>;
    };
    expect(dataset.id).toBe("amc-public-methodology-case-study-dataset");
    expect(dataset.cases.map((row) => row.maturityLevel)).toEqual([0, 1, 2, 3, 4, 5]);

    const mdResult = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "methodology",
      "--sample-dataset",
      "--format",
      "markdown",
      "--out",
      markdownOut
    ], { cwd: root, encoding: "utf8" });
    expect(mdResult.status, mdResult.stderr || mdResult.stdout).toBe(0);
    expect(readFileSync(markdownOut, "utf8")).toContain("Dataset Card");
  });

  test("public docs and audit expose the reproducibility packet path", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("docs/SCORING_METHODOLOGY.md")).toContain("amc methodology --reproducibility --json");
    expect(read("docs/SCORING_METHODOLOGY.md")).toContain("amc methodology --sample-dataset --json");
    expect(read("whitepaper/AMC_WHITEPAPER_v1.md")).toContain("amc methodology --reproducibility --json");
    expect(read("whitepaper/AMC_WHITEPAPER_v1.md")).toContain("amc methodology --sample-dataset --json");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("Methodology reproducibility packet — ✅ Resolved 2026-06-16");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("Methodology sample case-study dataset — ✅ Resolved 2026-06-16");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("not a DOI/arXiv assignment or third-party empirical validation");
  });
});
