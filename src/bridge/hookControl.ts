import { canonicalize } from "../utils/json.js";
import { z } from "zod";
import YAML from "yaml";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import {
  openLedger,
  hashBinaryOrPath,
  verifyEvidenceEventIntegrity,
} from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { redactBridgeText } from "./bridgeRedaction.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import { resolveProviderHookRequestIdentity } from "./hookActionIdentity.js";
import {
  canonicalToolRequests, CONTROL_HOOK_EVENTS, controlDecisionSchema, refineControlMapping, HookControlError, hookCall, openHookEnvelope,
  materializeProviderDecision, parseProvider, providerSchema, runtimeFor, serializeProviderControlResponse, validateProviderControlResponse,
  type HookControlDecision, type HookControlOutcome, type HookControlProviderMapping,
  type HookProvider, type ProviderControlResponse,
} from "./hookProviders.js";
// Still exported here for importers of hookControl.js, the archived HTTP parity module among them.
export { HookControlError } from "./hookProviders.js";
import { authorizeHookDecision, boundDecisionFacts, hookDecisionReceipt, type HookLease } from "./hookAuthorization.js";
import { requestedControlDecision, type CompoundCommandBlastRadiusReview, type NormalizedProviderToolRequest } from "./hookControlPolicy.js";
export type { CompoundCommandBlastRadiusReasonCode, CompoundCommandBlastRadiusStep, CompoundCommandBlastRadiusReview } from "./hookControlPolicy.js";
import { runHookControl, runHookControlAsync, hookApprovalAttemptSuffix, hookApprovalIntentHash, type HookApprovalPhase,
  type HookApprovalOperation, type HookApprovalOperationResult, type HookApprovalResolution } from "./hookApproval.js";
import { revokedLeaseIdSet } from "../leases/leaseStore.js";
import { verifyLeaseToken } from "../leases/leaseVerifier.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { hookAuditLatchState, HookWriterFault, latchedMessage } from "./hookAuditLatch.js";

export const CONTROL_HOOK_PATH = "/bridge/hooks/control/v1";
export const CONTROL_HOOK_ROUTE = "/hooks/control/v1";
export const MAX_CONTROL_HOOK_BODY_BYTES = 262_144;


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

const storedControlMetaV2BaseSchema = z.object({
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
}).passthrough();
const storedControlMetaV2Schema = storedControlMetaV2BaseSchema.superRefine(refineControlMapping);

const storedControlMetaSchema = z.union([
  storedControlMetaV1Schema,
  storedControlMetaV2Schema,
  // A pending/refused retry is not a second final action decision (hookActionLifecycle).
  storedControlMetaV2BaseSchema.omit({ controlSchemaVersion: true }).extend({ approvalControlSchemaVersion: z.literal(1) }).superRefine(refineControlMapping)
    .transform(value => ({ ...value, controlSchemaVersion: 2 as const })),
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


/** `payload`: the Claude Code payload AMC's envelope carried, already strictly read (openHookEnvelope). */
function parseProviderInput(rawInput: string, payload?: unknown): z.infer<typeof providerHookInputSchema> {
  let value: unknown = payload;
  if (payload === undefined) try {
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
  if (Buffer.byteLength(input.rawInput, "utf8") > MAX_CONTROL_HOOK_BODY_BYTES) {
    throw new HookControlError("HOOK_CONTROL_INPUT_TOO_LARGE", 413, "provider hook input exceeds 256 KiB");
  }
  const envelope = input.provider === "claude-code" ? openHookEnvelope(input.rawInput) : null;
  const parsed = parseProviderInput(input.rawInput, envelope?.payload);
  const expectedEvent = CONTROL_HOOK_EVENTS[input.provider];
  if (parsed.hook_event_name !== expectedEvent) throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, `hook control accepts only ${expectedEvent} events`);
  const rawInputSha256 = sha256Hex(Buffer.from(input.rawInput, "utf8"));
  const call = hookCall(input.provider, parsed, envelope);
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
    const baseEventId = deterministicEventId(input.authenticatedAgentId, input.provider, request.actionId);
    const baseSessionId = deterministicSessionId(input.authenticatedAgentId, input.provider, request.actionId);
    const attempt = (["pending", "blocked", "replay"] as const).find(phase =>
      suppliedResult.eventId === baseEventId + hookApprovalAttemptSuffix(phase, request.rawInputSha256));
    const suffix = attempt ? hookApprovalAttemptSuffix(attempt, request.rawInputSha256) : "";
    const eventId = baseEventId + suffix, sessionId = baseSessionId + suffix;
    if (attempt && suppliedResult.decision !== "deny") return { ok: false, error: "approval attempt cannot authorize execution" };
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

export type HookControlInput = {
  workspace: string;
  authenticatedAgentId: string;
  provider: HookProvider;
  rawInput: string;
  /** The hook lease the Bridge verified; it names the principal of a bound authorization record. */
  lease?: HookLease;
  /** Original broker credential, reverified after asynchronous signing; never persisted. */
  leaseToken?: string;
  now?: number;
};
export function evaluateProviderHookControl(input: HookControlInput): ProviderHookControlResult {
  return runHookControl(evaluateHookControl(input));
}

/** Bridge uses the provider-backed publishers; synchronous callers retain their existing API. */
export function evaluateProviderHookControlAsync(input: HookControlInput): Promise<ProviderHookControlResult> {
  return runHookControlAsync(evaluateHookControl(input));
}

function* evaluateHookControl(input: HookControlInput): Generator<HookApprovalOperation, ProviderHookControlResult, HookApprovalOperationResult> {
  input = structuredClone(input);
  const provider = parseProvider(input.provider);
  const latch = hookAuditLatchState(input.workspace);
  if (latch.latched) throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, latchedMessage(latch.reason));
  if (!SAFE_ID.test(input.authenticatedAgentId) || input.authenticatedAgentId.length > 160) {
    throw new HookControlError("HOOK_CONTROL_INPUT_INVALID", 400, "authenticated agent identity is invalid");
  }
  const request = normalizeProviderRequest({
    workspace: input.workspace,
    provider,
    rawInput: input.rawInput,
  });
  let eventId = deterministicEventId(input.authenticatedAgentId, provider, request.actionId);
  let sessionId = deterministicSessionId(input.authenticatedAgentId, provider, request.actionId);
  const now = input.now ?? Date.now();
  let ledger: ReturnType<typeof openLedger> | null = null;
  /** Whether the decision row being written serves a session with a verified registration: only then does its writer's fault latch. */
  let underRegistration = false;
  let signedApprovalExecution = false;
  try {
    ledger = openLedger(input.workspace);
    const recovered = recoverControlResult({
      ledger,
      eventId,
      sessionId,
      request,
      agentId: input.authenticatedAgentId,
    });
    const approvalBacked = recovered && (JSON.parse((ledger.db.prepare("SELECT meta_json FROM evidence_events WHERE id = ?").get(eventId) as { meta_json: string }).meta_json) as { approvalRequestIds?: string[] }).approvalRequestIds?.length;
    if (recovered && !approvalBacked) return recovered;

    const authorizationInput = { workspace: input.workspace, agentId: input.authenticatedAgentId, lease: input.lease,
      provider, actionId: request.actionId, call: request.call, toolInput: request.toolInput, ledger, now };
    let { requested, authorization, enforced, version } = authorizeHookDecision({ ...authorizationInput,
      requested: approvalBacked ? { decision: "deny" as HookControlOutcome, reason: "AMC signed approval already consumed; hook replay denied.", commandBlastRadius: null, approvals: [], target: null }
        : requestedControlDecision({ workspace: input.workspace, agentId: input.authenticatedAgentId, request }),
    });
    let approvalPhase: HookApprovalPhase | null = approvalBacked ? "replay" : null;
    let approvalRequestIds: string[] = [];
    if (requested.decision === "ask" && (provider === "claude-code" || provider === "gemini-cli")) {
      const resolved = (yield { kind: "prepare", input: { workspace: input.workspace, agentId: input.authenticatedAgentId,
        request, targets: requested.approvals ?? [], lease: input.lease } }) as HookApprovalResolution;
      approvalRequestIds = resolved.grants.map(grant => grant.approvalId);
      approvalPhase = resolved.phase;
      const authorized = authorizeHookDecision({ ...authorizationInput, approvalRequestIds,
        requested: { ...requested, decision: resolved.phase ? "deny" as const : "allow" as const, reason: `${requested.reason} ${resolved.reason}` } });
      ({ requested, authorization, enforced, version } = authorized);
      if (requested.decision === "allow") {
        signedApprovalExecution = true;
        const assertCurrent = () => {
          if (Date.now() >= (resolved.expiresTs ?? 0)) throw new Error("hook approval expired during signing");
          if (hookAuditLatchState(input.workspace).latched) throw new Error("hook audit latch changed during signing");
          if (authorization?.ok && Date.parse(authorization.record.expiresAt) <= Date.now()) throw new Error("hook authorization expired during signing");
          const current = normalizeProviderRequest({ workspace: input.workspace, provider, rawInput: input.rawInput });
          const contextHash = hookApprovalIntentHash({ workspace: input.workspace, agentId: input.authenticatedAgentId,
            request: current, targets: requested.approvals ?? [], lease: input.lease });
          if (resolved.grants.some(grant => grant.expectedIntentHash !== contextHash)) throw new Error("hook approval context changed during signing");
          if (canonicalize(current.canonicalRequests) !== canonicalize(request.canonicalRequests)) throw new Error("hook targets changed during approval");
          const checked = authorizeHookDecision({ ...authorizationInput,
            requested: requestedControlDecision({ workspace: input.workspace, agentId: input.authenticatedAgentId, request: current }) });
          if (checked.requested.decision !== "ask") throw new Error("hook policy or session changed during approval");
          // The engine owns its multipart grant publication; recheck only external hook authority here.
          const rebound = authorizeHookDecision({ ...authorizationInput,
            requested: { ...checked.requested, decision: "allow" as const } });
          if (rebound.requested.decision !== "allow") throw new Error("hook authorization changed during approval");
          if (input.leaseToken !== undefined) {
            const checkedLease = verifyLeaseToken({ workspace: input.workspace, token: input.leaseToken,
              expectedWorkspaceId: workspaceIdFromDirectory(input.workspace), expectedAgentId: input.authenticatedAgentId,
              requiredScope: "hook:control", routePath: CONTROL_HOOK_ROUTE, revokedLeaseIds: revokedLeaseIdSet(input.workspace) });
            if (!checkedLease.ok || checkedLease.payload?.leaseId !== input.lease?.leaseId) throw new Error("hook broker credential no longer verifies");
          }
          if (input.lease && (input.lease.expiresTs <= Date.now() || revokedLeaseIdSet(input.workspace).has(input.lease.leaseId)
            || resolved.grants.some(grant => input.lease?.executeActionClasses && !input.lease.executeActionClasses.includes(grant.expectedActionClass))))
            throw new Error("hook lease expired, revoked or outside scope");
        };
        let refusal = (yield { kind: "consume", grants: resolved.grants, executionId: request.actionId, assertCurrent }) as string | null;
        if (!refusal) try { assertCurrent(); } catch { refusal = "AMC hook context changed during approval consumption; hook call denied."; }
        if (refusal) { requested = { ...requested, decision: "deny", reason: refusal }; authorization = null; approvalPhase = "blocked"; }
      } else approvalPhase ??= "blocked";
    }
    if (approvalPhase) {
      const suffix = hookApprovalAttemptSuffix(approvalPhase, request.rawInputSha256);
      eventId += suffix;
      sessionId += suffix;
      const attempt = recoverControlResult({ ledger, eventId, sessionId, request, agentId: input.authenticatedAgentId });
      if (attempt) return attempt;
    }
    const sessionState = ensureControlSession({ ledger, sessionId, provider });
    if (sessionState === "event-present") throw new HookControlError("HOOK_CONTROL_LEDGER_UNAVAILABLE", 503, "existing hook control session contains an unrelated event");
    const materialized = materializeProviderDecision({
      provider,
      requestSha256: request.rawInputSha256,
      requestedDecision: requested.decision,
      reason: requested.reason,
    });
    const bound = request.call ? boundDecisionFacts(request.call, { version, authorization, lease: input.lease, targets: request.canonicalRequests }) : {};
    const payload = {
      kind: approvalPhase ? "hook_approval_attempt" : "hook_control_decision",
      approvalRequestIds,
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
    underRegistration = enforced;
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
        ...(approvalPhase ? { approvalControlSchemaVersion: 1 } : { controlSchemaVersion: 2 }),
        approvalRequestIds,
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
      if (recovered && signedApprovalExecution && recovered.decision === "allow") {
        throw new HookControlError("HOOK_CONTROL_REPLAY_CONFLICT", 409, "signed approval already consumed; hook replay denied");
      }
      if (recovered) return recovered;
    }
    throw new HookWriterFault("hook control receipt could not be recorded", underRegistration);
  } finally {
    ledger?.close();
  }
}
