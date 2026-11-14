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

    // Security review: an edit to status UNSIGNED must not buy back "verified" or a passing verification label.
    writeFileSync(file, JSON.stringify({ ...edited, status: "UNSIGNED", verificationPassed: true }));
    const relabelled = resolveRunReport(workspace, run.runId);
    expect(relabelled.sealVerified).toBe(false);
    expect(relabelled.report.verificationPassed).toBe(false);
    expect(generateReport(relabelled.report, "md") as string).not.toContain("PASSED");
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

// CLI-04, security review: an edited current-format run that claims an AMC 1.x version must still fail through amc report.
describe("amc report on an edited run that claims AMC 1.x", () => {
  test("exits non-zero and prints no PASSED or VALID", async () => {
    const { spawnSync } = await import("node:child_process");
    const { resolve } = await import("node:path");
    const passphrase = "synthetic-run-report-legacy-claim";
    const root = mkdtempSync(join(tmpdir(), "amc-run-report-legacy-claim-"));
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = passphrase;
    try {
      initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
      const run = await runDiagnostic({ workspace: root, window: "14d", targetName: "default", claimMode: "auto" });
      const file = join(getAgentPaths(root, "default").runsDir, `${run.runId}.json`);
      const edited = JSON.parse(readFileSync(file, "utf8")) as { methodology?: Record<string, unknown> };
      writeFileSync(file, JSON.stringify({ ...edited, integrityIndex: 0.99, methodology: { ...(edited.methodology ?? {}), amcVersion: "1.1.1" } }));
      const out = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("src/cli.ts"), "report", run.runId],
        { cwd: root, env: { ...process.env, NO_COLOR: "1", HOME: root, AMC_VAULT_PASSPHRASE: passphrase }, encoding: "utf8", timeout: 120_000 });
      expect(out.status, out.stderr).not.toBe(0);
      expect(out.stdout).not.toMatch(/Artifact Verification: PASSED|Artifact Status: \*\*VALID\*\*/);
    } finally {
      lockVault(root);
      rmSync(root, { recursive: true, force: true });
      if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
    }
  }, 180_000);
});
