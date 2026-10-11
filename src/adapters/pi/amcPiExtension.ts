/**
 * AMC's Pi extension (P1-22). In control mode it sends every Pi `tool_call` to AMC's hook control route and applies
 * AMC's decision. It allows a call only for an answer whose AMC-signed receipt binds exactly this request (tool,
 * arguments, Pi call id, session, version and a fresh nonce), and it then freezes the call's input so a later Pi
 * handler cannot change what runs. Any error, timeout, malformed or unbound answer, bad signature, lease failure,
 * unknown event shape or outage blocks the call. In both modes it records each call's request and outcome
 * (`tool_result`) as observations without arguments or output. Observe mode never blocks.
 *
 * Structural Pi types only: AMC has no Pi runtime dependency. The contract (event fields, `{ block: true, reason }`,
 * a throwing handler blocks, `ctx.mode`) is confirmed against Pi 1.0.2 and 1.0.4 in docs/adapters/pi.md. Enforcement
 * holds only while Pi loads this extension and only for the tools AMC maps.
 */
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../../utils/hash.js";
import { piControlAnswer, postToBridge, readPiHookConfig, PI_CONTROL_PATH, PI_OBSERVE_PATH, type PiHookConfig } from "./piControlClient.js";
import { piActionId } from "./piIdentity.js";
import { UNKNOWN_PI_VERSION } from "./piVersions.js";

const AMC_CONTROL_UNAVAILABLE = "AMC control unavailable; action denied.";
const DEFAULT_TIMEOUT_MS = 5_000;
/** Pi's built-in tools; any other tool name is an extension's. */
const PI_BUILTIN_TOOLS = new Set(["read", "bash", "edit", "write", "grep", "find", "ls", "powershell"]);
/** Pi aliases this module for extensions (Pi's virtual-modules.js); widened so tsc does not resolve it. */
const PI_MODULE: string = "@earendil-works/pi-coding-agent";

/** The part of Pi's ExtensionContext the extension reads. */
export interface PiToolCallContext {
  readonly mode: "tui" | "rpc" | "json" | "print";
  readonly hasUI: boolean;
  readonly sessionManager: { getSessionId(): string };
  readonly ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

/** The part of Pi's ExtensionAPI the extension uses. */
export interface PiExtensionApi {
  on(event: string, handler: (event: never, ctx: PiToolCallContext) => unknown): unknown;
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
  /** Pi's version; read from Pi when omitted. */
  readonly piVersion?: string;
}

/** Pi's tool_call and tool_result shape (1.0.2, 1.0.4); anything else is an event AMC does not recognise. */
function isPiToolEvent(event: unknown): event is PiToolEvent {
  const value = (event ?? {}) as Record<string, unknown>;
  const nonEmpty = (field: unknown) => typeof field === "string" && field.length > 0;
  return nonEmpty(value.toolName) && nonEmpty(value.toolCallId)
    && (value.parentToolCallId === undefined || nonEmpty(value.parentToolCallId))
    && typeof value.input === "object" && value.input !== null && !Array.isArray(value.input);
}

/** Freeze the input Pi will run, all the way down: a later handler's mutation throws, and Pi blocks a throwing handler. */
function deepFreeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
}

async function readPiVersion(): Promise<string> {
  try {
    const pi = await import(PI_MODULE) as { VERSION?: unknown };
    return typeof pi.VERSION === "string" && pi.VERSION.length > 0 ? pi.VERSION : UNKNOWN_PI_VERSION;
  } catch {
    return UNKNOWN_PI_VERSION;
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
    const version = options.piVersion ?? await readPiVersion();
    const observe = async (event: unknown, ctx: PiToolCallContext, type: Parameters<typeof observation>[4]) => {
      try {
        if (!isPiToolEvent(event)) throw new Error("Pi sent a tool event AMC does not recognise");
        const config = readPiHookConfig(options.workspace, options.mode);
        const actionId = piActionId(ctx.sessionManager.getSessionId(), event.toolCallId);
        await postToBridge(config, PI_OBSERVE_PATH, observation(config, version, actionId, event.toolName, type), timeoutMs);
      } catch (error) {
        report(ctx, `the ${type} observation was not recorded: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    pi.on("tool_call", async (event: unknown, ctx: PiToolCallContext) => {
      if (options.mode === "observe") {
        await observe(event, ctx, "action.requested");
        return undefined;
      }
      try {
        if (!isPiToolEvent(event)) throw new Error("Pi sent a tool_call event AMC does not recognise");
        const sessionId = ctx.sessionManager.getSessionId();
        const actionId = piActionId(sessionId, event.toolCallId);
        const config = readPiHookConfig(options.workspace, "control");
        await postToBridge(config, PI_OBSERVE_PATH, observation(config, version, actionId, event.toolName, "action.requested"), timeoutMs);
        const body = JSON.stringify({
          hook_event_name: "tool_call",
          tool_name: event.toolName,
          tool_input: event.input,
          pi: { version, mode: ctx.mode, sessionId, toolCallId: event.toolCallId, parentToolCallId: event.parentToolCallId ?? null, nonce: randomUUID() },
        });
        const answer = await postToBridge(config, PI_CONTROL_PATH, body, timeoutMs, { "x-amc-hook-provider": "pi" });
        const result = piControlAnswer(answer, { agentId: config.agentId, actionId, toolCallId: event.toolCallId,
          requestSha256: sha256Hex(Buffer.from(body, "utf8")) }, config.receiptPublicKeys);
        if (result.block) return result;
        deepFreeze(event.input);
        return undefined;
      } catch (error) {
        report(ctx, `${AMC_CONTROL_UNAVAILABLE} ${error instanceof Error ? error.message : String(error)}`);
        return { block: true, reason: AMC_CONTROL_UNAVAILABLE };
      }
    });

    pi.on("tool_result", async (event: unknown, ctx: PiToolCallContext) => {
      await observe(event, ctx, (event as PiToolEvent | null)?.isError === true ? "action.failed" : "action.completed");
      return undefined;
    });
  };
}
