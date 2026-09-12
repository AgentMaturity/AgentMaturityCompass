/** AMC-1518 / T02 — AUTHORING ONLY, UNEXECUTED.
 * Synthetic local files and deterministic competing-writer injection. The real
 * comparison entry point is used, but adapters/oracles/providers never execute.
 * No filesystem setup or test import has been run by authoring this source.
 */
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHarnessComparison } from "../src/benchmarks/harnessComparison.js";
import { runProcess } from "../src/exec/runProcess.js";
import type { HarnessComparisonManifest } from "../src/benchmarks/harnessComparisonSchema.js";

const hooks = vi.hoisted(() => ({
  beforeMkdir: undefined as undefined | ((path: unknown) => void),
  afterMkdir: undefined as undefined | ((path: unknown) => void)
}));
vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...real,
    mkdirSync: vi.fn((...args: Parameters<typeof real.mkdirSync>) => {
      hooks.beforeMkdir?.(args[0]);
      const result = Reflect.apply(real.mkdirSync, real, args);
      hooks.afterMkdir?.(args[0]);
      return result;
    }),
    mkdtempSync: vi.fn(real.mkdtempSync),
    writeFileSync: vi.fn(real.writeFileSync)
  };
});
vi.mock("../src/exec/runProcess.js", () => ({
  runProcess: vi.fn(() => { throw new Error("No adapter or oracle may run in output-admission regressions."); })
}));
const real = await vi.importActual<typeof import("node:fs")>("node:fs");
let root = "", manifestPath = "", outputDir = "";
const pin = (path: string) => ({ path, sha256: createHash("sha256").update(real.readFileSync(path)).digest("hex") });

beforeEach(() => {
  vi.clearAllMocks(); hooks.beforeMkdir = hooks.afterMkdir = undefined;
  root = real.realpathSync(real.mkdtempSync(join(tmpdir(), "amc-comparison-output-test-")));
  manifestPath = join(root, "manifest.json"); outputDir = join(root, "results");
  const input = join(root, "synthetic.txt"); real.writeFileSync(input, "Synthetic file pin, never an executed program.\n");
  const command = { executable: pin(input), inputs: [], args: [] };
  const manifest: HarnessComparisonManifest = {
    schemaVersion: "2026-09-08", id: "synthetic-output-ownership",
    description: "Synthetic runner admission, not comparison results.",
    environment: { platform: process.platform as "darwin" | "linux" | "win32", arch: process.arch as "x64" | "arm64",
      nodeVersion: process.version, description: "Future test runtime, not authoring environment.", variables: {} },
    concurrency: 1, repetitions: 2, captureBytesPerStream: 4096,
    lanes: [{ id: "keyless", kind: "keyless-conformance", provider: null, model: null, settings: {},
      permissions: { read: ["fixture"], write: ["trial-workspace"], network: [],
        sandbox: "No sandbox claim", enforcement: "adapter-responsibility" },
      budgets: { timeoutMs: 1000, maxTokens: null, maxCostUsd: null }, requiredSecretEnv: [] }],
    tasks: [{ id: "synthetic", laneId: "keyless", scenario: "success", description: "Unexecuted synthetic task",
      fixture: pin(input), oracle: command }],
    targets: ["first", "second"].map(id => ({ id, label: `Synthetic ${id}`, artifact: pin(input),
      source: { url: "https://example.invalid/synthetic", commit: "1".repeat(40),
        retrievedAt: "2026-09-01T00:00:00Z", auditReference: "Synthetic declaration only." },
      bindings: [{ taskId: "synthetic", command, unavailableReason: null, supportsBoundedLiveExecution: false }] }))
  };
  real.writeFileSync(manifestPath, JSON.stringify(manifest));
});
afterEach(() => {
  hooks.beforeMkdir = hooks.afterMkdir = undefined;
  // Unexpected scratch creation is a test failure; still clean only our returned roots.
  for (const result of vi.mocked(fs.mkdtempSync).mock.results) {
    if (result.type === "return" && typeof result.value === "string") real.rmSync(result.value, { recursive: true, force: true });
  }
  if (root) real.rmSync(root, { recursive: true, force: true });
  root = ""; vi.restoreAllMocks();
});
const run = (allowAdapterExecution = true) => runHarnessComparison({ manifestPath, outputDir, allowAdapterExecution });
const unstarted = () => {
  expect(runProcess).not.toHaveBeenCalled(); expect(fs.mkdtempSync).not.toHaveBeenCalled();
};
const snapshot = (directory: string) => real.readdirSync(directory).sort().map(name => ({ name, bytes: real.readFileSync(join(directory, name)) }));

describe("comparison new-only output through the actual runner", () => {
  it.each(["empty-directory", "populated-directory", "file"])("refuses %s before artifacts or trial setup", async kind => {
    if (kind === "file") real.writeFileSync(outputDir, "original destination file");
    else {
      real.mkdirSync(outputDir);
      if (kind === "populated-directory") real.writeFileSync(join(outputDir, "report.json"), "original report bytes");
    }
    const inputBefore = real.readFileSync(manifestPath);
    await expect(run()).rejects.toThrow(/new directory/);
    unstarted(); expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(real.readFileSync(manifestPath)).toEqual(inputBefore);
    if (kind === "file") expect(real.readFileSync(outputDir, "utf8")).toBe("original destination file");
    else if (kind === "empty-directory") expect(real.readdirSync(outputDir)).toEqual([]);
    else expect(snapshot(outputDir)).toEqual([{ name: "report.json", bytes: Buffer.from("original report bytes") }]);
  });

  it.each(["existing-target", "dangling-target"])("refuses an output link with %s", async kind => {
    const target = join(root, "link-target");
    if (kind === "existing-target") { real.mkdirSync(target); real.writeFileSync(join(target, "retained.txt"), "original"); }
    real.symlinkSync(target, outputDir, process.platform === "win32" ? "junction" : "dir");
    await expect(run()).rejects.toThrow(); unstarted();
    expect(real.lstatSync(outputDir).isSymbolicLink()).toBe(true);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    if (kind === "existing-target") expect(real.readdirSync(target)).toEqual(["retained.txt"]);
    else expect(real.existsSync(target)).toBe(false);
  });

  it("refuses a competing creator at the leaf operation rather than adopting its directory", async () => {
    outputDir = join(root, "new-parent/results"); let intercepted = false;
    hooks.beforeMkdir = path => {
      if (String(path) !== outputDir || intercepted) return;
      intercepted = true; real.mkdirSync(outputDir);
      real.writeFileSync(join(outputDir, "winner.txt"), "synthetic competing run");
    };
    await expect(run()).rejects.toThrow(/new directory/);
    expect(intercepted).toBe(true); unstarted(); expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(snapshot(outputDir)).toEqual([{ name: "winner.txt", bytes: Buffer.from("synthetic competing run") }]);
  });

  it.each(["ancestor", "leaf"])("preserves a noncollision %s error without inventing a report", async where => {
    outputDir = join(root, "new-parent/results");
    const denied = Object.assign(new Error("synthetic permission refusal"), { code: "EACCES" });
    hooks.beforeMkdir = path => { if (String(path) === (where === "ancestor" ? dirname(outputDir) : outputDir)) throw denied; };
    await expect(run()).rejects.toBe(denied); unstarted();
    expect(real.existsSync(outputDir)).toBe(false); expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("creates new ancestors and retains every unavailable trial without a made-up pass", async () => {
    outputDir = join(root, "nested/ancestors/results");
    const before = real.readFileSync(manifestPath), report = await run(false);
    expect(report.trials.map(trial => trial.targetId)).toEqual(["first", "second", "second", "first"]);
    expect(report.trials.every(trial => trial.status === "unavailable" && trial.process === null
      && trial.verdict === null && trial.observedOutcome === null && trial.observations === null)).toBe(true);
    expect(report.repeat.outputDirectoryMustBeNew).toBe(true);
    expect(report.schemaVersion).toBe("2026-09-08");
    expect(JSON.parse(real.readFileSync(join(outputDir, "report.json"), "utf8"))).toEqual(report);
    expect(real.readdirSync(outputDir).sort()).toEqual(["manifest.redacted.json", "report.json", "report.md", "summary.json"]);
    expect(fs.mkdirSync).toHaveBeenCalledWith(outputDir, { mode: 0o700 });
    expect(real.readFileSync(manifestPath)).toEqual(before); unstarted();
    if (process.platform !== "win32") expect(real.statSync(outputDir).mode & 0o777).toBe(0o700);
    const prior = snapshot(outputDir);
    await expect(run(false)).rejects.toThrow(/new directory/);
    expect(snapshot(outputDir)).toEqual(prior); unstarted();
  });

  it("admits only one of two API attempts and preserves the resulting report", async () => {
    const results = await Promise.allSettled([run(false), run(false)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const report = JSON.parse(real.readFileSync(join(outputDir, "report.json"), "utf8"));
    expect(report.trials).toHaveLength(4); unstarted();
    // This is a synthetic API-attempt assertion, not a multi-process race measurement.
  });

  it("retains per-artifact exclusive creation after acquiring a new output directory", async () => {
    hooks.afterMkdir = path => {
      if (String(path) === outputDir) real.writeFileSync(join(outputDir, "manifest.redacted.json"), "synthetic existing artifact", { flag: "wx" });
    };
    await expect(run()).rejects.toThrow(); unstarted();
    expect(snapshot(outputDir)).toEqual([{ name: "manifest.redacted.json", bytes: Buffer.from("synthetic existing artifact") }]);
    expect(real.existsSync(join(outputDir, "report.json"))).toBe(false);
  });

  it("does not acquire output or rewrite input when manifest parsing already fails", async () => {
    real.writeFileSync(manifestPath, "{synthetic malformed manifest");
    const before = real.readFileSync(manifestPath);
    await expect(run()).rejects.toThrow(/not valid JSON/);
    expect(fs.mkdirSync).not.toHaveBeenCalled(); expect(real.existsSync(outputDir)).toBe(false);
    expect(real.readFileSync(manifestPath)).toEqual(before); unstarted();
  });
});
