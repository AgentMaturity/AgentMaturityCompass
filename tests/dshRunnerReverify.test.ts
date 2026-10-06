// AMC-1520: the DSH runner re-hashes the approved launch files at the last
// point before spawn. A write between launch preparation and spawn must stop
// the run before any child starts. Studio liveness is the only stubbed seam;
// the workspace, signed adapter profile, ledger and child process are real.
import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as childProcess from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { adaptersConfigureCli } from "../src/adapters/adapterCli.js";
import { runAdapterCommand } from "../src/adapters/adapterRunner.js";

const hooks = vi.hoisted(() => ({ afterPrepare: undefined as (() => void) | undefined }));
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
vi.mock("../src/adapters/deepseekHarnessLaunch.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/adapters/deepseekHarnessLaunch.js")>();
  return {
    ...real,
    prepareDeepseekHarnessLaunch: (input: Parameters<typeof real.prepareDeepseekHarnessLaunch>[0]) => {
      const prepared = real.prepareDeepseekHarnessLaunch(input);
      hooks.afterPrepare?.();
      return prepared;
    }
  };
});
vi.mock("../src/studio/studioSupervisor.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/studio/studioSupervisor.js")>(),
  studioStatus: () => ({ running: true, vaultUnlocked: true,
    state: { host: "127.0.0.1", gatewayPort: 9, proxyPort: 9, dashboardPort: 9 } as never })
}));

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
let workspace = "";
let entry = "";

beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "dsh-reverify-synthetic-test-passphrase");
  workspace = mkdtempSync(join(tmpdir(), "amc-dsh-reverify-"));
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  entry = join(workspace, "runtime.mjs");
  writeFileSync(entry, "if (process.argv.includes('--version')) console.log('0.1.3-alpha.2');\n");
  const launch = join(workspace, "launch.json");
  writeFileSync(launch, JSON.stringify({ executable: { path: process.execPath, sha256: sha(process.execPath) }, entrypoint: { path: entry, sha256: sha(entry) } }));
  adaptersConfigureCli({ workspace, agentId: "default", adapterId: "deepseek-harness", route: "/openai", model: "fixture-model", mode: "SUPERVISE", launchConfig: launch });
  vi.mocked(childProcess.spawn).mockClear();
});
afterEach(() => {
  hooks.afterPrepare = undefined;
  vi.unstubAllEnvs();
  rmSync(workspace, { recursive: true, force: true });
});

const runtimeSpawns = () => vi.mocked(childProcess.spawn).mock.calls.filter(([, args]) => (args as string[] | undefined)?.[0] === entry);
const run = () => runAdapterCommand({ workspace, agentId: "default", adapterId: "deepseek-harness", command: ["one task"] });

describe("AMC-1520 adapterRunner.ts — DSH launch files are re-verified at spawn", () => {
  test("an approved file changed after preparation and before spawn rejects the run and never spawns", async () => {
    hooks.afterPrepare = () => appendFileSync(entry, "// changed after approval\n");
    await expect(run()).rejects.toThrow("DSH approved launch artifact changed; review and reconfigure its signed hash before running.");
    expect(runtimeSpawns()).toHaveLength(0);
  });
  test("untouched approved files spawn the runtime once", async () => {
    const result = await run();
    expect(result.exitCode).toBe(0);
    expect(runtimeSpawns()).toHaveLength(1);
  });
});
