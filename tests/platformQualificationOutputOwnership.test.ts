/** AMC-1530 / T01 — AUTHORING ONLY, UNEXECUTED.
 * All files and subprocess responses are synthetic. These tests never perform
 * packaging, installation, Git commands, provider calls or native qualification.
 * Temporary files exist only on a later authorized test run.
 */
import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qualifyPlatform } from "../scripts/qualify-platform.mjs";

const hooks = vi.hoisted(() => ({
  beforeMkdir: undefined as undefined | ((path: unknown, options: unknown) => void),
  beforeOpen: undefined as undefined | ((path: unknown) => void),
  beforeWrite: undefined as undefined | ((path: unknown) => void)
}));
vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...real,
    mkdirSync: vi.fn((...args: Parameters<typeof real.mkdirSync>) => {
      hooks.beforeMkdir?.(args[0], args[1]);
      return Reflect.apply(real.mkdirSync, real, args);
    }),
    mkdtempSync: vi.fn(real.mkdtempSync),
    openSync: vi.fn((...args: Parameters<typeof real.openSync>) => {
      hooks.beforeOpen?.(args[0]);
      return Reflect.apply(real.openSync, real, args);
    }),
    closeSync: vi.fn(real.closeSync),
    writeFileSync: vi.fn((...args: Parameters<typeof real.writeFileSync>) => {
      hooks.beforeWrite?.(args[0]);
      return Reflect.apply(real.writeFileSync, real, args);
    })
  };
});
vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("../scripts/packed-evidence-verification.mjs", () => ({
  verifyPackedRun: vi.fn(() => { throw new Error("Native qualification is outside this synthetic test."); })
}));

const real = await vi.importActual<typeof import("node:fs")>("node:fs");
let root = "";
const syntheticExit = () => ({ pid: 0, output: [null, "", "synthetic refusal"],
  stdout: "", stderr: "synthetic refusal", status: 7, signal: null });

beforeEach(() => {
  vi.clearAllMocks();
  hooks.beforeMkdir = hooks.beforeOpen = hooks.beforeWrite = undefined;
  root = real.realpathSync(real.mkdtempSync(join(tmpdir(), "amc-platform-output-test-")));
  real.writeFileSync(join(root, "package.json"), JSON.stringify({ name: "synthetic-package", version: "0.0.0" }));
  vi.stubEnv("npm_execpath", "");
  vi.mocked(spawnSync).mockImplementation(() => syntheticExit() as ReturnType<typeof spawnSync>);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  hooks.beforeMkdir = hooks.beforeOpen = hooks.beforeWrite = undefined;
  // Only scratch roots returned by this test's intercepted production calls.
  for (const result of vi.mocked(fs.mkdtempSync).mock.results) {
    if (result.type === "return" && typeof result.value === "string") real.rmSync(result.value, { recursive: true, force: true });
  }
  if (root) real.rmSync(root, { recursive: true, force: true });
  root = "";
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

function unstarted() {
  expect(fs.mkdtempSync).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
}
function permitSyntheticPackFailure() {
  const npm = join(root, "npm-cli.js");
  real.writeFileSync(npm, "// Synthetic path only; never executed.\n");
  real.mkdirSync(join(root, "dist")); real.writeFileSync(join(root, "dist/cli.js"), "// Never executed.\n");
  vi.stubEnv("npm_execpath", npm);
}

describe("platform evidence output admission through qualifyPlatform", () => {
  it.each(["empty-directory", "populated-directory", "file"])("refuses an existing %s before scratch or commands", kind => {
    const directory = join(root, "results"), out = join(directory, "report.json");
    if (kind === "file") real.writeFileSync(directory, "original file");
    else {
      real.mkdirSync(directory);
      if (kind === "populated-directory") {
        real.writeFileSync(out, "original report");
        real.writeFileSync(join(directory, "00-pack.json"), "original step");
      }
    }
    expect(() => qualifyPlatform({ root, out })).toThrow(/new directory/);
    unstarted();
    if (kind === "file") expect(real.readFileSync(directory, "utf8")).toBe("original file");
    else if (kind === "empty-directory") expect(real.readdirSync(directory)).toEqual([]);
    else {
      expect(real.readFileSync(out, "utf8")).toBe("original report");
      expect(real.readFileSync(join(directory, "00-pack.json"), "utf8")).toBe("original step");
      expect(real.readdirSync(directory).sort()).toEqual(["00-pack.json", "report.json"]);
    }
  });

  it.each(["existing-target", "dangling-target"])("does not reuse a %s directory link", kind => {
    const directory = join(root, "results"), target = join(root, "link-target");
    if (kind === "existing-target") {
      real.mkdirSync(target); real.writeFileSync(join(target, "original.txt"), "retained");
    }
    real.symlinkSync(target, directory, process.platform === "win32" ? "junction" : "dir");
    expect(() => qualifyPlatform({ root, out: join(directory, "report.json") })).toThrow();
    unstarted(); expect(real.lstatSync(directory).isSymbolicLink()).toBe(true);
    if (kind === "existing-target") expect(real.readdirSync(target)).toEqual(["original.txt"]);
    else expect(real.existsSync(target)).toBe(false);
  });

  it("refuses a deterministic competing directory creator without changing the winner", () => {
    const directory = join(root, "nested/results"), out = join(directory, "report.json");
    let intercepted = false;
    hooks.beforeMkdir = path => {
      if (String(path) !== directory || intercepted) return;
      intercepted = true; real.mkdirSync(directory);
      real.writeFileSync(join(directory, "winner.txt"), "synthetic competing owner");
    };
    expect(() => qualifyPlatform({ root, out })).toThrow(/new directory/);
    expect(intercepted).toBe(true); unstarted();
    expect(real.readdirSync(directory)).toEqual(["winner.txt"]);
    expect(real.readFileSync(join(directory, "winner.txt"), "utf8")).toBe("synthetic competing owner");
  });

  it("keeps noncollision admission errors and leaves no fabricated report", () => {
    const directory = join(root, "results"), out = join(directory, "report.json");
    const denied = Object.assign(new Error("synthetic permission refusal"), { code: "EACCES" });
    hooks.beforeMkdir = path => { if (String(path) === directory) throw denied; };
    expect(() => qualifyPlatform({ root, out })).toThrow(denied);
    unstarted(); expect(real.existsSync(directory)).toBe(false);
  });

  it("claims new nested output and writes only an honest incomplete prerequisite report", () => {
    const out = join(root, "new/ancestors/results/report.json");
    const report = qualifyPlatform({ root, out });
    expect(report.status).toBe("inconclusive"); expect(report.steps).toEqual([]);
    expect(report.sourceCommit).toBeNull(); expect(report.sourceDirty).toBeNull();
    expect(report.packageSha256).toBeNull(); expect(report.cleanup).toBe("retained-for-inspection");
    expect(JSON.parse(real.readFileSync(out, "utf8"))).toEqual(report);
    expect(real.readdirSync(dirname(out))).toEqual(["report.json"]);
    expect(fs.openSync).toHaveBeenCalledWith(resolve(out), "wx", 0o600);
    const reserved = vi.mocked(fs.openSync).mock.results.find(result => result.type === "return");
    expect(reserved).toBeDefined(); expect(fs.closeSync).toHaveBeenCalledWith(reserved!.value);
    if (process.platform !== "win32") expect(real.statSync(out).mode & 0o777).toBe(0o600);
    const before = real.readFileSync(out), calls = vi.mocked(spawnSync).mock.calls.length;
    expect(() => qualifyPlatform({ root, out: join(dirname(out), "another-report.json") })).toThrow(/new directory/);
    expect(vi.mocked(spawnSync).mock.calls.length).toBe(calls);
    expect(real.readFileSync(out)).toEqual(before);
  });

  it("does not replace a report-name collision injected after directory ownership", () => {
    const out = join(root, "results/report.json");
    hooks.beforeOpen = path => {
      if (String(path) === out) real.writeFileSync(out, "synthetic other file", { flag: "wx" });
    };
    expect(() => qualifyPlatform({ root, out })).toThrow();
    unstarted(); expect(real.readFileSync(out, "utf8")).toBe("synthetic other file");
  });

  it("writes a failed synthetic step exclusively without treating command failure as success", () => {
    permitSyntheticPackFailure(); const out = join(root, "results/report.json");
    const report = qualifyPlatform({ root, out });
    expect(report.status).toBe("failed"); expect(report.steps).toHaveLength(1);
    expect(report.steps[0]).toMatchObject({ id: "pack", status: "failed", exitCode: 7 });
    const step = join(dirname(out), "00-pack.json");
    expect(JSON.parse(real.readFileSync(step, "utf8"))).toMatchObject({ exitCode: 7 });
    expect(fs.writeFileSync).toHaveBeenCalledWith(step, expect.any(String), { mode: 0o600, flag: "wx" });
  });

  it("preserves a step file created by another writer instead of overwriting it", () => {
    permitSyntheticPackFailure(); const out = join(root, "results/report.json"), step = join(dirname(out), "00-pack.json");
    vi.mocked(spawnSync).mockImplementation((command) => {
      if (String(command) !== "git") real.writeFileSync(step, "prior step bytes", { flag: "wx" });
      return syntheticExit() as ReturnType<typeof spawnSync>;
    });
    const report = qualifyPlatform({ root, out });
    expect(report.status).toBe("inconclusive"); expect(report.steps).toEqual([]);
    expect(real.readFileSync(step, "utf8")).toBe("prior step bytes");
    expect(JSON.parse(real.readFileSync(out, "utf8")).status).toBe("inconclusive");
  });

  it("keeps the reserved report when its requested name equals a generated step name", () => {
    permitSyntheticPackFailure(); const out = join(root, "results/00-pack.json");
    const report = qualifyPlatform({ root, out });
    expect(report.status).toBe("inconclusive"); expect(report.steps).toEqual([]);
    expect(JSON.parse(real.readFileSync(out, "utf8"))).toEqual(report);
    expect(report.schema).toBe("amc.platform-qualification");
  });

  it("closes its reserved descriptor and preserves incomplete output on final write failure", () => {
    const out = join(root, "results/report.json");
    hooks.beforeWrite = path => { if (typeof path === "number") throw Object.assign(new Error("synthetic write failure"), { code: "EIO" }); };
    expect(() => qualifyPlatform({ root, out })).toThrow(/synthetic write failure/);
    expect(real.readFileSync(out).length).toBe(0);
    const reserved = vi.mocked(fs.openSync).mock.results.find(result => result.type === "return");
    expect(reserved).toBeDefined(); expect(fs.closeSync).toHaveBeenCalledWith(reserved!.value);
    expect(real.readdirSync(dirname(out))).toEqual(["report.json"]);
  });
});
