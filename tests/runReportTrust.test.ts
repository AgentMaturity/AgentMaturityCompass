import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { generateReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { latestRunId, latestRunSummary, resolveRunReport } from "../src/diagnostic/runReportResolution.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { lockVault } from "../src/vault/vault.js";

describe("run reports read back for display", () => {
  let workspace: string;
  let previousPass: string | undefined;

  beforeEach(() => {
    previousPass = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-run-report-trust";
    workspace = mkdtempSync(join(tmpdir(), "amc-run-report-trust-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (previousPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPass;
  });

  // CLI-04: a hand-edited run printed "Artifact Status: VALID" and "Artifact Verification: PASSED".
  test("a run edited by hand reads INVALID and never PASSED", async () => {
    const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    const intact = resolveRunReport(workspace, run.runId);
    expect(intact.sealVerified).toBe(true);
    expect(intact.report.status).toBe("VALID");

    const file = join(getAgentPaths(workspace, "default").runsDir, `${run.runId}.json`);
    const edited = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...edited, integrityIndex: 0.99 }));

    const tampered = resolveRunReport(workspace, run.runId);
    expect(tampered.sealVerified).toBe(false);
    expect(tampered.report.status).toBe("INVALID");
    expect(tampered.report.verificationPassed).toBe(false);
    const markdown = generateReport(tampered.report, "md") as string;
    expect(markdown).not.toContain("Artifact Verification: PASSED");
    expect(markdown).not.toContain("Artifact Status: **VALID**");
  }, 120_000);

  // CLI-05: "Latest run" sorted run files by their UUID names, so it named a random run.
  test("the latest run is the one with the newest recorded time, whatever its file name", () => {
    const runsDir = getAgentPaths(workspace, "default").runsDir;
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "ffffffff-old.json"), JSON.stringify({ runId: "ffffffff-old", ts: 1_000, integrityIndex: 0, trustLabel: "LOW" }));
    writeFileSync(join(runsDir, "00000000-new.json"), JSON.stringify({ runId: "00000000-new", ts: 2_000, integrityIndex: 0, trustLabel: "LOW" }));
    expect(latestRunId(workspace, "default")).toBe("00000000-new");
    expect(latestRunSummary(workspace, "default")?.runId).toBe("00000000-new");
  });
});
