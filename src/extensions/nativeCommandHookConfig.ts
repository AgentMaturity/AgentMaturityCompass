import { lstatSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { listContainedDir, readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { highWaterKey, readHighWater, recordHighWater, workspaceScope, type HighWaterOptions } from "../keys/highWater.js";
import { argvPathCandidates, canonicalPath, hookArgvRefusal, isBareProgram, workspaceLocation } from "./nativeCommandHookArgv.js";

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
 * TRUST VALUE on THIS machine (`amc native-extension hooks trust --sha256 ...`), recorded in the per-machine high-water
 * store outside every workspace. Until then the file is not ignored: deny-capable events deny and observe events
 * report, because a guard an operator configured must never switch itself off because someone edited the file. For the
 * same reason a trusted file that goes MISSING fails closed until the operator restores it or retires the mark with
 * `hooks untrust`.
 *
 * WHAT THE ACCEPTANCE BINDS (S6). The file alone is not what runs: `["node", ".amc/hooks/check.js"]` runs the script,
 * and the script is workspace content too. Every workspace file a hook may load must therefore live under
 * `.amc/hooks/`, the directory AMC's tools cannot write, and the trust value is the file digest bound to the digest of
 * EVERY regular file in that tree (so a script's local imports are bound with it), re-checked before every spawn. An
 * argv item (or the value of a `--flag=value`) that names a workspace path anywhere else, or a directory, is refused;
 * so are an interpreter's code-loading flags (`node -e`, `python -c`, `--require`, ...), which load code trust cannot
 * see. Paths are compared by their canonical location (symlinks and case resolved), never as strings. A program named
 * by a relative path is refused at load, and a bare name is resolved on PATH only, never against the working directory
 * (Windows searches the cwd first); a bare name that resolves inside the workspace is refused, because the environment,
 * not the accepted file, chose the code. Imports a bound script makes OUTSIDE `.amc/hooks/` are not covered; the docs
 * say so.
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
  /** Per file under .amc/hooks/; the digest of a bigger file cannot be bound, so the file is invalid. */
  referenceBytes: 4_194_304, referenceFiles: 256
});
/** The only workspace directory a hook may load code from: AMC's tools never write under .amc/. */
const NATIVE_COMMAND_HOOKS_DIR = ".amc/hooks";

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
        const refused = hookArgvRefusal(event, argv, NATIVE_COMMAND_HOOKS_DIR);
        if (refused !== undefined) throw new NativeCommandHookError("HOOKS_INVALID", refused);
        handlers.push(Object.freeze({ event, matcher, argv: Object.freeze(argv), index: ++index,
          timeoutMs: (handler.timeout ?? NATIVE_COMMAND_HOOK_LIMITS.defaultTimeoutMs / 1000) * 1000,
          acceptTruncatedInput: handler.acceptTruncatedInput === true }));
      }
    }
  }
  if (handlers.length > NATIVE_COMMAND_HOOK_LIMITS.handlers) throw new NativeCommandHookError("HOOKS_INVALID", `hooks.json declares more than ${NATIVE_COMMAND_HOOK_LIMITS.handlers} handlers.`);
  return Object.freeze(handlers);
}

/** A file under .amc/hooks/, bound into the trust mark. `rel` is POSIX-separated, relative to the workspace. */
export interface NativeCommandHookReference { readonly rel: string; readonly sha256: string }

/**
 * Every workspace path a handler's argv may name (nativeCommandHookArgv.ts lists the candidates) must be a regular file
 * under .amc/hooks/. The workspace itself and any directory in it are refused: code may be loaded from them that trust
 * cannot bind (`node .` runs the workspace's package entry point).
 */
function checkWorkspaceReferences(root: string, handlers: readonly NativeCommandHookHandler[]): void {
  for (const handler of handlers) {
    for (const candidate of argvPathCandidates(handler.argv)) {
      if (isBareProgram(handler.argv, candidate)) continue;
      const rel = workspaceLocation(root, candidate);
      if (rel === null) continue;
      const where = `A ${handler.event} hook names ${candidate}, which is ${rel === "" ? "the workspace itself" : `${rel} inside the workspace`}`;
      let stat: ReturnType<typeof lstatSync>;
      // A value that names no file (absent, `a.txt/b`, over-long) is no file the hook can load as this user either.
      try { stat = lstatSync(join(canonicalPath(root), ...rel.split("/").filter(part => part.length > 0)), { throwIfNoEntry: false }); } catch { stat = undefined; }
      if (stat === undefined) continue;
      if (stat.isDirectory()) throw new NativeCommandHookError("HOOKS_INVALID", `${where}: a directory; code may be loaded from it that trust cannot bind. Name a single file under ${NATIVE_COMMAND_HOOKS_DIR}/ (the workspace path is in the hook input's cwd and AMC_WORKSPACE).`);
      if (!stat.isFile()) throw new NativeCommandHookError("HOOKS_INVALID", `${where}: not a regular file, so its digest cannot be bound.`);
      if (!rel.startsWith(`${NATIVE_COMMAND_HOOKS_DIR}/`)) {
        throw new NativeCommandHookError("HOOKS_INVALID", `${where}: outside ${NATIVE_COMMAND_HOOKS_DIR}/. Hook scripts must live under ${NATIVE_COMMAND_HOOKS_DIR}/, which trust binds whole and agent tools cannot write.`);
      }
    }
  }
}

/** Every regular file under .amc/hooks/ with its digest. A symlink, special file or over-cap file throws: it cannot be bound. */
function hooksTreeReferences(root: string): readonly NativeCommandHookReference[] {
  const refs: NativeCommandHookReference[] = [];
  const walk = (rel: string): void => {
    for (const name of listContainedDir(root, rel).sort()) {
      const child = `${rel}/${name}`;
      const stat = lstatSync(join(root, ...child.split("/")));
      if (stat.isDirectory()) { walk(child); continue; }
      const bytes = readContainedOrNull(root, child, NATIVE_COMMAND_HOOK_LIMITS.referenceBytes); // throws for a symlink or a special file
      if (bytes === null) throw new NativeCommandHookError("HOOKS_INVALID", `${child} disappeared while its digest was being bound.`);
      refs.push(Object.freeze({ rel: child, sha256: sha256Hex(bytes) }));
      if (refs.length > NATIVE_COMMAND_HOOK_LIMITS.referenceFiles) throw new NativeCommandHookError("HOOKS_INVALID", `${NATIVE_COMMAND_HOOKS_DIR}/ holds more than ${NATIVE_COMMAND_HOOK_LIMITS.referenceFiles} files; trust cannot bind it.`);
    }
  };
  walk(NATIVE_COMMAND_HOOKS_DIR);
  return Object.freeze(refs);
}

function commandHookReferences(root: string, handlers: readonly NativeCommandHookHandler[]): readonly NativeCommandHookReference[] {
  checkWorkspaceReferences(root, handlers);
  return hooksTreeReferences(root);
}

/**
 * What the operator types and the high-water store records: the file digest alone when nothing under .amc/hooks/ is
 * bound, otherwise the file digest bound to every bound file's digest. `hooks inspect` prints it with its parts.
 */
function commandHookTrustMark(sha256: string, references: readonly NativeCommandHookReference[]): string {
  return references.length === 0 ? sha256 : sha256Hex(JSON.stringify([sha256, references.map(reference => [reference.rel, reference.sha256])]));
}

/**
 * argv[0] as the process is started: an absolute path as written, or a bare name found in an absolute PATH entry
 * (never the working directory). A bare name whose canonical location is inside the workspace is refused: the
 * accepted file did not name that code, the environment did. An absolute program inside the workspace was already
 * checked at load against .amc/hooks/.
 */
export function resolveHookProgram(program: string, workspace: string, env: NodeJS.ProcessEnv = process.env): string {
  if (isAbsolute(program)) return program;
  const extensions = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter).filter(entry => entry.length > 0 && isAbsolute(entry))) {
    for (const extension of extensions) {
      const candidate = join(dir, program + extension);
      const stat = statSync(candidate, { throwIfNoEntry: false });
      if (stat === undefined || !stat.isFile()) continue;
      if (workspaceLocation(resolve(workspace), candidate) !== null) {
        throw new NativeCommandHookError("HOOK_PROGRAM_IN_WORKSPACE", `hook program ${program} resolves inside the workspace (${candidate}); name it by absolute path under ${NATIVE_COMMAND_HOOKS_DIR}/ so trust binds its digest`);
      }
      return candidate;
    }
  }
  throw new NativeCommandHookError("HOOK_PROGRAM_NOT_FOUND", `hook program ${program} was not found in PATH`);
}

const NATIVE_COMMAND_HOOKS_REL = ".amc/hooks.json";
interface ParsedHooks { readonly handlers: readonly NativeCommandHookHandler[]; readonly references: readonly NativeCommandHookReference[]; readonly mark: string }
export type NativeCommandHookLoad =
  | { readonly status: "absent"; readonly path: string }
  | ({ readonly status: "trusted"; readonly path: string; readonly sha256: string } & ParsedHooks)
  /** Parses, but this machine has not accepted its current trust value; handlers and references are for review only. */
  | ({ readonly status: "untrusted"; readonly path: string; readonly sha256: string; readonly reason: string } & ParsedHooks)
  | { readonly status: "invalid"; readonly path: string; readonly sha256: string | null; readonly reason: string };

const trustKey = (workspace: string) => highWaterKey("hooks-trusted", workspaceScope(workspace));
/** `hooks untrust` records this in place of a mark; the store is append-only, so retirement is a value, not a deletion. */
const RETIRED_MARK = sha256Hex(Buffer.from("amc.hooks-trusted.retired"));

/** The trust mark this machine accepted for the workspace's hooks.json, or null when none is recorded or it was retired. */
function trustedCommandHooksMark(workspace: string, opts: HighWaterOptions = {}): string | null {
  const mark = readHighWater(trustKey(workspace), opts)?.sha256 ?? null;
  return mark === RETIRED_MARK ? null : mark;
}

function record(workspace: string, mark: string, opts: HighWaterOptions): void {
  const previous = readHighWater(trustKey(workspace), opts);
  if (previous?.sha256 === mark) return;
  if (!recordHighWater(trustKey(workspace), (previous?.sequence ?? 0) + 1, mark, opts)) {
    throw new NativeCommandHookError("HOOKS_TRUST_NOT_RECORDED", "The trust mark could not be recorded: this machine's AMC home is not writable, so nothing was accepted.");
  }
}

/**
 * Record the operator's explicit acceptance of the file's current trust value: the file digest bound to the digests of
 * every file under .amc/hooks/. Refused when the value typed is not exactly that mark, or when it cannot be recorded.
 */
export function trustNativeCommandHooks(workspace: string, expected: string, opts: HighWaterOptions = {}): { readonly path: string; readonly sha256: string; readonly mark: string; readonly handlers: number; readonly references: readonly NativeCommandHookReference[] } {
  const root = resolve(workspace), path = resolve(root, NATIVE_COMMAND_HOOKS_REL);
  const bytes = readContainedOrNull(root, NATIVE_COMMAND_HOOKS_REL, NATIVE_COMMAND_HOOK_LIMITS.fileBytes);
  if (bytes === null) throw new NativeCommandHookError("HOOKS_ABSENT", `${path} does not exist.`);
  const sha256 = sha256Hex(bytes);
  const handlers = parseNativeCommandHooks(bytes.toString("utf8")); // never trust bytes that cannot load
  const references = commandHookReferences(root, handlers);
  const mark = commandHookTrustMark(sha256, references);
  if (!/^[0-9a-f]{64}$/.test(expected) || expected !== mark) {
    throw new NativeCommandHookError("HOOKS_DIGEST_MISMATCH", `${path} has trust value ${mark} (file sha256 ${sha256}${references.length === 0 ? "" : `, bound to ${references.length} file(s) under ${NATIVE_COMMAND_HOOKS_DIR}/`}); review the file and its bound files with hooks inspect, then pass exactly that value to --sha256.`);
  }
  record(workspace, mark, opts);
  return { path, sha256, mark, handlers: handlers.length, references };
}

/** Retire this machine's acceptance, so a missing or present file is untrusted again (and a missing one no longer fails closed). */
export function untrustNativeCommandHooks(workspace: string, opts: HighWaterOptions = {}): { readonly path: string; readonly retired: boolean } {
  const path = resolve(workspace, NATIVE_COMMAND_HOOKS_REL);
  const had = trustedCommandHooksMark(workspace, opts) !== null;
  if (had) record(workspace, RETIRED_MARK, opts);
  return { path, retired: had };
}

/** Read the workspace hooks file and say exactly how it stands; never throws for a file problem. */
export function loadNativeCommandHooks(workspace: string, opts: HighWaterOptions = {}): NativeCommandHookLoad {
  const root = resolve(workspace), path = resolve(root, NATIVE_COMMAND_HOOKS_REL);
  let bytes: Buffer | null;
  try { bytes = readContainedOrNull(root, NATIVE_COMMAND_HOOKS_REL, NATIVE_COMMAND_HOOK_LIMITS.fileBytes); }
  catch (error) { return { status: "invalid", path, sha256: null, reason: error instanceof Error && /exceeds/.test(error.message) ? "hooks.json exceeds 64 KiB" : "hooks.json could not be read as a regular file" }; }
  const trusted = trustedCommandHooksMark(workspace, opts);
  if (bytes === null) {
    if (trusted === null) return { status: "absent", path };
    // A guard the operator configured does not switch itself off because the file was deleted or renamed.
    return { status: "invalid", path, sha256: null, reason: `${path} is missing but this machine trusts a hooks file for the workspace; restore it, or retire the acceptance with: amc native-extension hooks untrust` };
  }
  const sha256 = sha256Hex(bytes);
  let parsed: ParsedHooks;
  try {
    const handlers = parseNativeCommandHooks(bytes.toString("utf8")), references = commandHookReferences(root, handlers);
    parsed = { handlers, references, mark: commandHookTrustMark(sha256, references) };
  } catch (error) { return { status: "invalid", path, sha256, reason: error instanceof Error ? error.message : "hooks.json is invalid" }; }
  const accept = `review it and its bound files (amc native-extension hooks inspect), then run: amc native-extension hooks trust --sha256 ${parsed.mark}`;
  if (trusted === null) return { status: "untrusted", path, sha256, ...parsed, reason: `${path} (sha256 ${sha256}) is not trusted on this machine; ${accept}` };
  if (parsed.mark !== trusted) {
    return { status: "untrusted", path, sha256, ...parsed, reason: `${path} (sha256 ${sha256}) or a file under ${NATIVE_COMMAND_HOOKS_DIR}/ changed since this machine trusted it; ${accept}` };
  }
  return { status: "trusted", path, sha256, ...parsed };
}

/** Before every spawn: the bound files must still have the digests trust recorded. Names the file that changed. */
export function staleCommandHookReferences(workspace: string, load: Extract<NativeCommandHookLoad, { status: "trusted" }>): string | undefined {
  let current: readonly NativeCommandHookReference[];
  try { current = commandHookReferences(resolve(workspace), load.handlers); }
  catch (error) { return `a file under ${NATIVE_COMMAND_HOOKS_DIR}/ bound by ${load.path} can no longer be read as a regular file (${error instanceof Error ? error.message : "unreadable"})`; }
  if (commandHookTrustMark(load.sha256, current) === load.mark) return undefined;
  const was = new Map(load.references.map(reference => [reference.rel, reference.sha256]));
  const changed = current.find(reference => was.get(reference.rel) !== reference.sha256)?.rel ?? load.references.find(reference => !current.some(now => now.rel === reference.rel))?.rel ?? NATIVE_COMMAND_HOOKS_DIR;
  return `${changed} changed since this machine trusted ${load.path}; review the change, then run: amc native-extension hooks trust --sha256 ${commandHookTrustMark(load.sha256, current)}`;
}
