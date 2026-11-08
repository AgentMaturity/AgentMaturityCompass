import { lstatSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { highWaterKey, readHighWater, recordHighWater, workspaceScope, type HighWaterOptions } from "../keys/highWater.js";

/**
 * Operator command hooks for the native loop (SH-EXT-01): `<workspace>/.amc/hooks.json`.
 *
 * The file shape is Claude Code's `hooks.json` so one file can be carried across harnesses, but the AUTHORITY MODEL is
 * AMC's (decision D55): a hook observes, or denies on the two deny-capable events. It can never allow, rewrite
 * arguments, add context or reach past an approval.
 *
 * TRUST. A hooks.json is attacker-writable workspace state that causes commands to run with the operator's rights on
 * every platform. A signature made with the workspace's own keyset would not do: AMC adopts an unseen keyset on first
 * use, so a cloned repository could sign its own hooks. The file therefore runs only after the operator accepted its
 * exact sha256 on THIS machine (`amc native-extension hooks trust --sha256 ...`), recorded in the per-machine
 * high-water store outside every workspace. Any byte change needs a new acceptance. Until then the file is not
 * ignored: deny-capable events deny and observe events report, because a guard an operator configured must never
 * switch itself off because someone edited the file.
 *
 * WHAT THE ACCEPTANCE BINDS (S6). The file alone is not what runs: `["node", ".amc/hooks/check.js"]` runs the script,
 * and the script is workspace content too. So the recorded mark binds the file digest to the digest of every workspace
 * file the argv names (the program when it is inside the workspace, and any argument that names a workspace file),
 * re-checked before every run. A program named by a relative path is refused at load, and a bare name is resolved on
 * PATH only, never against the working directory (Windows searches the cwd first); a bare name that resolves inside
 * the workspace is refused, because the environment, not the accepted file, chose the code.
 */

export const NATIVE_COMMAND_HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop",
  "SessionStart", "SessionEnd", "SubagentStop", "PreCompact", "Notification"] as const;
export type NativeCommandHookEvent = typeof NATIVE_COMMAND_HOOK_EVENTS[number];
/** Events this build fires. The others parse (one carried file) and are reported as not emitted by `hooks inspect`. */
export const NATIVE_COMMAND_HOOK_EMITTED: readonly NativeCommandHookEvent[] = Object.freeze(["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"]);
export const NATIVE_COMMAND_HOOK_DENY_EVENTS: readonly NativeCommandHookEvent[] = Object.freeze(["PreToolUse", "UserPromptSubmit"]);

export const NATIVE_COMMAND_HOOK_LIMITS = Object.freeze({
  fileBytes: 65_536, handlers: 32, matcherBytes: 256, commandBytes: 4_096, argv: 64,
  defaultTimeoutMs: 10_000, maxTimeoutMs: 60_000, inputBytes: 32_768, outputBytes: 65_536, reasonBytes: 256,
  /** Per workspace file an argv names; the digest of a bigger file cannot be bound, so the file is invalid. */
  referenceBytes: 4_194_304
});

export class NativeCommandHookError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "NativeCommandHookError"; }
}

/** Exact names, `|` lists and a trailing `*` prefix glob; nothing else, so there is no regular-expression surface. */
const MATCHER_TOKEN = /^[A-Za-z0-9_.-]{1,64}\*?$/;
function parseCommandHookMatcher(matcher: string): readonly string[] | "*" {
  const trimmed = matcher.trim();
  if (trimmed === "" || trimmed === "*") return "*";
  if (Buffer.byteLength(trimmed) > NATIVE_COMMAND_HOOK_LIMITS.matcherBytes) throw new NativeCommandHookError("MATCHER_INVALID", "A hook matcher exceeds 256 bytes.");
  const tokens = trimmed.split("|").map(token => token.trim());
  if (tokens.some(token => !MATCHER_TOKEN.test(token))) {
    throw new NativeCommandHookError("MATCHER_INVALID", `Hook matcher ${JSON.stringify(trimmed)} is not an exact tool name, a |-list of names, or a name* prefix; regular expressions are not supported.`);
  }
  return tokens;
}
export function commandHookMatches(matcher: string, toolName: string): boolean {
  const parsed = parseCommandHookMatcher(matcher);
  if (parsed === "*") return true;
  return parsed.some(token => token.endsWith("*") ? toolName.startsWith(token.slice(0, -1)) : token === toolName);
}

const commandSchema = z.union([
  z.string().min(1).max(NATIVE_COMMAND_HOOK_LIMITS.commandBytes),
  z.array(z.string().min(1).max(NATIVE_COMMAND_HOOK_LIMITS.commandBytes)).min(1).max(NATIVE_COMMAND_HOOK_LIMITS.argv)
]);
const handlerSchema = z.object({
  type: z.literal("command"),
  command: commandSchema,
  /** Seconds, as in Claude Code's file; 1 through 60. */
  timeout: z.number().int().min(1).max(NATIVE_COMMAND_HOOK_LIMITS.maxTimeoutMs / 1000).optional(),
  /** PreToolUse only: run on an input over 32 KiB with `tool_input: null`; without it such a call is denied. */
  acceptTruncatedInput: z.boolean().optional()
}).strict();
const groupSchema = z.object({ matcher: z.string().max(NATIVE_COMMAND_HOOK_LIMITS.matcherBytes).optional(), hooks: z.array(handlerSchema).min(1) }).strict();
const fileSchema = z.object({ hooks: z.object(Object.fromEntries(NATIVE_COMMAND_HOOK_EVENTS.map(event => [event, z.array(groupSchema).optional()]))).strict() }).strict();

export interface NativeCommandHookHandler {
  readonly event: NativeCommandHookEvent;
  readonly matcher: string;
  /** Never shell-interpreted. A string `command` is split on whitespace only. */
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly acceptTruncatedInput: boolean;
  /** 1-based position among the event's handlers, for reports. */
  readonly index: number;
}

export function parseNativeCommandHooks(text: string): readonly NativeCommandHookHandler[] {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new NativeCommandHookError("HOOKS_INVALID", "hooks.json is not valid JSON."); }
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) throw new NativeCommandHookError("HOOKS_INVALID", `hooks.json is not a valid hooks file: ${parsed.error.issues[0]?.path.join("/") || "root"}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const handlers: NativeCommandHookHandler[] = [];
  for (const event of NATIVE_COMMAND_HOOK_EVENTS) {
    let index = 0;
    for (const group of parsed.data.hooks[event] ?? []) {
      const matcher = group.matcher ?? "";
      parseCommandHookMatcher(matcher);
      for (const handler of group.hooks) {
        const argv = typeof handler.command === "string" ? handler.command.split(/\s+/).filter(part => part.length > 0) : [...handler.command];
        if (argv.length === 0 || argv.length > NATIVE_COMMAND_HOOK_LIMITS.argv) throw new NativeCommandHookError("HOOKS_INVALID", `A ${event} hook has an empty or oversized command.`);
        if (!isAbsolute(argv[0]!) && /[\\/]/.test(argv[0]!)) {
          throw new NativeCommandHookError("HOOKS_INVALID", `A ${event} hook names its program by a relative path (${argv[0]}); use an absolute path, or a bare name found on PATH.`);
        }
        handlers.push(Object.freeze({ event, matcher, argv: Object.freeze(argv), index: ++index,
          timeoutMs: (handler.timeout ?? NATIVE_COMMAND_HOOK_LIMITS.defaultTimeoutMs / 1000) * 1000,
          acceptTruncatedInput: handler.acceptTruncatedInput === true }));
      }
    }
  }
  if (handlers.length > NATIVE_COMMAND_HOOK_LIMITS.handlers) throw new NativeCommandHookError("HOOKS_INVALID", `hooks.json declares more than ${NATIVE_COMMAND_HOOK_LIMITS.handlers} handlers.`);
  return Object.freeze(handlers);
}

/** A workspace file a handler's argv names, bound into the trust mark. `rel` is POSIX-separated, relative to the workspace. */
export interface NativeCommandHookReference { readonly rel: string; readonly sha256: string }

/** `item` as a path inside `root`, or null when it is absolute elsewhere or escapes the root. */
function workspaceRelative(root: string, item: string): string | null {
  const rel = relative(root, resolve(root, item));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** Every regular workspace file the handlers' argv name, with its digest. A symlink or an over-cap file throws: it cannot be bound. */
function commandHookReferences(workspace: string, handlers: readonly NativeCommandHookHandler[]): readonly NativeCommandHookReference[] {
  const root = resolve(workspace), refs = new Map<string, string>();
  for (const handler of handlers) {
    for (const item of handler.argv) {
      const rel = workspaceRelative(root, item);
      if (rel === null || refs.has(rel)) continue;
      const stat = lstatSync(resolve(root, rel), { throwIfNoEntry: false });
      if (stat === undefined || stat.isDirectory()) continue; // a flag, a value or a directory names no code that runs
      const bytes = readContainedOrNull(root, rel, NATIVE_COMMAND_HOOK_LIMITS.referenceBytes);
      if (bytes !== null) refs.set(rel, sha256Hex(bytes));
    }
  }
  return Object.freeze([...refs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([rel, sha256]) => Object.freeze({ rel, sha256 })));
}

/** What the high-water store records: the file digest bound to the digests of the workspace files its argv names. */
function commandHookTrustMark(sha256: string, references: readonly NativeCommandHookReference[]): string {
  return sha256Hex(JSON.stringify([sha256, references.map(reference => [reference.rel, reference.sha256])]));
}

/**
 * argv[0] as the process is started: an absolute path as written, or a bare name found in an absolute PATH entry
 * (never the working directory). A bare name that lands inside the workspace is refused: the accepted file did not
 * name that code, the environment did.
 */
export function resolveHookProgram(program: string, workspace: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isAbsolute(program)) return program;
  const extensions = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter).filter(entry => entry.length > 0 && isAbsolute(entry))) {
    for (const extension of extensions) {
      const candidate = join(dir, program + extension);
      const stat = statSync(candidate, { throwIfNoEntry: false });
      if (stat === undefined || !stat.isFile()) continue;
      if (workspaceRelative(resolve(workspace), candidate) !== null) {
        throw new NativeCommandHookError("HOOK_PROGRAM_IN_WORKSPACE", `hook program ${program} resolves inside the workspace (${candidate}); name it by absolute path so trust binds its digest`);
      }
      return candidate;
    }
  }
  throw new NativeCommandHookError("HOOK_PROGRAM_NOT_FOUND", `hook program ${program} was not found in PATH`);
}

const NATIVE_COMMAND_HOOKS_REL = ".amc/hooks.json";
export type NativeCommandHookLoad =
  | { readonly status: "absent"; readonly path: string }
  | { readonly status: "trusted"; readonly path: string; readonly sha256: string; readonly handlers: readonly NativeCommandHookHandler[];
      readonly references: readonly NativeCommandHookReference[] }
  | { readonly status: "untrusted"; readonly path: string; readonly sha256: string; readonly reason: string }
  | { readonly status: "invalid"; readonly path: string; readonly sha256: string | null; readonly reason: string };

const trustKey = (workspace: string) => highWaterKey("hooks-trusted", workspaceScope(workspace));

/** The trust mark this machine accepted for the workspace's hooks.json (file digest bound to its references), or null. */
function trustedCommandHooksMark(workspace: string, opts: HighWaterOptions = {}): string | null {
  return readHighWater(trustKey(workspace), opts)?.sha256 ?? null;
}

/**
 * Record the operator's explicit acceptance of the file's current bytes, bound to the current digests of the workspace
 * files it names. Refused when the digest typed does not match the file.
 */
export function trustNativeCommandHooks(workspace: string, expectedSha256: string, opts: HighWaterOptions = {}): { readonly path: string; readonly sha256: string; readonly handlers: number; readonly references: readonly NativeCommandHookReference[] } {
  const path = resolve(workspace, NATIVE_COMMAND_HOOKS_REL);
  const bytes = readContainedOrNull(resolve(workspace), NATIVE_COMMAND_HOOKS_REL, NATIVE_COMMAND_HOOK_LIMITS.fileBytes);
  if (bytes === null) throw new NativeCommandHookError("HOOKS_ABSENT", `${path} does not exist.`);
  const sha256 = sha256Hex(bytes);
  if (!/^[0-9a-f]{64}$/.test(expectedSha256) || expectedSha256 !== sha256) {
    throw new NativeCommandHookError("HOOKS_DIGEST_MISMATCH", `${path} has sha256 ${sha256}; review that file and pass exactly that digest to --sha256.`);
  }
  const handlers = parseNativeCommandHooks(bytes.toString("utf8")); // never trust bytes that cannot load
  const references = commandHookReferences(workspace, handlers);
  const mark = commandHookTrustMark(sha256, references);
  const previous = readHighWater(trustKey(workspace), opts);
  if (previous?.sha256 !== mark) recordHighWater(trustKey(workspace), (previous?.sequence ?? 0) + 1, mark, opts);
  return { path, sha256, handlers: handlers.length, references };
}

/** Read the workspace hooks file and say exactly how it stands; never throws for a file problem. */
export function loadNativeCommandHooks(workspace: string, opts: HighWaterOptions = {}): NativeCommandHookLoad {
  const root = resolve(workspace), path = resolve(root, NATIVE_COMMAND_HOOKS_REL);
  let bytes: Buffer | null;
  try { bytes = readContainedOrNull(root, NATIVE_COMMAND_HOOKS_REL, NATIVE_COMMAND_HOOK_LIMITS.fileBytes); }
  catch (error) { return { status: "invalid", path, sha256: null, reason: error instanceof Error && /exceeds/.test(error.message) ? "hooks.json exceeds 64 KiB" : "hooks.json could not be read as a regular file" }; }
  if (bytes === null) return { status: "absent", path };
  const sha256 = sha256Hex(bytes);
  const trusted = trustedCommandHooksMark(workspace, opts);
  if (trusted === null) return { status: "untrusted", path, sha256, reason: `${path} (sha256 ${sha256}) is not trusted on this machine; review it, then run: amc native-extension hooks trust --sha256 ${sha256}` };
  let handlers: readonly NativeCommandHookHandler[], references: readonly NativeCommandHookReference[];
  try { handlers = parseNativeCommandHooks(bytes.toString("utf8")); references = commandHookReferences(root, handlers); }
  catch (error) { return { status: "invalid", path, sha256, reason: error instanceof Error ? error.message : "hooks.json is invalid" }; }
  if (commandHookTrustMark(sha256, references) !== trusted) {
    return { status: "untrusted", path, sha256, reason: `${path} (sha256 ${sha256}) or a workspace file its hooks name changed since this machine trusted it; review the change, then run: amc native-extension hooks trust --sha256 ${sha256}` };
  }
  return { status: "trusted", path, sha256, handlers, references };
}

/** Before every run: the bound workspace files must still have the digests trust recorded. */
export function staleCommandHookReferences(workspace: string, load: Extract<NativeCommandHookLoad, { status: "trusted" }>): string | undefined {
  try {
    if (commandHookTrustMark(load.sha256, commandHookReferences(workspace, load.handlers)) === commandHookTrustMark(load.sha256, load.references)) return undefined;
  } catch (error) { return `a workspace file named by ${load.path} can no longer be read as a regular file (${error instanceof Error ? error.message : "unreadable"})`; }
  return `a workspace file named by ${load.path} changed since this machine trusted it; review the change, then run: amc native-extension hooks trust --sha256 ${load.sha256}`;
}
