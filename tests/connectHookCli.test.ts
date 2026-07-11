import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const cliPath = resolve(process.cwd(), "dist/cli.js");

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-connect-hooks-cli-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

function run(cwd: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "amc-test-passphrase"
    },
    timeout: 30_000
  });
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("amc connect hooks CLI", () => {
  test("shows the public lifecycle commands and hides the internal forwarder", () => {
    const result = run(workspace(), ["connect", "hooks", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("install");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("remove");
    expect(result.stdout).not.toContain("forward");
  });

  test("runs dry-run, install, status, and remove with machine-readable output", () => {
    const cwd = workspace();
    const dryRun = run(cwd, [
      "connect", "hooks", "install",
      "--provider", "claude-code",
      "--agent", "cli-agent",
      "--dry-run",
      "--json"
    ]);
    expect(dryRun.status).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toEqual(expect.objectContaining({ dryRun: true, applied: false }));

    const installed = run(cwd, [
      "connect", "hooks", "install",
      "--provider", "claude-code",
      "--agent", "cli-agent",
      "--json"
    ]);
    expect(installed.status).toBe(0);
    expect(JSON.parse(installed.stdout)).toEqual(expect.objectContaining({ applied: true, changed: true }));

    const status = run(cwd, ["connect", "hooks", "status", "--provider", "claude-code", "--json"]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toEqual(expect.objectContaining({ state: "installed", leaseValid: true }));

    const removed = run(cwd, ["connect", "hooks", "remove", "--provider", "claude-code", "--json"]);
    expect(removed.status).toBe(0);
    expect(JSON.parse(removed.stdout)).toEqual(expect.objectContaining({ applied: true, changed: true }));
  });

  test("preserves the existing bare connect wizard action", () => {
    const result = run(workspace(), [
      "connect",
      "--agent", "default",
      "--mode", "supervise",
      "--print-cmd"
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("amc supervise --agent default");
  });
});
