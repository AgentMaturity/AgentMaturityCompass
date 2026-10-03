// AMC-1520: the hash pin that approves a DSH launcher, and the boundary its
// receipt states. Synthetic files only; no DSH build is launched here.
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { deepseekHarnessCoverage, prepareDeepseekHarnessLaunch, verifyDeepseekHarnessLaunch, type DeepseekHarnessLaunch } from "../src/adapters/deepseekHarnessLaunch.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const pin = (path: string) => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
function launch(): { root: string; config: DeepseekHarnessLaunch } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-dsh-pin-"))); roots.push(root);
  const executable = join(root, "dsh"), entrypoint = join(root, "entry.mjs");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n"); chmodSync(executable, 0o755); writeFileSync(entrypoint, "export {};\n");
  return { root, config: { executable: pin(executable), entrypoint: pin(entrypoint) } };
}
const CHANGED = "DSH approved launch artifact changed; review and reconfigure its signed hash before running.";

describe("DSH launch pin", () => {
  test("matching pinned files are admitted and changed executable or entrypoint bytes refuse", () => {
    const { config } = launch();
    expect(() => verifyDeepseekHarnessLaunch(config)).not.toThrow();
    writeFileSync(config.entrypoint!.path, "export const changed = true;\n");
    expect(() => verifyDeepseekHarnessLaunch(config)).toThrow(CHANGED);
    const other = launch().config;
    writeFileSync(other.executable.path, "#!/bin/sh\nexit 1\n");
    expect(() => verifyDeepseekHarnessLaunch(other)).toThrow(CHANGED);
  });

  test("a directory at a pinned path is refused even when its hash field is reused", () => {
    const { root, config } = launch(), directory = join(root, "dir");
    mkdirSync(directory);
    expect(() => verifyDeepseekHarnessLaunch({ ...config, entrypoint: { path: directory, sha256: config.entrypoint!.sha256 } })).toThrow(CHANGED);
  });

  test("launch preparation re-checks the pin instead of trusting configuration time", () => {
    const { config } = launch();
    writeFileSync(config.executable.path, "#!/bin/sh\necho swapped\n");
    expect(() => prepareDeepseekHarnessLaunch({ launch: config, task: ["read the file"], routeUrl: "http://127.0.0.1:1/openai", model: "fixture" })).toThrow(CHANGED);
  });

  test("the capture receipt states that exec by path is outside the hash check", () => {
    expect(deepseekHarnessCoverage().launchPin).toEqual({ status: "hashed_before_spawn",
      boundary: expect.stringContaining("started by path, so a write to those paths after the last hash and before exec is not detected") });
  });
});
