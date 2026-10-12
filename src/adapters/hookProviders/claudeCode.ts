/**
 * Claude Code specifics of AMC's hook integration (P1-23), confirmed against Claude Code 2.1.296 and its hooks
 * reference (docs/source-reviews/P1-23-claude-code-hooks.md): the pinned contract and qualified versions, the hook
 * payloads AMC accepts, where Claude Code's file tools open a path, the configuration AMC protects, the Claude Code
 * install a control installation binds, and the scan of the settings files whose hooks Claude Code runs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { cachedFileSha256 } from "../pi/piInstall.js";
import { inWorkspace, realLocation } from "../pi/piPaths.js";

export const CLAUDE_CODE_HOOK_SOURCE = {
  provider: "claude-code",
  contract: "Claude Code command hooks: tool lifecycle, SessionStart, UserPromptSubmit and Stop",
  url: "https://code.claude.com/docs/en/hooks.md",
  reference: "sha256:31754d5adce5052af35acf85dc2ed207bb082b7dbf87f25218047b10a024a073",
} as const;

/** Releases that passed tests/conformance/claudeCodeHooks.conformance.test.ts; add one only with a passing receipt. */
export const QUALIFIED_CLAUDE_CODE_VERSIONS: readonly string[] = ["2.1.296"];
/** The markers of AMC's handlers (HOOK_INTEGRATION_ID, HOOK_CONTROL_INTEGRATION_ID). Literal: the bridge loads this module. */
export const CLAUDE_STATUS_MESSAGE = "AMC Observe [amc-observe-v1]";
export const CLAUDE_CONTROL_STATUS_MESSAGE = "AMC Control [amc-control-v1]";
/** The hooks a control installation adds to PreToolUse, PostToolUse and PostToolUseFailure. */
export const CLAUDE_SESSION_HOOKS = ["SessionStart", "Stop", "UserPromptSubmit"] as const;
/** File-based managed settings (managed-settings.json plus managed-settings.d/*.json), per the managed settings docs. */
export const CLAUDE_MANAGED_SETTINGS_DIRS: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Library/Application Support/ClaudeCode",
  linux: "/etc/claude-code",
  win32: "C:\\Program Files\\ClaudeCode",
};
/** Hook events whose handlers can replace a tool's input (`updatedInput`) after AMC decided on it. */
const INPUT_REWRITING_EVENTS = new Set(["PreToolUse", "PermissionRequest"]);

const id = z.string().min(1).max(256);
const path = z.string().min(1).max(4096);
/** The common input fields of the pinned release. Every payload AMC reads is strict: an unknown field is refused. */
const common = {
  session_id: id, transcript_path: path.optional(), cwd: path, prompt_id: id.optional(), permission_mode: z.string().max(64).optional(),
  scratchpad_dir: path.optional(), effort: z.strictObject({ level: z.string().max(32) }).optional(), agent_id: id.optional(),
  agent_type: z.string().max(256).optional(),
};
const tool = { tool_name: z.string().min(1).max(512), tool_input: z.record(z.string(), z.unknown()), tool_use_id: z.string().min(1).max(160),
  mcp_server: z.strictObject({ name: z.string().max(512), source: z.string().max(64) }).optional() };
/** What AMC's forwarder adds to a PreToolUse payload: a fresh nonce, so each decision is single-use. */
export const claudeControlNonceSchema = z.strictObject({ nonce: z.string().min(16).max(128) });

export const claudeHookPayloadSchema = z.discriminatedUnion("hook_event_name", [
  z.strictObject({ ...common, hook_event_name: z.literal("PreToolUse"), ...tool }),
  z.strictObject({ ...common, hook_event_name: z.literal("PostToolUse"), ...tool, tool_response: z.unknown(), duration_ms: z.number().optional() }),
  z.strictObject({ ...common, hook_event_name: z.literal("PostToolUseFailure"), ...tool, error: z.string(), is_interrupt: z.boolean().optional(),
    duration_ms: z.number().optional() }),
  z.strictObject({ ...common, hook_event_name: z.literal("SessionStart"), source: z.enum(["startup", "resume", "clear", "compact", "fork"]),
    model: z.string().max(256).optional(), session_title: z.string().max(1024).optional(), seconds_since_last_response: z.number().optional(),
    context_tokens: z.number().optional(), prompt_cache_likely_expired: z.boolean().optional(), estimated_cache_write_usd: z.number().optional() }),
  z.strictObject({ ...common, hook_event_name: z.literal("UserPromptSubmit"), prompt: z.string(), session_title: z.string().max(1024).optional() }),
  z.strictObject({ ...common, hook_event_name: z.literal("Stop"), stop_hook_active: z.boolean(), last_assistant_message: z.string().optional(),
    background_tasks: z.array(z.unknown()).optional(), session_crons: z.array(z.unknown()).optional() }),
]);
export type ClaudeHookPayload = z.infer<typeof claudeHookPayloadSchema>;
/** The PreToolUse request AMC's forwarder sends to the control route: Claude Code's payload plus `amc.nonce`. */
export const claudeControlRequestSchema = z.strictObject({ ...common, hook_event_name: z.literal("PreToolUse"), ...tool, amc: claudeControlNonceSchema });

/** AMC's action id for one Claude Code tool call, derived from the session and tool_use_id (ids repeat across sessions). */
export function claudeActionId(sessionId: string, toolUseId: string): string {
  return `cc.${sha256Hex(`${sessionId}\0${toolUseId}`).slice(0, 40)}`;
}

/** The digest of a Claude Code session id a registration records; the raw id is not stored. */
export function claudeSessionSha256(sessionId: string): string {
  return sha256Hex(`claude-code\0${sessionId}`);
}

/**
 * Where Claude Code opens an absolute `path` (its file tools expand `~` and relative paths before hooks run), followed
 * through symlinks with the case the file system stores and named inside the workspace when it lies there. Null for
 * a form AMC cannot resolve as the OS does: not absolute, `.` or `..` segments, a trailing separator, a dangling link,
 * any path on Windows.
 */
export function claudeFileLocation(value: unknown, workspace: string): string | null {
  if (process.platform === "win32" || typeof value !== "string" || !isAbsolute(value) || normalize(value) !== value
    || (value.length > 1 && value.endsWith(sep))) return null;
  const real = realLocation(value);
  return real === null ? null : inWorkspace(real, workspace);
}

/** A glob that stays under the directory it searches: not absolute, no `~`, no `..` segment. */
function containedGlob(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && !isAbsolute(value) && !value.startsWith("~")
    && !value.split(/[\\/]/).includes(".."));
}

/** The canonical ToolHub request for a Claude Code file or fetch tool, or null (unmapped or unresolvable: denied). */
export function claudeToolRequest(toolName: string, input: Record<string, unknown>, workspace: string, cwd: string):
  { name: "fs.read" | "fs.write" | "http.fetch"; args: Record<string, unknown> } | null {
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
    const location = claudeFileLocation(input.file_path, workspace);
    return location ? { name: toolName === "Read" ? "fs.read" : "fs.write", args: { path: location } } : null;
  }
  if (toolName === "Glob" || toolName === "Grep") {
    if (!containedGlob(toolName === "Glob" ? input.pattern : input.glob)) return null;
    const location = claudeFileLocation(input.path ?? cwd, workspace);
    return location ? { name: "fs.read", args: { path: location } } : null;
  }
  if (toolName === "WebFetch" && typeof input.url === "string" && input.url.length > 0) {
    return { name: "http.fetch", args: { url: input.url, method: "GET" } };
  }
  return null;
}

/**
 * Why AMC refuses a Claude Code call before mapping it: a working directory outside the workspace, or a Write or Edit
 * of AMC's hook configuration (`.claude/settings*.json` anywhere, the workspace's `.amc/`). Claude Code's own users can
 * still edit these files outside Claude Code, and a Bash command can write them unless its plan is denied.
 */
export function claudeCodeRefusal(cwd: string, workspace: string, toolName: string, input: Record<string, unknown>): string | null {
  const realCwd = isAbsolute(cwd) ? realLocation(cwd) : null;
  const realWorkspace = realLocation(resolve(workspace));
  const rel = realCwd === null || realWorkspace === null ? ".." : relative(realWorkspace, realCwd);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return "Claude Code's working directory is outside this AMC workspace, so AMC cannot resolve its paths; control denies the call.";
  }
  if (toolName !== "Write" && toolName !== "Edit") return null;
  const location = claudeFileLocation(input.file_path, workspace);
  if (location === null) return null;
  const amc = relative(join(resolve(workspace), ".amc"), location);
  const settings = basename(dirname(location)).toLowerCase() === ".claude" && /^settings(\..*)?\.json$/i.test(basename(location));
  return settings || !(amc === ".." || amc.startsWith(`..${sep}`) || isAbsolute(amc)) ? "AMC protects its hook configuration." : null;
}

export const claudeCodeInstallSchema = z.strictObject({ binaryPath: z.string().min(1), version: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export type ClaudeCodeInstall = z.infer<typeof claudeCodeInstallSchema>;
/** What a Claude Code control manifest binds: AMC's forwarder entry and the Claude Code install sessions must run. */
export const claudeCodeBindingSchema = z.strictObject({
  forwarder: z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  install: claudeCodeInstallSchema.nullable(),
});
export type ClaudeCodeBinding = z.infer<typeof claudeCodeBindingSchema>;

/**
 * The Claude Code binary at `binaryPath` (symlinks followed) as installed now: its SHA-256 and the version it reports
 * with `--version`, or null. The version is read once, at install; later checks compare the digest only.
 */
export function measureClaudeCode(binaryPath: string): ClaudeCodeInstall | null {
  try {
    const real = realpathSync(binaryPath);
    const sha256 = cachedFileSha256(real);
    const out = execFileSync(real, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } });
    const version = /^(\d+\.\d+\.\d+) \(Claude Code\)\s*$/.exec(out)?.[1];
    return sha256 && version ? { binaryPath: real, version, sha256 } : null;
  } catch {
    return null;
  }
}

/** The `claude` a person running `claude` here gets: the first one on `searchPath`, or null. */
export function findClaudeCode(searchPath = process.env.PATH ?? ""): string | null {
  return searchPath.split(delimiter).filter(Boolean).map((dir) => join(dir, "claude")).find((candidate) => existsSync(candidate)) ?? null;
}

/** The executable of process `pid` (Claude Code's own CLAUDE_PID), symlinks followed, or null where AMC cannot read it. */
export function processExecutable(pid: number): string | null {
  try {
    if (!Number.isInteger(pid) || pid <= 1) return null;
    const named = process.platform === "linux" ? readlinkSync(`/proc/${pid}/exe`)
      : process.platform === "darwin" ? execFileSync("ps", ["-o", "comm=", "-p", String(pid)], { encoding: "utf8", timeout: 5_000 }).trim() : "";
    return isAbsolute(named) ? realpathSync(named) : null;
  } catch {
    return null;
  }
}

export interface ClaudeHookBinding { readonly eventName: string; readonly handlerSha256: string }
export interface ClaudeHookScan {
  /** Why Claude Code would not run exactly AMC's installed hooks and nothing that can rewrite a tool's input, or null. */
  readonly problem: string | null;
  /** All of AMC's handlers are delivered by file-based managed settings. */
  readonly managedDelivery: boolean;
  /** SHA-256 over every scanned path and its bytes' digest (null when absent). */
  readonly digest: string;
}

type Scope = "managed" | "user" | "project" | "local";

function settingsFiles(input: { workspace: string; userSettingsPath: string; managedDir: string | null }): Array<{ scope: Scope; path: string }> {
  const dropIns = input.managedDir === null ? [] : (() => {
    try {
      return readdirSync(join(input.managedDir, "managed-settings.d")).filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort()
        .map((name) => join(input.managedDir!, "managed-settings.d", name));
    } catch {
      return [];
    }
  })();
  return [
    ...(input.managedDir === null ? [] : [join(input.managedDir, "managed-settings.json")]).map((p) => ({ scope: "managed" as const, path: p })),
    ...dropIns.map((p) => ({ scope: "managed" as const, path: p })),
    { scope: "user", path: input.userSettingsPath },
    { scope: "project", path: join(input.workspace, ".claude", "settings.json") },
    { scope: "local", path: join(input.workspace, ".claude", "settings.local.json") },
  ];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Every handler of a settings document as [event, handler]; throws on a hooks block Claude Code would not read as written. */
function handlers(settings: Record<string, unknown>): Array<[string, unknown]> {
  if (settings.hooks === undefined) return [];
  if (!isObject(settings.hooks)) throw new Error("hooks is not an object");
  return Object.entries(settings.hooks).flatMap(([event, groups]) => {
    if (!Array.isArray(groups)) throw new Error(`hooks.${event} is not an array`);
    return groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) throw new Error(`a hooks.${event} group has no hooks array`);
      return group.hooks.map((handler) => [event, handler] as [string, unknown]);
    });
  });
}

/**
 * Reads the file-based settings Claude Code merges (managed, user, project, local; symlinks followed, as Claude Code
 * reads them) and checks that the hooks Claude Code runs include exactly the AMC handlers `bindings` names, no other
 * AMC-marked handler, and no PreToolUse or PermissionRequest handler of anyone else, which could replace the tool input
 * after AMC allowed it. `allowManagedHooksOnly`, or `disableAllHooks` outside managed settings, leaves only managed
 * hooks running. Not read: MDM profiles, registry policy, server-managed settings, plugins, skill and agent
 * frontmatter, `--settings` and SDK hooks.
 */
export function scanClaudeHookSettings(input: { workspace: string; userSettingsPath: string; managedDir: string | null;
  bindings: readonly ClaudeHookBinding[] }): ClaudeHookScan {
  const read = settingsFiles(input).map((file) => {
    try {
      const bytes = existsSync(file.path) ? readFileSync(file.path) : null;
      const value = bytes === null ? {} : JSON.parse(bytes.toString("utf8")) as unknown;
      return { ...file, sha256: bytes === null ? null : sha256Hex(bytes), value: isObject(value) ? value : null };
    } catch {
      return { ...file, sha256: "unreadable", value: null };
    }
  });
  const digest = sha256Hex(canonicalize(read.map(({ path: p, sha256 }) => [p, sha256])));
  const result = (problem: string | null, managedDelivery = false): ClaudeHookScan => ({ problem, managedDelivery, digest });
  const unreadable = read.find((file) => file.value === null);
  if (unreadable) return result(`Claude Code settings ${unreadable.path} cannot be read as a JSON object`);
  const managed = read.filter((file) => file.scope === "managed");
  if (managed.some((file) => file.value!.disableAllHooks === true)) return result("managed settings disable every hook");
  const othersRun = !managed.some((file) => file.value!.allowManagedHooksOnly === true)
    && !read.some((file) => file.scope !== "managed" && file.value!.disableAllHooks === true);
  const wanted = new Set(input.bindings.map((binding) => `${binding.eventName}\0${binding.handlerSha256}`));
  const seen = { all: new Set<string>(), managed: new Set<string>() };
  for (const file of othersRun ? read : managed) {
    let entries: Array<[string, unknown]>;
    try {
      entries = handlers(file.value!);
    } catch (error) {
      return result(`Claude Code settings ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const [event, handler] of entries) {
      const marker = isObject(handler) ? handler.statusMessage : undefined;
      if (marker === CLAUDE_STATUS_MESSAGE || marker === CLAUDE_CONTROL_STATUS_MESSAGE) {
        const key = `${event}\0${sha256Hex(canonicalize(handler))}`;
        if (!wanted.has(key)) return result(`an AMC ${event} hook in ${file.path} is not the one this installation wrote`);
        seen.all.add(key);
        if (file.scope === "managed") seen.managed.add(key);
      } else if (INPUT_REWRITING_EVENTS.has(event)) {
        return result(`a ${event} hook in ${file.path} that is not AMC's can replace a tool's input after AMC allows it`);
      }
    }
  }
  const missing = input.bindings.find((binding) => !seen.all.has(`${binding.eventName}\0${binding.handlerSha256}`));
  if (missing) return result(`AMC's ${missing.eventName} hook is not in the settings Claude Code runs`);
  return result(null, input.bindings.every((binding) => seen.managed.has(`${binding.eventName}\0${binding.handlerSha256}`)));
}
