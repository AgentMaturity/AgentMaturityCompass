/**
 * Provider hook contracts: which providers AMC's hook control path accepts, how each provider's tool request maps to
 * canonical ToolHub requests, and the exact response each provider expects. Shared by the control route
 * (`hookControl.ts`) and the installers (`src/adapters/hookIntegration.ts`).
 */
import { z } from "zod";
import {
  parseShellCommandPlan,
  type ShellCommandPlan,
  type ShellCommandSegment,
} from "../enforce/shellCommandPlan.js";
import type { ActionClass, RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { piCwdRefusal, piPathLocations } from "../adapters/pi/piPaths.js";
import { piVersionRefusal } from "../adapters/pi/piVersions.js";
import { piActionId } from "../adapters/pi/piIdentity.js";
import { claudeActionId, claudeCodeRefusal, claudeControlRequestSchema, claudeToolRequest } from "../adapters/hookProviders/claudeCode.js";
import { redactBridgeText } from "./bridgeRedaction.js";

const HOOK_PROVIDERS = ["claude-code", "gemini-cli", "pi"] as const;
export type HookProvider = (typeof HOOK_PROVIDERS)[number];
export type HookControlDecision = "allow" | "deny" | "ask";
export type HookControlOutcome = HookControlDecision | "steer";
export type HookControlProviderMapping = "native" | "corrective_deny" | "fail_closed_deny";
export type ProviderControlResponse = Record<string, unknown>;

export type HookControlErrorCode =
  | "HOOK_CONTROL_INPUT_INVALID"
  | "HOOK_CONTROL_INPUT_AMBIGUOUS"
  | "HOOK_CONTROL_INPUT_TOO_LARGE"
  | "HOOK_CONTROL_PROVIDER_UNSUPPORTED"
  | "HOOK_CONTROL_REPLAY_CONFLICT"
  | "HOOK_CONTROL_LEDGER_UNAVAILABLE";

export class HookControlError extends Error {
  readonly code: HookControlErrorCode;
  readonly statusCode: number;

  constructor(code: HookControlErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = "HookControlError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface CanonicalToolRequest {
  name: string;
  args: Record<string, unknown>;
  segment: ShellCommandSegment | null;
  argumentsReviewable: boolean;
  /** Set by a provider mapping table: control denies when the signed config gives the tool a lower class. */
  minimumActionClass?: ActionClass;
}

export const providerSchema = z.enum(HOOK_PROVIDERS);
export const controlDecisionSchema = z.enum(["allow", "deny", "ask"]);

export function isHookProvider(value: unknown): value is HookProvider {
  return providerSchema.safeParse(value).success;
}

/** The event each provider's control hook sends; control accepts no other. */
export const CONTROL_HOOK_EVENTS: Readonly<Record<HookProvider, string>> = {
  "claude-code": "PreToolUse",
  "gemini-cli": "BeforeTool",
  pi: "tool_call",
};

export function runtimeFor(provider: HookProvider): RuntimeName {
  switch (provider) {
    case "claude-code": return "claude";
    case "gemini-cli": return "gemini";
    case "pi": return "pi";
    default: {
      const unreachable: never = provider;
      throw new Error(`unknown hook provider ${String(unreachable)}`);
    }
  }
}

/**
 * What AMC's Pi extension adds to each Pi tool_call it forwards (docs/adapters/pi.md): Pi's version and run mode,
 * Pi's session id and call id (AMC derives the action id from them) and a fresh nonce, so each decision is bound to
 * one request and can be made once. None of it is authority: identity and the decision come from AMC.
 */
const piControlContextSchema = z.strictObject({
  version: z.string().min(1).max(64),
  mode: z.enum(["tui", "rpc", "json", "print"]),
  sessionId: z.string().min(1).max(512),
  toolCallId: z.string().min(1).max(512),
  parentToolCallId: z.string().min(1).max(512).nullable(),
  nonce: z.string().min(16).max(128),
  /** Pi's working directory (ExtensionContext.cwd), against which Pi resolves relative paths. */
  cwd: z.string().min(1).max(4096),
  /** Whether Pi's tool registry names Pi's own built-in for this tool name, rather than an extension's tool. */
  builtinTool: z.boolean(),
});
export type PiControlContext = z.infer<typeof piControlContextSchema>;

/** The Pi context of a pi request, or null for other providers. A pi request without a valid one is refused. */
export function piControlContext(provider: HookProvider, input: Record<string, unknown>): PiControlContext | null {
  if (provider !== "pi") return null;
  const parsed = piControlContextSchema.safeParse(input.pi);
  if (!parsed.success) {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "Pi hook input needs a valid pi context");
  }
  return parsed.data;
}

/**
 * The call a Pi or Claude Code control request names. AMC derives the action id from the session and call id (an id
 * the payload names is ignored); the request carries a fresh nonce, so one decision answers one request. None of it is
 * authority. Other providers carry none; a Pi or Claude Code request that does not match its pinned shape is refused.
 */
export interface HookCall {
  readonly provider: "pi" | "claude-code";
  readonly actionId: string;
  readonly sessionId: string;
  readonly callId: string;
  readonly parentActionId: string | null;
  /** The provider's working directory, against which it resolves relative paths and runs shell commands. */
  readonly cwd: string;
  readonly pi: PiControlContext | null;
}

export function hookCall(provider: HookProvider, input: Record<string, unknown>): HookCall | null {
  const pi = piControlContext(provider, input);
  if (pi) {
    return { provider: "pi", actionId: piActionId(pi.sessionId, pi.toolCallId), sessionId: pi.sessionId, callId: pi.toolCallId, cwd: pi.cwd, pi,
      parentActionId: pi.parentToolCallId === null ? null : piActionId(pi.sessionId, pi.parentToolCallId) };
  }
  if (provider !== "claude-code") return null;
  const parsed = claudeControlRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "Claude Code hook input does not match the pinned PreToolUse payload with AMC's nonce");
  }
  const { session_id: sessionId, tool_use_id: callId, cwd } = parsed.data;
  return { provider: "claude-code", actionId: claudeActionId(sessionId, callId), sessionId, callId, parentActionId: null, cwd, pi: null };
}

/** Why AMC refuses a Pi or Claude Code call before mapping it, or null. */
export function hookCallRefusal(call: HookCall, workspace: string, toolName: string, toolInput: Record<string, unknown>): string | null {
  return call.pi ? piRefusal(call.pi, workspace, toolName) : claudeCodeRefusal(call.cwd, workspace, toolName, toolInput);
}

/**
 * Whether a recorded outcome mapping is one AMC produces: native, Claude Code's corrective deny for steer, or a
 * capability-lossy deny for an ask (every provider: a provider-local ask is not AMC approval) or another provider's steer.
 */
export function controlMappingValid(value: { provider: HookProvider; requestedDecision: HookControlOutcome; decision: HookControlDecision;
  effectiveOutcome: HookControlOutcome; providerMapping: HookControlProviderMapping; capabilityLossy: boolean }): boolean {
  if (value.providerMapping === "native") {
    return value.requestedDecision !== "steer" && value.requestedDecision === value.decision && value.effectiveOutcome === value.decision
      && !value.capabilityLossy;
  }
  if (value.providerMapping === "corrective_deny") {
    return value.provider === "claude-code" && value.requestedDecision === "steer" && value.decision === "deny"
      && value.effectiveOutcome === "steer" && !value.capabilityLossy;
  }
  return (value.requestedDecision === "ask" || (value.requestedDecision === "steer" && value.provider !== "claude-code"))
    && value.decision === "deny" && value.effectiveOutcome === "deny" && value.capabilityLossy;
}

/** Why AMC denied an outcome the provider's hook cannot carry (capability-lossy). */
function lossyOutcomeNote(outcome: "ask" | "steer", provider: HookProvider): string {
  if (provider === "claude-code") return "A Claude Code ask is not AMC approval, and AMC has no approval path for hook calls, so AMC denied the action.";
  if (provider === "pi") {
    return outcome === "ask"
      ? "A Pi tool call cannot carry an AMC approval, so AMC denied the action."
      : "Pi tool_call has no verified corrective retry outcome, so AMC denied the action.";
  }
  return outcome === "ask"
    ? "Gemini CLI BeforeTool does not support ask, so AMC denied the action."
    : "Gemini CLI BeforeTool does not support a verified corrective retry outcome, so AMC denied the action.";
}

const claudeControlResponseSchema = z.object({
  hookSpecificOutput: z.object({
    hookEventName: z.literal("PreToolUse"),
    permissionDecision: controlDecisionSchema,
    permissionDecisionReason: z.string().min(1).max(1_024),
    additionalContext: z.string().min(1).max(1_024).optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.hookSpecificOutput.additionalContext
    && value.hookSpecificOutput.permissionDecision !== "deny") {
    ctx.addIssue({
      code: "custom",
      path: ["hookSpecificOutput", "additionalContext"],
      message: "corrective context requires a blocking deny decision",
    });
  }
});

const geminiControlResponseSchema = z.union([
  z.object({ decision: z.literal("allow") }).strict(),
  z.object({
    decision: z.literal("deny"),
    reason: z.string().min(1).max(1_024),
  }).strict(),
]);

/**
 * Pi's ToolCallEventResult: `{ block: true, reason }` blocks, `{ block: false }` runs the tool. `requestSha256` is the
 * digest of the exact request AMC decided; the signed receipt's body digest covers it, so a receipt authorizes only
 * that request. Pi ignores the extra member.
 */
const requestSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const piControlResponseSchema = z.union([
  z.strictObject({ block: z.literal(false), requestSha256: requestSha256Schema }),
  z.strictObject({ block: z.literal(true), reason: z.string().min(1).max(1_024), requestSha256: requestSha256Schema }),
]);

const CONTROL_RESPONSE_SCHEMAS: Readonly<Record<HookProvider, z.ZodType>> = {
  "claude-code": claudeControlResponseSchema,
  "gemini-cli": geminiControlResponseSchema,
  pi: piControlResponseSchema,
};

export function parseProvider(provider: unknown): HookProvider {
  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) {
    throw new HookControlError(
      "HOOK_CONTROL_PROVIDER_UNSUPPORTED",
      400,
      "hook control provider is unsupported",
    );
  }
  return parsed.data;
}

function cleanReason(reason: string): string {
  const cleaned = redactBridgeText(reason).replace(/\s+/g, " ").trim().slice(0, 1_024);
  return cleaned || "AMC denied the provider tool request.";
}

export function renderProviderControlResponse(
  providerInput: HookProvider,
  decision: HookControlDecision,
  reasonInput: string,
  extra: { additionalContext?: string; requestSha256?: string } = {},
): ProviderControlResponse {
  const provider = parseProvider(providerInput);
  const reason = cleanReason(reasonInput);
  if (provider === "claude-code") {
    const additionalContext = decision === "deny" && extra.additionalContext
      ? cleanReason(extra.additionalContext)
      : null;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
        ...(additionalContext ? { additionalContext } : {}),
      },
    };
  }
  if (provider === "pi") {
    if (!extra.requestSha256) throw new Error("a Pi control response must bind the request it decided");
    return decision === "allow" ? { block: false, requestSha256: extra.requestSha256 } : { block: true, reason, requestSha256: extra.requestSha256 };
  }
  if (decision === "allow") {
    return { decision: "allow" };
  }
  if (decision === "ask") {
    return {
      decision: "deny",
      reason: cleanReason(
        `${reason} Gemini CLI BeforeTool does not support ask; use an AMC-approved ToolHub execution path or a provider with native ask support.`,
      ),
    };
  }
  return { decision: "deny", reason };
}

export function serializeProviderControlResponse(response: ProviderControlResponse): string {
  return canonicalize(response);
}

export function validateProviderControlResponse(
  providerInput: HookProvider,
  response: unknown,
): response is ProviderControlResponse {
  return CONTROL_RESPONSE_SCHEMAS[parseProvider(providerInput)].safeParse(response).success;
}

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function canonicalShellToolRequest(
  segment: ShellCommandSegment,
  workspace: string,
): CanonicalToolRequest {
  if (segment.binary === "git") {
    const firstArgument = segment.argv[0] ?? "";
    const subcommands = new Set(segment.argv);
    const name = subcommands.has("push")
      ? "git.push"
      : subcommands.has("commit")
        ? "git.commit"
        : subcommands.has("status")
          ? "git.status"
          : "git.push";
    return {
      name,
      args: { cwd: workspace },
      segment,
      argumentsReviewable: !firstArgument.startsWith("-"),
    };
  }
  return {
    name: "process.spawn",
    args: { binary: segment.binary, argv: segment.argv },
    segment,
    argumentsReviewable: true,
  };
}

/** The provider's response for AMC's requested outcome; an outcome the provider cannot carry becomes a lossy deny. */
export function materializeProviderDecision(input: {
  provider: HookProvider;
  /** The digest of the exact request; Pi's response binds it. */
  requestSha256: string;
  requestedDecision: HookControlOutcome;
  reason: string;
}): {
  decision: HookControlDecision;
  effectiveOutcome: HookControlOutcome;
  providerMapping: HookControlProviderMapping;
  capabilityLossy: boolean;
  reason: string;
  providerResponse: ProviderControlResponse;
  providerResponseSha256: string;
} {
  let decision: HookControlDecision;
  let effectiveOutcome: HookControlOutcome;
  let providerMapping: HookControlProviderMapping;
  let capabilityLossy: boolean;
  let reason: string;
  let providerResponse: ProviderControlResponse;
  const binding = { requestSha256: input.requestSha256 };

  if (input.requestedDecision === "steer") {
    decision = "deny";
    if (input.provider === "claude-code") {
      effectiveOutcome = "steer";
      providerMapping = "corrective_deny";
      capabilityLossy = false;
      reason = cleanReason(input.reason);
      providerResponse = renderProviderControlResponse(input.provider, "deny", reason, {
        additionalContext: "Correct the tool arguments to satisfy the signed ToolHub constraints, then retry as a new action. AMC did not rewrite the input and will re-evaluate every control on the retry.",
      });
    } else {
      effectiveOutcome = "deny";
      providerMapping = "fail_closed_deny";
      capabilityLossy = true;
      reason = cleanReason(`${input.reason} ${lossyOutcomeNote("steer", input.provider)}`);
      providerResponse = renderProviderControlResponse(input.provider, "deny", reason, binding);
    }
  } else if (input.requestedDecision === "ask") {
    decision = "deny";
    effectiveOutcome = "deny";
    providerMapping = "fail_closed_deny";
    capabilityLossy = true;
    reason = cleanReason(`${input.reason} ${lossyOutcomeNote("ask", input.provider)}`);
    // Gemini CLI's own renderer turns an ask into its deny; every other provider gets a plain deny.
    providerResponse = input.provider === "gemini-cli"
      ? renderProviderControlResponse(input.provider, "ask", input.reason)
      : renderProviderControlResponse(input.provider, "deny", reason, binding);
  } else {
    decision = input.requestedDecision;
    effectiveOutcome = input.requestedDecision;
    providerMapping = "native";
    capabilityLossy = false;
    reason = cleanReason(input.reason);
    providerResponse = renderProviderControlResponse(input.provider, decision, reason, binding);
  }

  return {
    decision,
    effectiveOutcome,
    providerMapping,
    capabilityLossy,
    reason,
    providerResponse,
    providerResponseSha256: sha256Hex(Buffer.from(serializeProviderControlResponse(providerResponse), "utf8")),
  };
}

/**
 * Every Pi tool AMC controls (the built-ins of Pi 1.0.2 and 1.0.4), its canonical ToolHub tool and the lowest action
 * class the signed config may give that tool; a lower class is denied. `read` needs a path; grep, find and ls default
 * to the working directory. Any tool not listed, extension and Codemode tools included, is denied until mapped here.
 */
const PI_TOOLS: Readonly<Record<string, { tool: "fs.read" | "fs.write" | "shell"; minimumActionClass: ActionClass; cwdDefault?: true }>> = {
  read: { tool: "fs.read", minimumActionClass: "READ_ONLY" },
  grep: { tool: "fs.read", minimumActionClass: "READ_ONLY", cwdDefault: true },
  find: { tool: "fs.read", minimumActionClass: "READ_ONLY", cwdDefault: true },
  ls: { tool: "fs.read", minimumActionClass: "READ_ONLY", cwdDefault: true },
  write: { tool: "fs.write", minimumActionClass: "WRITE_LOW" },
  edit: { tool: "fs.write", minimumActionClass: "WRITE_LOW" },
  // An arbitrary binary is at least WRITE_HIGH; git subcommands keep the classes the signed config gives git.*.
  bash: { tool: "shell", minimumActionClass: "WRITE_HIGH" },
};

const piTool = (toolName: string) => (Object.hasOwn(PI_TOOLS, toolName) ? PI_TOOLS[toolName]! : null);

/** Why AMC refuses a Pi call before mapping it: an unqualified Pi, another working directory, or a mapped name an extension took over. */
export function piRefusal(pi: Pick<PiControlContext, "version" | "cwd" | "builtinTool">, workspace: string, toolName: string): string | null {
  return piVersionRefusal(pi.version) ?? piCwdRefusal(pi.cwd, workspace) ?? (piTool(toolName) && !pi.builtinTool
    ? `Pi's ${toolName} tool is an extension's tool, not Pi's built-in; AMC maps only Pi's built-ins and denied the call.` : null);
}

/** A path tool's request at every location Pi opens for it (piPaths.ts); none when the path is missing or unresolvable. */
function piToolRequest(toolName: string, toolInput: Record<string, unknown>, workspace: string, cwd: string): Omit<CanonicalToolRequest, "segment"> | null {
  const entry = piTool(toolName);
  if (!entry || entry.tool === "shell") return null;
  // Pi's own default: `path || "."` for grep, find and ls; read, write and edit require a path.
  const raw = entry.cwdDefault && (toolInput.path === undefined || toolInput.path === "") ? "." : toolInput.path;
  const locations = typeof raw === "string" && raw.length > 0 ? piPathLocations(toolName, raw, cwd, workspace) : null;
  if (!locations) return null;
  return { name: entry.tool, args: { path: locations.length === 1 ? locations[0]! : locations }, argumentsReviewable: true,
    minimumActionClass: entry.minimumActionClass };
}

function shellCommandForProviderTool(
  provider: HookProvider,
  toolName: string,
  toolInput: Record<string, unknown>,
): string | null {
  if (provider === "claude-code" && toolName === "Bash") {
    return firstString(toolInput, ["command"]) ?? "";
  }
  if (provider === "gemini-cli" && toolName === "run_shell_command") {
    return firstString(toolInput, ["command"]) ?? "";
  }
  if (provider === "pi" && piTool(toolName)?.tool === "shell") {
    return firstString(toolInput, ["command"]) ?? "";
  }
  return null;
}

export function canonicalToolRequests(
  provider: HookProvider,
  toolName: string,
  toolInput: Record<string, unknown>,
  workspace: string,
  call: Pick<HookCall, "cwd"> | null = null,
): { requests: CanonicalToolRequest[]; commandPlan: ShellCommandPlan | null } {
  if (provider !== "gemini-cli" && !call) return { requests: [], commandPlan: null };
  const command = shellCommandForProviderTool(provider, toolName, toolInput);
  if (command !== null) {
    const commandPlan = parseShellCommandPlan(command);
    return {
      commandPlan,
      requests: commandPlan.status === "parsed"
        ? commandPlan.segments.map((segment) => canonicalShellToolRequest(segment, workspace)).map((request) =>
          provider === "pi" && request.name === "process.spawn" ? { ...request, minimumActionClass: PI_TOOLS.bash!.minimumActionClass } : request)
        : [],
    };
  }

  let request: Omit<CanonicalToolRequest, "segment"> | null = null;
  if (provider === "claude-code") {
    const mapped = call ? claudeToolRequest(toolName, toolInput, workspace, call.cwd) : null;
    request = mapped ? { ...mapped, argumentsReviewable: true } : null;
  } else if (provider === "pi") {
    request = call ? piToolRequest(toolName, toolInput, workspace, call.cwd) : null;
  } else if (["read_file", "list_directory", "glob", "search_file_content"].includes(toolName)) {
    request = {
      name: "fs.read",
      args: { path: firstString(toolInput, ["file_path", "path", "dir_path"]) ?? workspace },
      argumentsReviewable: true,
    };
  } else if (["write_file", "replace"].includes(toolName)) {
    const path = firstString(toolInput, ["file_path", "path"]);
    request = path ? { name: "fs.write", args: { path }, argumentsReviewable: true } : null;
  } else if (toolName === "web_fetch") {
    const url = firstString(toolInput, ["url"]);
    request = url
      ? { name: "http.fetch", args: { url, method: "GET" }, argumentsReviewable: true }
      : null;
  }

  return {
    commandPlan: null,
    requests: request ? [{ ...request, segment: null }] : [],
  };
}
