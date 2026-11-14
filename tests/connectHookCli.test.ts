import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-connect-hooks-cli-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}

/**
 * A PATH whose only `claude` reports `version` (the qualified release by default), or none at all, so the installer binds
 * the same Claude Code on every host instead of whatever release (if any) the machine running the tests has installed.
 */
function claudePath(root: string, version: string | null = "2.1.296"): string {
  const bin = join(root, ".fixture-bin");
  mkdirSync(bin, { recursive: true });
  if (version) {
    writeFileSync(join(bin, "claude"), `#!/bin/sh\necho '${version} (Claude Code)'\n`);
    chmodSync(join(bin, "claude"), 0o755);
  }
  return bin;
}

function run(cwd: string, args: string[], input?: string, PATH = claudePath(cwd), env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      PATH,
      NO_COLOR: "1",
      AMC_VAULT_PASSPHRASE: "amc-test-passphrase",
      // The control install reads Claude Code's user settings; the developer's own plugins and hooks stay out of the test.
      CLAUDE_CONFIG_DIR: join(cwd, ".claude-config"),
      ...env
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
    expect(result.stdout).toContain("health");
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

    const health = run(cwd, ["connect", "hooks", "health", "--provider", "claude-code", "--json"]);
    expect(health.status).toBe(1);
    expect(JSON.parse(health.stdout)).toEqual(expect.objectContaining({
      status: "awaiting_first_event",
      failClosed: false,
      reasonCodes: ["HOOK_EVENT_NOT_OBSERVED"],
    }));

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

  test("rejects unsupported health providers with a stable machine-readable exit", () => {
    const result = run(workspace(), ["connect", "hooks", "health", "--provider", "cursor", "--json"]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: "provider must be claude-code, gemini-cli, pi or dsh",
    });
  });

  test("returns a provider-native deny when an installed control hook cannot reach Bridge", () => {
    const cwd = workspace();
    const installed = run(cwd, [
      "connect", "hooks", "install",
      "--provider", "claude-code",
      "--mode", "control",
      "--agent", "control-cli-agent",
      "--json",
    ]);
    expect(installed.status).toBe(0);
    expect(JSON.parse(installed.stdout)).toMatchObject({
      mode: "control",
      lease: { scopes: ["hook:observe", "hook:control"] },
      warnings: [],
    });

    const forwarded = run(cwd, [
      "connect", "hooks", "forward",
      "--provider", "claude-code",
      "--mode", "control",
      "--agent", "control-cli-agent",
      "--token-file", ".amc/hooks/claude-code.lease",
      // As the installer writes it: Claude Code control answers only the hook it is installed for.
      "--event", "PreToolUse",
    ], JSON.stringify({
      session_id: "cli-outage-session",
      transcript_path: "/private/transcript.jsonl",
      cwd,
      permission_mode: "default",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "toolu_cli_outage_01",
      tool_input: { file_path: "/private/never-forwarded.txt" },
    }));
    expect(forwarded.status).toBe(2);
    expect(JSON.parse(forwarded.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "AMC control is unavailable; the action is denied fail closed.",
      },
    });
    expect(forwarded.stderr).toContain("AMC hook control unavailable; action denied.");
    expect(forwarded.stdout).not.toContain("never-forwarded");
  });

  test("control install warns when Claude Code's own settings will refuse the session registration, and names observe mode", () => {
    const cwd = workspace();
    const configDir = join(cwd, "plugin-config");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "settings.json"), JSON.stringify({ enabledPlugins: { "some-plugin@market": true } }));
    const control = ["--provider", "claude-code", "--mode", "control", "--agent", "control-cli-agent"];
    const clean = run(cwd, ["connect", "hooks", "install", ...control, "--json"]);
    expect(JSON.parse(clean.stdout).warnings).toEqual([]);
    const withPlugin = run(cwd, ["connect", "hooks", "install", ...control], undefined, claudePath(cwd), { CLAUDE_CONFIG_DIR: configDir });
    expect(withPlugin.stdout).toMatch(/Warning: Claude Code's settings keep AMC from registering sessions \(an enabled plugin in .*settings\.json can run hooks AMC did not install\), so control denies every tool call here/);
    expect(withPlugin.stdout).toContain("amc connect hooks install --provider claude-code --mode observe --agent control-cli-agent");
  });

  test("denies as an unusable installation, not invalid input, when control was installed with no Claude Code on PATH", () => {
    const cwd = workspace();
    const noClaude = claudePath(join(cwd, "no-claude"), null);
    const control = ["--provider", "claude-code", "--mode", "control", "--agent", "control-cli-agent"];
    const installed = run(cwd, ["connect", "hooks", "install", ...control, "--json"], undefined, noClaude);
    expect(installed.status).toBe(0);
    expect(JSON.parse(installed.stdout).warnings).toEqual([expect.stringContaining("no Claude Code was on PATH, so the installation binds no qualified release and the hook denies every action")]);
    const again = run(cwd, ["connect", "hooks", "install", ...control], undefined, noClaude);
    expect(again.stdout).toContain("Warning: no Claude Code was on PATH");
    const forwarded = run(cwd, ["connect", "hooks", "forward", ...control, "--token-file", ".amc/hooks/claude-code.lease", "--event", "PreToolUse"],
      JSON.stringify({ session_id: "cli-unbound-session", transcript_path: "/private/transcript.jsonl", cwd, permission_mode: "default",
        hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "toolu_cli_unbound_01", tool_input: { file_path: "/private/never-forwarded.txt" } }), noClaude);
    expect(forwarded.status).toBe(2);
    expect(JSON.parse(forwarded.stdout)).toMatchObject({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } });
    expect(forwarded.stderr).toContain("AMC hook installation unusable (the installation binds no qualified Claude Code release");
    expect(forwarded.stderr).not.toContain("input invalid");
  });
});
