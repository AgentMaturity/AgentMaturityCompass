import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { canonicalize } from "../utils/json.js";
import { expectedClaudeControlHandler, getHookIntegrationStatus, HOOK_CONTROL_INTEGRATION_ID } from "./hookIntegration.js";
import { CLAUDE_MANAGED_SETTINGS_DIRS } from "./hookProviders/claudeCode.js";

export type ClaudeHookProbeReason =
  | "ok"
  | "not_installed"
  | "command_missing"
  | "stale"
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
  /** null when the installation is not intact, so nothing was spawned. */
  probe: ClaudeHookProbeResult | null;
  settingsBlockers: string[];
  notes: string[];
}

interface InstalledCommandHandler {
  command: string;
  args: string[];
  timeoutSeconds: number;
  matcher: unknown;
  raw: Record<string, unknown>;
}

/** Fails input validation in the forwarder, so the probe never reaches policy, Bridge or the ledger. */
const PROBE_PAYLOAD = JSON.stringify({ hook_event_name: "PreToolUse", amc_probe: "invalid-on-purpose" });
const REINSTALL_COMMAND = "amc connect hooks install --provider claude-code --mode control --agent <agent>";

/** The file-based managed settings Claude Code merges: managed-settings.json, then managed-settings.d/*.json in name order. */
function managedSettingsFiles(managedDir: string | null): string[] {
  if (managedDir === null) return [];
  let dropIns: string[] = [];
  try {
    dropIns = readdirSync(join(managedDir, "managed-settings.d")).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort()
      .map((name) => join(managedDir, "managed-settings.d", name));
  } catch {
    // No drop-in directory.
  }
  return [join(managedDir, "managed-settings.json"), ...dropIns].filter((path) => existsSync(path));
}

/** Whether a managed settings document carries the exact PreToolUse control handler this AMC installs for the workspace. */
function deliversAmcControl(settings: Record<string, unknown>, workspace: string): boolean {
  try {
    const expected = canonicalize(expectedClaudeControlHandler(workspace));
    const groups = (settings.hooks as Record<string, unknown> | undefined)?.PreToolUse;
    return Array.isArray(groups) && groups.some((group) => Array.isArray((group as { hooks?: unknown })?.hooks)
      && ((group as { hooks: unknown[] }).hooks).some((handler) => canonicalize(handler) === expected));
  } catch {
    return false;
  }
}

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
  const groups = Array.isArray(hooks?.PreToolUse) ? hooks.PreToolUse as Array<{ matcher?: unknown; hooks?: unknown }> : [];
  const statusMessage = `AMC Control [${HOOK_CONTROL_INTEGRATION_ID}]`;
  for (const group of groups) {
    for (const handler of Array.isArray(group?.hooks) ? group.hooks as Array<Record<string, unknown>> : []) {
      if (handler?.statusMessage !== statusMessage) continue;
      return {
        command: typeof handler.command === "string" ? handler.command : "",
        args: Array.isArray(handler.args) ? handler.args.map(String) : [],
        timeoutSeconds: typeof handler.timeout === "number" && handler.timeout > 0 ? handler.timeout : 60,
        matcher: group.matcher,
        raw: handler,
      };
    }
  }
  return null;
}

/**
 * True only for the exact handler and matcher this AMC would install for the signed manifest:
 * its own Node executable, its own CLI script and the forward argv. A signature over the
 * manifest only shows the workspace's keys wrote it, and those keys can come with the workspace.
 */
function isAmcInstalledHandler(workspace: string, handler: InstalledCommandHandler): boolean {
  try {
    return handler.matcher === "*" && canonicalize(handler.raw) === canonicalize(expectedClaudeControlHandler(workspace));
  } catch {
    return false;
  }
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
 * the handler timeout. Any handler other than the one this AMC would install is reported stale
 * and never spawned.
 */
export function probeInstalledClaudeHook(input: { workspace: string }): Promise<ClaudeHookProbeResult> {
  const workspace = resolve(input.workspace);
  const handler = installedControlHandler(workspace);
  const result = (reason: ClaudeHookProbeReason, exitCode: number | null, durationMs: number): ClaudeHookProbeResult =>
    ({ ok: reason === "ok", reason, exitCode, durationMs });
  if (!handler) return Promise.resolve(result("not_installed", null, 0));
  // Gate first, so no path a foreign handler names is even looked at.
  if (!isAmcInstalledHandler(workspace, handler)) return Promise.resolve(result("stale", null, 0));
  const script = handler.args[0];
  if (!isAbsolute(handler.command) || !existsSync(handler.command) || script === undefined || !(isAbsolute(script) && existsSync(script))) {
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
      // The caller's own environment, as Claude Code passes its own; only AMC's forwarder gets it.
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

/**
 * Settings that switch AMC's hook off, which no probe of the handler itself can see. `allowManagedHooksOnly` is a
 * blocker unless file-based managed settings deliver AMC's own control handler (the enterprise path). MDM profiles,
 * registry policy and server-managed settings are not read.
 */
export function claudeHookSettingsFindings(input: { workspace: string; home?: string; managedDir?: string | null }): { blockers: string[]; notes: string[] } {
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
  const managedFiles = managedSettingsFiles(input.managedDir === undefined ? CLAUDE_MANAGED_SETTINGS_DIRS[process.platform] ?? null : input.managedDir);
  if (managedFiles.length === 0) notes.push("no file-based managed settings found; MDM, registry and server-managed settings are not checked");
  const managed = managedFiles.map((path) => ({ path, value: readJsonObject(path) }));
  const delivered = managed.some(({ value }) => value !== null && deliversAmcControl(value, workspace));
  for (const { path, value } of managed) {
    if (value === null) blockers.push(`managed settings ${path} cannot be read as a JSON object`);
    if (value?.disableAllHooks === true) blockers.push(`disableAllHooks is true in ${path}`);
    if (value?.allowManagedHooksOnly === true && !delivered) blockers.push(`allowManagedHooksOnly is true in ${path}, and managed settings do not deliver AMC's hooks`);
  }
  if (delivered) notes.push("AMC's control hook is delivered by file-based managed settings");
  return { blockers, notes };
}

function installState(workspace: string): string {
  try {
    return getHookIntegrationStatus({ workspace, provider: "claude-code" }).state;
  } catch {
    return "invalid";
  }
}

/**
 * Control counts as verified only after the installed command ran and denied, and no setting
 * disables hooks. The probe runs only when the provider config still matches the signed manifest
 * (matcher, command and args included) and the handler is exactly the one this AMC installs, so a
 * drifted, tampered or foreign handler is never spawned.
 */
export async function verifyClaudeControl(input: { workspace: string; home?: string }): Promise<ClaudeControlVerification> {
  const state = installState(resolve(input.workspace));
  const probe = state === "installed" ? await probeInstalledClaudeHook(input) : null;
  const settings = claudeHookSettingsFindings(input);
  const notes = [...settings.notes];
  if (probe?.reason === "command_missing") {
    notes.push(`stale: the installed Node or AMC CLI path no longer exists; re-install with ${REINSTALL_COMMAND}`);
  }
  if (probe?.reason === "stale") {
    notes.push(`stale: the installed handler is not the one this AMC installs for the signed manifest, so it was not run; re-install with ${REINSTALL_COMMAND}`);
  }
  const verified = probe?.ok === true && settings.blockers.length === 0;
  const reason = !probe ? state : !probe.ok ? probe.reason : settings.blockers[0]?.split(" ")[0];
  return {
    verified,
    summary: verified && probe
      ? `Control: verified (probe denied in ${probe.durationMs} ms)`
      : `Control: NOT VERIFIED (${reason})`,
    probe,
    settingsBlockers: settings.blockers,
    notes,
  };
}
