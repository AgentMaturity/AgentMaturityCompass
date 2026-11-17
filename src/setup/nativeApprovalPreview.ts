/**
 * What a gated tool call would do, in words a person can check before allowing it: an edit as a unified diff, a shell call
 * as its command and folder, a network call as its host. The chat parent builds it from the arguments the agent run
 * reported over IPC, and calls it the request's own only when those arguments hash to the digest the signed request
 * binds (callMatchesRequest). The model wrote these arguments, so every shown character a terminal would hide, reorder or
 * act on is written as a visible `\uXXXX`, and the preview then counts as incomplete.
 */
import { normalizeArguments } from "../actions/normalizeArguments.js";
import type { ApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import type { ApprovalAskDisplay } from "../approvals/seam/approvalSeamTypes.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { planLiteralEdits, type LiteralEdit } from "../tools/builtin/fsEditPlan.js";
import { readBeforeWrite, shownDiff, utf8, writeTarget } from "../tools/builtin/fsWritePrimitives.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface ReportedCall {
  readonly toolName: string;
  readonly rawArguments?: string;
  readonly arguments?: Readonly<Record<string, unknown>>;
}

/** Past this the run reports no arguments, and the prompt says the call cannot be shown. */
const MAX_REPORTED_CALL_BYTES = 256 * 1024;
const MAX_SHOWN_LINES = 120;
const MAX_LINE_CHARS = 400;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The run's side: the call to report beside a raised request, or nothing when there is none or it is too large to send. */
export function reportedCallFor(event: { readonly toolName: string; readonly display?: ApprovalAskDisplay }): { call?: ReportedCall } {
  if (event.display === undefined) return {};
  const call: ReportedCall = { toolName: event.toolName, ...event.display };
  try {
    return Buffer.byteLength(JSON.stringify(call)) <= MAX_REPORTED_CALL_BYTES ? { call } : {};
  } catch {
    return {};
  }
}

/** The parent's side: a well-formed reported call, or null. */
export function parseReportedCall(value: unknown): ReportedCall | null {
  if (!isRecord(value) || typeof value.toolName !== "string" || value.toolName.length === 0 || value.toolName.length > 256) return null;
  if (value.rawArguments !== undefined && typeof value.rawArguments !== "string") return null;
  if (value.arguments !== undefined && !isRecord(value.arguments)) return null;
  return { toolName: value.toolName, ...(value.rawArguments === undefined ? {} : { rawArguments: value.rawArguments }),
    ...(value.arguments === undefined ? {} : { arguments: value.arguments as Record<string, unknown> }) };
}

function argumentsOf(call: ReportedCall): Record<string, unknown> | null {
  if (call.arguments !== undefined) return call.arguments as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(call.rawArguments === undefined || call.rawArguments === "" ? "{}" : call.rawArguments);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Whether the reported arguments are the ones the signed request binds: the normalized-arguments digest of its
 * authorization intent, or (a call without one) the hash of the gate's own payload. False for any doubt.
 */
export function callMatchesRequest(workspace: string, request: ApprovalRequestRecord, call: ReportedCall): boolean {
  if (call.toolName !== request.toolName) return false;
  try {
    const bound = request.authorizationIntent?.argumentsDigest;
    if (typeof bound === "string") {
      const args = argumentsOf(call);
      if (args === null) return false;
      const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
      const normalized = normalizeArguments(snapshot.config ? findToolDefinition(snapshot.config, call.toolName) : null, request.actionClass, args);
      return normalized.ok && normalized.argumentsDigest === bound;
    }
    const intentHash = request.boundHashes.intentHash;
    return (call.rawArguments !== undefined && sha256Hex(canonicalize({ toolName: call.toolName, rawArguments: call.rawArguments })) === intentHash)
      || (call.arguments !== undefined && sha256Hex(canonicalize({ toolName: call.toolName, arguments: call.arguments })) === intentHash);
  } catch {
    return false;
  }
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Whether every argument was shown in full. Any cut line, cut block, escaped character, unreadable change or redacted span clears it. */
interface Shown { complete: boolean }

/**
 * Terminal controls (C0 but tab and newline, DEL, C1), Unicode format characters (bidi overrides and isolates, zero-width
 * characters), line and paragraph separators, spaces other than U+0020, and characters drawn as nothing.
 */
const HIDDEN = /[\x00-\x08\x0b-\x1f\x7f-\x9f\p{Cf}\p{Zl}\p{Zp}\p{Zs}\u034f\u115f\u1160\u17b4\u17b5\u3164\uffa0\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu;

/** The text with each hidden character written as a visible `\uXXXX`; any such character marks the preview incomplete. */
function visible(value: string, shown: Shown): string {
  return value.replace(HIDDEN, (c) => {
    if (c === " ") return c;
    shown.complete = false;
    return `\\u${c.codePointAt(0)!.toString(16).padStart(4, "0")}`;
  });
}

/** A value that must fit one line (a key, a folder, a tool name, a path): tab and newline written visibly, length bounded. */
function field(value: string, shown: Shown): string {
  const flat = value.replace(/[\t\n]/g, (c) => { shown.complete = false; return c === "\n" ? "\\n" : "\\t"; });
  return shownLines(flat, shown, 1)[0] ?? "";
}

function shownLines(block: string, shown: Shown, max = MAX_SHOWN_LINES): string[] {
  const lines = block.replace(/\n$/, "").split("\n");
  const kept = lines.slice(0, max).map((line) => {
    const safe = visible(line.replace(/\t/g, "    "), shown);
    if (safe.length <= MAX_LINE_CHARS) return safe;
    shown.complete = false;
    return `${safe.slice(0, MAX_LINE_CHARS)} … (${safe.length - MAX_LINE_CHARS} more characters not shown)`;
  });
  if (lines.length <= max) return kept;
  shown.complete = false;
  return [...kept, `… ${lines.length - max} more lines are not shown here.`];
}

/** One file change as a unified diff; a new file shows every line as added. */
function fileChange(workspace: string, path: string, after: (before: string | null) => string, shown: Shown): string[] {
  const { full, rel } = writeTarget(workspace, path);
  const before = readBeforeWrite(full, path);
  const beforeText = before === null ? null : utf8(before);
  if (before !== null && beforeText === null) { shown.complete = false; return [`${rel} is not text, so its change cannot be shown as lines.`]; }
  const diff = shownDiff(rel, before ?? Buffer.alloc(0), Buffer.from(after(beforeText), "utf8"));
  if (diff.truncated || diff.text.includes("[AMC_REDACTED:") || diff.text.startsWith("Binary files ")) shown.complete = false;
  return [before === null ? `New file: ${field(rel, shown)}` : `Change to: ${field(rel, shown)}`,
    ...(diff.text.length === 0 ? ["(no line would change)"] : shownLines(diff.text, shown))];
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.host : null;
  } catch {
    return null;
  }
}

/** Every argument not named in `used`, by name and value. */
function otherArguments(args: Record<string, unknown>, shown: Shown, used: readonly string[] = []): string[] {
  return Object.entries(args).filter(([key]) => !used.includes(key)).flatMap(([key, value]) => {
    const host = typeof value === "string" ? hostOf(value) : null;
    const lines = shownLines(typeof value === "string" ? value : JSON.stringify(value) ?? String(value), shown, 20);
    const name = field(key, shown);
    return [...(host === null ? [] : [`Network host: ${field(host, shown)}`]),
      lines.length <= 1 ? `${name}: ${lines[0] ?? ""}` : `${name}:`, ...(lines.length <= 1 ? [] : lines.map((line) => `    ${line}`))];
  });
}

/** A special summary for one built-in tool, naming the arguments it showed; null when the call does not fit it. */
function summary(workspace: string, call: ReportedCall, args: Record<string, unknown>, shown: Shown): { title: string; lines: string[]; used: readonly string[] } | null {
  const path = text(args.path), command = text(args.command), url = text(args.url), patch = text(args.patch);
  if (call.toolName === "fs.write" && path !== null && typeof args.content === "string") {
    const content = args.content;
    return { title: "Write a file", lines: fileChange(workspace, path, () => content, shown), used: ["path", "content"] };
  }
  if (call.toolName === "fs.edit" && path !== null) {
    const edits = (Array.isArray(args.edits) ? args.edits : [{ find: args.find, replace: args.replace, replaceAll: args.replaceAll }]) as LiteralEdit[];
    return { title: "Edit a file", lines: fileChange(workspace, path, (before) => {
      if (before === null) throw new Error("the file does not exist yet");
      return planLiteralEdits(before, edits, path).after;
    }, shown), used: Array.isArray(args.edits) ? ["path", "edits"] : ["path", "find", "replace", "replaceAll"] };
  }
  if (call.toolName === "apply_patch" && patch !== null) return { title: "Apply a patch to files", lines: shownLines(patch, shown), used: ["patch"] };
  if (call.toolName === "bash" && command !== null) {
    const said = text(args.description), workdir = text(args.workdir);
    // A folder or description that is not text is not summarised, so it is listed with the other arguments.
    const used = ["command", ...(workdir === null && args.workdir !== undefined ? [] : ["workdir"]), ...(said === null ? [] : ["description"])];
    return { title: "Run a shell command", used, lines: [
      ...shownLines(command, shown, 40).map((line, index) => (index === 0 ? `Command: ${line}` : `         ${line}`)),
      ...(workdir === null && args.workdir !== undefined ? [] : [`Folder:  ${workdir === null ? ". (this workspace)" : field(workdir, shown)}`]),
      ...(said === null ? [] : [`The agent's own description, not checked: ${shownLines(said, shown, 3).join(" ")}`])] };
  }
  const host = call.toolName === "web_fetch" && url !== null ? hostOf(url) : null;
  if (host !== null) return { title: "Connect to the network", used: ["url"], lines: [`Host:    ${field(host, shown)}`, `Address: ${shownLines(url!, shown, 2).join(" ")}`] };
  return null;
}

/**
 * What the reported call would do. Every argument is shown: a built-in tool's summary first, then each argument it did
 * not use. `complete` is false when anything was cut short, escaped or could not be shown; the caller then lets
 * only a signed-in reviewer decide. Never throws: a call that cannot be read is described as such.
 */
export function describeReportedCall(workspace: string, call: ReportedCall): { readonly title: string; readonly lines: readonly string[]; readonly complete: boolean } {
  const shown: Shown = { complete: true };
  const name = field(call.toolName, shown);
  const args = argumentsOf(call);
  if (args === null) return { title: `Call the tool "${name}"`, complete: false, lines: ["Its arguments are not a readable list of values, so the tool will refuse the call."] };
  try {
    const special = summary(workspace, call, args, shown);
    if (special === null) return { title: `Call the tool "${name}"`, lines: otherArguments(args, shown), complete: shown.complete };
    const rest = otherArguments(args, shown, special.used);
    return { title: special.title, lines: [...special.lines, ...(rest.length === 0 ? [] : ["Other arguments:", ...rest.map((line) => `  ${line}`)])], complete: shown.complete };
  } catch (error) {
    const all: Shown = { complete: shown.complete };
    const why = field(error instanceof Error ? error.message : "unknown reason", all);
    return { title: `Call the tool "${name}"`, lines: [`AMC could not work out the change (${why}). The arguments as given:`, ...otherArguments(args, all)], complete: all.complete };
  }
}
