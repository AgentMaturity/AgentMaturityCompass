/**
 * Claude Code specifics of AMC's hook integration (P1-23), confirmed against Claude Code 2.1.296 and its hooks
 * reference (docs/source-reviews/P1-23-claude-code-hooks.md): the pinned contract and qualified versions, the hook
 * payloads AMC accepts, where Claude Code's file tools open a path, the configuration AMC protects, the Claude Code
 * install a control installation binds, and the scan of the settings files whose hooks Claude Code runs.
 */
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { existsSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { cachedFileSha256 } from "../pi/piInstall.js";
import { inWorkspace, realLocation } from "../pi/piPaths.js";
import { CLAUDE_HOOK_SCHEMAS } from "./claudeCodePayloads.js";

export const CLAUDE_CODE_HOOK_SOURCE = {
  provider: "claude-code",
  contract: "Claude Code command hooks: tool lifecycle, SessionStart, UserPromptSubmit and Stop",
  url: "https://code.claude.com/docs/en/hooks.md",
  reference: "sha256:31754d5adce5052af35acf85dc2ed207bb082b7dbf87f25218047b10a024a073",
} as const;

/**
 * Releases that passed tests/conformance/claudeCodeHooks.conformance.test.ts, each with its own payload schemas
 * (claudeCodePayloads.ts); add one only with a passing receipt.
 */
export const QUALIFIED_CLAUDE_CODE_VERSIONS: readonly string[] = Object.keys(CLAUDE_HOOK_SCHEMAS);
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
/**
 * Hook events whose handlers can change what an allowed call does after AMC decided on it: PreToolUse and
 * PermissionRequest return `updatedInput`; SessionStart, Setup, CwdChanged and FileChanged write CLAUDE_ENV_FILE, which
 * Claude Code runs as shell code before every Bash command.
 */
const CALL_CHANGING_EVENTS = new Set(["PreToolUse", "PermissionRequest", "SessionStart", "Setup", "CwdChanged", "FileChanged"]);

/** AMC's action id for one Claude Code tool call, derived from the session and tool_use_id (ids repeat across sessions). */
export function claudeActionId(sessionId: string, toolUseId: string): string {
  return `cc.${sha256Hex(`${sessionId}\0${toolUseId}`).slice(0, 40)}`;
}

/** The digest of a Claude Code session id a registration records; the raw id is not stored. */
export function claudeSessionSha256(sessionId: string): string {
  return sha256Hex(`claude-code\0${sessionId}`);
}

/**
 * The one resolver every Claude Code path check uses: `~` and a path relative to `cwd` expanded, then followed through
 * symlinks with the case the file system stores and named inside the workspace when it lies there. Null for a value
 * that is not NFC, holds a control character, or cannot be resolved as the OS would (a dangling link, any path on Windows).
 */
function claudeResolvePath(value: string, workspace: string, cwd: string): string | null {
  if (process.platform === "win32" || value.length === 0 || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const expanded = value === "~" ? homedir() : value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
  const real = realLocation(normalize(isAbsolute(expanded) ? expanded : join(cwd, expanded)));
  return real === null ? null : inWorkspace(real, workspace);
}

/**
 * Where Claude Code opens an absolute `path` (its file tools expand `~` and relative paths before hooks run), through
 * claudeResolvePath, for a value in its one canonical spelling: absolute, no `.` or `..` segment, no repeated or
 * trailing separator. Null otherwise (the call is then unmapped and denied).
 */
function claudeFileLocation(value: unknown, workspace: string): string | null {
  if (typeof value !== "string" || !isAbsolute(value) || normalize(value) !== value || (value.length > 1 && value.endsWith(sep))) return null;
  return claudeResolvePath(value, workspace, "/");
}

/** A glob that stays under the directory it searches: not absolute, no `~`, no `..` anywhere (a brace alternative included), no escape. */
function containedGlob(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && !isAbsolute(value) && !value.startsWith("~") && !value.includes("..")
    && !/[\\\u0000-\u001f]/.test(value));
}

/**
 * The only Bash form AMC can prove the shell runs as written: single-quoted words separated by one space, the first an
 * absolute path. Quoting stops alias and global-alias expansion and every other expansion; a command name with a slash
 * is never looked up as a function or on PATH. Anything else (compound commands, subshells, heredocs, `$()`,
 * backticks, `;`, `&&`, `|`, assignments, bare names that could be aliases) is not classified and is denied.
 */
const PURE_BASH = /^'\/[^'\u0000-\u001f\u007f]*'(?: '[^'\u0000-\u001f\u007f]*')*$/;

/**
 * A word AMC classifies, as bash passes it to the program (single quotes removed; inside them bash changes nothing):
 * printable ASCII with none of `\\ $ \` * ? [ ] { }`, and `~` only first. A program can read escapes, patterns, braces
 * or a tilde itself; a non-ASCII character can be a lookalike. Any other word is not classified, so the command is denied.
 */
const PLAIN_WORD = /^~?[\x20-\x7e]*$/;
const NOT_PLAIN = /[\\$`*?[\]{}]|.~/;

/** The binary (where it really opens) and argv of a pure-form Bash command, or null. */
function claudePureBash(command: unknown, workspace: string): { binary: string; argv: string[] } | null {
  // One spelling: a command that is not NFC could name a binary or argument other than the one AMC evaluates.
  if (typeof command !== "string" || command.normalize("NFC") !== command || !PURE_BASH.test(command)) return null;
  // The one tokenizer: the words exactly as bash passes them; every later check (AMC's files included) reads these.
  const [first, ...argv] = command.slice(1, -1).split("' '");
  if (![first!, ...argv].every((word) => PLAIN_WORD.test(word) && !NOT_PLAIN.test(word))) return null;
  const binary = claudeFileLocation(first, workspace);
  return binary ? { binary, argv } : null;
}

/**
 * Whether `value` is an http(s) URL written exactly as the URL parser serializes it, every percent-encoding in upper
 * case and none for an unreserved character: one URL, one spelling, so ToolHub's rules see what Claude Code fetches.
 */
function canonicalUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.href === value && (url.protocol === "http:" || url.protocol === "https:")
      && (value.match(/%[0-9A-Fa-f]{2}/g) ?? []).every((code) => code === code.toUpperCase()
        && !/[A-Za-z0-9\-._~]/.test(String.fromCharCode(Number.parseInt(code.slice(1), 16))));
  } catch {
    return false;
  }
}

/** The canonical ToolHub request for a Claude Code file, fetch or pure-form Bash call, or null (unmapped or unresolvable: denied). */
export function claudeToolRequest(toolName: string, input: Record<string, unknown>, workspace: string, cwd: string):
  { name: "fs.read" | "fs.write" | "http.fetch" | "process.spawn"; args: Record<string, unknown> } | null {
  if (toolName === "Bash") {
    const pure = claudePureBash(input.command, workspace);
    return pure ? { name: "process.spawn", args: pure } : null;
  }
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
    const location = claudeFileLocation(input.file_path, workspace);
    return location ? { name: toolName === "Read" ? "fs.read" : "fs.write", args: { path: location } } : null;
  }
  if (toolName === "Glob" || toolName === "Grep") {
    if (!containedGlob(toolName === "Glob" ? input.pattern : input.glob)) return null;
    const location = claudeFileLocation(input.path ?? cwd, workspace);
    return location ? { name: "fs.read", args: { path: location } } : null;
  }
  if (toolName === "WebFetch" && canonicalUrl(input.url)) {
    return { name: "http.fetch", args: { url: input.url, method: "GET" } };
  }
  return null;
}

/**
 * A path segment in the form AMC compares: NFKC (full-width and other compatibility lookalikes), case-folded (macOS and
 * Windows volumes are case-insensitive by default), trailing dots and spaces dropped (Windows drops them).
 */
const fold = (segment: string) => segment.normalize("NFKC").toLowerCase().replace(/[. ]+$/, (dots) => (segment === "." || segment === ".." ? dots : ""));
const foldPath = (path: string) => path.split(sep).map(fold).join(sep);
const within = (root: string, location: string) => {
  const rel = relative(foldPath(root), foldPath(location));
  return rel === "" || !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
};

/** Whether a resolved `location` is in the workspace's `.amc` or is a Claude Code settings file (`.claude/settings*.json`). */
function amcFile(location: string, workspace: string): boolean {
  return within(join(resolve(workspace), ".amc"), location)
    || (fold(basename(dirname(location))) === ".claude" && /^settings(\..*)?\.json$/.test(fold(basename(location))));
}

/**
 * Whether a resolved Grep or Glob search root reaches AMC's files: it is in, or holds, the workspace's `.amc` or `.claude`
 * or the user's `~/.claude`. Claude Code 2.1.296 searches hidden directories (ripgrep `--hidden`; Glob also
 * `--no-ignore`), so a search of the workspace root would read AMC's hook lease.
 */
function searchReachesAmc(root: string, workspace: string): boolean {
  const ws = resolve(workspace);
  // Each directory in the workspace's form and in its real form: a root outside the workspace comes back as a real path.
  return [join(ws, ".amc"), join(ws, ".claude"), join(homedir(), ".claude")].flatMap((dir) => [dir, realLocation(dir) ?? dir])
    .some((dir) => within(dir, root) || within(root, dir));
}

/**
 * AMC's names anywhere inside a word, after a prefix (`@.amc/…`, `-f.amc/…`, `-C.amc`) or before any character that is
 * not a letter or digit: `.amc`, `.claude/settings`, and a `.lease` file. Matched on the NFKC, case-folded word.
 */
const AMC_NAMES_IN_WORD = /\.amc(?![\p{L}\p{N}])|\.claude[\\/]+settings|\.lease(?![\p{L}\p{N}])/u;

/**
 * Whether a pure-form Bash word names AMC's files: it holds one of AMC_NAMES_IN_WORD, or the word (or the value after
 * its `=`) resolved by claudeResolvePath from `cwd` is in `.amc` or is a settings file (a symlink to them included).
 */
function bashWordNamesAmc(word: string, workspace: string, cwd: string): boolean {
  if (AMC_NAMES_IN_WORD.test(word.normalize("NFKC").toLowerCase())) return true;
  return [word, ...(word.includes("=") ? [word.slice(word.indexOf("=") + 1)] : [])].some((value) => {
    const location = claudeResolvePath(value, workspace, cwd);
    return location !== null && amcFile(location, workspace);
  });
}

/**
 * Why AMC refuses a Claude Code call before mapping it: a working directory outside the workspace, a form AMC cannot
 * prove, or a call that names or searches AMC's files (`.amc`, the hook lease, `.claude/settings*.json`): Read of
 * `.amc`, a Grep or Glob root that reaches them, a Bash word that names them, a Write or Edit of either. A Bash command
 * can still reach them through a path it does not name (`'/usr/bin/find' '.'`); this is not OS containment.
 */
export function claudeCodeRefusal(cwd: string, workspace: string, toolName: string, input: Record<string, unknown>): string | null {
  const realCwd = isAbsolute(cwd) && normalize(cwd) === cwd && cwd.normalize("NFC") === cwd ? realLocation(cwd) : null;
  const realWorkspace = realLocation(resolve(workspace));
  const rel = realCwd === null || realWorkspace === null ? ".." : relative(realWorkspace, realCwd);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return "Claude Code's working directory is outside this AMC workspace, so AMC cannot resolve its paths; control denies the call.";
  }
  if (toolName === "Bash") {
    const pure = claudePureBash(input.command, workspace);
    if (!pure) {
      return "AMC allows a Claude Code Bash command only in its pure form ('/absolute/binary' 'arg' …, single-quoted words, no shell syntax); AMC cannot prove what this one runs, so AMC denied it.";
    }
    if ([pure.binary, ...pure.argv].some((word) => bashWordNamesAmc(word, workspace, realCwd!))) return "AMC protects its hook configuration.";
  }
  if ((toolName === "Glob" && !containedGlob(input.pattern)) || (toolName === "Grep" && !containedGlob(input.glob))) {
    return "AMC denies a glob that could leave the directory it searches (absolute, `~`, `..` or an escape), so AMC denied the call.";
  }
  if (toolName === "WebFetch" && !canonicalUrl(input.url)) {
    return "AMC accepts a WebFetch URL only in its canonical form (as the URL parser writes it), so AMC denied the call.";
  }
  // AMC's own state (its hook lease, ledger and keys) is neither read nor written from a governed session.
  const raw = toolName === "Glob" || toolName === "Grep" ? input.path ?? cwd : input.file_path;
  const location = typeof raw === "string" ? claudeResolvePath(raw, workspace, realCwd!) : null;
  if (location === null) return null;
  if (toolName === "Read" && within(join(resolve(workspace), ".amc"), location)) return "AMC protects its hook configuration.";
  if ((toolName === "Glob" || toolName === "Grep") && searchReachesAmc(location, workspace)) return "AMC protects its hook configuration.";
  return (toolName === "Write" || toolName === "Edit") && amcFile(location, workspace) ? "AMC protects its hook configuration." : null;
}

const claudeCodeInstallSchema = z.strictObject({ binaryPath: z.string().min(1), version: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
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

/** Markdown files under `root`, at most `depth` directories deep and MAX_HOOK_SOURCES in all. A directory AMC cannot list throws. */
const MAX_HOOK_SOURCES = 1_000;
function markdownFiles(root: string, depth: number, found: string[] = []): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    if (found.length >= MAX_HOOK_SOURCES) break;
    const path = join(root, entry.name);
    if (entry.isDirectory() && depth > 0) markdownFiles(path, depth - 1, found);
    else if (entry.name.toLowerCase().endsWith(".md")) found.push(path);
  }
  return found;
}

/** Whether a skill or agent file's frontmatter declares hooks; one AMC cannot read or parse counts as declaring them. */
function frontmatterHooks(path: string): boolean {
  try {
    const text = readFileSync(path, "utf8");
    if (!text.startsWith("---")) return false;
    const end = text.indexOf("\n---", 3);
    const value = YAML.parse(text.slice(3, end < 0 ? undefined : end)) as unknown;
    return isObject(value) && value.hooks !== undefined && value.hooks !== null;
  } catch {
    return true;
  }
}

/** The skill and agent files Claude Code reads for a session: under the project's `.claude` and the user's configuration directory. */
function hookSourceFiles(workspace: string, configDir: string): string[] {
  return [join(resolve(workspace), ".claude"), configDir].flatMap((dir) => [...markdownFiles(join(dir, "skills"), 2), ...markdownFiles(join(dir, "agents"), 2)]);
}

/** A digest of those files' identities (path, device, inode, size, times): any added, removed or changed file changes it. */
function hookSourcesDigest(files: readonly string[]): string {
  return sha256Hex(canonicalize(files.map((file) => {
    try {
      const stat = statSync(file);
      return [file, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
    } catch {
      return [file, "unreadable"];
    }
  })));
}

/**
 * Why a Claude Code session may run hooks AMC did not install, beyond its settings files, and the digest of its skill and
 * agent files: a skill or agent whose frontmatter declares hooks (in the project's `.claude` or the user's configuration
 * directory), a directory AMC cannot list, or (with `pid`) a process started with `--settings` or `--plugin-dir` or
 * whose arguments AMC cannot read. Not needed when Claude Code runs only managed hooks.
 */
export function claudeSessionHookSources(input: { workspace: string; configDir: string; pid?: number }): { problem: string | null; digest: string } {
  let files: string[];
  try {
    files = hookSourceFiles(input.workspace, input.configDir);
  } catch (error) {
    return { problem: `AMC cannot list this session's skills or agents (${error instanceof Error ? error.message : String(error)})`, digest: "" };
  }
  const digest = hookSourcesDigest(files);
  const result = (problem: string | null) => ({ problem, digest });
  const declared = files.find(frontmatterHooks);
  if (declared) return result(`the skill or agent ${declared} declares hooks AMC did not install`);
  if (input.pid === undefined) return result(null);
  let args: string;
  try {
    args = process.platform === "linux" ? readFileSync(`/proc/${input.pid}/cmdline`, "utf8").split("\0").join(" ")
      : execFileSync("ps", ["-o", "args=", "-p", String(input.pid)], { encoding: "utf8", timeout: 5_000 });
  } catch {
    return result("AMC cannot read this Claude Code process's arguments");
  }
  return result(/(^|\s)--(settings|plugin-dir)(=|\s|$)/.test(args) ? "this Claude Code process was started with --settings or --plugin-dir, which can add hooks AMC did not install" : null);
}

/** The digest of a session's skill and agent files now, or null when AMC cannot list them: compared with the registered one at every decision. */
export function claudeHookSourcesDigest(workspace: string, configDir: string): string | null {
  try {
    return hookSourcesDigest(hookSourceFiles(workspace, configDir));
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
  /** Claude Code runs only managed hooks (managed `allowManagedHooksOnly`, or `disableAllHooks` outside managed settings). */
  readonly foreignHooksBlocked: boolean;
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

/** Every handler of a settings document as [event, handler, its group's matcher]; throws on a hooks block Claude Code would not read as written. */
function handlers(settings: Record<string, unknown>): Array<[string, unknown, unknown]> {
  if (settings.hooks === undefined) return [];
  if (!isObject(settings.hooks)) throw new Error("hooks is not an object");
  return Object.entries(settings.hooks).flatMap(([event, groups]) => {
    if (!Array.isArray(groups)) throw new Error(`hooks.${event} is not an array`);
    return groups.flatMap((group) => {
      if (!isObject(group) || !Array.isArray(group.hooks)) throw new Error(`a hooks.${event} group has no hooks array`);
      return group.hooks.map((handler) => [event, handler, group.matcher] as [string, unknown, unknown]);
    });
  });
}

/**
 * Reads the file-based settings Claude Code merges (managed, user, project, local; symlinks followed, as Claude Code
 * reads them) and checks that the hooks Claude Code runs include exactly the AMC handlers `bindings` names, no other
 * AMC-marked handler, and no PreToolUse or PermissionRequest handler of anyone else, which could replace the tool input
 * after AMC allowed it. `allowManagedHooksOnly`, or `disableAllHooks` outside managed settings, leaves only managed
 * hooks running. Any enabled plugin (`enabledPlugins`) is refused: its hooks run beside AMC's. Not read here: MDM
 * profiles, registry policy, server-managed settings and SDK hooks; skill and agent frontmatter and the process's
 * `--settings` and `--plugin-dir` are checked at registration (claudeSessionHookSources).
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
  let foreignHooksBlocked = false;
  const result = (problem: string | null, managedDelivery = false): ClaudeHookScan => ({ problem, managedDelivery, digest, foreignHooksBlocked });
  const unreadable = read.find((file) => file.value === null);
  if (unreadable) return result(`Claude Code settings ${unreadable.path} cannot be read as a JSON object`);
  const managed = read.filter((file) => file.scope === "managed");
  if (managed.some((file) => file.value!.disableAllHooks === true)) return result("managed settings disable every hook");
  const othersRun = !managed.some((file) => file.value!.allowManagedHooksOnly === true)
    && !read.some((file) => file.scope !== "managed" && file.value!.disableAllHooks === true);
  foreignHooksBlocked = !othersRun;
  const malformed = read.find((file) => file.value!.enabledPlugins !== undefined
    && !(isObject(file.value!.enabledPlugins) && Object.values(file.value!.enabledPlugins).every((enabled) => typeof enabled === "boolean")));
  if (malformed) return result(`enabledPlugins in ${malformed.path} is not an object of booleans`);
  // A plugin's hooks run beside AMC's (with managed hooks only, so do those of plugins managed settings force-enable).
  const plugin = (othersRun ? read : managed).find((file) => isObject(file.value!.enabledPlugins)
    && Object.values(file.value!.enabledPlugins).some((enabled) => enabled === true));
  if (plugin) return result(`an enabled plugin in ${plugin.path} can run hooks AMC did not install`);
  const wanted = new Set(input.bindings.map((binding) => `${binding.eventName}\0${binding.handlerSha256}`));
  const seen = { all: new Set<string>(), managed: new Set<string>() };
  for (const file of othersRun ? read : managed) {
    let entries: Array<[string, unknown, unknown]>;
    try {
      entries = handlers(file.value!);
    } catch (error) {
      return result(`Claude Code settings ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const [event, handler, matcher] of entries) {
      const marker = isObject(handler) ? handler.statusMessage : undefined;
      if (marker === CLAUDE_STATUS_MESSAGE || marker === CLAUDE_CONTROL_STATUS_MESSAGE) {
        const key = `${event}\0${sha256Hex(canonicalize(handler))}`;
        if (!wanted.has(key)) return result(`an AMC ${event} hook in ${file.path} is not the one this installation wrote`);
        // AMC installs its hooks for every tool; a narrower matcher would let some tools skip AMC.
        if (matcher !== "*") return result(`AMC's ${event} hook in ${file.path} does not match every tool (matcher ${JSON.stringify(matcher ?? null)})`);
        seen.all.add(key);
        if (file.scope === "managed") seen.managed.add(key);
      } else if (CALL_CHANGING_EVENTS.has(event)) {
        return result(`a ${event} hook in ${file.path} that is not AMC's can change a tool's input or Bash environment after AMC allows it`);
      }
    }
  }
  const missing = input.bindings.find((binding) => !seen.all.has(`${binding.eventName}\0${binding.handlerSha256}`));
  if (missing) return result(`AMC's ${missing.eventName} hook is not in the settings Claude Code runs`);
  return result(null, input.bindings.every((binding) => seen.managed.has(`${binding.eventName}\0${binding.handlerSha256}`)));
}
