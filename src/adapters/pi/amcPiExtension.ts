/**
 * AMC's Pi extension (P1-22). In control mode it sends every Pi `tool_call` to AMC's hook control route and applies
 * AMC's allow, deny or ask; any error, timeout, malformed answer, lease failure or outage blocks the call. In both
 * modes it records each call's request and outcome (`tool_result`) as observations without arguments or output.
 * Observe mode never blocks.
 *
 * Structural Pi types only: AMC has no Pi runtime dependency. The contract (event fields, `{ block: true, reason }`,
 * a throwing handler blocks, `ctx.mode`/`ctx.hasUI`, `ctx.ui.confirm`) is confirmed against Pi 1.0.2 and 1.0.4 in
 * docs/adapters/pi.md. Enforcement holds only while Pi loads this extension and only for the tools AMC maps.
 */
import { sha256Hex } from "../../utils/hash.js";
import { piControlAnswer, postToBridge, readPiHookConfig, PI_CONTROL_PATH, PI_OBSERVE_PATH, type PiHookConfig } from "./piControlClient.js";
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
  readonly ui: {
    confirm(title: string, message: string): Promise<boolean>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
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

/** AMC's action id for one Pi call: Pi call ids can repeat across sessions, and nested ones contain "/". */
export function piActionId(sessionId: string, toolCallId: string): string {
  return `pi.${sha256Hex(`${sessionId}\0${toolCallId}`).slice(0, 40)}`;
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
function observation(config: PiHookConfig, version: string, actionId: string, event: PiToolEvent,
  type: "action.requested" | "action.completed" | "action.failed"): string {
  return JSON.stringify({
    aep_version: "0.1",
    id: `${actionId}.${type.slice("action.".length)}`,
    type,
    time: new Date().toISOString(),
    agent: { slug: config.agentId, surface: "pi", version },
    action: { type: "tool_call", id: actionId, ...(type === "action.requested" ? {} : { status: type === "action.completed" ? "success" : "failure" }) },
    tool: { type: PI_BUILTIN_TOOLS.has(event.toolName) ? "native" : "extension", name: event.toolName },
  });
}

/** The Pi extension factory. The installed `.pi/extensions/amc.js` exports `createAmcPiExtension({ workspace, mode })`. */
export function createAmcPiExtension(options: AmcPiExtensionOptions): (pi: PiExtensionApi) => Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (pi) => {
    const version = options.piVersion ?? await readPiVersion();
    const actionIds = (event: PiToolEvent, ctx: PiToolCallContext) => {
      const session = ctx.sessionManager.getSessionId();
      return { actionId: piActionId(session, event.toolCallId),
        parentActionId: event.parentToolCallId ? piActionId(session, event.parentToolCallId) : null };
    };
    const observe = async (event: PiToolEvent, ctx: PiToolCallContext, type: Parameters<typeof observation>[4]) => {
      try {
        const config = readPiHookConfig(options.workspace, options.mode);
        await postToBridge(config, PI_OBSERVE_PATH, observation(config, version, actionIds(event, ctx).actionId, event, type), timeoutMs);
      } catch (error) {
        report(ctx, `the ${type} observation was not recorded: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    pi.on("tool_call", async (event: PiToolEvent, ctx: PiToolCallContext) => {
      if (options.mode === "observe") {
        await observe(event, ctx, "action.requested");
        return undefined;
      }
      try {
        const { actionId, parentActionId } = actionIds(event, ctx);
        const config = readPiHookConfig(options.workspace, "control");
        await postToBridge(config, PI_OBSERVE_PATH, observation(config, version, actionId, event, "action.requested"), timeoutMs);
        const answer = piControlAnswer(await postToBridge(config, PI_CONTROL_PATH, JSON.stringify({
          hook_event_name: "tool_call",
          tool_name: event.toolName,
          tool_call_id: actionId,
          tool_input: event.input,
          pi: { version, mode: ctx.mode, hasUI: ctx.hasUI, toolCallId: event.toolCallId, parentActionId },
        }), timeoutMs, { "x-amc-hook-provider": "pi" }), actionId);
        if (!answer.block) return undefined;
        if (answer.ask && ctx.mode === "tui" && ctx.hasUI) {
          return await ctx.ui.confirm("AMC approval required", answer.reason)
            ? undefined
            : { block: true, reason: `${answer.reason} The action was not approved in Pi.` };
        }
        return { block: true, reason: answer.reason };
      } catch (error) {
        report(ctx, `${AMC_CONTROL_UNAVAILABLE} ${error instanceof Error ? error.message : String(error)}`);
        return { block: true, reason: AMC_CONTROL_UNAVAILABLE };
      }
    });

    pi.on("tool_result", async (event: PiToolEvent, ctx: PiToolCallContext) => {
      await observe(event, ctx, event.isError === true ? "action.failed" : "action.completed");
      return undefined;
    });
  };
}
