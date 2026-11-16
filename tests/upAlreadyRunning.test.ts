import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { writeStudioState } from "../src/studio/studioState.js";

// CLI-10: with AMC already running, `amc up` asked vault questions (or, without a terminal, refused for want of a
// passphrase) before it said AMC was running. No process is started here: the recorded pid is this test's own.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("amc up when AMC already runs in the folder", () => {
  test("says it is running and asks for no passphrase", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-up-running-"));
    roots.push(root);
    const previous = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-up-running-passphrase";
    try { initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); } finally {
      lockVault(root);
      if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
    }
    writeStudioState(root, { pid: process.pid, startedTs: Date.now(), apiPort: 3481, gatewayPort: 3482, proxyPort: 3483, dashboardPort: 3481,
      host: "127.0.0.1", currentAgent: "default", vaultUnlocked: true, untrustedConfig: false, logFile: join(root, "studio.log") });
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", HOME: root, AMC_VAULT_PASSPHRASE: "", AMC_VAULT_PASSPHRASE_FILE: "" };
    const run = spawnSync(process.execPath, ["--import", resolve("node_modules/tsx/dist/loader.mjs"), resolve("src/cli.ts"), "up", "--no-open"],
      { cwd: root, env, encoding: "utf8", timeout: 120_000, input: "" });
    const output = `${run.stdout}\n${run.stderr}`;
    expect(run.status, output).toBe(0);
    expect(output).toContain("AMC is already running in this folder");
    expect(output).toContain("http://127.0.0.1:3481/console");
    expect(output).not.toContain("passphrase");
  }, 180_000);
});
