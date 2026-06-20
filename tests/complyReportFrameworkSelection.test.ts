import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
}

describe("comply report framework selection", () => {
  test("non-interactive no-args output lists frameworks instead of failing with a raw option error", () => {
    const result = runCli(["comply", "report"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Available compliance frameworks");
    expect(result.stdout).toContain("EU_AI_ACT");
    expect(result.stdout).toContain("SOC2");
    expect(result.stdout).toContain("Usage: amc comply report --framework EU_AI_ACT");
    expect(result.stdout).not.toContain("required option '--framework <framework>' not specified");
    expect(result.stderr).toBe("");
  });

  test("interactive terminals get a framework picker before report generation", () => {
    const cli = readProjectFile("src/cli.ts");

    expect(cli).toContain('message: "Select compliance framework:"');
    expect(cli).toContain("complianceFrameworkFamilies.map");
    expect(cli).toContain("value: row.framework");
  });

  test("keeps the UX audit aligned with current comply report behavior", () => {
    const audit = readProjectFile("docs/UX_AUDIT_REPORT.md");

    expect(audit).toContain("R3 — comply report selects or lists frameworks");
    expect(audit).toContain("Interactive terminals show a framework picker");
    expect(audit).toContain("Non-interactive shells list every supported framework");
    expect(audit).not.toContain("still requires `--framework` flag with no interactive prompt");
    expect(audit).not.toContain("returns the same terse error as before");
  });
});
