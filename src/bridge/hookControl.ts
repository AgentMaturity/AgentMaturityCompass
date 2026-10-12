import { canonicalize } from "../utils/json.js";
import { z } from "zod";
import YAML from "yaml";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
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
import type { ActionClass, RiskTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { redactBridgeText } from "./bridgeRedaction.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { resolveProviderHookRequestIdentity } from "./hookActionIdentity.js";
import type { ShellCommandConnector, ShellCommandPlan } from "../enforce/shellCommandPlan.js";
import {
  canonicalToolRequests, CONTROL_HOOK_EVENTS, controlDecisionSchema, controlMappingValid, HookControlError, hookCall, hookCallRefusal,
  materializeProviderDecision, parseProvider, providerSchema, runtimeFor, serializeProviderControlResponse, validateProviderControlResponse,
  type CanonicalToolRequest, type HookCall, type HookControlDecision, type HookControlOutcome, type HookControlProviderMapping,
  type HookProvider, type ProviderControlResponse,
} from "./hookProviders.js";
// Still exported here for importers of hookControl.js, the archived HTTP parity module among them.
export { HookControlError } from "./hookProviders.js";
import { authorizeHookDecision, boundDecisionFacts, hookDecisionReceipt, type AuthorizationTarget, type HookLease } from "./hookAuthorization.js";

export const CONTROL_HOOK_PATH = "/bridge/hooks/control/v1";
export const CONTROL_HOOK_ROUTE = "/hooks/control/v1";
export const MAX_CONTROL_HOOK_BODY_BYTES = 262_144;


export type CompoundCommandBlastRadiusReasonCode =
  | "SIGNED_AUTHORITY_UNTRUSTED"
  | "COMMAND_PLAN_INVALID"
  | "TOOL_NOT_ALLOWED"
  | "TOOL_ARGUMENTS_REJECTED"
  | "ACTION_POLICY_DENIED"
  | "APPROVAL_QUORUM_UNSUPPORTED"
  | "APPROVAL_REQUIRED"
  | "POLICY_ALLOW"
  | "CONTROL_EVALUATION_FAILED";

export interface CompoundCommandBlastRadiusStep {
  index: number;
  connector: ShellCommandConnector;
  canonicalToolName: string;
  actionClass: ActionClass | null;
  outcome: HookControlOutcome;
  reasonCode: CompoundCommandBlastRadiusReasonCode;
}

export interface CompoundCommandBlastRadiusReview {
  schemaVersion: "2026-07-13";
  parseStatus: "parsed" | "invalid";
  trustStatus: "verified" | "untrusted";
  completeEvaluation: boolean;
  compound: boolean;
  segmentCount: number;
  highestActionClass: ActionClass | null;
  aggregateOutcome: HookControlOutcome;
  decisiveStepIndex: number | null;
  outcomeCounts: Record<HookControlOutcome, number>;
  steps: CompoundCommandBlastRadiusStep[];
  reasonCodes: string[];
  rawCommandStored: false;
  argumentValuesStored: false;
}


export interface ProviderHookControlResult {
  controlled: true;
  idempotentReplay: boolean;
  provider: HookProvider;
  actionId: string;
  eventId: string;
  sessionId: string;
  canonicalToolName: string | null;
  commandBlastRadius: CompoundCommandBlastRadiusReview | null;
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
  canonicalRequests: CanonicalToolRequest[];
  commandPlan: ShellCommandPlan | null;
  rawInputSha256: string;
  call: HookCall | null;
  toolInput: Record<string, unknown>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const controlOutcomeSchema = z.enum(["allow", "deny", "ask", "steer"]);
const controlProviderMappingSchema = z.enum(["native", "corrective_deny", "fail_closed_deny"]);
const actionClassSchema = z.enum(ACTION_CLASSES as [ActionClass, ...ActionClass[]]);
const shellCommandConnectorSchema = z.enum(["and", "or", "pipe", "sequence", "newline"])
  .nullable();
const compoundCommandBlastRadiusReasonCodeSchema = z.enum([
  "SIGNED_AUTHORITY_UNTRUSTED",
  "COMMAND_PLAN_INVALID",
  "TOOL_NOT_ALLOWED",
  "TOOL_ARGUMENTS_REJECTED",
  "ACTION_POLICY_DENIED",
  "APPROVAL_QUORUM_UNSUPPORTED",
  "APPROVAL_REQUIRED",
  "POLICY_ALLOW",
  "CONTROL_EVALUATION_FAILED",
]);
const compoundCommandBlastRadiusStepSchema = z.object({
  index: z.number().int().nonnegative(),
  connector: shellCommandConnectorSchema,
  canonicalToolName: z.string().min(1),
  actionClass: actionClassSchema.nullable(),
  outcome: controlOutcomeSchema,
  reasonCode: compoundCommandBlastRadiusReasonCodeSchema,
}).strict();
const compoundCommandBlastRadiusReviewSchema = z.object({
  schemaVersion: z.literal("2026-07-13"),
  parseStatus: z.enum(["parsed", "invalid"]),
  trustStatus: z.enum(["verified", "untrusted"]),
  completeEvaluation: z.boolean(),
  compound: z.boolean(),
  segmentCount: z.number().int().nonnegative().max(32),
  highestActionClass: actionClassSchema.nullable(),
  aggregateOutcome: controlOutcomeSchema,
  decisiveStepIndex: z.number().int().nonnegative().max(31).nullable(),
  outcomeCounts: z.object({
    allow: z.number().int().nonnegative(),
    deny: z.number().int().nonnegative(),
    ask: z.number().int().nonnegative(),
    steer: z.number().int().nonnegative(),
  }).strict(),
  steps: z.array(compoundCommandBlastRadiusStepSchema).max(32),
  reasonCodes: z.array(z.string().min(1).max(160)).max(64),
  rawCommandStored: z.literal(false),
  argumentValuesStored: z.literal(false),
}).strict();
const providerHookInputSchema = z.object({
  hook_event_name: z.string().min(1).max(160),
  tool_name: z.string().min(1).max(512),
  tool_input: z.record(z.string(), z.unknown()),
  tool_use_id: z.string().min(1).max(160).optional(),
  tool_call_id: z.string().min(1).max(160).optional(),
  session_id: z.string().max(512).optional(),
  timestamp: z.string().max(128).optional(),
}).passthrough();


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
  commandBlastRadius: compoundCommandBlastRadiusReviewSchema.nullable().optional(),
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
  commandBlastRadius: z.null().optional(),
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
  commandBlastRadius: compoundCommandBlastRadiusReviewSchema.nullable().optional(),
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
  if ("effectiveOutcome" in value && "providerMapping" in value) {
    return { ...value, commandBlastRadius: value.commandBlastRadius ?? null };
  }
  return {
    ...value,
    ...normalizeLegacyControlFields(value),
    commandBlastRadius: null,
  };
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


function normalizeProviderRequest(input: {
  workspace: string;
  provider: HookProvider;
  rawInput: string;
}): NormalizedProviderToolRequest {
  const parsed = parseProviderInput(input.rawInput);
  const expectedEvent = CONTROL_HOOK_EVENTS[input.provider];
  if (parsed.hook_event_name !== expectedEvent) throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, `hook control accepts only ${expectedEvent} events`);
  const rawInputSha256 = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  const call = hookCall(input.provider, parsed);
  const identity = resolveProviderHookRequestIdentity({
    provider: input.provider,
    // A Pi or Claude Code action id is AMC's own derivation from the session and call id, never an id the payload names.
    providerActionId: call ? call.actionId : parsed.tool_use_id ?? parsed.tool_call_id,
    sessionId: parsed.session_id,
    timestamp: parsed.timestamp,
    toolName: parsed.tool_name,
    toolInput: parsed.tool_input,
    rawInputSha256,
  });
  const mapped = canonicalToolRequests(input.provider, parsed.tool_name, parsed.tool_input, input.workspace, call);
  const canonicalToolName = mapped.requests.length === 1 ? mapped.requests[0]?.name ?? null : null;
  return {
    provider: input.provider,
    actionId: identity.actionId,
    providerToolName: redactBridgeText(parsed.tool_name).slice(0, 512),
    canonicalToolName,
    canonicalRequests: mapped.requests,
    commandPlan: mapped.commandPlan,
    rawInputSha256,
    call,
    toolInput: parsed.tool_input,
  };
}

function riskTierFor(actionClass: ActionClass): RiskTier {
  if (actionClass === "READ_ONLY") return "low";
  if (actionClass === "WRITE_LOW") return "med";
  if (actionClass === "WRITE_HIGH" || actionClass === "NETWORK_EXTERNAL") return "high";
  return "critical";
}

const OUTCOME_RANK: Record<HookControlOutcome, number> = {
  allow: 0,
  ask: 1,
  steer: 2,
  deny: 3,
};

const ACTION_CLASS_RANK: Record<ActionClass, number> = {
  READ_ONLY: 0,
  WRITE_LOW: 1,
  WRITE_HIGH: 2,
  NETWORK_EXTERNAL: 2,
  DATA_EXPORT: 3,
  DEPLOY: 3,
  SECURITY: 4,
  FINANCIAL: 4,
  IDENTITY: 4,
};

interface EvaluatedControlStep {
  request: CanonicalToolRequest;
  actionClass: ActionClass | null;
  outcome: HookControlOutcome;
  reason: string;
  reasonCode: CompoundCommandBlastRadiusReasonCode;
}

function emptyOutcomeCounts(): Record<HookControlOutcome, number> {
  return { allow: 0, deny: 0, ask: 0, steer: 0 };
}

function incompleteCommandReview(input: {
  plan: ShellCommandPlan;
  trustStatus: "verified" | "untrusted";
  reasonCodes: string[];
}): CompoundCommandBlastRadiusReview {
  return {
    schemaVersion: "2026-07-13",
    parseStatus: input.plan.status,
    trustStatus: input.trustStatus,
    completeEvaluation: false,
    compound: input.plan.compound,
    segmentCount: input.plan.segments.length,
    highestActionClass: null,
    aggregateOutcome: "deny",
    decisiveStepIndex: null,
    outcomeCounts: emptyOutcomeCounts(),
    steps: [],
    reasonCodes: input.reasonCodes,
    rawCommandStored: false,
    argumentValuesStored: false,
  };
}

function evaluateCanonicalRequest(input: {
  workspace: string;
  agentId: string;
  request: CanonicalToolRequest;
  tools: ReturnType<typeof loadToolsConfig>;
  approvalPolicy: ReturnType<typeof loadApprovalPolicy>;
}): EvaluatedControlStep {
  const tool = findToolDefinition(input.tools, input.request.name);
  if (!tool) {
    return {
      request: input.request,
      actionClass: null,
      outcome: "deny",
      reason: `Canonical tool ${input.request.name} is not allowed by signed ToolHub config.`,
      reasonCode: "TOOL_NOT_ALLOWED",
    };
  }
  const minimum = input.request.minimumActionClass;
  if (minimum && ACTION_CLASS_RANK[tool.actionClass] < ACTION_CLASS_RANK[minimum]) {
    return { request: input.request, actionClass: tool.actionClass, outcome: "deny", reasonCode: "TOOL_NOT_ALLOWED",
      reason: `Signed ToolHub config gives ${tool.name} ${tool.actionClass}, below the ${minimum} the Pi mapping requires.` };
  }
  if (!input.request.argumentsReviewable) {
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "steer",
      reason: `Signed ToolHub policy cannot verify the current ${tool.name} argument context.`,
      reasonCode: "TOOL_ARGUMENTS_REJECTED",
    };
  }
  const argsValidation = validateToolRequest({
    workspace: input.workspace,
    tool,
    args: input.request.args,
  });
  if (!argsValidation.ok) {
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "steer",
      reason: `Signed ToolHub policy rejected the current ${tool.name} arguments.`,
      reasonCode: "TOOL_ARGUMENTS_REJECTED",
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
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "deny",
      reason: governor.reasons.length > 0
        ? `Signed Action Policy denied native execution: ${governor.reasons.join(" ")}`
        : "Signed Action Policy denied native execution.",
      reasonCode: "ACTION_POLICY_DENIED",
    };
  }

  const approvalRule = input.approvalPolicy.approvalPolicy.actionClasses[tool.actionClass];
  const requiredApprovals = approvalRule?.requiredApprovals ?? 0;
  if (requiredApprovals > 0) {
    if (requiredApprovals !== 1 || approvalRule?.requireDistinctUsers === true) {
      return {
        request: input.request,
        actionClass: tool.actionClass,
        outcome: "deny",
        reason: `Signed Approval Policy requires ${requiredApprovals} distinct or multi-user approvals and cannot be reduced to one provider-local ask.`,
        reasonCode: "APPROVAL_QUORUM_UNSUPPORTED",
      };
    }
    return {
      request: input.request,
      actionClass: tool.actionClass,
      outcome: "ask",
      reason: `Signed Approval Policy requires ${requiredApprovals} human approval before ${tool.actionClass}.`,
      reasonCode: "APPROVAL_REQUIRED",
    };
  }
  return {
    request: input.request,
    actionClass: tool.actionClass,
    outcome: "allow",
    reason: `Signed AMC policies allow ${tool.actionClass} through ${tool.name}.`,
    reasonCode: "POLICY_ALLOW",
  };
}

function completeCommandReview(
  plan: ShellCommandPlan,
  evaluations: EvaluatedControlStep[],
): CompoundCommandBlastRadiusReview {
  const outcomeCounts = emptyOutcomeCounts();
  for (const evaluation of evaluations) outcomeCounts[evaluation.outcome] += 1;
  const aggregateOutcome = evaluations.reduce<HookControlOutcome>(
    (current, evaluation) => OUTCOME_RANK[evaluation.outcome] > OUTCOME_RANK[current]
      ? evaluation.outcome
      : current,
    "allow",
  );
  const decisiveStepIndex = evaluations.findIndex(
    (evaluation) => evaluation.outcome === aggregateOutcome,
  );
  const actionClasses = evaluations
    .map((evaluation) => evaluation.actionClass)
    .filter((actionClass): actionClass is ActionClass => actionClass !== null);
  const highestActionClass = actionClasses.reduce<ActionClass | null>(
    (current, actionClass) => current === null
      || ACTION_CLASS_RANK[actionClass] > ACTION_CLASS_RANK[current]
      ? actionClass
      : current,
    null,
  );
  return {
    schemaVersion: "2026-07-13",
    parseStatus: "parsed",
    trustStatus: "verified",
    completeEvaluation: true,
    compound: plan.compound,
    segmentCount: plan.segments.length,
    highestActionClass,
    aggregateOutcome,
    decisiveStepIndex: decisiveStepIndex >= 0 ? decisiveStepIndex : null,
    outcomeCounts,
    steps: evaluations.map((evaluation, index) => ({
      index,
      connector: evaluation.request.segment?.connector ?? null,
      canonicalToolName: evaluation.request.name,
      actionClass: evaluation.actionClass,
      outcome: evaluation.outcome,
      reasonCode: evaluation.reasonCode,
    })),
    reasonCodes: [...new Set(evaluations.map((evaluation) => evaluation.reasonCode))],
    rawCommandStored: false,
    argumentValuesStored: false,
  };
}

interface RequestedControlDecision {
  decision: HookControlOutcome;
  reason: string;
  commandBlastRadius: CompoundCommandBlastRadiusReview | null;
  /** The highest-class canonical tool evaluated: what an authorization record for this call names. */
  target?: AuthorizationTarget | null;
}

function requestedControlDecision(input: {
  workspace: string;
  agentId: string;
  request: NormalizedProviderToolRequest;
}): RequestedControlDecision {
  const versionRefusal = input.request.call ? hookCallRefusal(input.request.call, input.workspace, input.request.providerToolName, input.request.toolInput) : null;
  if (versionRefusal) return { decision: "deny", reason: versionRefusal, commandBlastRadius: null };
  const signatureChecks = [
    ["action policy", verifyActionPolicySignature(input.workspace)],
    ["approval policy", verifyApprovalPolicySignature(input.workspace)],
    ["ToolHub config", verifyToolsConfigSignature(input.workspace)],
    ["budget policy", verifyBudgetsConfigSignature(input.workspace)],
  ] as const;
  for (const [label, check] of signatureChecks) {
    if (!check.valid) {
      return {
        decision: "deny",
        reason: `${label} signature invalid; control fails closed.`,
        commandBlastRadius: input.request.commandPlan
          ? incompleteCommandReview({
              plan: input.request.commandPlan,
              trustStatus: "untrusted",
              reasonCodes: ["SIGNED_AUTHORITY_UNTRUSTED"],
            })
          : null,
      };
    }
  }

  if (input.request.commandPlan?.status === "invalid") {
    return {
      decision: "deny",
      reason: `Provider command syntax is unsupported or invalid: ${input.request.commandPlan.reasonCodes[0] ?? "COMMAND_PLAN_INVALID"}.`,
      commandBlastRadius: incompleteCommandReview({
        plan: input.request.commandPlan,
        trustStatus: "verified",
        reasonCodes: ["COMMAND_PLAN_INVALID", ...input.request.commandPlan.reasonCodes],
      }),
    };
  }
  if (input.request.canonicalRequests.length === 0) {
    return {
      decision: "deny",
      reason: `${input.request.provider === "pi" ? "Pi" : "Provider"} tool ${input.request.providerToolName} is not mapped to an allowed ToolHub tool.`,
      commandBlastRadius: null,
    };
  }

  try {
    const tools = loadToolsConfig(input.workspace);
    const approvalPolicy = loadApprovalPolicy(input.workspace);
    const evaluations = input.request.canonicalRequests.map((request) => evaluateCanonicalRequest({
      workspace: input.workspace,
      agentId: input.agentId,
      request,
      tools,
      approvalPolicy,
    }));
    if (!input.request.commandPlan) {
      const evaluation = evaluations[0];
      if (!evaluation) throw new Error("control evaluation produced no result");
      return {
        decision: evaluation.outcome,
        reason: evaluation.reason,
        commandBlastRadius: null,
        target: evaluation.actionClass ? { toolName: evaluation.request.name, actionClass: evaluation.actionClass } : null,
      };
    }
    const review = completeCommandReview(input.request.commandPlan, evaluations);
    const decisive = review.decisiveStepIndex === null
      ? null
      : evaluations[review.decisiveStepIndex] ?? null;
    const reason = review.compound
      ? `Compound command review: ${review.segmentCount} steps; highest action class ${review.highestActionClass ?? "UNKNOWN"}; step ${(review.decisiveStepIndex ?? 0) + 1} requires ${review.aggregateOutcome}.`
      : decisive?.reason ?? "AMC control evaluation failed closed.";
    const top = evaluations.find((evaluation) => evaluation.actionClass === review.highestActionClass);
    const target = top?.actionClass ? { toolName: top.request.name, actionClass: top.actionClass } : null;
    return { decision: review.aggregateOutcome, reason, commandBlastRadius: review, target };
  } catch {
    return {
      decision: "deny",
      reason: "AMC control evaluation failed closed.",
      commandBlastRadius: input.request.commandPlan
        ? incompleteCommandReview({
            plan: input.request.commandPlan,
            trustStatus: "verified",
            reasonCodes: ["CONTROL_EVALUATION_FAILED"],
          })
        : null,
    };
  }
}

export function deterministicEventId(agentId: string, provider: HookProvider, actionId: string): string {
  return `hook_control_${sha256Hex(canonicalize({ agentId, provider, actionId })).slice(0, 44)}`;
}

function deterministicSessionId(agentId: string, provider: HookProvider, actionId: string): string {
  return `hook-control-session-${sha256Hex(canonicalize({ agentId, provider, actionId })).slice(0, 36)}`;
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
  const receipt = verifyReceipt(stored.receipt, getPurposeKeyHistory(input.ledger.workspace, "receipt"));
  const receiptKind = input.request.call ? "action_state" : "guard_check";
  const responseSha256 = sha256Hex(Buffer.from(
    serializeProviderControlResponse(stored.providerResponse),
    "utf8",
  ));
  if (
    !integrity.ok
    || !validateProviderControlResponse(stored.provider, stored.providerResponse)
    || !receipt.ok
    || receipt.payload?.kind !== receiptKind
    || receipt.payload.agentId !== input.agentId
    || receipt.payload.providerId !== `hook-control:${input.request.provider}`
    || receipt.payload.body_sha256 !== stored.providerResponseSha256
    || responseSha256 !== stored.providerResponseSha256
  ) {
    const diagnostics = [
      ...integrity.errors,
      !validateProviderControlResponse(stored.provider, stored.providerResponse) ? "provider response shape invalid" : null,
      receipt.error ?? null,
      receipt.payload?.kind !== receiptKind ? "receipt kind mismatch" : null,
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
    commandBlastRadius: stored.controlSchemaVersion === 2
      ? stored.commandBlastRadius ?? null
      : null,
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
  /** The hook lease the Bridge verified; it names the principal of a bound authorization record. */
  lease?: HookLease;
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
    // Pi and Claude Code decisions that let an effect proceed bind P1-02's authorization record.
    const { requested, authorization, enforced, version } = authorizeHookDecision({
      workspace: input.workspace, agentId: input.authenticatedAgentId, lease: input.lease, provider, actionId: request.actionId,
      call: request.call, toolInput: request.toolInput, ledger,
      requested: requestedControlDecision({ workspace: input.workspace, agentId: input.authenticatedAgentId, request }),
    });
    const materialized = materializeProviderDecision({
      provider,
      requestSha256: request.rawInputSha256,
      requestedDecision: requested.decision,
      reason: requested.reason,
    });
    const bound = request.call ? boundDecisionFacts(request.call, version, authorization) : {};
    const payload = {
      kind: "hook_control_decision",
      version: 2,
      agentId: input.authenticatedAgentId,
      provider,
      actionId: request.actionId,
      canonicalToolName: request.canonicalToolName,
      commandBlastRadius: requested.commandBlastRadius,
      requestedDecision: requested.decision,
      decision: materialized.decision,
      effectiveOutcome: materialized.effectiveOutcome,
      providerMapping: materialized.providerMapping,
      capabilityLossy: materialized.capabilityLossy,
      reason: materialized.reason,
      providerResponseSha256: materialized.providerResponseSha256,
      rawPayloadStored: false,
      ...bound,
      ...(request.call ? { authorizationRecord: authorization?.ok ? authorization.record : null } : {}),
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
        commandBlastRadius: requested.commandBlastRadius,
        requestedDecision: requested.decision,
        decision: materialized.decision,
        effectiveOutcome: materialized.effectiveOutcome,
        providerMapping: materialized.providerMapping,
        capabilityLossy: materialized.capabilityLossy,
        reason: materialized.reason,
        providerResponse: materialized.providerResponse,
        providerResponseSha256: materialized.providerResponseSha256,
        bodySha256: materialized.providerResponseSha256,
        ...bound,
      },
      receipt: {
        kind: request.call ? "action_state" : "guard_check",
        agentId: input.authenticatedAgentId,
        providerId: `hook-control:${provider}`,
        model: null,
        bodySha256: materialized.providerResponseSha256,
        ...(request.call ? {
          action: hookDecisionReceipt({ provider, actionId: request.actionId, idempotencyKey: request.call.callId,
            decision: materialized.decision, reason: materialized.reason, authorization, enforced }),
        } : {}),
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
      commandBlastRadius: requested.commandBlastRadius,
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
