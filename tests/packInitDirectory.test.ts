import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-init-dir-"));
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

describe("pack init target directory", () => {
  test("defaults --name scaffolding into a named subdirectory", () => {
    const root = tempRoot();

    const result = runCli(root, ["pack", "init", "--name", "my-test-pack", "--description", "Directory regression"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Initialized assurance pack at");
    expect(result.stdout).toContain("my-test-pack");
    expect(existsSync(join(root, "package.json"))).toBe(false);
    expect(existsSync(join(root, "my-test-pack", "package.json"))).toBe(true);
    expect(existsSync(join(root, "my-test-pack", "index.mjs"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(root, "my-test-pack", "package.json"), "utf8")) as { name: string };
    expect(manifest.name).toBe("my-test-pack");
  });

  test("supports explicit --dir target without changing pack name", () => {
    const root = tempRoot();

    const result = runCli(root, ["pack", "init", "--name", "named-pack", "--dir", "custom-dir"]);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(existsSync(join(root, "named-pack"))).toBe(false);
    expect(existsSync(join(root, "custom-dir", "package.json"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(root, "custom-dir", "package.json"), "utf8")) as { name: string };
    expect(manifest.name).toBe("named-pack");
  });

  test("requires --name or --dir in non-interactive shells", () => {
    const root = tempRoot();

    const result = runCli(root, ["pack", "init"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Pack name required");
    expect(result.stderr).toContain("amc pack init --name my-pack");
    expect(existsSync(join(root, "package.json"))).toBe(false);
  });

  test("keeps the UX audit aligned with current pack init directory behavior", () => {
    const audit = readFileSync(resolve(process.cwd(), "docs/UX_AUDIT_REPORT.md"), "utf8");

    expect(audit).toContain("R7 — pack init creates a named subdirectory by default");
    expect(audit).toContain("`amc pack init --name mypack` creates `./mypack/`");
    expect(audit).toContain("`amc pack init --name mypack --dir ./packs/mypack`");
    expect(audit).not.toContain("creates `index.mjs`, `package.json`, `src/`, `test/` in the current directory");
  });
});
