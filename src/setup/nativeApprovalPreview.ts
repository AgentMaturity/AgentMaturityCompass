/**
 * What a gated tool call would do, in words a person can check before allowing it: an edit as a unified diff, a shell call
 * as its command and folder, a network call as its host. The chat parent builds it from the arguments the agent run
 * reported over IPC, and calls it the request's own only when those arguments hash to the digest the signed request
 * binds (callMatchesRequest). The model wrote these arguments, so every shown line passes through escapeTerminalControls.
 */
import { normalizeArguments } from "../actions/normalizeArguments.js";
import type { ApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import type { ApprovalAskDisplay } from "../approvals/seam/approvalSeamTypes.js";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
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

function shownLines(block: string, max = MAX_SHOWN_LINES): string[] {
  const lines = block.replace(/\n$/, "").split("\n");
  const kept = lines.slice(0, max).map((line) => {
    const safe = escapeTerminalControls(line.replace(/\t/g, "    "));
    return safe.length > MAX_LINE_CHARS ? `${safe.slice(0, MAX_LINE_CHARS)} … (${safe.length - MAX_LINE_CHARS} more characters)` : safe;
  });
  return lines.length > max ? [...kept, `… ${lines.length - max} more lines are not shown here. The approval covers all of them.`] : kept;
}

/** One file change as a unified diff; a new file shows every line as added. */
function fileChange(workspace: string, path: string, after: (before: string | null) => string): string[] {
  const { full, rel } = writeTarget(workspace, path);
  const before = readBeforeWrite(full, path);
  const beforeText = before === null ? null : utf8(before);
  if (before !== null && beforeText === null) return [`${rel} is not text, so its change cannot be shown as lines.`];
  const diff = shownDiff(rel, before ?? Buffer.alloc(0), Buffer.from(after(beforeText), "utf8"));
  return [before === null ? `New file: ${escapeTerminalControls(rel)}` : `Change to: ${escapeTerminalControls(rel)}`,
    ...(diff.text.length === 0 ? ["(no line would change)"] : shownLines(diff.text))];
}

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.host : null;
  } catch {
    return null;
  }
}

function otherArguments(args: Record<string, unknown>): string[] {
  return Object.entries(args).flatMap(([key, value]) => {
    const host = typeof value === "string" ? hostOf(value) : null;
    const shown = shownLines(typeof value === "string" ? value : JSON.stringify(value) ?? String(value), 20);
    return [...(host === null ? [] : [`Network host: ${escapeTerminalControls(host)}`]),
      shown.length <= 1 ? `${escapeTerminalControls(key)}: ${shown[0] ?? ""}` : `${escapeTerminalControls(key)}:`, ...(shown.length <= 1 ? [] : shown.map((line) => `    ${line}`))];
  });
}

/** What the reported call would do. Never throws: a call that cannot be read is described as such. */
export function describeReportedCall(workspace: string, call: ReportedCall): { readonly title: string; readonly lines: readonly string[] } {
  const name = escapeTerminalControls(call.toolName);
  const args = argumentsOf(call);
  if (args === null) return { title: `Call the tool "${name}"`, lines: ["Its arguments are not a readable list of values, so the tool will refuse the call."] };
  try {
    const path = text(args.path), command = text(args.command), url = text(args.url), patch = text(args.patch);
    if (call.toolName === "fs.write" && path !== null && typeof args.content === "string") {
      const content = args.content;
      return { title: "Write a file", lines: fileChange(workspace, path, () => content) };
    }
    if (call.toolName === "fs.edit" && path !== null) {
      const edits = (Array.isArray(args.edits) ? args.edits : [{ find: args.find, replace: args.replace, replaceAll: args.replaceAll }]) as LiteralEdit[];
      return { title: "Edit a file", lines: fileChange(workspace, path, (before) => {
        if (before === null) throw new Error("the file does not exist yet");
        return planLiteralEdits(before, edits, path).after;
      }) };
    }
    if (call.toolName === "apply_patch" && patch !== null) return { title: "Apply a patch to files", lines: shownLines(patch) };
    if (call.toolName === "bash" && command !== null) {
      const said = text(args.description);
      return { title: "Run a shell command", lines: [
        ...shownLines(command, 40).map((line, index) => (index === 0 ? `Command: ${line}` : `         ${line}`)),
        `Folder:  ${escapeTerminalControls(text(args.workdir) ?? ". (this workspace)")}`,
        ...(said === null ? [] : [`The agent's own description, not checked: ${shownLines(said, 3).join(" ")}`])] };
    }
    const host = url === null ? null : hostOf(url);
    if (host !== null) {
      return { title: "Connect to the network", lines: [`Host:    ${escapeTerminalControls(host)}`, `Address: ${shownLines(url!, 2).join(" ")}`] };
    }
    return { title: `Call the tool "${name}"`, lines: otherArguments(args) };
  } catch (error) {
    const why = escapeTerminalControls(error instanceof Error ? error.message : "unknown reason").slice(0, MAX_LINE_CHARS);
    return { title: `Call the tool "${name}"`, lines: [`AMC could not work out the change (${why}). The arguments as given:`, ...otherArguments(args)] };
  }
}
