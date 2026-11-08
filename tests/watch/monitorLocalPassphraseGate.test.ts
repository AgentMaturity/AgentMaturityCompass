import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/workspace.js", () => ({ initWorkspace: () => { throw new Error("initWorkspace reached"); } }));

import { AGENT_ENV_MARKERS } from "../../src/vault/operatorContext.js";
import { createContinuousMonitor } from "../../src/watch/continuousMonitor.js";

/** LIVE-VAULT-02: `amc monitor start` never loads .amc/local-vault-passphrase into a process carrying an agent marker. */
describe("the monitor's local passphrase gate", () => {
  let workspace: string;
  beforeEach(() => {
    for (const name of AGENT_ENV_MARKERS) vi.stubEnv(name, undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    workspace = mkdtempSync(join(tmpdir(), "amc-monitor-gate-"));
    mkdirSync(join(workspace, ".amc"));
    writeFileSync(join(workspace, ".amc", "local-vault-passphrase"), "monitor-local-pass-123\n", { mode: 0o600 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("refuses to start under an agent marker, before the workspace is touched", async () => {
    vi.stubEnv("CODEX_SANDBOX", "seatbelt");
    const monitor = createContinuousMonitor({ workspace, agentId: "default", scoringIntervalMs: 100_000, driftCheckIntervalMs: 100_000 });
    await expect(monitor.start()).rejects.toThrow(
      "Vault passphrase needed: the monitor does not read .amc/local-vault-passphrase under the agent marker CODEX_SANDBOX; export AMC_VAULT_PASSPHRASE.");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBeUndefined();
  });

  it("loads it without a marker and goes on to the workspace", async () => {
    const monitor = createContinuousMonitor({ workspace, agentId: "default", scoringIntervalMs: 100_000, driftCheckIntervalMs: 100_000 });
    await expect(monitor.start()).rejects.toThrow("initWorkspace reached");
    expect(process.env.AMC_VAULT_PASSPHRASE).toBe("monitor-local-pass-123");
  });
});
