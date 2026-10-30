import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// scripts/mutation-batch.mjs (P0-30) against a throwaway git repository whose
// node_modules links to this checkout's, so its vitest runs for real.
const SCRIPT = resolve(import.meta.dirname, "..", "scripts", "mutation-batch.mjs");
const GUARD = 'export function allow(value) {\n  return value === "ok";\n}\n';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}

function repo(): string {
  const root = scratch("amc-mutation-batch-repo-");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "fixture");
  writeFileSync(join(root, ".gitignore"), "node_modules\n");
  symlinkSync(resolve(import.meta.dirname, "..", "node_modules"), join(root, "node_modules"), "dir");
  writeFileSync(join(root, "guard.mjs"), GUARD);
  writeFileSync(join(root, "guard.test.mjs"), [
    'import { expect, it } from "vitest";',
    'import { allow } from "./guard.mjs";',
    'it("refuses anything but ok", () => { expect(allow("bad")).toBe(false); expect(allow("ok")).toBe(true); });',
    ""
  ].join("\n"));
  git("add", ".");
  git("commit", "-q", "-m", "fixture");
  return root;
}

function entry(overrides: Record<string, unknown> = {}) {
  return { id: "M1", oldIssue: "AMC-0000", file: "guard.mjs", find: 'value === "ok"', replace: "true",
    tests: ["guard.test.mjs"], expect: "killed", ...overrides };
}

function batchFiles(entries: unknown[]) {
  const dir = scratch("amc-mutation-batch-io-");
  const batch = join(dir, "batch.json");
  writeFileSync(batch, JSON.stringify(entries));
  return { batch, out: join(dir, "out.json") };
}

function run(root: string, entries: unknown[]) {
  const files = batchFiles(entries);
  const result = spawnSync(process.execPath, [SCRIPT, "--batch", files.batch, "--out", files.out], { cwd: root, encoding: "utf8", timeout: 120_000 });
  const report = existsSync(files.out) ? JSON.parse(readFileSync(files.out, "utf8")) : null;
  return { status: result.status, stderr: result.stderr, report };
}

const status = (root: string) => execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });

describe("mutation-batch.mjs", () => {
  it("records a killed mutant with its failing test, restores the bytes and leaves the tree clean", () => {
    const root = repo();
    const result = run(root, [entry()]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.report.results[0]).toMatchObject({ id: "M1", outcome: "killed", ok: true, line: 2, exitCode: 1 });
    expect(result.report.results[0].failingTests).toEqual(["guard.test.mjs > refuses anything but ok"]);
    expect(result.report.summary).toMatchObject({ killed: 1, survived: 0, errors: 0 });
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
    expect(status(root)).toBe("");
  }, 120_000);

  it("fails the batch when a killed entry survives or an equivalent entry is killed", () => {
    const root = repo();
    const result = run(root, [
      entry({ id: "survivor", find: 'return value === "ok";', replace: 'return "ok" === value;' }),
      entry({ id: "not-equivalent", expect: "equivalent" }),
      entry({ id: "equivalent", find: 'return value === "ok";', replace: 'return "ok" === value;', expect: "equivalent" })
    ]);
    expect(result.status).toBe(1);
    expect(result.report.results.map((row: { id: string; outcome: string; ok: boolean }) => [row.id, row.outcome, row.ok])).toEqual([
      ["survivor", "survived", false], ["not-equivalent", "equivalent-killed", false], ["equivalent", "equivalent", true]
    ]);
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
    expect(status(root)).toBe("");
  }, 120_000);

  it("refuses a find string that occurs zero or several times without touching the file", () => {
    const root = repo();
    const result = run(root, [entry({ id: "absent", find: "value !== 'ok'" }), entry({ id: "twice", find: "value" })]);
    expect(result.status).toBe(1);
    expect(result.report.results.map((row: { outcome: string; reason: string }) => [row.outcome, row.reason])).toEqual([
      ["error", "find occurs 0 times; exactly one is required"], ["error", "find occurs 2 times; exactly one is required"]
    ]);
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
  }, 120_000);

  it("refuses a dirty tree before mutating anything", () => {
    const root = repo();
    writeFileSync(join(root, "stray.txt"), "uncommitted work");
    const result = run(root, [entry()]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("working tree is not clean before the batch");
    expect(result.report).toBeNull();
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
  }, 120_000);

  it("does not count a kill when the unmutated tests already fail", () => {
    const root = repo();
    writeFileSync(join(root, "guard.test.mjs"), 'import { it } from "vitest";\nit("always fails", () => { throw new Error("broken"); });\n');
    execFileSync("git", ["commit", "-qam", "broken test"], { cwd: root });
    const result = run(root, [entry()]);
    expect(result.status).toBe(1);
    expect(result.report.results[0]).toMatchObject({ outcome: "baseline-failed", ok: false });
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
  }, 120_000);

  it.each(["SIGTERM", "SIGINT"] as const)("restores the original bytes when %s arrives mid-run", async (signal) => {
    const root = repo();
    // hang.test.mjs passes unmutated (baseline) and hangs only while the guard is mutated, so the signal lands mid-run.
    const files = batchFiles([entry({ tests: ["guard.test.mjs", "hang.test.mjs"] })]);
    writeFileSync(join(root, "hang.test.mjs"), 'import { it } from "vitest";\nimport { allow } from "./guard.mjs";\n'
      + 'it("waits to be killed while mutated", () => (allow("bad") ? new Promise(() => {}) : undefined), 600_000);\n');
    execFileSync("git", ["add", "hang.test.mjs"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "hang only under the mutation"], { cwd: root });
    const runner = spawn(process.execPath, [SCRIPT, "--batch", files.batch, "--out", files.out], { cwd: root, stdio: "ignore" });
    const exited = new Promise<number | null>((done) => runner.on("close", (code) => done(code)));
    await vi.waitFor(() => expect(readFileSync(join(root, "guard.mjs"), "utf8")).not.toBe(GUARD), { timeout: 60_000, interval: 50 });
    runner.kill(signal);
    expect(await exited).toBe(signal === "SIGTERM" ? 143 : 130);
    expect(readFileSync(join(root, "guard.mjs"), "utf8")).toBe(GUARD);
    expect(status(root)).toBe("");
    expect(existsSync(files.out)).toBe(false);
  }, 120_000);
});
