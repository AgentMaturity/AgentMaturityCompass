import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, test } from "vitest";

// Start-up floors for the `amc` bin (dist/amc.js). Measured 2026-11-17 on a 12-core Mac under load 4 to 10, medians of
// 10: `--version` 59 ms (dist/cli.js: 916 ms), `--help` 654 ms warm (921 ms). The limits below leave room for a
// loaded CI machine; the module count is exact and does not depend on the machine.
const amc = resolve(process.cwd(), "dist/amc.js");
const scratch = mkdtempSync(join(tmpdir(), "amc-startup-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: scratch, LANG: "en_US.UTF-8" };

function run(args: string[], nodeArgs: string[] = []): { ms: number; stdout: string; stderr: string; status: number | null } {
  const started = performance.now();
  const result = spawnSync(process.execPath, [...nodeArgs, amc, ...args], { cwd: scratch, env, encoding: "utf8", timeout: 60_000 });
  return { ms: performance.now() - started, stdout: result.stdout, stderr: result.stderr, status: result.status };
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

describe("performance: CLI start-up", () => {
  test("--version prints the version without loading the program", () => {
    expect(existsSync(amc), "build first: npm run build").toBe(true);
    // Every file module the process loads is listed on stderr by a load hook.
    const hook = `data:text/javascript,${encodeURIComponent(`import { registerHooks } from "node:module";
registerHooks({ load(url, context, next) { if (url.startsWith("file:")) process.stderr.write("LOADED " + url + "\\n"); return next(url, context); } });`)}`;
    const traced = run(["--version"], ["--import", hook]);
    expect(traced.status).toBe(0);
    const loaded = traced.stderr.split("\n").filter((line) => line.startsWith("LOADED "));
    expect(loaded.some((line) => line.endsWith("/dist/cli.js"))).toBe(false);
    // 18 today: the entry, the database engine guard with better-sqlite3, and version.js (the program is about 2,500).
    expect(loaded.length).toBeLessThan(40);

    run(["--version"]);
    const timings = Array.from({ length: 5 }, () => run(["--version"]).ms);
    expect(median(timings)).toBeLessThan(1_000);
  }, 120_000);

  test("--help through the bin stays within its floor", () => {
    run(["--help"]); // the first run fills the compile cache
    const timings = Array.from({ length: 3 }, () => {
      const result = run(["--help"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: amc");
      return result.ms;
    });
    expect(median(timings)).toBeLessThan(6_000);
  }, 120_000);
});
