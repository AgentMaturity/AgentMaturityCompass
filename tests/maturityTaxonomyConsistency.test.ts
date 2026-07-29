import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateBadge, formatBadgeOutput } from "../src/badge/badgeCli.js";
import { generateGuide } from "../src/guide/guideGenerator.js";
import {
  AMC_MATURITY_LABELS,
  AMC_MATURITY_LEGEND,
  AMC_MATURITY_LEVELS,
  formatMaturityLevel,
  maturityLevelFromOrdinal,
} from "../src/score/maturityTaxonomy.js";
import {
  AMC_PUBLIC_METHODOLOGY_ID,
  getPublicMethodologyManifest,
  verifyPublicMethodologyReference,
} from "../src/methodology/publicMethodology.js";
import {
  getQuestionSet,
  LIFECYCLE_QUESTION_SET_VERSION,
} from "../src/diagnostic/questionSets.js";
import { probeEndpoint } from "../src/scanner/endpointProbe.js";
import { scanLocal } from "../src/scanner/localScanner.js";

const root = process.cwd();
const canonicalRows = [
  ["L0", "Absent"],
  ["L1", "Initial"],
  ["L2", "Developing"],
  ["L3", "Defined"],
  ["L4", "Managed"],
  ["L5", "Optimizing"],
] as const;

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AMC aggregate maturity taxonomy", () => {
  it("defines one ordered typed L0-L5 contract and rejects invalid ordinals", () => {
    expect(AMC_MATURITY_LEVELS.map(({ level, label }) => [level, label])).toEqual(canonicalRows);
    expect(AMC_MATURITY_LABELS).toEqual(Object.fromEntries(canonicalRows));
    expect(AMC_MATURITY_LEGEND).toBe(
      "L0=Absent | L1=Initial | L2=Developing | L3=Defined | L4=Managed | L5=Optimizing",
    );
    expect(formatMaturityLevel("L3")).toBe("L3 — Defined");
    expect(maturityLevelFromOrdinal(5)).toBe("L5");
    expect(() => maturityLevelFromOrdinal(-1)).toThrow(/maturity ordinal/i);
    expect(() => maturityLevelFromOrdinal(1.5)).toThrow(/maturity ordinal/i);
    expect(() => maturityLevelFromOrdinal(6)).toThrow(/maturity ordinal/i);
  });

  it("publishes the current methodology release and corrected labels without changing score ranges", () => {
    const manifest = getPublicMethodologyManifest();

    expect(manifest.version).toBe("2026.07.29-r223");
    expect(manifest.releaseDate).toBe("2026-07-29");
    expect(manifest.scoreScale.map(({ level, label }) => [level, label])).toEqual(canonicalRows);
    expect(manifest.scoreScale.map(({ numericRange }) => numericRange)).toEqual([
      [0, 0.99],
      [1, 1.99],
      [2, 2.99],
      [3, 3.99],
      [4, 4.74],
      [4.75, 5],
    ]);
    expect(manifest.changelog[0]).toMatchObject({ version: "2026.07.29-r223", date: "2026-07-29" });
    expect(manifest.changelog[0]?.summary).toContain("public badge methodology assurance hash");
    expect(manifest.changelog[0]?.migration).toContain("2026.07.10-r222");
    expect(manifest.changelog[1]).toMatchObject({ version: "2026.07.10-r222", date: "2026-07-10" });
    expect(manifest.changelog[1]?.summary).toContain("canonical L0-L5 maturity taxonomy");
    expect(manifest.changelog[1]?.migration).toContain("Numerical scores, thresholds, and historical hashes are unchanged");
    expect(manifest.migrationGuidance[0]).toContain("2026.07.10-r222");
    expect(manifest.migrationGuidance[0]).toContain("amc_methodology_assurance");
  });

  it("verifies current manifests for both supported built-in question sets", () => {
    const lifecycle = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION });
    const manifests = [
      getPublicMethodologyManifest(),
      getPublicMethodologyManifest(lifecycle.info),
    ];

    for (const manifest of manifests) {
      expect(verifyPublicMethodologyReference(manifest)).toEqual({
        ok: true,
        status: "current",
        reason: null,
      });
    }
  });

  it("verifies default and lifecycle manifests from historical r222 and r221", () => {
    const historicalReferences = [
      {
        version: "2026.07.10-r222",
        hash: "9c8f098a6f91b09db9350f034a06daa51580ea223ed4decab34556c964fa030e",
      },
      {
        version: "2026.07.10-r222",
        hash: "f6760ef9fc525003e8f6cf1bc306fd7c462cf22b2bc01a19dd5aaf9d9a35664b",
      },
      {
        version: "2026.07.10-r221",
        hash: "7eb7fd5bd9e0fc9952fca8dc935647988e6a2d6c5fdf786cd70160a0290fba8f",
      },
      {
        version: "2026.07.10-r221",
        hash: "9e7b02210379835ecfe1d5d5a06018c78c944197c12f3bac6ffa725c44c13c0d",
      },
    ];

    for (const reference of historicalReferences) {
      expect(verifyPublicMethodologyReference({
        id: AMC_PUBLIC_METHODOLOGY_ID,
        ...reference,
      })).toEqual({
        ok: true,
        status: "historical",
        reason: null,
      });
    }
  });

  it("fails closed for tampered, unknown-version, and custom-question-set hashes", () => {
    const current = getPublicMethodologyManifest();
    const lifecycle = getQuestionSet({ version: LIFECYCLE_QUESTION_SET_VERSION });
    const custom = getPublicMethodologyManifest({
      ...lifecycle.info,
      version: "amc-custom-review-v1",
      title: "Custom review question set",
      includedVersions: ["amc-custom-review-v1"],
      default: false,
    });

    expect(verifyPublicMethodologyReference({ ...current, hash: "0".repeat(64) })).toEqual({
      ok: false,
      status: "current",
      reason: "methodology hash mismatch",
    });
    expect(verifyPublicMethodologyReference({
      id: AMC_PUBLIC_METHODOLOGY_ID,
      version: "2026.07.10-r222",
      hash: "0".repeat(64),
    })).toEqual({
      ok: false,
      status: "historical",
      reason: "methodology hash mismatch",
    });
    expect(verifyPublicMethodologyReference(custom)).toEqual({
      ok: false,
      status: "current",
      reason: "methodology hash mismatch",
    });
    expect(verifyPublicMethodologyReference({
      id: AMC_PUBLIC_METHODOLOGY_ID,
      version: "2026.07.10-r999",
      hash: current.hash,
    })).toEqual({
      ok: false,
      status: "unknown",
      reason: "unknown methodology version",
    });
    expect(verifyPublicMethodologyReference({
      id: "unknown-methodology",
      version: current.version,
      hash: current.hash,
    })).toEqual({
      ok: false,
      status: "unknown",
      reason: "methodology id mismatch",
    });
  });

  it("uses the same labels in generated badges, guides, and scanners", async () => {
    expect(generateBadge({ level: 0 })).toContain("L0 Absent");
    expect(formatBadgeOutput({ level: 5 })).toContain("L5 Optimizing");
    expect(() => generateBadge({ level: 6 })).toThrow(/maturity ordinal/i);
    expect(generateGuide({ overall: 0, questionScores: [], targetLevel: 4 }).summary).toContain("L4 — Managed");

    const workspace = mkdtempSync(join(tmpdir(), "amc-taxonomy-"));
    try {
      expect(scanLocal(workspace).preliminaryScore).toMatchObject({ level: 0, label: "L0 — Absent" });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unreachable"); }));
    const unreachable = await probeEndpoint("https://unreachable.example");
    expect(unreachable.preliminaryScore).toMatchObject({ level: 0, label: "L0 — Absent", confidence: 0 });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const endpoint = await probeEndpoint("https://agent.example");
    expect(endpoint.preliminaryScore).toMatchObject({ level: 2, label: "L2 — Developing" });
  });

  it("routes aggregate runtime labels through the shared contract", () => {
    const runtimeFiles = [
      "src/agents/harnessRunner.ts",
      "src/badge/badgeCli.ts",
      "src/cli.ts",
      "src/guide/frameworkGuide.ts",
      "src/guide/guideGenerator.ts",
      "src/methodology/publicMethodology.ts",
      "src/scanner/endpointProbe.ts",
      "src/scanner/localScanner.ts",
      "src/transparency/transparencyReport.ts",
    ];

    for (const path of runtimeFiles) {
      expect(read(path), `${path} should import the canonical taxonomy`).toContain("maturityTaxonomy.js");
    }

    const runtimeText = runtimeFiles.map(read).join("\n");
    expect(runtimeText).not.toMatch(/L0[ =—]+(?:Initial|Undocumented|Running with Scissors)/);
    expect(runtimeText).not.toMatch(/L1[ =—]+(?:Aware|Awareness|Ad Hoc|Documented|Minimal|Basic)/);
    expect(runtimeText).not.toMatch(/L2[ =—]+(?:Managed|Defined|Emerging|Automated|Repeatable|Structured)/);
    expect(runtimeText).not.toMatch(/L3[ =—]+(?:Operational|Evidence-backed|Moderate|Governed)/);
    expect(runtimeText).not.toMatch(/L4[ =—]+(?:Measured|Proactive|Optimized|High Trust|Auditable)/);
    expect(runtimeText).not.toMatch(/L5[ =—]+(?:Optimized|Certifiable|Self-Governing|Trustworthy|Autonomous)/);
  });

  it("keeps current README, Docs, website, and whitepaper surfaces on the same names", () => {
    const publicFiles = [
      "README.md",
      "AMC_COMPLETE_KNOWLEDGE.md",
      "docs/AFTER_FIRST_SCORE.md",
      "docs/AMC_STANDARD_RFC.md",
      "docs/GETTING_STARTED.md",
      "docs/OPEN_RUBRIC_STANDARD.md",
      "docs/SCORING_METHODOLOGY.md",
      "docs/adr/002-five-dimension-maturity-model.md",
      "website/docs/methodology.html",
      "website/lite.html",
      "website/methodology.html",
      "whitepaper/AMC_WHITEPAPER_v1.md",
    ];

    for (const path of publicFiles) {
      const lines = read(path).split("\n");
      for (const [level, label] of canonicalRows) {
        expect(
          lines.some((line) => line.includes(level) && line.includes(label)),
          `${path} should publish ${level} ${label} in one taxonomy row`,
        ).toBe(true);
      }
    }

    for (const path of [
      "docs/SCORING_METHODOLOGY.md",
      "website/docs/methodology.html",
      "website/methodology.html",
    ]) {
      expect(read(path), `${path} should publish the current methodology version`).toContain("2026.07.29-r223");
      expect(read(path), `${path} should publish the current methodology release date`).toContain("2026-07-29");
    }

    const methodologyDoc = read("docs/SCORING_METHODOLOGY.md");
    expect(methodologyDoc).toContain("supported built-in question sets");
    expect(methodologyDoc).toContain("`amc-legacy-240-v1`");
    expect(methodologyDoc).toContain("`amc-lifecycle-2026-v1`");
    expect(methodologyDoc).toContain("Custom question-set hashes fail closed");
  });

  it("publishes exact aggregate score bands in the public rubric", () => {
    const rubric = read("docs/OPEN_RUBRIC_STANDARD.md");
    const ranges = getPublicMethodologyManifest().scoreScale.map(({ level, numericRange, label }) =>
      `| **${level}** | **${label}** | ${numericRange[0]}-${numericRange[1]} |`,
    );

    for (const row of ranges) expect(rubric).toContain(row);
    expect(rubric).not.toContain("0–0.9 = Ad-hoc");
    expect(rubric).not.toContain("4.0–4.9 = Managed");
    expect(rubric).not.toContain("5.0 = Optimizing");
  });

  it("uses canonical AMC labels in the public CMMI crosswalk without rewriting CMMI", () => {
    const mapping = read("docs/STANDARDS_MAPPING.md");
    for (const [level, label] of canonicalRows.slice(1)) {
      expect(mapping).toContain(`${level} (${label})`);
    }
    expect(mapping).toContain("**Level 4 — Quantitatively Managed**");
    expect(mapping).toContain("**Level 5 — Optimizing**");
    expect(mapping).not.toContain("L1 (Ad Hoc)");
    expect(mapping).not.toContain("L4 (Optimized)");
    expect(mapping).not.toContain("L5 (Autonomous)");
  });

  it("keeps validity and demo guidance on current labels and domain", () => {
    const validity = read("docs/VALIDITY_FRAMEWORK.md");
    const demo = read("docs/content/demo-video-script-quickstart.md");
    const lite = read("website/lite.html");

    expect(validity).toContain('L4 = "Managed with known gaps"');
    expect(validity).not.toContain('L4 = "Optimized with known gaps"');
    expect(demo).toContain("AMC-L3_Defined");
    expect(demo).toContain("agentmaturity.co");
    expect(demo).not.toContain("AMC-L3_Governed");
    expect(demo).not.toContain("agentmaturitycompass.com");
    expect(lite).toContain("L0 (Absent) to L5 (Optimizing)");
    expect(lite).not.toContain("L0 (dangerous) to L5 (trustworthy)");
  });
});
