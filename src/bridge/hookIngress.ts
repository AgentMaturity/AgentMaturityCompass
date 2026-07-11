import { randomUUID } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import YAML from "yaml";
import { z } from "zod";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { openLedger, hashBinaryOrPath, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import { verifyReceipt, type ReceiptKind } from "../receipts/receipt.js";
import type { EvidenceEventType } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { redactBridgeText } from "./bridgeRedaction.js";

export const AEP_01_SOURCE_COMMIT = "2583cff9380f8f0a459d52c7112b6105c46496ed";
export const OBSERVED_AEP_HOOK_PATH = "/bridge/hooks/aep/0.1/events";
export const OBSERVED_AEP_HOOK_ROUTE = "/hooks/aep/0.1/events";
export const MAX_OBSERVED_HOOK_BODY_BYTES = 262_144;

const MAX_EVENT_AGE_MS = 24 * 60 * 60_000;
const MAX_EVENT_FUTURE_SKEW_MS = 5 * 60_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type HookIngressErrorCode =
  | "HOOK_PAYLOAD_TOO_LARGE"
  | "HOOK_JSON_INVALID"
  | "HOOK_JSON_AMBIGUOUS"
  | "HOOK_SCHEMA_INVALID"
  | "HOOK_EVENT_STALE"
  | "HOOK_EVENT_FUTURE"
  | "HOOK_EVENT_REPLAY"
  | "HOOK_LEDGER_UNAVAILABLE";

export class HookIngressError extends Error {
  readonly code: HookIngressErrorCode;
  readonly statusCode: number;

  constructor(code: HookIngressErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = "HookIngressError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const idSchema = z.string().min(1).max(160).regex(SAFE_ID, "must be a stable identifier");
const shortStringSchema = z.string().min(1).max(512);
const optionalShortStringSchema = z.string().max(512).optional();

const agentSchema = z.object({
  slug: idSchema,
  display_name: optionalShortStringSchema,
  version: optionalShortStringSchema,
  instance_id: idSchema.optional(),
  surface: optionalShortStringSchema
}).strict();

const sessionParentSchema = z.object({
  conversation_id: idSchema.optional(),
  relation: z.enum(["subagent", "fork", "resume", "continuation"]).optional(),
  spawning_action_id: idSchema.optional()
}).strict();

const sessionSchema = z.object({
  id: idSchema.optional(),
  conversation_id: idSchema.optional(),
  turn_id: idSchema.optional(),
  permission_mode: optionalShortStringSchema,
  root_conversation_id: idSchema.optional(),
  parent: sessionParentSchema.optional()
}).strict();

const userSchema = z.object({
  id: idSchema.optional(),
  email: z.string().email().max(320).optional(),
  login: optionalShortStringSchema,
  display_name: optionalShortStringSchema
}).strict();

const workspaceSchema = z.object({
  cwd: z.string().min(1).max(4096).optional(),
  project_path: z.string().min(1).max(4096).optional(),
  roots: z.array(z.string().min(1).max(4096)).max(64).optional()
}).strict();

const modelSchema = z.object({
  id: optionalShortStringSchema,
  display_name: optionalShortStringSchema,
  provider: optionalShortStringSchema,
  effort: optionalShortStringSchema
}).strict();

const actionErrorSchema = z.object({
  code: idSchema.optional(),
  message: z.string().max(16_384).optional()
}).strict();

const actionSchema = z.object({
  type: z.enum(["tool_call", "skill_use", "subagent_spawn", "other"]),
  id: idSchema,
  status: z.enum(["success", "failure", "timeout", "cancelled"]).optional(),
  rationale: z.string().max(32_768).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: actionErrorSchema.optional()
}).strict();

const iconSchema = z.object({
  src: z.string().min(1).max(4096),
  mime_type: optionalShortStringSchema
}).strict();

const toolSchema = z.object({
  id: idSchema.optional(),
  type: z.enum(["native", "mcp", "connector", "extension", "other"]),
  name: shortStringSchema,
  display_name: optionalShortStringSchema,
  description: z.string().max(16_384).optional(),
  icon: iconSchema.optional(),
  version: optionalShortStringSchema,
  schema: z.unknown().optional(),
  original_name: optionalShortStringSchema
}).strict();

const serverSchema = z.object({
  id: idSchema.optional(),
  name: optionalShortStringSchema,
  title: optionalShortStringSchema,
  description: z.string().max(16_384).optional(),
  icon: iconSchema.optional(),
  version: optionalShortStringSchema,
  transport: optionalShortStringSchema,
  command: z.string().max(16_384).optional(),
  url: z.string().url().max(4096).optional(),
  repository_url: z.string().url().max(4096).optional(),
  website_url: z.string().url().max(4096).optional()
}).strict();

const skillSchema = z.object({
  id: idSchema.optional(),
  name: shortStringSchema,
  source: z.enum(["user", "project", "builtin", "marketplace"]).optional(),
  version: optionalShortStringSchema,
  path: z.string().max(4096).optional(),
  description: z.string().max(16_384).optional()
}).strict();

const contentSchema = z.object({
  type: z.enum(["prompt", "thought", "response", "plan", "notification", "question", "answer"]),
  text: z.string().max(262_144),
  style: optionalShortStringSchema,
  truncated: z.boolean().optional(),
  original_length: z.number().int().nonnegative().optional()
}).strict();

const attachmentSchema = z.object({
  type: z.enum(["image", "video", "audio", "file"]),
  mime_type: optionalShortStringSchema,
  url: z.string().url().max(4096).optional(),
  data_uri: z.string().max(262_144).optional(),
  thumbnail_url: z.string().url().max(4096).optional(),
  thumbnail_data_uri: z.string().max(262_144).optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  duration_ms: z.number().nonnegative().optional(),
  size_bytes: z.number().int().nonnegative().optional(),
  name: optionalShortStringSchema
}).strict();

const decisionSchema = z.object({
  outcome: z.enum(["approved", "denied", "info"]),
  by: optionalShortStringSchema,
  reason: z.string().max(16_384).optional(),
  feedback: z.string().max(16_384).optional(),
  policy_id: idSchema.optional(),
  time: z.string().datetime({ offset: true }).optional(),
  response_time_ms: z.number().nonnegative().optional()
}).strict();

const lifecycleSchema = z.object({
  source: optionalShortStringSchema,
  reason: optionalShortStringSchema,
  trigger: optionalShortStringSchema
}).strict();

const extensionsSchema = z.record(
  z.string().regex(/^x-[a-z0-9][a-z0-9._-]*$/i, "extension keys must use x- namespaces"),
  z.unknown()
);

export const observedAepActionEventSchema = z.object({
  aep_version: z.literal("0.1"),
  id: idSchema,
  type: z.enum(["action.requested", "action.completed", "action.failed", "action.denied"]),
  time: z.string().datetime({ offset: true }),
  hook: optionalShortStringSchema,
  agent: agentSchema,
  session: sessionSchema.optional(),
  user: userSchema.optional(),
  workspace: workspaceSchema.optional(),
  model: modelSchema.optional(),
  action: actionSchema,
  tool: toolSchema.optional(),
  server: serverSchema.optional(),
  skill: skillSchema.optional(),
  content: z.array(contentSchema).max(64).optional(),
  attachments: z.array(attachmentSchema).max(32).optional(),
  decision: decisionSchema.optional(),
  metrics: z.record(z.string().min(1).max(128), z.number().finite()).optional(),
  lifecycle: lifecycleSchema.optional(),
  extensions: extensionsSchema.optional()
}).strict().superRefine((event, context) => {
  if (event.action.type === "tool_call" && !event.tool) {
    context.addIssue({ code: "custom", path: ["tool"], message: "tool is required for tool_call actions" });
  }
  if (event.action.type === "skill_use" && !event.skill) {
    context.addIssue({ code: "custom", path: ["skill"], message: "skill is required for skill_use actions" });
  }
  if (event.tool?.type === "mcp" && !event.server) {
    context.addIssue({ code: "custom", path: ["server"], message: "server is required for mcp tools" });
  }
  if (event.type === "action.completed" && event.action.status !== "success") {
    context.addIssue({ code: "custom", path: ["action", "status"], message: "completed actions require success status" });
  }
  if (event.type === "action.failed" && !["failure", "timeout", "cancelled"].includes(event.action.status ?? "")) {
    context.addIssue({ code: "custom", path: ["action", "status"], message: "failed actions require failure, timeout, or cancelled status" });
  }
  if (event.type === "action.denied" && event.decision?.outcome !== "denied") {
    context.addIssue({ code: "custom", path: ["decision", "outcome"], message: "denied actions require a denied decision outcome" });
  }
});

export type ObservedAepActionEvent = z.infer<typeof observedAepActionEventSchema>;

export interface ObservedAepHookReceipt {
  observed: true;
  idempotentReplay: boolean;
  protocol: {
    name: "aep";
    version: "0.1";
    sourceCommit: typeof AEP_01_SOURCE_COMMIT;
    conformanceClaim: false;
  };
  sourceEventId: string;
  sourceEventType: ObservedAepActionEvent["type"];
  actionId: string;
  eventId: string;
  evidenceType: EvidenceEventType;
  sessionId: string;
  rawBodySha256: string;
  receipt: string;
  receiptId: string;
  receiptSha256: string;
}

export interface ObservedHookRateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  retryAfterSeconds: number;
}

function parseUnambiguousJson(rawBody: Buffer): unknown {
  if (rawBody.byteLength > MAX_OBSERVED_HOOK_BODY_BYTES) {
    throw new HookIngressError("HOOK_PAYLOAD_TOO_LARGE", 413, "hook payload too large");
  }
  if (rawBody.byteLength === 0) {
    throw new HookIngressError("HOOK_JSON_INVALID", 400, "hook payload must be JSON");
  }
  const text = rawBody.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(rawBody)) {
    throw new HookIngressError("HOOK_JSON_INVALID", 400, "hook payload must be valid UTF-8 JSON");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new HookIngressError("HOOK_JSON_INVALID", 400, "hook payload must be valid JSON");
  }
  const yamlDocument = YAML.parseDocument(text, { uniqueKeys: true });
  const duplicate = yamlDocument.errors.find((error) => /unique|duplicate/i.test(error.message));
  if (duplicate) {
    throw new HookIngressError("HOOK_JSON_AMBIGUOUS", 400, "hook payload contains duplicate JSON keys");
  }
  return parsed;
}

function validateEvent(rawBody: Buffer, now: number): ObservedAepActionEvent {
  const parsed = parseUnambiguousJson(rawBody);
  const result = observedAepActionEventSchema.safeParse(parsed);
  if (!result.success) {
    throw new HookIngressError("HOOK_SCHEMA_INVALID", 400, "hook payload does not match the pinned observed AEP 0.1 subset");
  }
  const eventTime = Date.parse(result.data.time);
  if (eventTime > now + MAX_EVENT_FUTURE_SKEW_MS) {
    throw new HookIngressError("HOOK_EVENT_FUTURE", 422, "hook event timestamp is too far in the future");
  }
  if (eventTime < now - MAX_EVENT_AGE_MS) {
    throw new HookIngressError("HOOK_EVENT_STALE", 422, "hook event timestamp is stale");
  }
  return result.data;
}

function digestOptional(value: unknown): string | null {
  return value === undefined ? null : sha256Hex(canonicalize(value));
}

function omittedFields(event: ObservedAepActionEvent): string[] {
  const omitted: string[] = [];
  if (event.user) omitted.push("user");
  if (event.workspace) omitted.push("workspace");
  if (event.extensions) omitted.push("extensions");
  if (event.content) omitted.push("content");
  if (event.attachments) omitted.push("attachments");
  if (event.decision) omitted.push("decision");
  if (event.lifecycle) omitted.push("lifecycle");
  if (event.action.input !== undefined) omitted.push("action.input");
  if (event.action.output !== undefined) omitted.push("action.output");
  if (event.action.rationale !== undefined) omitted.push("action.rationale");
  if (event.action.error?.message !== undefined) omitted.push("action.error.message");
  if (event.tool?.description !== undefined) omitted.push("tool.description");
  if (event.tool?.schema !== undefined) omitted.push("tool.schema");
  if (event.tool?.icon !== undefined) omitted.push("tool.icon");
  if (event.server) omitted.push("server.privateFields");
  if (event.skill?.path !== undefined || event.skill?.description !== undefined) omitted.push("skill.privateFields");
  return omitted.sort();
}

function buildProjection(event: ObservedAepActionEvent, authenticatedAgentId: string, rawBodySha256: string): Record<string, unknown> {
  return {
    schemaVersion: "2026-07-10",
    protocol: {
      name: "aep",
      version: "0.1",
      sourceCommit: AEP_01_SOURCE_COMMIT,
      conformanceClaim: false,
      acceptance: "AMC-owned observed action subset"
    },
    source: {
      eventId: event.id,
      eventType: event.type,
      eventTime: event.time,
      hook: event.hook ? redactBridgeText(event.hook).slice(0, 512) : null,
      rawBodySha256,
      rawStored: false
    },
    producer: {
      authenticatedAgentId,
      claimedAgentSlug: event.agent.slug,
      claimedAgentVersion: event.agent.version ? redactBridgeText(event.agent.version).slice(0, 512) : null,
      modelId: event.model?.id ? redactBridgeText(event.model.id).slice(0, 512) : null,
      modelProvider: event.model?.provider ? redactBridgeText(event.model.provider).slice(0, 512) : null
    },
    correlation: {
      actionId: event.action.id,
      sessionIdSha256: digestOptional(event.session?.id),
      conversationIdSha256: digestOptional(event.session?.conversation_id)
    },
    action: {
      type: event.action.type,
      status: event.action.status ?? null,
      inputSha256: digestOptional(event.action.input),
      outputSha256: digestOptional(event.action.output),
      errorCode: event.action.error?.code ?? null,
      errorMessageSha256: digestOptional(event.action.error?.message)
    },
    target: {
      toolId: event.tool?.id ?? null,
      toolType: event.tool?.type ?? null,
      toolName: event.tool?.name ? redactBridgeText(event.tool.name).slice(0, 512) : null,
      serverId: event.server?.id ?? null,
      serverName: event.server?.name ? redactBridgeText(event.server.name).slice(0, 512) : null,
      serverTransport: event.server?.transport ? redactBridgeText(event.server.transport).slice(0, 512) : null,
      skillId: event.skill?.id ?? null,
      skillName: event.skill?.name ? redactBridgeText(event.skill.name).slice(0, 512) : null
    },
    privacy: {
      projectionRedacted: true,
      omittedFields: omittedFields(event)
    }
  };
}

function evidenceTypeFor(event: ObservedAepActionEvent): EvidenceEventType {
  return event.type === "action.requested" ? "tool_action" : "tool_result";
}

function receiptKindFor(event: ObservedAepActionEvent): ReceiptKind {
  return event.type === "action.requested" ? "tool_action" : "tool_result";
}

function deterministicEventId(authenticatedAgentId: string, sourceEventId: string): string {
  return `hook_${sha256Hex(canonicalize({ authenticatedAgentId, sourceEventId })).slice(0, 48)}`;
}

function deterministicSessionId(authenticatedAgentId: string, event: ObservedAepActionEvent): string {
  return `hook-session-${sha256Hex(canonicalize({ authenticatedAgentId, sourceEventId: event.id })).slice(0, 40)}`;
}

function isUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed|SQLITE_CONSTRAINT_PRIMARYKEY/i.test(message);
}

function sealHookSession(ledger: ReturnType<typeof openLedger>, sessionId: string): void {
  const current = ledger.db.prepare(
    "SELECT session_final_event_hash FROM sessions WHERE session_id = ? LIMIT 1"
  ).get(sessionId) as { session_final_event_hash: string | null } | undefined;
  if (!current || current.session_final_event_hash) return;
  try {
    ledger.sealSession(sessionId);
  } catch (error) {
    const recovered = ledger.db.prepare(
      "SELECT session_final_event_hash FROM sessions WHERE session_id = ? LIMIT 1"
    ).get(sessionId) as { session_final_event_hash: string | null } | undefined;
    if (!recovered?.session_final_event_hash) throw error;
  }
}

export function consumeObservedHookRateLimit(input: {
  workspace: string;
  leaseId: string;
  authenticatedAgentId: string;
  maxRequestsPerMinute: number;
  routePath?: string;
  now?: number;
}): ObservedHookRateLimitStatus {
  const now = input.now ?? Date.now();
  const limit = Math.max(1, Math.trunc(input.maxRequestsPerMinute));
  let ledger: ReturnType<typeof openLedger> | null = null;
  let transactionOpen = false;
  try {
    ledger = openLedger(input.workspace);
    ledger.db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    const cutoff = now - 60_000;
    const routePath = input.routePath ?? OBSERVED_AEP_HOOK_ROUTE;
    ledger.db.prepare("DELETE FROM bridge_request_usage WHERE ts < ?").run(cutoff);
    const row = ledger.db.prepare(
      `SELECT COUNT(*) AS count, MIN(ts) AS oldest_ts
       FROM bridge_request_usage
       WHERE lease_id = ? AND route = ? AND ts >= ?`
    ).get(input.leaseId, routePath, cutoff) as { count: number; oldest_ts: number | null };
    const used = Number(row.count ?? 0);
    if (used >= limit) {
      ledger.db.exec("COMMIT");
      transactionOpen = false;
      const retryAfterSeconds = row.oldest_ts === null
        ? 60
        : Math.max(1, Math.ceil((row.oldest_ts + 60_000 - now) / 1000));
      return { allowed: false, used, limit, retryAfterSeconds };
    }
    ledger.db.prepare(
      `INSERT INTO bridge_request_usage(request_id, lease_id, agent_id, route, ts)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), input.leaseId, input.authenticatedAgentId, routePath, now);
    ledger.db.exec("COMMIT");
    transactionOpen = false;
    return {
      allowed: true,
      used: used + 1,
      limit,
      retryAfterSeconds: 60
    };
  } catch {
    if (ledger && transactionOpen) {
      try {
        ledger.db.exec("ROLLBACK");
      } catch {
        // Best effort; the request still fails closed.
      }
    }
    throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "hook quota ledger unavailable");
  } finally {
    ledger?.close();
  }
}

const storedHookReceiptMetaSchema = z.object({
  trustTier: z.literal("OBSERVED"),
  agentId: z.string(),
  sourceProtocol: z.literal("aep"),
  sourceProtocolVersion: z.literal("0.1"),
  sourceProtocolCommit: z.literal(AEP_01_SOURCE_COMMIT),
  sourceConformanceClaim: z.literal(false),
  sourceEventId: z.string(),
  sourceEventType: z.enum(["action.requested", "action.completed", "action.failed", "action.denied"]),
  actionId: z.string(),
  rawBodySha256: z.string().regex(/^[a-f0-9]{64}$/),
  rawPayloadStored: z.literal(false),
  projectionRedacted: z.literal(true),
  conformanceBoundary: z.literal("observed-subset-only"),
  receipt: z.string().min(1),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).passthrough();

function recoverObservedHookReceipt(input: {
  ledger: ReturnType<typeof openLedger>;
  authenticatedAgentId: string;
  event: ObservedAepActionEvent;
  eventId: string;
  sessionId: string;
  rawBodySha256: string;
}): ObservedAepHookReceipt | null {
  const existing = input.ledger.db.prepare(
    "SELECT id, session_id, event_type, meta_json FROM evidence_events WHERE id = ? LIMIT 1"
  ).get(input.eventId) as { id: string; session_id: string; event_type: EvidenceEventType; meta_json: string } | undefined;
  if (!existing) return null;

  let parsedMeta: unknown;
  try {
    parsedMeta = JSON.parse(existing.meta_json) as unknown;
  } catch {
    throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "stored hook receipt metadata is invalid");
  }
  const result = storedHookReceiptMetaSchema.safeParse(parsedMeta);
  if (
    !result.success
    || existing.session_id !== input.sessionId
    || existing.event_type !== evidenceTypeFor(input.event)
    || result.data.agentId !== input.authenticatedAgentId
    || result.data.sourceEventId !== input.event.id
    || result.data.sourceEventType !== input.event.type
    || result.data.actionId !== input.event.action.id
  ) {
    throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "stored hook receipt metadata is invalid");
  }
  if (result.data.rawBodySha256 !== input.rawBodySha256) {
    throw new HookIngressError("HOOK_EVENT_REPLAY", 409, "hook source event ID conflicts with previously observed bytes");
  }

  sealHookSession(input.ledger, input.sessionId);
  const integrity = verifyEvidenceEventIntegrity({
    ledger: input.ledger,
    eventId: input.eventId,
    requireReceipt: true,
    requireSealedSession: true
  });
  const verifiedReceipt = verifyReceipt(result.data.receipt, getPublicKeyHistory(input.ledger.workspace, "monitor"));
  if (
    !integrity.ok
    || !verifiedReceipt.ok
    || !verifiedReceipt.payload
    || verifiedReceipt.payload.kind !== receiptKindFor(input.event)
    || verifiedReceipt.payload.agentId !== input.authenticatedAgentId
    || verifiedReceipt.payload.providerId !== `aep:${input.event.agent.slug}`
  ) {
    throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "stored hook receipt integrity verification failed");
  }
  return {
    observed: true,
    idempotentReplay: true,
    protocol: {
      name: "aep",
      version: "0.1",
      sourceCommit: AEP_01_SOURCE_COMMIT,
      conformanceClaim: false
    },
    sourceEventId: input.event.id,
    sourceEventType: input.event.type,
    actionId: input.event.action.id,
    eventId: existing.id,
    evidenceType: evidenceTypeFor(input.event),
    sessionId: input.sessionId,
    rawBodySha256: input.rawBodySha256,
    receipt: result.data.receipt,
    receiptId: result.data.receipt_id,
    receiptSha256: result.data.receipt_sha256
  };
}

export function ingestObservedAepHookEvent(input: {
  workspace: string;
  authenticatedAgentId: string;
  rawBody: Buffer;
  now?: number;
}): ObservedAepHookReceipt {
  const now = input.now ?? Date.now();
  if (!SAFE_ID.test(input.authenticatedAgentId) || input.authenticatedAgentId.length > 160) {
    throw new HookIngressError("HOOK_SCHEMA_INVALID", 400, "authenticated agent identity is invalid");
  }
  const event = validateEvent(input.rawBody, now);
  const rawBodySha256 = sha256Hex(input.rawBody);
  const eventId = deterministicEventId(input.authenticatedAgentId, event.id);
  const sessionId = deterministicSessionId(input.authenticatedAgentId, event);
  const evidenceType = evidenceTypeFor(event);
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(input.workspace);
    const recovered = recoverObservedHookReceipt({
      ledger,
      authenticatedAgentId: input.authenticatedAgentId,
      event,
      eventId,
      sessionId,
      rawBodySha256
    });
    if (recovered) return recovered;

    const session = ledger.db.prepare("SELECT session_id, session_final_event_hash FROM sessions WHERE session_id = ? LIMIT 1").get(sessionId) as
      | { session_id: string; session_final_event_hash: string | null }
      | undefined;
    if (session?.session_final_event_hash) {
      throw new HookIngressError("HOOK_EVENT_REPLAY", 409, "hook event session is sealed");
    }
    if (!session) {
      try {
        ledger.startSession({
          sessionId,
          runtime: "any",
          binaryPath: "amc-bridge-hook-ingress",
          binarySha256: hashBinaryOrPath("amc-bridge-hook-ingress", "1")
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
      }
    }

    const projection = buildProjection(event, input.authenticatedAgentId, rawBodySha256);
    const projectionPayload = `${JSON.stringify(projection, null, 2)}\n`;
    try {
      const appended = ledger.appendEvidenceWithReceipt({
        id: eventId,
        ts: now,
        sessionId,
        runtime: "any",
        eventType: evidenceType,
        payload: projectionPayload,
        payloadExt: "json",
        inline: false,
        meta: {
          trustTier: "OBSERVED",
          agentId: input.authenticatedAgentId,
          sourceProtocol: "aep",
          sourceProtocolVersion: "0.1",
          sourceProtocolCommit: AEP_01_SOURCE_COMMIT,
          sourceConformanceClaim: false,
          sourceEventId: event.id,
          sourceEventType: event.type,
          sourceEventTime: event.time,
          actionId: event.action.id,
          actionType: event.action.type,
          actionStatus: event.action.status ?? null,
          claimedAgentSlug: event.agent.slug,
          toolName: event.tool?.name ? redactBridgeText(event.tool.name).slice(0, 512) : null,
          toolType: event.tool?.type ?? null,
          rawBodySha256,
          rawPayloadStored: false,
          projectionRedacted: true,
          conformanceBoundary: "observed-subset-only"
        },
        receipt: {
          kind: receiptKindFor(event),
          agentId: input.authenticatedAgentId,
          providerId: `aep:${event.agent.slug}`,
          model: event.model?.id ? redactBridgeText(event.model.id).slice(0, 512) : null,
          bodySha256: sha256Hex(Buffer.from(projectionPayload, "utf8"))
        }
      });
      sealHookSession(ledger, sessionId);
      return {
        observed: true,
        idempotentReplay: false,
        protocol: {
          name: "aep",
          version: "0.1",
          sourceCommit: AEP_01_SOURCE_COMMIT,
          conformanceClaim: false
        },
        sourceEventId: event.id,
        sourceEventType: event.type,
        actionId: event.action.id,
        eventId: appended.id,
        evidenceType,
        sessionId,
        rawBodySha256,
        receipt: appended.receipt,
        receiptId: appended.receiptId,
        receiptSha256: appended.receiptSha256
      };
    } catch (error) {
      if (isUniqueConstraint(error)) {
        const recoveredAfterRace = recoverObservedHookReceipt({
          ledger,
          authenticatedAgentId: input.authenticatedAgentId,
          event,
          eventId,
          sessionId,
          rawBodySha256
        });
        if (recoveredAfterRace) return recoveredAfterRace;
        throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "hook event receipt could not be recovered");
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof HookIngressError) throw error;
    throw new HookIngressError("HOOK_LEDGER_UNAVAILABLE", 503, "hook event could not be recorded");
  } finally {
    ledger?.close();
  }
}
