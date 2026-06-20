import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-test-path-"));
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

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("pack test path UX", () => {
  test("auto-detects a single child pack from a parent directory", () => {
    const root = tempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "parent-project", version: "1.0.0" }), "utf8");

    const init = runCli(root, ["pack", "init", "--name", "child-pack"]);
    expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
    expect(existsSync(join(root, "child-pack", "package.json"))).toBe(true);

    const testRun = runCli(root, ["pack", "test"]);
    expect(testRun.status, `${testRun.stdout}\n${testRun.stderr}`).toBe(0);
    expect(testRun.stdout).toContain("Auto-detected pack directory:");
    expect(testRun.stdout).toContain("child-pack");
    expect(testRun.stdout).toContain("Pack test passed");
  });

  test("does not treat an ordinary package.json as an AMC pack", () => {
    const root = tempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ordinary-app", version: "1.0.0" }), "utf8");

    const result = runCli(root, ["pack", "test"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No AMC pack found");
    expect(result.stderr).toContain("amc pack test <dir>");
    expect(result.stderr).not.toContain("Pack must export an execute(context) function");
  });

  test("documents the directory argument in help and the UX audit", () => {
    const root = tempRoot();
    const help = runCli(root, ["pack", "test", "--help"]);
    expect(help.status, `${help.stdout}\n${help.stderr}`).toBe(0);
    expect(help.stdout).toContain("Test a local pack directory");
    expect(help.stdout).toContain("auto-detects one child pack");

    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");
    expect(audit).toContain("R8 — pack test accepts a path or auto-detects one child pack");
    expect(audit).toContain("`amc pack test ./mypack`");
    expect(audit).not.toContain("must be run from inside the pack directory");
  });
});
