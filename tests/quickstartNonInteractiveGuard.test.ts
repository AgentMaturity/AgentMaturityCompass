import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-quickstart-guard-"));
  roots.push(dir);
  return dir;
}

function runCli(cwd: string, args: string[]) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.AMC_VAULT_PASSPHRASE;
  delete env.AMC_VAULT_PASSPHRASE_FILE;
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

describe("quickstart non-interactive guard", () => {
  test("does not generate placeholder L0 results in non-interactive shells", () => {
    const dir = workspace();

    const result = runCli(dir, ["quickstart"]);

    expect(result.status).toBe(1);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("Interactive quickstart requires a terminal");
    expect(output).toContain("No placeholder L0 score was generated");
    expect(output).toContain("amc quickstart --startup-plan --answers-out amc-startup-answers.json");
    expect(output).toContain("amc quickscore --answers amc-startup-answers.json --json");
    expect(output).not.toContain("Step 3: Your Results");
    expect(output).not.toContain("Overall: 0/50");
  });

  test("keeps CI-safe quickstart modes available", () => {
    const dir = workspace();

    const startupPlan = runCli(dir, ["quickstart", "--startup-plan"]);
    expect(startupPlan.status, `${startupPlan.stdout}\n${startupPlan.stderr}`).toBe(0);
    expect(startupPlan.stdout).toContain("# AMC Startup Plan");

    const minimal = runCli(dir, ["quickstart", "--minimal"]);
    expect(minimal.status, `${minimal.stdout}\n${minimal.stderr}`).toBe(0);
    expect(minimal.stdout).toContain("Startup path: creating a minimal workspace");
  });

  test("keeps the UX audit aligned with the current quickstart guard", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R16 — non-interactive quickstart fails closed instead of producing placeholder L0 results");
    expect(audit).not.toContain("Non-interactive quickstart still useless");
  });
});
