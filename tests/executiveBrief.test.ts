import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-executive-brief-"));
  roots.push(root);
  return root;
}

function writeRun(root: string, runId: string): void {
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
    integrityIndex: 0.76,
    trustLabel: "HIGH TRUST",
    targetProfileId: "default",
    layerScores: [
      { layerName: "Governance", avgFinalLevel: 3.2, confidenceWeightedFinalLevel: 3.2 },
      { layerName: "Security", avgFinalLevel: 2.4, confidenceWeightedFinalLevel: 2.4 },
      { layerName: "Reliability", avgFinalLevel: 4.1, confidenceWeightedFinalLevel: 4.1 }
    ],
    questionScores: [
      { questionId: "AMC-1.1", finalLevel: 3 },
      { questionId: "AMC-2.1", finalLevel: 2 },
      { questionId: "AMC-3.1", finalLevel: 4 }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.76,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 }
  }), "utf8");
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("executive brief artifact", () => {
  test("built CLI writes a print-ready board one-pager without vault signing", () => {
    const root = tempRoot();
    writeRun(root, "33333333-3333-3333-3333-333333333333");

    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "executive",
      "brief",
      "--run",
      "latest",
      "--out",
      "board-brief.html"
    ], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, AMC_VAULT_PASSPHRASE: "" }
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("Executive brief saved");
    expect(result.stdout).toContain("Print to PDF");
    expect(existsSync(join(root, "board-brief.html"))).toBe(true);

    const html = readFileSync(join(root, "board-brief.html"), "utf8");
    expect(html).toContain("Board AI Risk Brief");
    expect(html).toContain("Recommended Board Decision");
    expect(html).toContain("Top Maturity Gaps");
    expect(html).toContain("@media print");
    expect(html).toContain("Print-ready HTML");
  });

  test("public docs expose the board brief path and audit marks the gap resolved", () => {
    const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

    expect(read("README.md")).toContain("amc executive brief --run latest --out board-brief.html");
    expect(read("docs/GETTING_STARTED.md")).toContain("Generate a board-ready one-page HTML brief");
    expect(read("docs/QUICKSTART.md")).toContain("Create a board one-pager");
    expect(read("docs/EXECUTIVE_OVERVIEW.md")).toContain("Board one-pager: amc executive brief");
    expect(read("docs/AUDIT_50_AGENTS_BATCH5.md")).toContain("PDF/exportable board one-pager — ✅ Resolved");
  });
});
