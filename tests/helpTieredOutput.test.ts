import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

function runCli(args: string[]) {
  return spawnSync(process.execPath, [resolve(process.cwd(), "dist/cli.js"), ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: "1"
    },
    encoding: "utf8"
  });
}

function lineCount(output: string): number {
  return output.trimEnd().split(/\r?\n/).length;
}

describe("tiered top-level help", () => {
  test("shows compact grouped help by default", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(lineCount(result.stdout)).toBeLessThan(140);
    expect(result.stdout).toContain("High-signal commands:");
    expect(result.stdout).toContain("amc --help --all");
    expect(result.stdout).not.toContain("compliance|comply");
  });

  test("keeps the full command list behind --help --all", () => {
    const result = runCli(["--help", "--all"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(lineCount(result.stdout)).toBeGreaterThan(300);
    expect(result.stdout).toContain("Commands:");
    expect(result.stdout).toContain("compliance|comply");
  });

  test("keeps the UX audit aligned with tiered help output", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R11 — top-level help is compact and full help moves behind --help --all");
    expect(audit).toContain("amc --help --all");
    expect(audit).not.toContain("`--help` output grew from 357 to 409 lines");
  });
});
