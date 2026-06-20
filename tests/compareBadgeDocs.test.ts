import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-compare-badge-"));
  roots.push(root);
  return root;
}

function writeRun(root: string, runId: string, integrityIndex: number): void {
  const runsDir = join(root, ".amc", "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify({
    agentId: "default",
    runId,
    ts: Date.parse("2026-06-16T00:00:00Z"),
    windowStartTs: Date.parse("2026-06-15T00:00:00Z"),
    windowEndTs: Date.parse("2026-06-16T00:00:00Z"),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex,
    trustLabel: integrityIndex >= 0.72 ? "HIGH TRUST" : "MEDIUM TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Governance", avgFinalLevel: integrityIndex * 5, confidenceWeightedFinalLevel: integrityIndex * 5 },
      { layerName: "Security", avgFinalLevel: integrityIndex * 4.5, confidenceWeightedFinalLevel: integrityIndex * 4.5 }
    ],
    questionScores: [
      { questionId: "AMC-1.1", finalLevel: integrityIndex * 5 },
      { questionId: "AMC-2.1", finalLevel: integrityIndex * 4.5 }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: integrityIndex,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 }
  }), "utf8");
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("compare badge DevRel docs", () => {
  test("documents compare badge generation in public onboarding docs", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("README.md")).toContain("amc compare <run-a> <run-b> --output compare.json --badge");
    expect(read("README.md")).toContain("model-compare-badge.svg");
    expect(read("docs/GETTING_STARTED.md")).toContain("Compare scored runs and write a comparison SVG badge");
    expect(read("docs/QUICKSTART.md")).toContain("Compare scored runs with badge output");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("compare-badge docs/runtime behavior are resolved");
  });

  test("compare --badge writes an SVG for two-run comparisons", () => {
    const root = tempRoot();
    const runA = "11111111-1111-1111-1111-111111111111";
    const runB = "22222222-2222-2222-2222-222222222222";
    writeRun(root, runA, 0.54);
    writeRun(root, runB, 0.82);

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "compare",
      runA,
      runB,
      "--output",
      "compare.json",
      "--badge"
    ], {
      cwd: root,
      encoding: "utf8"
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(existsSync(join(root, "compare.json"))).toBe(true);
    expect(existsSync(join(root, "compare-badge.svg"))).toBe(true);
    expect(readFileSync(join(root, "compare-badge.svg"), "utf8")).toContain("AMC: L4 (82.0)");
  });
});
