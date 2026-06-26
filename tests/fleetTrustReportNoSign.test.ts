import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-fleet-trust-nosign-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  const env = { ...process.env };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
  delete env.AMC_NO_SIGN;
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd,
    env,
    encoding: "utf8"
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("fleet trust-report --no-sign", () => {
  test("generates an unsigned trust report when the vault is unavailable", () => {
    const dir = workspace();

    expect(runCli(dir, ["fleet", "trust-init"]).status).toBe(0);
    expect(
      runCli(dir, [
        "fleet",
        "trust-add-edge",
        "--from",
        "agent-a",
        "--to",
        "agent-b",
        "--purpose",
        "task-delegation"
      ]).status
    ).toBe(0);

    const result = runCli(dir, ["fleet", "trust-report", "--no-sign", "--output", "trust-report.md"]);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Running without artifact signing");
    expect(result.stdout).toContain("diagnostic prerequisites unavailable; using unsigned empty-evidence trust snapshot");
    expect(result.stdout).toContain("Trust composition report (JSON):");
    expect(result.stdout).not.toContain("AMC_VAULT_PASSPHRASE environment variable is required");

    const markdown = readFileSync(join(dir, "trust-report.md"), "utf8");
    expect(markdown).toContain("# Trust Composition Report");
    expect(markdown).toContain("Fleet Composite Score");

    const jsonPath = result.stdout.match(/Trust composition report \(JSON\): (.+)/)?.[1]?.trim();
    expect(jsonPath).toBeTruthy();
    const report = JSON.parse(readFileSync(jsonPath!, "utf8")) as { reportSealSig: string; agentResults: unknown[] };
    expect(report.reportSealSig).toBe("unsigned");
    expect(report.agentResults.length).toBeGreaterThan(0);
  });

  test("keeps the UX audit aligned with the unsigned trust report behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("`trust-report --no-sign` generates an unsigned local trust composition report");
    expect(audit).toContain("Signed report boundary remains");
    expect(audit).not.toContain("trust-report still vault-blocked");
    expect(audit).not.toContain("BROKEN: all trust commands crash");
    expect(audit).not.toContain("entire trust subsystem unusable");
  });
});
