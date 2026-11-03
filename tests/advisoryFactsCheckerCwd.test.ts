import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const script = resolve(__dirname, "../qualification/2026-10-29-P0-36/check-advisory-facts.mjs");
const run = (cwd: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
};

describe("P0-36 check-advisory-facts.mjs", () => {
  // Pathspecs resolve from the repository root, so a shallow clone fails the same checks from either directory.
  test("reports the same result from its own directory as from the repository root", () => {
    const fromRoot = run(resolve(__dirname, ".."));
    expect(fromRoot.stdout).toMatch(/^advisory facts: \d+\/\d+ hold at /);
    expect(run(dirname(script))).toEqual(fromRoot);
    expect(run(join(__dirname, "a4"))).toEqual(fromRoot);
  }, 60_000);

  // A package without an anchor file, or with the pin in another dist file, must not pass the "no monitor pin" check.
  test("--published fails closed on a missing anchor file and finds a monitor pin in any dist file", () => {
    const pkg = mkdtempSync(join(tmpdir(), "amc-advisory-pkg-"));
    try {
      mkdirSync(join(pkg, "dist", "ledger"), { recursive: true });
      writeFileSync(join(pkg, "package.json"), JSON.stringify({ version: "1.1.1" }));
      writeFileSync(join(pkg, "dist", "cli.js"), "export {};\n");
      writeFileSync(join(pkg, "dist", "ledger", "monitorPin.js"), "export const EXPECTED_MONITOR = 'x';\n");
      const r = run(pkg, "--published", pkg);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("FAIL published dist/ledger/ledger.js missing or empty");
      expect(r.stderr).toContain("FAIL published dist/ledger/monitorPin.js pins a monitor key");
    } finally {
      rmSync(pkg, { recursive: true, force: true });
    }
  }, 60_000);
});
