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
import type { RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { redactBridgeText } from "./bridgeRedaction.js";

export const HOOK_PROVIDERS = ["claude-code", "gemini-cli", "pi"] as const;
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
 * What AMC's Pi extension adds to each Pi tool_call it forwards (docs/adapters/pi.md): Pi's version, run mode and
 * dialog support as Pi's ExtensionContext reports them, Pi's own call id, and the AMC action id of the calling tool.
 */
const piControlContextSchema = z.strictObject({
  version: z.string().min(1).max(64),
  mode: z.enum(["tui", "rpc", "json", "print"]),
  hasUI: z.boolean(),
  toolCallId: z.string().min(1).max(512),
  parentActionId: z.string().min(1).max(160).nullable(),
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

/** Claude Code can put an ask to a person; Pi only in its interactive terminal UI, never print, JSON, RPC or the SDK. */
export function supportsNativeAsk(provider: HookProvider, pi: PiControlContext | null): boolean {
  return provider === "claude-code" || (pi !== null && pi.mode === "tui" && pi.hasUI);
}

/** Why AMC denied an outcome the provider's hook cannot carry (capability-lossy). */
export function lossyOutcomeNote(outcome: "ask" | "steer", provider: HookProvider, pi: PiControlContext | null): string {
  if (provider === "pi") {
    return outcome === "ask"
      ? `Pi ${pi?.mode ?? "unknown"} mode has no interactive confirmation, so AMC denied the action.`
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
 * Pi's ToolCallEventResult: `{ block: true, reason }` blocks, no block runs the tool. `ask: true` is AMC's own
 * instruction to its extension to confirm in Pi's UI; an extension that ignores it still blocks.
 */
const piControlResponseSchema = z.union([
  z.strictObject({ block: z.literal(false) }),
  z.strictObject({ block: z.literal(true), reason: z.string().min(1).max(1_024) }),
  z.strictObject({ block: z.literal(true), reason: z.string().min(1).max(1_024), ask: z.literal(true) }),
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

export function cleanReason(reason: string): string {
  const cleaned = redactBridgeText(reason).replace(/\s+/g, " ").trim().slice(0, 1_024);
  return cleaned || "AMC denied the provider tool request.";
}

export function renderProviderControlResponse(
  providerInput: HookProvider,
  decision: HookControlDecision,
  reasonInput: string,
  additionalContextInput?: string,
): ProviderControlResponse {
  const provider = parseProvider(providerInput);
  const reason = cleanReason(reasonInput);
  if (provider === "claude-code") {
    const additionalContext = decision === "deny" && additionalContextInput
      ? cleanReason(additionalContextInput)
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
    if (decision === "allow") return { block: false };
    return decision === "ask" ? { block: true, reason, ask: true } : { block: true, reason };
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
  pi: PiControlContext | null;
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

  if (input.requestedDecision === "steer") {
    decision = "deny";
    if (input.provider === "claude-code") {
      effectiveOutcome = "steer";
      providerMapping = "corrective_deny";
      capabilityLossy = false;
      reason = cleanReason(input.reason);
      providerResponse = renderProviderControlResponse(
        input.provider,
        "deny",
        reason,
        "Correct the tool arguments to satisfy the signed ToolHub constraints, then retry as a new action. AMC did not rewrite the input and will re-evaluate every control on the retry.",
      );
    } else {
      effectiveOutcome = "deny";
      providerMapping = "fail_closed_deny";
      capabilityLossy = true;
      reason = cleanReason(`${input.reason} ${lossyOutcomeNote("steer", input.provider, input.pi)}`);
      providerResponse = renderProviderControlResponse(input.provider, "deny", reason);
    }
  } else if (input.requestedDecision === "ask" && !supportsNativeAsk(input.provider, input.pi)) {
    decision = "deny";
    effectiveOutcome = "deny";
    providerMapping = "fail_closed_deny";
    capabilityLossy = true;
    reason = cleanReason(`${input.reason} ${lossyOutcomeNote("ask", input.provider, input.pi)}`);
    // Gemini CLI's own renderer turns an ask into its deny; every other provider gets a plain deny.
    providerResponse = input.provider === "gemini-cli"
      ? renderProviderControlResponse(input.provider, "ask", input.reason)
      : renderProviderControlResponse(input.provider, "deny", reason);
  } else {
    decision = input.requestedDecision;
    effectiveOutcome = input.requestedDecision;
    providerMapping = "native";
    capabilityLossy = false;
    reason = cleanReason(input.reason);
    providerResponse = renderProviderControlResponse(input.provider, decision, reason);
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

/** Pi's built-in tools (1.0.2 and 1.0.4 schemas): `read` needs a path; grep, find and ls default to the cwd. */
function piToolRequest(toolName: string, toolInput: Record<string, unknown>, workspace: string): Omit<CanonicalToolRequest, "segment"> | null {
  const path = firstString(toolInput, ["path"]);
  if (toolName === "read" || ["grep", "find", "ls"].includes(toolName)) {
    const readPath = toolName === "read" ? path : path ?? workspace;
    return readPath ? { name: "fs.read", args: { path: readPath }, argumentsReviewable: true } : null;
  }
  if (toolName === "write" || toolName === "edit") {
    return path ? { name: "fs.write", args: { path }, argumentsReviewable: true } : null;
  }
  return null;
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
  if (provider === "pi" && toolName === "bash") {
    return firstString(toolInput, ["command"]) ?? "";
  }
  return null;
}

export function canonicalToolRequests(
  provider: HookProvider,
  toolName: string,
  toolInput: Record<string, unknown>,
  workspace: string,
): { requests: CanonicalToolRequest[]; commandPlan: ShellCommandPlan | null } {
  const command = shellCommandForProviderTool(provider, toolName, toolInput);
  if (command !== null) {
    const commandPlan = parseShellCommandPlan(command);
    return {
      commandPlan,
      requests: commandPlan.status === "parsed"
        ? commandPlan.segments.map((segment) => canonicalShellToolRequest(segment, workspace))
        : [],
    };
  }

  let request: Omit<CanonicalToolRequest, "segment"> | null = null;
  if (provider === "claude-code") {
    if (["Read", "Glob", "Grep"].includes(toolName)) {
      request = {
        name: "fs.read",
        args: { path: firstString(toolInput, ["file_path", "path"]) ?? workspace },
        argumentsReviewable: true,
      };
    } else if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) {
      const path = firstString(toolInput, ["file_path", "notebook_path", "path"]);
      request = path ? { name: "fs.write", args: { path }, argumentsReviewable: true } : null;
    } else if (toolName === "WebFetch") {
      const url = firstString(toolInput, ["url"]);
      request = url
        ? { name: "http.fetch", args: { url, method: "GET" }, argumentsReviewable: true }
        : null;
    }
  } else if (provider === "pi") {
    request = piToolRequest(toolName, toolInput, workspace);
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
