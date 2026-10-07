import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { HOOK_CONTROL_INTEGRATION_ID } from "./hookIntegration.js";

export type ClaudeHookProbeReason =
  | "ok"
  | "not_installed"
  | "command_missing"
  | "spawn_failed"
  | "timed_out"
  | "not_blocking"
  | "invalid_output";

export interface ClaudeHookProbeResult {
  ok: boolean;
  reason: ClaudeHookProbeReason;
  exitCode: number | null;
  durationMs: number;
}

export interface ClaudeControlVerification {
  verified: boolean;
  summary: string;
  probe: ClaudeHookProbeResult;
  settingsBlockers: string[];
  notes: string[];
}

interface InstalledCommandHandler {
  command: string;
  args: string[];
  timeoutSeconds: number;
}

/** Fails input validation in the forwarder, so the probe never reaches policy, Bridge or the ledger. */
const PROBE_PAYLOAD = JSON.stringify({ hook_event_name: "PreToolUse", amc_probe: "invalid-on-purpose" });
const REINSTALL_COMMAND = "amc connect hooks install --provider claude-code --mode control --agent <agent>";

// Not verified against the settings reference for every Claude Code release; see docs/ADAPTERS.md.
const MANAGED_SETTINGS_PATHS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Library/Application Support/ClaudeCode/managed-settings.json",
  linux: "/etc/claude-code/managed-settings.json",
  win32: "C:\\Program Files\\ClaudeCode\\managed-settings.json",
};

function readJsonObject(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function installedControlHandler(workspace: string): InstalledCommandHandler | null {
  const settings = readJsonObject(join(workspace, ".claude", "settings.local.json"));
  const hooks = settings?.hooks as Record<string, unknown> | undefined;
  const groups = Array.isArray(hooks?.PreToolUse) ? hooks.PreToolUse as Array<{ hooks?: unknown }> : [];
  const statusMessage = `AMC Control [${HOOK_CONTROL_INTEGRATION_ID}]`;
  for (const group of groups) {
    for (const handler of Array.isArray(group?.hooks) ? group.hooks as Array<Record<string, unknown>> : []) {
      if (handler?.statusMessage !== statusMessage) continue;
      return {
        command: typeof handler.command === "string" ? handler.command : "",
        args: Array.isArray(handler.args) ? handler.args.map(String) : [],
        timeoutSeconds: typeof handler.timeout === "number" && handler.timeout > 0 ? handler.timeout : 60,
      };
    }
  }
  return null;
}

function denies(stdout: string): boolean {
  try {
    const output = JSON.parse(stdout) as { hookSpecificOutput?: Record<string, unknown> };
    return output.hookSpecificOutput?.hookEventName === "PreToolUse"
      && output.hookSpecificOutput.permissionDecision === "deny";
  } catch {
    return false;
  }
}

/**
 * Spawns the installed Claude Code PreToolUse control handler in exec form (no shell), as Claude
 * Code does, with a payload the forwarder must reject. Passes only on exit 2 with a deny inside
 * the handler timeout.
 */
export function probeInstalledClaudeHook(input: { workspace: string }): Promise<ClaudeHookProbeResult> {
  const workspace = resolve(input.workspace);
  const handler = installedControlHandler(workspace);
  const result = (reason: ClaudeHookProbeReason, exitCode: number | null, durationMs: number): ClaudeHookProbeResult =>
    ({ ok: reason === "ok", reason, exitCode, durationMs });
  if (!handler) return Promise.resolve(result("not_installed", null, 0));
  const script = handler.args[0];
  if (!isAbsolute(handler.command) || !existsSync(handler.command) || (script !== undefined && !(isAbsolute(script) && existsSync(script)))) {
    return Promise.resolve(result("command_missing", null, 0));
  }
  const started = Date.now();
  return new Promise((resolvePromise) => {
    let stdout = "";
    let settled = false;
    const finish = (reason: ClaudeHookProbeReason, exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result(reason, exitCode, Date.now() - started));
    };
    const child = spawn(handler.command, handler.args, {
      cwd: workspace,
      shell: false,
      env: { ...process.env, CLAUDE_PROJECT_DIR: workspace },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish("timed_out", null);
    }, handler.timeoutSeconds * 1000);
    child.on("error", () => finish("spawn_failed", null));
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stdin.on("error", () => { /* reported through the child's own error or exit */ });
    child.stdin.end(PROBE_PAYLOAD);
    child.on("close", (code) => {
      if (code !== 2) finish("not_blocking", code);
      else finish(denies(stdout) ? "ok" : "invalid_output", code);
    });
  });
}

/** Settings that switch every hook off, which no probe of the handler itself can see. */
export function claudeHookSettingsFindings(input: { workspace: string; home?: string }): { blockers: string[]; notes: string[] } {
  const workspace = resolve(input.workspace);
  const blockers: string[] = [];
  const notes: string[] = [];
  const scoped = [
    join(input.home ?? homedir(), ".claude", "settings.json"),
    join(workspace, ".claude", "settings.json"),
    join(workspace, ".claude", "settings.local.json"),
  ];
  for (const path of scoped) {
    if (readJsonObject(path)?.disableAllHooks === true) blockers.push(`disableAllHooks is true in ${path}`);
  }
  const managedPath = MANAGED_SETTINGS_PATHS[process.platform];
  const managed = managedPath && existsSync(managedPath) ? readJsonObject(managedPath) : null;
  if (!managed) {
    notes.push("managed settings not checked");
  } else {
    if (managed.disableAllHooks === true) blockers.push(`disableAllHooks is true in ${managedPath}`);
    if (managed.allowManagedHooksOnly === true) blockers.push(`allowManagedHooksOnly is true in ${managedPath}`);
  }
  return { blockers, notes };
}

/** Control counts as verified only after the installed command ran and denied, and no setting disables hooks. */
export async function verifyClaudeControl(input: { workspace: string; home?: string }): Promise<ClaudeControlVerification> {
  const probe = await probeInstalledClaudeHook(input);
  const settings = claudeHookSettingsFindings(input);
  const notes = [...settings.notes];
  if (probe.reason === "command_missing") {
    notes.push(`stale: the installed Node or AMC CLI path no longer exists; re-install with ${REINSTALL_COMMAND}`);
  }
  const verified = probe.ok && settings.blockers.length === 0;
  const reason = !probe.ok ? probe.reason : settings.blockers[0]?.split(" ")[0];
  return {
    verified,
    summary: verified
      ? `Control: verified (probe denied in ${probe.durationMs} ms)`
      : `Control: NOT VERIFIED (${reason})`,
    probe,
    settingsBlockers: settings.blockers,
    notes,
  };
}
