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
import { canonicalize } from "../utils/json.js";
import { redactBridgeText } from "./bridgeRedaction.js";

export type HookProvider = "claude-code" | "gemini-cli";
export type HookControlDecision = "allow" | "deny" | "ask";
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

export const providerSchema = z.enum(["claude-code", "gemini-cli"]);
export const controlDecisionSchema = z.enum(["allow", "deny", "ask"]);

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
  const provider = parseProvider(providerInput);
  return (provider === "claude-code" ? claudeControlResponseSchema : geminiControlResponseSchema)
    .safeParse(response).success;
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
