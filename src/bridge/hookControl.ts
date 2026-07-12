import { canonicalize } from "../utils/json.js";
import { z } from "zod";
import YAML from "yaml";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { verifyBudgetsConfigSignature } from "../budgets/budgets.js";
import {
  loadApprovalPolicy,
  verifyApprovalPolicySignature,
} from "../approvals/approvalPolicyEngine.js";
import { runGovernorCheck } from "../governor/governorCli.js";
import {
  openLedger,
  hashBinaryOrPath,
  verifyEvidenceEventIntegrity,
} from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
import {
  findToolDefinition,
  loadToolsConfig,
  validateToolRequest,
  verifyToolsConfigSignature,
} from "../toolhub/toolhubValidators.js";
import type { ActionClass, RiskTier, RuntimeName } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { redactBridgeText } from "./bridgeRedaction.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { resolveProviderHookRequestIdentity } from "./hookActionIdentity.js";

export const CONTROL_HOOK_PATH = "/bridge/hooks/control/v1";
export const CONTROL_HOOK_ROUTE = "/hooks/control/v1";
export const MAX_CONTROL_HOOK_BODY_BYTES = 262_144;

export type HookProvider = "claude-code" | "gemini-cli";
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

export interface ProviderHookControlResult {
  controlled: true;
  idempotentReplay: boolean;
  provider: HookProvider;
  actionId: string;
  eventId: string;
  sessionId: string;
  canonicalToolName: string | null;
  requestedDecision: HookControlOutcome;
  decision: HookControlDecision;
  effectiveOutcome: HookControlOutcome;
  providerMapping: HookControlProviderMapping;
  capabilityLossy: boolean;
  reason: string;
  providerResponse: ProviderControlResponse;
  providerResponseSha256: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
}

interface NormalizedProviderToolRequest {
  provider: HookProvider;
  actionId: string;
  providerToolName: string;
  canonicalToolName: string | null;
  args: Record<string, unknown>;
  rawInputSha256: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const providerSchema = z.enum(["claude-code", "gemini-cli"]);
const controlDecisionSchema = z.enum(["allow", "deny", "ask"]);
const controlOutcomeSchema = z.enum(["allow", "deny", "ask", "steer"]);
const controlProviderMappingSchema = z.enum(["native", "corrective_deny", "fail_closed_deny"]);
const providerHookInputSchema = z.object({
  hook_event_name: z.string().min(1).max(160),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
  tool_use_id: z.string().min(1).max(160).optional(),
  tool_call_id: z.string().min(1).max(160).optional(),
  session_id: z.string().max(512).optional(),
  timestamp: z.string().max(128).optional(),
}).passthrough();

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

const storedControlMetaV1Schema = z.object({
  trustTier: z.literal("OBSERVED"),
  controlSchemaVersion: z.literal(1),
  agentId: z.string().min(1),
  provider: providerSchema,
  actionId: z.string().min(1),
  rawInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rawPayloadStored: z.literal(false),
  canonicalToolName: z.string().nullable(),
  requestedDecision: controlDecisionSchema,
  decision: controlDecisionSchema,
  capabilityLossy: z.boolean(),
  reason: z.string().min(1),
  providerResponse: z.record(z.string(), z.unknown()),
  providerResponseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: z.string().min(1),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();

const storedControlMetaV2Schema = z.object({
  trustTier: z.literal("OBSERVED"),
  controlSchemaVersion: z.literal(2),
  agentId: z.string().min(1),
  provider: providerSchema,
  actionId: z.string().min(1),
  rawInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rawPayloadStored: z.literal(false),
  canonicalToolName: z.string().nullable(),
  requestedDecision: controlOutcomeSchema,
  decision: controlDecisionSchema,
  effectiveOutcome: controlOutcomeSchema,
  providerMapping: controlProviderMappingSchema,
  capabilityLossy: z.boolean(),
  reason: z.string().min(1).max(1_024),
  providerResponse: z.record(z.string(), z.unknown()),
  providerResponseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: z.string().min(1),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough().superRefine((value, ctx) => {
  if (!controlMappingValid(value)) {
    ctx.addIssue({ code: "custom", path: ["providerMapping"], message: "provider outcome mapping is inconsistent" });
  }
});

const storedControlMetaSchema = z.discriminatedUnion("controlSchemaVersion", [
  storedControlMetaV1Schema,
  storedControlMetaV2Schema,
]);

const providerHookControlResultV1Schema = z.object({
  controlled: z.literal(true),
  idempotentReplay: z.boolean(),
  provider: providerSchema,
  actionId: z.string().min(1),
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  canonicalToolName: z.string().nullable(),
  requestedDecision: controlDecisionSchema,
  decision: controlDecisionSchema,
  capabilityLossy: z.boolean(),
  reason: z.string().min(1),
  providerResponse: z.record(z.string(), z.unknown()),
  providerResponseSha256: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: z.string().min(1),
  receiptId: z.string().min(1),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const providerHookControlResultV2Schema = providerHookControlResultV1Schema.extend({
  requestedDecision: controlOutcomeSchema,
  effectiveOutcome: controlOutcomeSchema,
  providerMapping: controlProviderMappingSchema,
}).strict();

const providerHookControlResultSchema = z.union([
  providerHookControlResultV2Schema,
  providerHookControlResultV1Schema,
]);

interface ControlMappingFields {
  provider: HookProvider;
  requestedDecision: HookControlOutcome;
  decision: HookControlDecision;
  effectiveOutcome: HookControlOutcome;
  providerMapping: HookControlProviderMapping;
  capabilityLossy: boolean;
}

function controlMappingValid(value: ControlMappingFields): boolean {
  if (value.providerMapping === "native") {
    return value.requestedDecision !== "steer"
      && value.requestedDecision === value.decision
      && value.effectiveOutcome === value.decision
      && !value.capabilityLossy;
  }
  if (value.providerMapping === "corrective_deny") {
    return value.provider === "claude-code"
      && value.requestedDecision === "steer"
      && value.decision === "deny"
      && value.effectiveOutcome === "steer"
      && !value.capabilityLossy;
  }
  return value.provider === "gemini-cli"
    && (value.requestedDecision === "ask" || value.requestedDecision === "steer")
    && value.decision === "deny"
    && value.effectiveOutcome === "deny"
    && value.capabilityLossy;
}

function normalizeLegacyControlFields(value: {
  provider: HookProvider;
  requestedDecision: HookControlDecision;
  decision: HookControlDecision;
  capabilityLossy: boolean;
}): Pick<ControlMappingFields, "effectiveOutcome" | "providerMapping"> {
  if (value.provider === "gemini-cli"
    && value.requestedDecision === "ask"
    && value.decision === "deny"
    && value.capabilityLossy) {
    return { effectiveOutcome: "deny", providerMapping: "fail_closed_deny" };
  }
  if (value.requestedDecision === value.decision && !value.capabilityLossy) {
    return { effectiveOutcome: value.decision, providerMapping: "native" };
  }
  throw new Error("legacy provider outcome mapping is inconsistent");
}

function normalizeControlResult(
  value: z.infer<typeof providerHookControlResultSchema>,
): ProviderHookControlResult {
  if ("effectiveOutcome" in value && "providerMapping" in value) return value;
  return { ...value, ...normalizeLegacyControlFields(value) };
}

function parseProvider(provider: unknown): HookProvider {
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

function parseProviderInput(rawInput: string): z.infer<typeof providerHookInputSchema> {
  if (Buffer.byteLength(rawInput, "utf8") > MAX_CONTROL_HOOK_BODY_BYTES) {
    throw new HookControlError("HOOK_CONTROL_INPUT_TOO_LARGE", 413, "provider hook input exceeds 256 KiB");
  }
  let value: unknown;
  try {
    value = JSON.parse(rawInput) as unknown;
  } catch {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "provider hook input must be valid JSON");
  }
  const document = YAML.parseDocument(rawInput, { uniqueKeys: true });
  if (document.errors.some((error) => /unique|duplicate/i.test(error.message))) {
    throw new HookControlError("HOOK_CONTROL_INPUT_AMBIGUOUS", 400, "provider hook input contains duplicate JSON keys");
  }
  const parsed = providerHookInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "provider hook input is missing required tool fields");
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

function parseSimpleCommand(command: string): { binary: string; argv: string[] } | null {
  if (!command.trim() || /[\0\r\n;&|`$<>()[\]{}\\]/.test(command)) return null;
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (quote) return null;
  if (current) args.push(current);
  const [binary, ...argv] = args;
  return binary ? { binary, argv } : null;
}

function canonicalToolRequest(
  provider: HookProvider,
  toolName: string,
  toolInput: Record<string, unknown>,
  workspace: string,
): { name: string; args: Record<string, unknown> } | null {
  if (provider === "claude-code") {
    if (["Read", "Glob", "Grep"].includes(toolName)) {
      return {
        name: "fs.read",
        args: { path: firstString(toolInput, ["file_path", "path"]) ?? workspace },
      };
    }
    if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) {
      const path = firstString(toolInput, ["file_path", "notebook_path", "path"]);
      return path ? { name: "fs.write", args: { path } } : null;
    }
    if (toolName === "Bash") {
      const parsed = parseSimpleCommand(firstString(toolInput, ["command"]) ?? "");
      return parsed ? { name: "process.spawn", args: parsed } : null;
    }
    if (toolName === "WebFetch") {
      const url = firstString(toolInput, ["url"]);
      return url ? { name: "http.fetch", args: { url, method: "GET" } } : null;
    }
    return null;
  }

  if (["read_file", "list_directory", "glob", "search_file_content"].includes(toolName)) {
    return {
      name: "fs.read",
      args: { path: firstString(toolInput, ["file_path", "path", "dir_path"]) ?? workspace },
    };
  }
  if (["write_file", "replace"].includes(toolName)) {
    const path = firstString(toolInput, ["file_path", "path"]);
    return path ? { name: "fs.write", args: { path } } : null;
  }
  if (toolName === "run_shell_command") {
    const parsed = parseSimpleCommand(firstString(toolInput, ["command"]) ?? "");
    return parsed ? { name: "process.spawn", args: parsed } : null;
  }
  if (toolName === "web_fetch") {
    const url = firstString(toolInput, ["url"]);
    return url ? { name: "http.fetch", args: { url, method: "GET" } } : null;
  }
  return null;
}

function normalizeProviderRequest(input: {
  workspace: string;
  provider: HookProvider;
  rawInput: string;
}): NormalizedProviderToolRequest {
  const parsed = parseProviderInput(input.rawInput);
  const expectedEvent = input.provider === "claude-code" ? "PreToolUse" : "BeforeTool";
  if (parsed.hook_event_name !== expectedEvent) {
    throw new HookControlError(
      "HOOK_CONTROL_INPUT_INVALID",
      400,
      `hook control accepts only ${expectedEvent} events`,
    );
  }
  const rawInputSha256 = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  const identity = resolveProviderHookRequestIdentity({
    provider: input.provider,
    providerActionId: parsed.tool_use_id ?? parsed.tool_call_id,
    sessionId: parsed.session_id,
    timestamp: parsed.timestamp,
    toolName: parsed.tool_name,
    toolInput: parsed.tool_input,
    rawInputSha256,
  });
  const mapped = canonicalToolRequest(input.provider, parsed.tool_name, parsed.tool_input, input.workspace);
  return {
    provider: input.provider,
    actionId: identity.actionId,
    providerToolName: redactBridgeText(parsed.tool_name).slice(0, 512),
    canonicalToolName: mapped?.name ?? null,
    args: mapped?.args ?? {},
    rawInputSha256,
  };
}

function riskTierFor(actionClass: ActionClass): RiskTier {
  if (actionClass === "READ_ONLY") return "low";
  if (actionClass === "WRITE_LOW") return "med";
  if (actionClass === "WRITE_HIGH" || actionClass === "NETWORK_EXTERNAL") return "high";
  return "critical";
}

function requestedControlDecision(input: {
  workspace: string;
  agentId: string;
  request: NormalizedProviderToolRequest;
}): { decision: HookControlOutcome; reason: string } {
  if (!input.request.canonicalToolName) {
    return {
      decision: "deny",
      reason: `Provider tool ${input.request.providerToolName} is not mapped to an allowed ToolHub tool.`,
    };
  }

  const signatureChecks = [
    ["action policy", verifyActionPolicySignature(input.workspace)],
    ["approval policy", verifyApprovalPolicySignature(input.workspace)],
    ["ToolHub config", verifyToolsConfigSignature(input.workspace)],
    ["budget policy", verifyBudgetsConfigSignature(input.workspace)],
  ] as const;
  for (const [label, check] of signatureChecks) {
    if (!check.valid) {
      return { decision: "deny", reason: `${label} signature invalid; control fails closed.` };
    }
  }

  try {
    const tools = loadToolsConfig(input.workspace);
    const tool = findToolDefinition(tools, input.request.canonicalToolName);
    if (!tool) {
      return {
        decision: "deny",
        reason: `Canonical tool ${input.request.canonicalToolName} is not allowed by signed ToolHub config.`,
      };
    }
    const argsValidation = validateToolRequest({
      workspace: input.workspace,
      tool,
      args: input.request.args,
    });
    if (!argsValidation.ok) {
      return {
        decision: "steer",
        reason: `Signed ToolHub policy rejected the current ${tool.name} arguments.`,
      };
    }

    const governor = runGovernorCheck({
      workspace: input.workspace,
      agentId: input.agentId,
      actionClass: tool.actionClass,
      riskTier: riskTierFor(tool.actionClass),
      mode: "EXECUTE",
    });
    if (!governor.allowed || governor.effectiveMode !== "EXECUTE") {
      return {
        decision: "deny",
        reason: governor.reasons.length > 0
          ? `Signed Action Policy denied native execution: ${governor.reasons.join(" ")}`
          : "Signed Action Policy denied native execution.",
      };
    }

    const approvalPolicy = loadApprovalPolicy(input.workspace);
    const approvalRule = approvalPolicy.approvalPolicy.actionClasses[tool.actionClass];
    const requiredApprovals = approvalRule?.requiredApprovals ?? 0;
    if (requiredApprovals > 0) {
      if (requiredApprovals !== 1 || approvalRule?.requireDistinctUsers === true) {
        return {
          decision: "deny",
          reason: `Signed Approval Policy requires ${requiredApprovals} distinct or multi-user approvals and cannot be reduced to one provider-local ask.`,
        };
      }
      return {
        decision: "ask",
        reason: `Signed Approval Policy requires ${requiredApprovals} human approval${requiredApprovals === 1 ? "" : "s"} before ${tool.actionClass}.`,
      };
    }
    return {
      decision: "allow",
      reason: `Signed AMC policies allow ${tool.actionClass} through ${tool.name}.`,
    };
  } catch {
    return { decision: "deny", reason: "AMC control evaluation failed closed." };
  }
}

function materializeProviderDecision(input: {
  provider: HookProvider;
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
      reason = cleanReason(
        `${input.reason} Gemini CLI BeforeTool does not support a verified corrective retry outcome, so AMC denied the action.`,
      );
      providerResponse = renderProviderControlResponse(input.provider, "deny", reason);
    }
  } else if (input.provider === "gemini-cli" && input.requestedDecision === "ask") {
    decision = "deny";
    effectiveOutcome = "deny";
    providerMapping = "fail_closed_deny";
    capabilityLossy = true;
    providerResponse = renderProviderControlResponse(input.provider, "ask", input.reason);
    reason = cleanReason(`${input.reason} Gemini CLI BeforeTool does not support ask, so AMC denied the action.`);
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

function deterministicEventId(agentId: string, provider: HookProvider, actionId: string): string {
  return `hook_control_${sha256Hex(canonicalize({ agentId, provider, actionId })).slice(0, 44)}`;
}

function deterministicSessionId(agentId: string, provider: HookProvider, actionId: string): string {
  return `hook-control-session-${sha256Hex(canonicalize({ agentId, provider, actionId })).slice(0, 36)}`;
}

function runtimeFor(provider: HookProvider): RuntimeName {
  return provider === "claude-code" ? "claude" : "gemini";
}

function sealSession(ledger: ReturnType<typeof openLedger>, sessionId: string): void {
  const row = ledger.db.prepare(
    "SELECT session_final_event_hash FROM sessions WHERE session_id = ? LIMIT 1",
  ).get(sessionId) as { session_final_event_hash: string | null } | undefined;
  if (!row || row.session_final_event_hash) return;
  ledger.sealSession(sessionId);
}

function ensureControlSession(input: {
  ledger: ReturnType<typeof openLedger>;
  sessionId: string;
  provider: HookProvider;
}): "ready" | "event-present" {
  const runtime = runtimeFor(input.provider);
  const binaryPath = "amc-bridge-hook-control";
  const binarySha256 = hashBinaryOrPath(binaryPath, "1");
  const session = input.ledger.db.prepare(
    `SELECT runtime, binary_path, binary_sha256, ended_ts,
            session_final_event_hash, session_seal_sig
     FROM sessions
     WHERE session_id = ?
     LIMIT 1`,
  ).get(input.sessionId) as {
    runtime: string;
    binary_path: string;
    binary_sha256: string;
    ended_ts: number | null;
    session_final_event_hash: string | null;
    session_seal_sig: string | null;
  } | undefined;

  if (!session) {
    input.ledger.startSession({
      sessionId: input.sessionId,
      runtime,
      binaryPath,
      binarySha256,
    });
    return "ready";
  }

  if (
    session.runtime !== runtime
    || session.binary_path !== binaryPath
    || session.binary_sha256 !== binarySha256
  ) {
    throw new HookControlError(
      "HOOK_CONTROL_LEDGER_UNAVAILABLE",
      503,
      "existing hook control session metadata does not match the provider binding",
    );
  }
  if (
    session.ended_ts !== null
    || session.session_final_event_hash !== null
    || session.session_seal_sig !== null
  ) {
    throw new HookControlError(
      "HOOK_CONTROL_LEDGER_UNAVAILABLE",
      503,
      "existing hook control session is sealed without a recoverable receipt",
    );
  }

  const event = input.ledger.db.prepare(
    "SELECT 1 FROM evidence_events WHERE session_id = ? LIMIT 1",
  ).get(input.sessionId);
  return event ? "event-present" : "ready";
}

function recoverControlResult(input: {
  ledger: ReturnType<typeof openLedger>;
  eventId: string;
  sessionId: string;
  request: NormalizedProviderToolRequest;
  agentId: string;
}): ProviderHookControlResult | null {
  const existing = input.ledger.db.prepare(
    "SELECT id, session_id, event_type, meta_json FROM evidence_events WHERE id = ? LIMIT 1",
  ).get(input.eventId) as {
    id: string;
    session_id: string;
    event_type: string;
    meta_json: string;
  } | undefined;
  if (!existing) return null;

  let parsedMeta: unknown;
  try {
    parsedMeta = JSON.parse(existing.meta_json) as unknown;
  } catch {
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "stored hook control metadata is invalid");
  }
  const parsed = storedControlMetaSchema.safeParse(parsedMeta);
  if (
    !parsed.success
    || existing.session_id !== input.sessionId
    || existing.event_type !== "audit"
    || parsed.data.agentId !== input.agentId
    || parsed.data.provider !== input.request.provider
    || parsed.data.actionId !== input.request.actionId
  ) {
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "stored hook control metadata is invalid");
  }
  let stored: (
    z.infer<typeof storedControlMetaV1Schema> | z.infer<typeof storedControlMetaV2Schema>
  ) & Pick<ControlMappingFields, "effectiveOutcome" | "providerMapping">;
  try {
    stored = parsed.data.controlSchemaVersion === 1
      ? { ...parsed.data, ...normalizeLegacyControlFields(parsed.data) }
      : parsed.data;
  } catch {
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "stored hook control outcome mapping is invalid");
  }
  if (stored.rawInputSha256 !== input.request.rawInputSha256) {
    throw new HookControlError(
      "HOOK_CONTROL_REPLAY_CONFLICT",
      409,
      "hook action ID conflicts with previously evaluated input",
    );
  }

  sealSession(input.ledger, input.sessionId);
  const integrity = verifyEvidenceEventIntegrity({
    ledger: input.ledger,
    eventId: input.eventId,
    requireReceipt: true,
    requireSealedSession: true,
  });
  const receipt = verifyReceipt(stored.receipt, getPublicKeyHistory(input.ledger.workspace, "monitor"));
  const responseSha256 = sha256Hex(Buffer.from(
    serializeProviderControlResponse(stored.providerResponse),
    "utf8",
  ));
  if (
    !integrity.ok
    || !validateProviderControlResponse(stored.provider, stored.providerResponse)
    || !receipt.ok
    || receipt.payload?.kind !== "guard_check"
    || receipt.payload.agentId !== input.agentId
    || receipt.payload.providerId !== `hook-control:${input.request.provider}`
    || receipt.payload.body_sha256 !== stored.providerResponseSha256
    || responseSha256 !== stored.providerResponseSha256
  ) {
    const diagnostics = [
      ...integrity.errors,
      !validateProviderControlResponse(stored.provider, stored.providerResponse) ? "provider response shape invalid" : null,
      receipt.error ?? null,
      receipt.payload?.kind !== "guard_check" ? "receipt kind mismatch" : null,
      receipt.payload?.agentId !== input.agentId ? "receipt agent mismatch" : null,
      receipt.payload?.providerId !== `hook-control:${input.request.provider}` ? "receipt provider mismatch" : null,
      receipt.payload?.body_sha256 !== stored.providerResponseSha256 ? "receipt response hash mismatch" : null,
      responseSha256 !== stored.providerResponseSha256 ? "stored response hash mismatch" : null,
    ].filter((item): item is string => Boolean(item));
    throw new HookControlError(
      "HOOK_CONTROL_LEDGER_UNAVAILABLE",
      503,
      `stored hook control receipt is invalid: ${diagnostics.join("; ")}`,
    );
  }
  return {
    controlled: true,
    idempotentReplay: true,
    provider: stored.provider,
    actionId: stored.actionId,
    eventId: existing.id,
    sessionId: input.sessionId,
    canonicalToolName: stored.canonicalToolName,
    requestedDecision: stored.requestedDecision,
    decision: stored.decision,
    effectiveOutcome: stored.effectiveOutcome,
    providerMapping: stored.providerMapping,
    capabilityLossy: stored.capabilityLossy,
    reason: stored.reason,
    providerResponse: stored.providerResponse,
    providerResponseSha256: stored.providerResponseSha256,
    receipt: stored.receipt,
    receiptId: stored.receipt_id,
    receiptSha256: stored.receipt_sha256,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

export function verifyProviderHookControlResult(input: {
  workspace: string;
  authenticatedAgentId: string;
  provider: HookProvider;
  rawInput: string;
  result: unknown;
}): { ok: boolean; error: string | null } {
  const parsed = providerHookControlResultSchema.safeParse(input.result);
  if (!parsed.success || parsed.data.provider !== input.provider) {
    return { ok: false, error: "hook control response does not match the complete result schema" };
  }

  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    const suppliedResult = normalizeControlResult(parsed.data);
    const request = normalizeProviderRequest({
      workspace: input.workspace,
      provider: input.provider,
      rawInput: input.rawInput,
    });
    const eventId = deterministicEventId(input.authenticatedAgentId, input.provider, request.actionId);
    const sessionId = deterministicSessionId(input.authenticatedAgentId, input.provider, request.actionId);
    if (
      suppliedResult.actionId !== request.actionId
      || suppliedResult.eventId !== eventId
      || suppliedResult.sessionId !== sessionId
    ) {
      return { ok: false, error: "hook control response is not bound to the current provider request" };
    }

    ledger = openLedger(input.workspace);
    const recovered = recoverControlResult({
      ledger,
      eventId,
      sessionId,
      request,
      agentId: input.authenticatedAgentId,
    });
    if (!recovered) {
      return { ok: false, error: "hook control response has no matching sealed ledger event" };
    }
    const normalizedResult = { ...suppliedResult, idempotentReplay: true };
    return canonicalize(normalizedResult) === canonicalize(recovered)
      ? { ok: true, error: null }
      : { ok: false, error: "hook control response differs from its sealed ledger event" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "hook control response verification failed",
    };
  } finally {
    ledger?.close();
  }
}

export function evaluateProviderHookControl(input: {
  workspace: string;
  authenticatedAgentId: string;
  provider: HookProvider;
  rawInput: string;
  now?: number;
}): ProviderHookControlResult {
  const provider = parseProvider(input.provider);
  if (!SAFE_ID.test(input.authenticatedAgentId) || input.authenticatedAgentId.length > 160) {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "authenticated agent identity is invalid");
  }
  const request = normalizeProviderRequest({
    workspace: input.workspace,
    provider,
    rawInput: input.rawInput,
  });
  const eventId = deterministicEventId(input.authenticatedAgentId, provider, request.actionId);
  const sessionId = deterministicSessionId(input.authenticatedAgentId, provider, request.actionId);
  const now = input.now ?? Date.now();
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(input.workspace);
    const recovered = recoverControlResult({
      ledger,
      eventId,
      sessionId,
      request,
      agentId: input.authenticatedAgentId,
    });
    if (recovered) return recovered;

    const sessionState = ensureControlSession({ ledger, sessionId, provider });
    if (sessionState === "event-present") {
      const recoveredAfterSessionRead = recoverControlResult({
        ledger,
        eventId,
        sessionId,
        request,
        agentId: input.authenticatedAgentId,
      });
      if (recoveredAfterSessionRead) return recoveredAfterSessionRead;
      throw new HookControlError(
        "HOOK_CONTROL_LEDGER_UNAVAILABLE",
        503,
        "existing hook control session contains an unrelated event",
      );
    }
    const requested = requestedControlDecision({
      workspace: input.workspace,
      agentId: input.authenticatedAgentId,
      request,
    });
    const materialized = materializeProviderDecision({
      provider,
      requestedDecision: requested.decision,
      reason: requested.reason,
    });
    const payload = {
      kind: "hook_control_decision",
      version: 2,
      agentId: input.authenticatedAgentId,
      provider,
      actionId: request.actionId,
      canonicalToolName: request.canonicalToolName,
      requestedDecision: requested.decision,
      decision: materialized.decision,
      effectiveOutcome: materialized.effectiveOutcome,
      providerMapping: materialized.providerMapping,
      capabilityLossy: materialized.capabilityLossy,
      reason: materialized.reason,
      providerResponseSha256: materialized.providerResponseSha256,
      rawPayloadStored: false,
    };
    const appended = ledger.appendEvidenceWithReceipt({
      id: eventId,
      ts: now,
      sessionId,
      runtime: runtimeFor(provider),
      eventType: "audit",
      payload: `${JSON.stringify(payload, null, 2)}\n`,
      payloadExt: "json",
      inline: false,
      meta: {
        trustTier: "OBSERVED",
        controlSchemaVersion: 2,
        agentId: input.authenticatedAgentId,
        provider,
        actionId: request.actionId,
        providerToolName: request.providerToolName,
        rawInputSha256: request.rawInputSha256,
        rawPayloadStored: false,
        canonicalToolName: request.canonicalToolName,
        requestedDecision: requested.decision,
        decision: materialized.decision,
        effectiveOutcome: materialized.effectiveOutcome,
        providerMapping: materialized.providerMapping,
        capabilityLossy: materialized.capabilityLossy,
        reason: materialized.reason,
        providerResponse: materialized.providerResponse,
        providerResponseSha256: materialized.providerResponseSha256,
        bodySha256: materialized.providerResponseSha256,
      },
      receipt: {
        kind: "guard_check",
        agentId: input.authenticatedAgentId,
        providerId: `hook-control:${provider}`,
        model: null,
        bodySha256: materialized.providerResponseSha256,
      },
    });
    sealSession(ledger, sessionId);
    return {
      controlled: true,
      idempotentReplay: false,
      provider,
      actionId: request.actionId,
      eventId: appended.id,
      sessionId,
      canonicalToolName: request.canonicalToolName,
      requestedDecision: requested.decision,
      decision: materialized.decision,
      effectiveOutcome: materialized.effectiveOutcome,
      providerMapping: materialized.providerMapping,
      capabilityLossy: materialized.capabilityLossy,
      reason: materialized.reason,
      providerResponse: materialized.providerResponse,
      providerResponseSha256: materialized.providerResponseSha256,
      receipt: appended.receipt,
      receiptId: appended.receiptId,
      receiptSha256: appended.receiptSha256,
    };
  } catch (error) {
    if (error instanceof HookControlError) throw error;
    if (ledger && isUniqueConstraint(error)) {
      const recovered = recoverControlResult({
        ledger,
        eventId,
        sessionId,
        request,
        agentId: input.authenticatedAgentId,
      });
      if (recovered) return recovered;
    }
    throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "hook control receipt could not be recorded");
  } finally {
    ledger?.close();
  }
}
