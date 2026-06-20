import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-industry-score-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8"
  });
}

function writeLatestRun(workspace: string, agentId: string, runId: string, integrityIndex: number): void {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, `${runId}.json`),
    JSON.stringify({
      runId,
      integrityIndex,
      trustLabel: "EVIDENCE_BACKED"
    }, null, 2),
    "utf8"
  );
}

function writeTimestampedRun(workspace: string, agentId: string, runId: string, integrityIndex: number, ts: number): void {
  const runsDir = join(workspace, ".amc", "agents", agentId, "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    join(runsDir, `${runId}.json`),
    JSON.stringify({
      runId,
      ts,
      integrityIndex,
      trustLabel: "EVIDENCE_BACKED",
      evidenceTrustCoverage: {
        observed: 0.82,
        attested: 0.1,
        selfReported: 0.08
      }
    }, null, 2),
    "utf8"
  );
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("score industry-adjust current score fallback", () => {
  test("uses the latest run integrity score when --score is omitted", () => {
    const workspace = tempWorkspace();
    writeLatestRun(workspace, "default", "run-001", 0.72);

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Using current agent score: 72.0% (latest run run-001 for default)");
    expect(result.stdout).toContain("Industry-Adjusted Score");
    expect(result.stdout).toContain("Industry: Healthcare & Life Sciences");
  });

  test("still accepts explicit manual score input", () => {
    const workspace = tempWorkspace();

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare", "--score", "75"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Raw score:");
    expect(result.stdout).not.toContain("No --score provided");
  });

  test("explains how adjusted score differs from raw score", () => {
    const workspace = tempWorkspace();

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare", "--score", "66"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Why adjusted score differs from raw:");
    expect(result.stdout).toContain("No score delta: the same raw score was applied to every healthcare dimension");
    expect(result.stdout).toContain("Decay: 0 points");
    expect(result.stdout).toContain("Observed evidence expectation:");
  });

  test("shows per-dimension weighting drilldown on request", () => {
    const workspace = tempWorkspace();

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare", "--score", "66", "--drilldown"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Per-dimension drilldown:");
    expect(result.stdout).toContain("Dimension");
    expect(result.stdout).toContain("Raw");
    expect(result.stdout).toContain("Weight");
    expect(result.stdout).toContain("Weighted");
    expect(result.stdout).toContain("Observed evidence");
    expect(result.stdout).toContain("safety");
    expect(result.stdout).toContain("required");
  });

  test("includes per-dimension drilldown in JSON on request", () => {
    const workspace = tempWorkspace();

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare", "--score", "66", "--drilldown", "--json"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      dimensionDrilldown?: Array<{ dimension: string; raw: number; weight: number; weighted: number; evidenceExpectation: string }>;
    };
    expect(parsed.dimensionDrilldown).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dimension: "safety",
        raw: 66,
        weight: 2,
        weighted: 132,
        evidenceExpectation: "required"
      })
    ]));
  });

  test("exports an industry-adjusted comparison report across scored runs", () => {
    const workspace = tempWorkspace();
    const now = Date.now();
    writeTimestampedRun(workspace, "default", "run-001", 0.58, now - 60_000);
    writeTimestampedRun(workspace, "default", "run-002", 0.74, now);
    const out = join(workspace, "healthcare-industry-report.md");

    const result = runCli(workspace, [
      "score",
      "industry-adjust",
      "--industry",
      "healthcare",
      "--history",
      "--out",
      out
    ]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Industry-adjust comparison report");
    expect(result.stdout).toContain("Runs compared: 2");
    expect(result.stdout).toContain(`Report written: ${out}`);
    const report = readFileSync(out, "utf8");
    expect(report).toContain("# Industry-Adjusted Comparison Report");
    expect(report).toContain("Industry: Healthcare & Life Sciences (healthcare)");
    expect(report).toContain("| run-001 |");
    expect(report).toContain("| run-002 |");
    expect(report).toContain("Delta from previous");
    expect(report).toContain("Evidence mix");
  });

  test("includes run comparison rows in JSON history output", () => {
    const workspace = tempWorkspace();
    const now = Date.now();
    writeTimestampedRun(workspace, "default", "run-001", 0.58, now - 60_000);
    writeTimestampedRun(workspace, "default", "run-002", 0.74, now);

    const result = runCli(workspace, ["score", "industry-adjust", "--industry", "healthcare", "--history", "--json"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      runComparisons?: Array<{ runId: string; rawScore: number; adjustedScore: number; deltaFromPrevious: number | null }>;
    };
    expect(parsed.runComparisons).toHaveLength(2);
    expect(parsed.runComparisons?.[0]).toEqual(expect.objectContaining({ runId: "run-001", rawScore: 58 }));
    expect(parsed.runComparisons?.[1]).toEqual(expect.objectContaining({ runId: "run-002", rawScore: 74 }));
    expect(parsed.runComparisons?.[1]?.deltaFromPrevious).not.toBeNull();
  });

  test("keeps the UX audit aligned with current score auto-read behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R9 — industry-adjust auto-reads the latest agent score");
    expect(audit).toContain("`amc score industry-adjust --industry healthcare` reuses the latest scored run");
    expect(audit).toContain("R13 — industry-adjust explains adjusted-vs-raw score differences");
    expect(audit).toContain("R20 — industry-adjust per-dimension drilldown is available");
    expect(audit).toContain("R31 — industry-adjust exports comparison reports across scored runs");
    expect(audit).toContain("| 6 | Tom | Data Scientist | ⭐⭐⭐ 3/5 | ⭐⭐⭐⭐⭐ 5/5 | +2 | Industry-adjust now auto-reads current score, explains weighting, drills into dimensions, and exports run comparison reports |");
    expect(audit).toMatch(/\*\*New average: (?:4\.[6-9]|5\.0)\/5\*\*/);
    expect(audit).not.toContain("adjusted-vs-raw explanation still thin");
    expect(audit).not.toContain("still requires manual `--score` input");
    expect(audit).not.toContain("Add optional per-dimension drilldown for industry weighting");
    expect(audit).not.toContain("Tom (⭐⭐⭐⭐) | Add saved/exportable industry adjustment comparison reports across scored runs");
  });
});
