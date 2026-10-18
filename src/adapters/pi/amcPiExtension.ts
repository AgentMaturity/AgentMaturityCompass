/**
 * AMC's Pi extension (P1-22). In control mode it first registers each Pi session with AMC (`session_start`, or before the
 * session's first call): Pi's version, the session id and its own module's SHA-256. AMC checks them against the signed
 * installation and the extension file, AMC module and Pi install on disk, and records a signed registration: a
 * lease-holder attestation, not proof that Pi ran the hook. A session without one is not governed and its calls are
 * blocked. It then sends every Pi `tool_call` to AMC's hook control route, with Pi's working directory and whether
 * Pi's registry names Pi's own built-in for the tool, and applies AMC's decision. Before sending, it requires the
 * call's input to be plain JSON data and freezes it in place: Pi runs that very object (pi-agent-core
 * `prepareToolCall`), so nothing can change what runs while AMC decides or after. It allows a call only for an answer
 * whose AMC-signed receipt binds exactly this request (tool, arguments, Pi call id, session, version and a fresh
 * nonce). Any error, timeout, malformed or unbound answer, bad signature, lease failure, unknown event shape, input
 * that is not plain data or outage blocks the call. In both modes it records each call's request and outcome
 * (`tool_result`) as observations without arguments or output; a request AMC did not record (a 409 included) blocks
 * the call. In control mode it also sends each outcome, naming the decision it follows, to the control route, where a
 * fault of AMC's own writer latches the workspace's hooks, so every later call is blocked (hookAuditLatch.ts). An
 * outcome AMC did not record is reported; the call already ran. Observe mode never blocks.
 *
 * Structural Pi types only: AMC has no Pi runtime dependency. The contract (event fields, `{ block: true, reason }`,
 * a throwing handler blocks, `ctx.mode`) is confirmed against Pi 1.0.2 and 1.0.4 in docs/adapters/pi.md. Enforcement
 * holds only while Pi loads this extension and only for the tools AMC maps.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { types } from "node:util";
import { sha256Hex } from "../../utils/hash.js";
import { piControlAnswer, postObservation, postToBridge, readPiHookConfig, verifyPiRegistrationAnswer, PI_CONTROL_PATH, type PiHookConfig } from "./piControlClient.js";
import { piActionId, piSessionSha256 } from "./piIdentity.js";
import { UNKNOWN_PI_VERSION } from "./piVersions.js";

const AMC_CONTROL_UNAVAILABLE = "AMC control unavailable; action denied.";
const DEFAULT_TIMEOUT_MS = 5_000;
const PI_HEADERS = { "x-amc-hook-provider": "pi" };
// ponytail: allowed calls awaiting their tool_result, bounded; past it the oldest is dropped and its outcome is recorded as unmatched.
const MAX_PENDING_DECISIONS = 1_024;
/** Pi's built-in tools; any other tool name is an extension's. */
const PI_BUILTIN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls", "powershell"]);

/** The part of Pi's ExtensionContext the extension reads. */
export interface PiToolCallContext {
  readonly mode: "tui" | "rpc" | "json" | "print";
  readonly hasUI: boolean;
  /** Pi's working directory, against which Pi resolves relative tool paths. */
  readonly cwd: string;
  readonly sessionManager: { getSessionId(): string };
  readonly ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

/** The part of Pi's ExtensionAPI the extension uses. */
export interface PiExtensionApi {
  on(event: string, handler: (event: never, ctx: PiToolCallContext) => unknown): unknown;
  /** Pi's tool registry: each name's effective tool and where it came from (`builtin:<name>` for Pi's own). */
  getAllTools?(): ReadonlyArray<{ readonly name: string; readonly sourceInfo?: { readonly source?: string; readonly path?: string } }>;
}

interface PiToolEvent {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly parentToolCallId?: string;
  readonly input: Record<string, unknown>;
  readonly isError?: boolean;
}

export interface AmcPiExtensionOptions {
  /** The AMC workspace whose `.amc/hooks/pi.json` installation this extension serves. */
  readonly workspace: string;
  /** Written into the installed extension file; a manifest naming another mode is refused. */
  readonly mode: "observe" | "control";
  readonly timeoutMs?: number;
  /** Pi's VERSION, read by the installed extension file; anything but a non-empty string is "unknown", which control denies. */
  readonly piVersion?: unknown;
  /** The module whose SHA-256 the registration reports: this file, unless a test names the module the installation bound. */
  readonly modulePath?: string;
}

/** Pi's tool_call and tool_result shape (1.0.2, 1.0.4); anything else is an event AMC does not recognise. */
function isPiToolEvent(event: unknown): event is PiToolEvent {
  const value = (event ?? {}) as Record<string, unknown>;
  const nonEmpty = (field: unknown) => typeof field === "string" && field.length > 0;
  return nonEmpty(value.toolName) && nonEmpty(value.toolCallId)
    && (value.parentToolCallId === undefined || nonEmpty(value.parentToolCallId))
    && typeof value.input === "object" && value.input !== null && !Array.isArray(value.input);
}

const notPlain = () => new Error("Pi tool input is not plain JSON data");

/**
 * Require `value` to be plain JSON data (no getters, proxies, class instances, symbol keys, holes or non-finite
 * numbers) and freeze it, all the way down, before AMC sees it: what AMC evaluates is then what Pi runs, and any later
 * mutation throws, which Pi turns into a block.
 */
function freezePlainInput(value: unknown, depth = 0): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw notPlain();
    return;
  }
  if (typeof value !== "object" || depth > 64 || types.isProxy(value)) throw notPlain();
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw notPlain();
  if (Object.getOwnPropertySymbols(value).length > 0) throw notPlain();
  const fields = Object.entries(Object.getOwnPropertyDescriptors(value)).filter(([key]) => !(array && key === "length"));
  if (array && fields.length !== (value as unknown[]).length) throw notPlain();
  for (const [, field] of fields) {
    if (!("value" in field) || !field.enumerable) throw notPlain();
    if (!(field.value === undefined && !array)) freezePlainInput(field.value, depth + 1);
  }
  Object.freeze(value);
}

/** Whether Pi's registry names Pi's own built-in for `toolName`; an extension may register a tool under a built-in's name. */
function isPiBuiltinTool(pi: PiExtensionApi, toolName: string): boolean {
  try {
    const source = pi.getAllTools?.().find((tool) => tool.name === toolName)?.sourceInfo;
    return source?.source === "builtin" && source.path === `builtin:${toolName}`;
  } catch {
    return false;
  }
}

function report(ctx: PiToolCallContext, message: string): void {
  if (ctx.mode === "tui" && ctx.hasUI) ctx.ui.notify(`AMC: ${message}`, "error");
  else process.stderr.write(`AMC: ${message}\n`);
}

/** A privacy-minimal observed AEP 0.1 event: who, which tool, which action, the outcome; never arguments or output. */
function observation(config: PiHookConfig, version: string, actionId: string, toolName: string,
  type: "action.requested" | "action.completed" | "action.failed"): string {
  return JSON.stringify({
    aep_version: "0.1",
    id: `${actionId}.${type.slice("action.".length)}`,
    type,
    time: new Date().toISOString(),
    agent: { slug: config.agentId, surface: "pi", version },
    action: { type: "tool_call", id: actionId, ...(type === "action.requested" ? {} : { status: type === "action.completed" ? "success" : "failure" }) },
    tool: { type: PI_BUILTIN_TOOLS.has(toolName) ? "native" : "extension", name: toolName },
  });
}

/** The Pi extension factory. The installed `.pi/extensions/amc.js` exports `createAmcPiExtension({ workspace, mode })`. */
export function createAmcPiExtension(options: AmcPiExtensionOptions): (pi: PiExtensionApi) => Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (pi) => {
    const version = typeof options.piVersion === "string" && options.piVersion.length > 0 ? options.piVersion : UNKNOWN_PI_VERSION;
    const observe = async (event: unknown, ctx: PiToolCallContext, type: Parameters<typeof observation>[4]) => {
      try {
        if (!isPiToolEvent(event)) throw new Error("Pi sent a tool event AMC does not recognise");
        const config = readPiHookConfig(options.workspace, options.mode);
        const actionId = piActionId(ctx.sessionManager.getSessionId(), event.toolCallId);
        await postObservation(config, observation(config, version, actionId, event.toolName, type), timeoutMs);
      } catch (error) {
        report(ctx, `the ${type} observation was not recorded: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    /** The receipt digest of each allowed call's decision, until its tool_result names it. */
    const decisions = new Map<string, string>();
    /** Control mode: record one call's outcome at the observed ingress, then, naming its decision, at the control route. */
    const recordOutcome = async (event: unknown, ctx: PiToolCallContext) => {
      if (!isPiToolEvent(event)) throw new Error("Pi sent a tool_result event AMC does not recognise");
      const config = readPiHookConfig(options.workspace, "control");
      const sessionId = ctx.sessionManager.getSessionId();
      const actionId = piActionId(sessionId, event.toolCallId);
      const decisionReceiptSha256 = decisions.get(actionId) ?? null;
      decisions.delete(actionId);
      // The control route records whether the observed ingress got this outcome; a miss is recorded and refused there.
      const ingressRecorded = await postObservation(config, observation(config, version, actionId, event.toolName,
        event.isError === true ? "action.failed" : "action.completed"), timeoutMs).then(() => true, () => false);
      const answer = await postToBridge(config, PI_CONTROL_PATH, JSON.stringify({ hook_event_name: "tool_result", pi: { sessionId, toolCallId: event.toolCallId },
        tool_name: event.toolName, tool_input: event.input, isError: event.isError === true, ingressRecorded, decisionReceiptSha256 }), timeoutMs, PI_HEADERS);
      if ((answer as { recorded?: unknown } | null)?.recorded !== true) throw new Error("AMC's answer does not say it recorded the outcome");
    };

    const registered = new Set<string>();
    /** Register this Pi session with AMC once; a failure throws, so the session's calls are blocked. */
    const register = async (ctx: PiToolCallContext, config: PiHookConfig) => {
      const sessionId = ctx.sessionManager.getSessionId();
      if (registered.has(sessionId)) return;
      const extensionSha256 = sha256Hex(readFileSync(options.modulePath ?? fileURLToPath(import.meta.url)));
      const body = JSON.stringify({ hook_event_name: "session_start", pi: { version, mode: ctx.mode, sessionId, extensionSha256 } });
      const answer = await postToBridge(config, PI_CONTROL_PATH, body, timeoutMs, PI_HEADERS);
      verifyPiRegistrationAnswer(answer, { agentId: config.agentId, piSessionSha256: piSessionSha256(sessionId), piVersion: version,
        extensionSha256, requestSha256: sha256Hex(Buffer.from(body, "utf8")) }, config.receiptPublicKeys);
      registered.add(sessionId);
    };

    if (options.mode === "control") {
      pi.on("session_start", async (_event: unknown, ctx: PiToolCallContext) => {
        try {
          await register(ctx, readPiHookConfig(options.workspace, "control"));
        } catch (error) {
          report(ctx, `this Pi session is not registered with AMC, so its tool calls will be blocked: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }

    pi.on("tool_call", async (event: unknown, ctx: PiToolCallContext) => {
      if (options.mode === "observe") {
        await observe(event, ctx, "action.requested");
        return undefined;
      }
      try {
        if (!isPiToolEvent(event)) throw new Error("Pi sent a tool_call event AMC does not recognise");
        freezePlainInput(event.input);
        const input = JSON.stringify(event.input);
        const sessionId = ctx.sessionManager.getSessionId();
        const actionId = piActionId(sessionId, event.toolCallId);
        const config = readPiHookConfig(options.workspace, "control");
        await register(ctx, config);
        await postObservation(config, observation(config, version, actionId, event.toolName, "action.requested"), timeoutMs);
        const body = JSON.stringify({
          hook_event_name: "tool_call",
          tool_name: event.toolName,
          tool_input: event.input,
          pi: { version, mode: ctx.mode, sessionId, toolCallId: event.toolCallId, parentToolCallId: event.parentToolCallId ?? null, nonce: randomUUID(),
            cwd: ctx.cwd, builtinTool: isPiBuiltinTool(pi, event.toolName) },
        });
        const answer = await postToBridge(config, PI_CONTROL_PATH, body, timeoutMs, PI_HEADERS);
        const result = piControlAnswer(answer, { agentId: config.agentId, actionId, toolCallId: event.toolCallId,
          requestSha256: sha256Hex(Buffer.from(body, "utf8")) }, config.receiptPublicKeys);
        if (result.block) return result;
        if (JSON.stringify(event.input) !== input) throw new Error("Pi tool input changed while AMC decided");
        if (decisions.size >= MAX_PENDING_DECISIONS) decisions.delete(decisions.keys().next().value!);
        decisions.set(actionId, sha256Hex(Buffer.from((answer as { receipt: string }).receipt, "utf8")));
        return undefined;
      } catch (error) {
        report(ctx, `${AMC_CONTROL_UNAVAILABLE} ${error instanceof Error ? error.message : String(error)}`);
        return { block: true, reason: AMC_CONTROL_UNAVAILABLE };
      }
    });

    pi.on("tool_result", async (event: unknown, ctx: PiToolCallContext) => {
      if (options.mode === "observe") {
        await observe(event, ctx, (event as PiToolEvent | null)?.isError === true ? "action.failed" : "action.completed");
        return undefined;
      }
      try {
        await recordOutcome(event, ctx);
      } catch (error) {
        report(ctx, `AMC could not record this tool outcome; the call already ran: ${error instanceof Error ? error.message : String(error)}`);
      }
      return undefined;
    });
  };
}
