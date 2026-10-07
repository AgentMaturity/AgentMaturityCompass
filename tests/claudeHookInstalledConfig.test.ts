import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getHookIntegrationStatus, installHookIntegration } from "../src/adapters/hookIntegration.js";
import { claudeHookSettingsFindings, probeInstalledClaudeHook, verifyClaudeControl } from "../src/adapters/claudeHookProbe.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { signFileWithAuditor } from "../src/org/orgSigner.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { initWorkspace } from "../src/workspace.js";

const cliPath = resolve(process.cwd(), "dist/cli.js");
const PASSPHRASE = "claude-hook-installed-config-passphrase";
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

interface InstalledHandler {
  type: string;
  command: string;
  args?: string[];
  timeout: number;
  statusMessage: string;
}

interface HookRun {
  status: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  spawnError: string | null;
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function newWorkspace(): string {
  const workspace = tempDir("amc-claude-installed-");
  process.env.AMC_VAULT_PASSPHRASE = PASSPHRASE;
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initApprovalPolicy(workspace);
  return workspace;
}

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub bridge did not bind");
  closers.push(() => new Promise<void>((resolvePromise) => {
    server.closeAllConnections();
    server.close(() => resolvePromise());
  }));
  return `http://127.0.0.1:${address.port}`;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return address.port;
}

function installedPreToolUse(workspace: string): InstalledHandler {
  const settings = JSON.parse(readFileSync(join(workspace, ".claude", "settings.local.json"), "utf8")) as {
    hooks: { PreToolUse: Array<{ matcher: string; hooks: InstalledHandler[] }> };
  };
  const group = settings.hooks.PreToolUse.find((row) => row.hooks.some((hook) => hook.statusMessage.startsWith("AMC Control")));
  if (!group) throw new Error("AMC control PreToolUse handler is not installed");
  expect(group.matcher).toBe("*");
  return group.hooks.find((hook) => hook.statusMessage.startsWith("AMC Control"))!;
}

/**
 * Runs a command hook the way the Claude Code hooks reference describes the exec form:
 * `command` is spawned directly with `args` as the argument vector (no shell), the event JSON
 * arrives on stdin, and the hook is cancelled at `timeout` seconds.
 */
function runLikeClaudeCode(workspace: string, handler: InstalledHandler, payload: string, env: NodeJS.ProcessEnv = {}): Promise<HookRun> {
  const started = Date.now();
  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: string | null = null;
    const child = spawn(handler.command, handler.args ?? [], {
      cwd: workspace,
      shell: false,
      env: { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASSPHRASE, CLAUDE_PROJECT_DIR: workspace, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, handler.timeout * 1000);
    child.on("error", (error) => { spawnError = error.message; });
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.stdin.on("error", () => { /* a hook that never started cannot read its input */ });
    child.stdin.end(payload);
    child.on("close", (status) => {
      clearTimeout(timer);
      resolvePromise({ status, stdout, stderr, durationMs: Date.now() - started, timedOut, spawnError });
    });
  });
}

/** The documented PreToolUse rules: exit 2, or exit 0 with a valid deny, blocks; anything else lets the tool run. */
function claudeCodeOutcome(run: HookRun): "blocked" | "runs" {
  if (run.spawnError !== null || run.timedOut) return "runs";
  if (run.status === 2) return "blocked";
  if (run.status !== 0) return "runs";
  try {
    const parsed = JSON.parse(run.stdout) as { hookSpecificOutput?: { hookEventName?: unknown; permissionDecision?: unknown } };
    return parsed.hookSpecificOutput?.hookEventName === "PreToolUse" && parsed.hookSpecificOutput.permissionDecision === "deny"
      ? "blocked"
      : "runs";
  } catch {
    return "runs";
  }
}

function recordedBashPayload(workspace: string, marker: string): string {
  return JSON.stringify({
    session_id: "recorded-session-0001",
    transcript_path: join(workspace, ".claude", "transcript.jsonl"),
    cwd: workspace,
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: `touch ${marker}`, description: "Create the marker file" },
    tool_use_id: "toolu_recorded_bash_01",
  });
}

function amcStatus(workspace: string, home: string): Promise<HookRun> {
  return runLikeClaudeCode(workspace, {
    type: "command",
    command: process.execPath,
    args: [cliPath, "connect", "hooks", "status", "--provider", "claude-code"],
    timeout: 60,
    statusMessage: "status",
  }, "", { HOME: home, USERPROFILE: home });
}

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("installed Claude Code control configuration", () => {
  test("blocks a policy-denied Bash call through the written settings and verifies control by probe", async () => {
    const workspace = newWorkspace();
    const home = tempDir("amc-claude-home-");
    const port = await freePort();
    const bridgeBase = `http://127.0.0.1:${port}`;
    const bridge = await startBridgeServer({ workspace, host: "127.0.0.1", port, gatewayBaseUrl: "http://127.0.0.1:1" });
    closers.push(() => bridge.close());
    installHookIntegration({ workspace, provider: "claude-code", agentId: "installed-agent", bridgeBase, mode: "control" });

    const handler = installedPreToolUse(workspace);
    const marker = join(workspace, "bash-marker.txt");
    const run = await runLikeClaudeCode(workspace, handler, recordedBashPayload(workspace, marker));

    expect(run.spawnError).toBeNull();
    expect(claudeCodeOutcome(run)).toBe("blocked");
    expect(run.status).toBe(2);
    expect(JSON.parse(run.stdout)).toEqual({
      hookSpecificOutput: expect.objectContaining({ hookEventName: "PreToolUse", permissionDecision: "deny" }),
    });
    expect(run.stderr).not.toContain(marker);
    expect(existsSync(marker)).toBe(false);

    const status = await amcStatus(workspace, home);
    expect(status.status).toBe(0);
    expect(status.stdout).toMatch(/Control: verified \(probe denied in \d+ ms\)/);
    expect(status.stdout).not.toContain("enforced");
  }, 90_000);

  test("blocks in time when the bridge never answers", async () => {
    const workspace = newWorkspace();
    const bridgeBase = await listen(() => { /* never answers */ });
    installHookIntegration({ workspace, provider: "claude-code", agentId: "hung-installed", bridgeBase, mode: "control" });

    const handler = installedPreToolUse(workspace);
    const run = await runLikeClaudeCode(workspace, handler, recordedBashPayload(workspace, join(workspace, "hung-marker")));

    expect(run.timedOut).toBe(false);
    expect(claudeCodeOutcome(run)).toBe("blocked");
    expect(run.durationMs).toBeLessThan(handler.timeout * 1000);
  }, 90_000);

  test("reports a switched Node as stale, a missing own Node as command_missing, and status exits 1", async () => {
    const workspace = newWorkspace();
    const home = tempDir("amc-claude-home-");
    const linkDir = tempDir("amc-claude-node-");
    const nodeLink = join(linkDir, "node");
    symlinkSync(process.execPath, nodeLink);
    const realExecPath = process.execPath;
    process.execPath = nodeLink;
    try {
      installHookIntegration({ workspace, provider: "claude-code", agentId: "stale-agent", bridgeBase: "http://127.0.0.1:3212", mode: "control" });
    } finally {
      process.execPath = realExecPath;
    }
    expect(installedPreToolUse(workspace).command).toBe(nodeLink);
    unlinkSync(nodeLink);

    // This AMC runs another Node than the one installed, so the handler is not its own.
    expect(await probeInstalledClaudeHook({ workspace })).toMatchObject({ ok: false, reason: "stale", exitCode: null });
    const status = await amcStatus(workspace, home);
    expect(status.status).toBe(1);
    expect(status.stdout).toContain("Control: NOT VERIFIED (stale)");
    expect(status.stdout).toContain("amc connect hooks install --provider claude-code --mode control");

    // The handler is AMC's own, but the Node it names is gone.
    process.execPath = nodeLink;
    try {
      const missing = await verifyClaudeControl({ workspace, home });
      expect(missing).toMatchObject({ verified: false, summary: "Control: NOT VERIFIED (command_missing)", probe: { reason: "command_missing", exitCode: null } });
      expect(missing.notes.join("\n")).toContain("amc connect hooks install --provider claude-code --mode control");
    } finally {
      process.execPath = realExecPath;
    }
  }, 90_000);

  test("reports disableAllHooks in project settings and status exits 1", async () => {
    const workspace = newWorkspace();
    const home = tempDir("amc-claude-home-");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "disabled-agent", bridgeBase: "http://127.0.0.1:3212", mode: "control" });
    mkdirSync(join(workspace, ".claude"), { recursive: true });
    writeFileSync(join(workspace, ".claude", "settings.json"), `${JSON.stringify({ disableAllHooks: true }, null, 2)}\n`);

    const status = await amcStatus(workspace, home);
    expect(status.status).toBe(1);
    expect(status.stdout).toContain("Control: NOT VERIFIED");
    expect(status.stdout).toContain("disableAllHooks");
  }, 90_000);

  test("never runs or verifies a drifted or tampered control handler", async () => {
    const workspace = newWorkspace();
    const home = tempDir("amc-claude-home-");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "drift-agent", bridgeBase: "http://127.0.0.1:3212", mode: "control" });
    const settingsPath = join(workspace, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher: string; hooks: InstalledHandler[] }> };
    };

    // A narrowed matcher leaves Bash ungated even though the handler itself still denies.
    settings.hooks.PreToolUse[0]!.matcher = "Read";
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    const narrowed = await verifyClaudeControl({ workspace, home });
    expect(narrowed).toMatchObject({ verified: false, summary: "Control: NOT VERIFIED (drifted)", probe: null });

    // A swapped command must not run at all.
    const marker = join(workspace, "tampered-ran");
    const tampered = join(workspace, "tampered.cjs");
    writeFileSync(tampered, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"); process.stdout.write(${JSON.stringify(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } }))}); process.exitCode = 2;`);
    settings.hooks.PreToolUse[0]!.matcher = "*";
    settings.hooks.PreToolUse[0]!.hooks[0]!.args = [tampered];
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    const status = await amcStatus(workspace, home);
    expect(status.status).toBe(1);
    expect(status.stdout).toContain("AMC hook: drifted");
    expect(status.stdout).toContain("Control: NOT VERIFIED (drifted)");
    expect(status.stdout).not.toContain("Control: verified");
    expect(existsSync(marker)).toBe(false);
  }, 90_000);
});

describe("Claude hook probe outcomes", () => {
  function writeControlHandler(workspace: string, handler: Record<string, unknown>): void {
    mkdirSync(join(workspace, ".claude"), { recursive: true });
    writeFileSync(join(workspace, ".claude", "settings.local.json"), `${JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", statusMessage: "AMC Control [amc-control-v1]", ...handler }] }] },
    }, null, 2)}\n`);
  }

  function script(dir: string, name: string, code: string): string {
    const path = join(dir, `${name}.cjs`);
    writeFileSync(path, code);
    return path;
  }
  const DENY_JSON = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } });
  const DENY_SCRIPT = `process.stdout.write(${JSON.stringify(DENY_JSON)}); process.exitCode = 2;`;

  test("classifies each way the installed handler can fail to block", async () => {
    const workspace = tempDir("amc-claude-probe-");
    expect(await probeInstalledClaudeHook({ workspace })).toMatchObject({ ok: false, reason: "not_installed" });

    // A handler AMC did not write is stale before any of its paths is looked at.
    for (const handler of [
      { command: "amc", args: ["connect", "hooks", "forward"], timeout: 10 },
      { command: join(workspace, "missing-node"), args: [], timeout: 10 },
      { command: process.execPath, args: [], timeout: 10 },
      { command: process.execPath, timeout: 10 },
    ]) {
      writeControlHandler(workspace, handler);
      expect(await probeInstalledClaudeHook({ workspace })).toMatchObject({ ok: false, reason: "stale", exitCode: null, durationMs: 0 });
    }

    // Existing paths are not enough: without a signed manifest nothing matches what AMC would install.
    const denyMarker = join(workspace, "deny-ran");
    writeControlHandler(workspace, { command: process.execPath, args: [script(workspace, "deny", `require("node:fs").writeFileSync(${JSON.stringify(denyMarker)}, "x"); ${DENY_SCRIPT}`)], timeout: 10 });
    expect(await probeInstalledClaudeHook({ workspace })).toMatchObject({ ok: false, reason: "stale", exitCode: null, durationMs: 0 });
    expect(existsSync(denyMarker)).toBe(false);

    // The handler AMC installs, run under a stand-in Node executable, for each outcome.
    const installed = newWorkspace();
    const fakeNode = join(tempDir("amc-claude-fake-node-"), "node");
    const probeAs = async (body: string, mode = 0o755) => {
      writeFileSync(fakeNode, `#!/bin/sh\n${body}\n`);
      chmodSync(fakeNode, mode);
      return probeInstalledClaudeHook({ workspace: installed });
    };
    writeFileSync(fakeNode, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const realExecPath = process.execPath;
    process.execPath = fakeNode;
    try {
      installHookIntegration({ workspace: installed, provider: "claude-code", agentId: "outcome-agent", bridgeBase: "http://127.0.0.1:3212", mode: "control" });
      expect(await probeAs("exit 0")).toMatchObject({ ok: false, reason: "not_blocking", exitCode: 0 });
      expect(await probeAs("exit 2")).toMatchObject({ ok: false, reason: "invalid_output", exitCode: 2 });
      expect(await probeAs(`printf '%s' '${DENY_JSON}'; exit 2`, 0o644)).toMatchObject({ ok: false, reason: "spawn_failed" });
      expect(await probeAs(`printf '%s' '${DENY_JSON}'; exit 2`)).toMatchObject({ ok: true, reason: "ok", exitCode: 2 });
      expect(await probeAs("exec sleep 30")).toMatchObject({ ok: false, reason: "timed_out", exitCode: null });
      unlinkSync(fakeNode);
      expect(await probeInstalledClaudeHook({ workspace: installed })).toMatchObject({ ok: false, reason: "command_missing", exitCode: null });
    } finally {
      process.execPath = realExecPath;
    }
  }, 60_000);

  test("reports settings that disable every hook and never verifies with them set", async () => {
    const workspace = newWorkspace();
    const home = tempDir("amc-claude-home-");
    installHookIntegration({ workspace, provider: "claude-code", agentId: "settings-agent", bridgeBase: "http://127.0.0.1:3212", mode: "control" });
    expect(claudeHookSettingsFindings({ workspace, home }).blockers).toEqual([]);
    expect((await verifyClaudeControl({ workspace, home })).verified).toBe(true);

    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ disableAllHooks: true }));
    const findings = claudeHookSettingsFindings({ workspace, home });
    expect(findings.blockers).toEqual([`disableAllHooks is true in ${join(home, ".claude", "settings.json")}`]);
    const verification = await verifyClaudeControl({ workspace, home });
    expect(verification).toMatchObject({ verified: false, summary: "Control: NOT VERIFIED (disableAllHooks)" });
    expect(verification.probe?.ok).toBe(true);
  }, 60_000);
});

describe("Claude control probe runs only the handler AMC would install", () => {
  type ControlSettings = { hooks: { PreToolUse: Array<{ matcher: string; hooks: InstalledHandler[] }> } };

  /**
   * Rewrites the installed PreToolUse control handler and re-signs the manifest with the
   * workspace's own auditor key, so the forged state stays `installed`: what a cloned or
   * shared workspace can carry when its `.amc` keys are not the user's.
   */
  function forgeSignedHandler(workspace: string, edit: (group: ControlSettings["hooks"]["PreToolUse"][number], handler: InstalledHandler) => void): void {
    const settingsPath = join(workspace, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as ControlSettings;
    const group = settings.hooks.PreToolUse[0]!;
    const handler = group.hooks[0]!;
    edit(group, handler);
    const configText = `${JSON.stringify(settings, null, 2)}\n`;
    writeFileSync(settingsPath, configText);
    const manifestPath = join(workspace, ".amc", "hooks", "claude-code.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { configSha256: string; handlers: Array<{ eventName: string; handlerSha256: string }> };
    manifest.configSha256 = sha256Hex(Buffer.from(configText, "utf8"));
    for (const row of manifest.handlers) {
      if (row.eventName === "PreToolUse") row.handlerSha256 = sha256Hex(canonicalize(handler));
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    signFileWithAuditor(workspace, manifestPath);
    expect(getHookIntegrationStatus({ workspace, provider: "claude-code" }).state).toBe("installed");
  }

  function installControl(agentId: string): string {
    const workspace = newWorkspace();
    installHookIntegration({ workspace, provider: "claude-code", agentId, bridgeBase: "http://127.0.0.1:3212", mode: "control" });
    return workspace;
  }

  async function expectStaleNotRun(workspace: string, marker?: string): Promise<void> {
    const verification = await verifyClaudeControl({ workspace, home: tempDir("amc-claude-home-") });
    if (marker) expect(existsSync(marker), "the forged handler ran").toBe(false);
    expect(verification).toMatchObject({
      verified: false,
      summary: "Control: NOT VERIFIED (stale)",
      probe: { ok: false, reason: "stale", exitCode: null, durationMs: 0 },
    });
    expect(verification.notes.join("\n")).toContain("amc connect hooks install --provider claude-code --mode control");
  }

  test("never spawns a signed handler that runs another program", async () => {
    const workspace = installControl("forged-shell");
    const marker = join(workspace, "pwned");
    forgeSignedHandler(workspace, (_group, handler) => {
      handler.command = "/usr/bin/env";
      handler.args = ["/bin/sh", "-c", `touch ${marker}`];
    });
    await expectStaleNotRun(workspace, marker);

    const status = await amcStatus(workspace, tempDir("amc-claude-home-"));
    expect(existsSync(marker), "the forged handler ran").toBe(false);
    expect(status.status).toBe(1);
    expect(status.stdout).toContain("Control: NOT VERIFIED (stale)");
    expect(status.stdout).toContain("amc connect hooks install --provider claude-code --mode control");
  }, 60_000);

  test("never spawns a signed handler whose script is not AMC's CLI", async () => {
    const workspace = installControl("forged-script");
    const marker = join(workspace, "script-ran");
    const script = join(workspace, "evil.js");
    writeFileSync(script, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"); process.stdout.write(${JSON.stringify(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" } }))}); process.exitCode = 2;`);
    forgeSignedHandler(workspace, (_group, handler) => { handler.args = [script, ...handler.args!.slice(1)]; });
    await expectStaleNotRun(workspace, marker);
  }, 60_000);

  test.each([
    ["an appended flag", (_group: { matcher: string }, handler: InstalledHandler) => { handler.args!.push("--verbose"); }],
    ["a changed bridge URL", (_group: { matcher: string }, handler: InstalledHandler) => {
      const args = handler.args!;
      args[args.indexOf("--bridge-url") + 1] = "http://127.0.0.1:1";
    }],
    ["a changed agent", (_group: { matcher: string }, handler: InstalledHandler) => {
      const args = handler.args!;
      args[args.indexOf("--agent") + 1] = "someone-else";
    }],
    ["a longer timeout", (_group: { matcher: string }, handler: InstalledHandler) => { handler.timeout = 600; }],
    ["a narrowed matcher", (group: { matcher: string }) => { group.matcher = "Read"; }],
    ["a bare command name", (_group: { matcher: string }, handler: InstalledHandler) => {
      handler.command = "sh";
      handler.args = ["-c", "true"];
    }],
    ["a command that does not exist", (_group: { matcher: string }, handler: InstalledHandler) => { handler.command = "/nonexistent/amc-node"; }],
    ["no script argument", (_group: { matcher: string }, handler: InstalledHandler) => { handler.args = []; }],
  ])("reports a signed handler with %s as stale and never runs it", async (_label, edit) => {
    const workspace = installControl("forged-args");
    forgeSignedHandler(workspace, edit);
    await expectStaleNotRun(workspace);
  }, 60_000);

  test("still runs and verifies the genuine installed handler", async () => {
    const workspace = installControl("genuine-agent");
    const verification = await verifyClaudeControl({ workspace, home: tempDir("amc-claude-home-") });
    expect(verification).toMatchObject({ verified: true, probe: { ok: true, reason: "ok", exitCode: 2 } });
  }, 60_000);
});
