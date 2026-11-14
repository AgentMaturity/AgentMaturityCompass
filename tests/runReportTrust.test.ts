import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { generateReport, runDiagnostic } from "../src/diagnostic/runner.js";
import { resolveRunReport } from "../src/diagnostic/runReportResolution.js";
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
});
