import { z } from "zod";
import { openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import type { EvidenceEvent } from "../types.js";

export type HookActionLifecycleProvider = "claude-code" | "gemini-cli";
export type HookActionLifecycleStatus = "requested" | "awaiting_terminal" | "completed" | "failed" | "denied" | "steered" | "fail_closed";
export type HookActionLifecycleReasonCode =
  | "ACTION_ID_COLLISION"
  | "CORRELATION_MISMATCH"
  | "DECISION_BEFORE_REQUEST"
  | "DECISION_CONFLICT"
  | "DECISION_DUPLICATE"
  | "DECISION_METADATA_INVALID"
  | "DENIED_THEN_EXECUTED"
  | "EVIDENCE_INTEGRITY_FAILED"
  | "PROVIDER_MISMATCH"
  | "REQUEST_DUPLICATE"
  | "REQUEST_MISSING"
  | "TERMINAL_BEFORE_REQUEST"
  | "TERMINAL_CONFLICT"
  | "TERMINAL_DUPLICATE";

export interface HookActionLifecycleEvidenceRef {
  eventId: string;
  eventHash: string;
  receiptId: string;
  receiptSha256: string;
  observedAt: string;
}

export interface HookActionLifecycleInspection {
  schemaVersion: "2026-07-12";
  agentId: string;
  actionId: string;
  provider: HookActionLifecycleProvider | null;
  status: HookActionLifecycleStatus;
  valid: boolean;
  failClosed: boolean;
  reasonCodes: HookActionLifecycleReasonCode[];
  phases: {
    requested: (HookActionLifecycleEvidenceRef & { type: "action.requested" }) | null;
    decision: (HookActionLifecycleEvidenceRef & {
      decision: "allow" | "deny" | "ask";
      requestedDecision: "allow" | "deny" | "ask" | "steer";
      effectiveOutcome: "allow" | "deny" | "ask" | "steer";
      providerMapping: "native" | "corrective_deny" | "fail_closed_deny";
    }) | null;
    terminal: (HookActionLifecycleEvidenceRef & {
      type: "action.completed" | "action.failed" | "action.denied";
      status: "success" | "failure" | "timeout" | "cancelled" | null;
    }) | null;
  };
  evidenceEventIds: string[];
  receiptIds: string[];
  rawProviderPayloadStored: false;
  claimBoundary: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isSafeHookActionLookupId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 160 && SAFE_ID.test(value);
}

const hookMetaSchema = z.object({
  trustTier: z.literal("OBSERVED"),
  agentId: z.string().min(1),
  sourceProtocol: z.literal("aep"),
  sourceEventType: z.enum(["action.requested", "action.completed", "action.failed", "action.denied"]),
  actionId: z.string().min(1),
  actionStatus: z.enum(["success", "failure", "timeout", "cancelled"]).nullable().optional(),
  provider: z.enum(["claude-code", "gemini-cli"]),
  providerCorrelationSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  rawPayloadStored: z.literal(false),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();

const decisionMetaBaseSchema = z.object({
  trustTier: z.literal("OBSERVED"),
  agentId: z.string().min(1),
  provider: z.enum(["claude-code", "gemini-cli"]),
  actionId: z.string().min(1),
  decision: z.enum(["allow", "deny", "ask"]),
  rawPayloadStored: z.literal(false),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const decisionMetaV1Schema = decisionMetaBaseSchema.extend({
  controlSchemaVersion: z.literal(1),
  requestedDecision: z.enum(["allow", "deny", "ask"]),
  capabilityLossy: z.boolean(),
}).passthrough().superRefine((value, ctx) => {
  const native = value.requestedDecision === value.decision && !value.capabilityLossy;
  const geminiAskFallback = value.provider === "gemini-cli"
    && value.requestedDecision === "ask"
    && value.decision === "deny"
    && value.capabilityLossy;
  if (!native && !geminiAskFallback) {
    ctx.addIssue({ code: "custom", path: ["decision"], message: "legacy decision mapping is inconsistent" });
  }
});

const decisionMetaV2Schema = decisionMetaBaseSchema.extend({
  controlSchemaVersion: z.literal(2),
  requestedDecision: z.enum(["allow", "deny", "ask", "steer"]),
  effectiveOutcome: z.enum(["allow", "deny", "ask", "steer"]),
  providerMapping: z.enum(["native", "corrective_deny", "fail_closed_deny"]),
  capabilityLossy: z.boolean(),
}).passthrough().superRefine((value, ctx) => {
  const native = value.providerMapping === "native"
    && value.requestedDecision !== "steer"
    && value.requestedDecision === value.decision
    && value.effectiveOutcome === value.decision
    && !value.capabilityLossy;
  const corrective = value.providerMapping === "corrective_deny"
    && value.provider === "claude-code"
    && value.requestedDecision === "steer"
    && value.decision === "deny"
    && value.effectiveOutcome === "steer"
    && !value.capabilityLossy;
  const fallback = value.providerMapping === "fail_closed_deny"
    && value.provider === "gemini-cli"
    && (value.requestedDecision === "ask" || value.requestedDecision === "steer")
    && value.decision === "deny"
    && value.effectiveOutcome === "deny"
    && value.capabilityLossy;
  if (!native && !corrective && !fallback) {
    ctx.addIssue({ code: "custom", path: ["providerMapping"], message: "provider outcome mapping is inconsistent" });
  }
});

const decisionMetaSchema = z.union([decisionMetaV2Schema, decisionMetaV1Schema]);

interface IndexedHookEvent {
  kind: "hook";
  index: number;
  event: EvidenceEvent;
  meta: z.infer<typeof hookMetaSchema>;
}

interface IndexedDecisionEvent {
  kind: "decision";
  index: number;
  event: EvidenceEvent;
  meta: z.infer<typeof decisionMetaSchema>;
}

type IndexedLifecycleEvent = IndexedHookEvent | IndexedDecisionEvent;

const REASON_ORDER: HookActionLifecycleReasonCode[] = [
  "EVIDENCE_INTEGRITY_FAILED",
  "ACTION_ID_COLLISION",
  "REQUEST_MISSING",
  "REQUEST_DUPLICATE",
  "PROVIDER_MISMATCH",
  "CORRELATION_MISMATCH",
  "DECISION_METADATA_INVALID",
  "DECISION_DUPLICATE",
  "DECISION_CONFLICT",
  "TERMINAL_DUPLICATE",
  "TERMINAL_CONFLICT",
  "DECISION_BEFORE_REQUEST",
  "TERMINAL_BEFORE_REQUEST",
  "DENIED_THEN_EXECUTED",
];

function parseMeta(event: EvidenceEvent): unknown {
  try {
    return JSON.parse(event.meta_json) as unknown;
  } catch {
    return null;
  }
}

function projectedDecision(meta: z.infer<typeof decisionMetaSchema>): {
  decision: "allow" | "deny" | "ask";
  requestedDecision: "allow" | "deny" | "ask" | "steer";
  effectiveOutcome: "allow" | "deny" | "ask" | "steer";
  providerMapping: "native" | "corrective_deny" | "fail_closed_deny";
} {
  if (meta.controlSchemaVersion === 2) {
    return {
      decision: meta.decision,
      requestedDecision: meta.requestedDecision,
      effectiveOutcome: meta.effectiveOutcome,
      providerMapping: meta.providerMapping,
    };
  }
  const fallback = meta.provider === "gemini-cli"
    && meta.requestedDecision === "ask"
    && meta.decision === "deny"
    && meta.capabilityLossy;
  return {
    decision: meta.decision,
    requestedDecision: meta.requestedDecision,
    effectiveOutcome: fallback ? "deny" : meta.decision,
    providerMapping: fallback ? "fail_closed_deny" : "native",
  };
}

function isInvalidDecisionCandidate(meta: unknown, agentId: string, actionId: string): boolean {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  const row = meta as Record<string, unknown>;
  if (row.agentId !== agentId || row.actionId !== actionId) return false;
  if (row.controlSchemaVersion !== 1 && row.controlSchemaVersion !== 2) return false;
  return !decisionMetaSchema.safeParse(meta).success;
}

function lifecycleEvents(events: EvidenceEvent[], actionId: string): IndexedLifecycleEvent[] {
  const rows: IndexedLifecycleEvent[] = [];
  events.forEach((event, index) => {
    const meta = parseMeta(event);
    if (event.event_type === "tool_action" || event.event_type === "tool_result") {
      const hook = hookMetaSchema.safeParse(meta);
      const expectedEventType = hook.success && hook.data.sourceEventType === "action.requested"
        ? "tool_action"
        : "tool_result";
      if (hook.success && event.event_type === expectedEventType && hook.data.actionId === actionId) {
        rows.push({ kind: "hook", index, event, meta: hook.data });
        return;
      }
    }
    if (event.event_type === "audit") {
      const decision = decisionMetaSchema.safeParse(meta);
      if (decision.success && decision.data.actionId === actionId) {
        rows.push({ kind: "decision", index, event, meta: decision.data });
      }
    }
  });
  return rows;
}

function evidenceRef(row: IndexedLifecycleEvent): HookActionLifecycleEvidenceRef {
  return {
    eventId: row.event.id,
    eventHash: row.event.event_hash,
    receiptId: row.meta.receipt_id,
    receiptSha256: row.meta.receipt_sha256,
    observedAt: new Date(row.event.ts).toISOString(),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function inspectHookActionLifecycle(input: {
  workspace: string;
  agentId: string;
  actionId: string;
}): HookActionLifecycleInspection {
  if (!isSafeHookActionLookupId(input.agentId) || !isSafeHookActionLookupId(input.actionId)) {
    throw new Error("agentId and actionId must be stable 1-160 character identifiers");
  }
  const ledger = openLedger(input.workspace);
  try {
    const events = ledger.getAllEvents();
    const allRows = lifecycleEvents(events, input.actionId);
    const targetRows = allRows.filter((row) => row.meta.agentId === input.agentId);
    const reasons = new Set<HookActionLifecycleReasonCode>();

    if (events.some((event) => event.event_type === "audit"
      && isInvalidDecisionCandidate(parseMeta(event), input.agentId, input.actionId))) {
      reasons.add("DECISION_METADATA_INVALID");
    }

    const lastEvent = events.at(-1);
    if (lastEvent) {
      const chain = verifyEvidenceEventIntegrity({ ledger, eventId: lastEvent.id });
      if (!chain.ok) reasons.add("EVIDENCE_INTEGRITY_FAILED");
    }
    for (const row of targetRows) {
      const integrity = verifyEvidenceEventIntegrity({
        ledger,
        eventId: row.event.id,
        requireReceipt: true,
        requireSealedSession: true,
      });
      if (!integrity.ok) reasons.add("EVIDENCE_INTEGRITY_FAILED");
    }

    if (unique(allRows.map((row) => row.meta.agentId)).length > 1) reasons.add("ACTION_ID_COLLISION");
    const providers = unique(targetRows.map((row) => row.meta.provider));
    if (providers.length > 1) reasons.add("PROVIDER_MISMATCH");

    const hooks = targetRows.filter((row): row is IndexedHookEvent => row.kind === "hook");
    const decisions = targetRows.filter((row): row is IndexedDecisionEvent => row.kind === "decision");
    const requests = hooks.filter((row) => row.meta.sourceEventType === "action.requested");
    const terminals = hooks.filter((row) => row.meta.sourceEventType !== "action.requested");
    if (requests.length === 0) reasons.add("REQUEST_MISSING");
    if (requests.length > 1) reasons.add("REQUEST_DUPLICATE");
    if (decisions.length > 1) reasons.add("DECISION_DUPLICATE");
    if (unique(decisions.map((row) => JSON.stringify(projectedDecision(row.meta)))).length > 1) {
      reasons.add("DECISION_CONFLICT");
    }
    if (terminals.length > 1) reasons.add("TERMINAL_DUPLICATE");
    if (unique(terminals.map((row) => row.meta.sourceEventType)).length > 1) reasons.add("TERMINAL_CONFLICT");

    const correlations = unique(hooks
      .map((row) => row.meta.providerCorrelationSha256 ?? null)
      .filter((value): value is string => value !== null));
    if (correlations.length > 1) reasons.add("CORRELATION_MISMATCH");

    const firstRequest = requests[0] ?? null;
    const firstDecision = decisions[0] ?? null;
    const firstTerminal = terminals[0] ?? null;
    if (firstRequest && firstDecision && firstDecision.index < firstRequest.index) reasons.add("DECISION_BEFORE_REQUEST");
    if (firstRequest && firstTerminal && firstTerminal.index < firstRequest.index) reasons.add("TERMINAL_BEFORE_REQUEST");

    const deniedByControl = decisions.some((row) => row.meta.decision === "deny");
    const steeredByControl = decisions.some((row) => projectedDecision(row.meta).effectiveOutcome === "steer");
    const deniedByTerminal = terminals.some((row) => row.meta.sourceEventType === "action.denied");
    const executedTerminal = terminals.some((row) => row.meta.sourceEventType === "action.completed" || row.meta.sourceEventType === "action.failed");
    if ((deniedByControl || deniedByTerminal) && executedTerminal) reasons.add("DENIED_THEN_EXECUTED");

    const reasonCodes = REASON_ORDER.filter((reason) => reasons.has(reason));
    let status: HookActionLifecycleStatus;
    if (reasonCodes.length > 0) {
      status = "fail_closed";
    } else if (steeredByControl) {
      status = "steered";
    } else if (deniedByControl || deniedByTerminal) {
      status = "denied";
    } else if (firstTerminal?.meta.sourceEventType === "action.completed") {
      status = "completed";
    } else if (firstTerminal?.meta.sourceEventType === "action.failed") {
      status = "failed";
    } else if (firstDecision) {
      status = "awaiting_terminal";
    } else {
      status = "requested";
    }

    const orderedRows = [...targetRows].sort((left, right) => left.index - right.index);
    return {
      schemaVersion: "2026-07-12",
      agentId: input.agentId,
      actionId: input.actionId,
      provider: providers.length === 1 ? providers[0]! : null,
      status,
      valid: reasonCodes.length === 0,
      failClosed: reasonCodes.length > 0,
      reasonCodes,
      phases: {
        requested: firstRequest ? { ...evidenceRef(firstRequest), type: "action.requested" } : null,
        decision: firstDecision ? { ...evidenceRef(firstDecision), ...projectedDecision(firstDecision.meta) } : null,
        terminal: firstTerminal ? {
          ...evidenceRef(firstTerminal),
          type: firstTerminal.meta.sourceEventType as "action.completed" | "action.failed" | "action.denied",
          status: firstTerminal.meta.actionStatus ?? null,
        } : null,
      },
      evidenceEventIds: orderedRows.map((row) => row.event.id),
      receiptIds: orderedRows.map((row) => row.meta.receipt_id),
      rawProviderPayloadStored: false,
      claimBoundary: "Verified AMC evidence lifecycle only; steer proves a blocked corrective signal, not retry execution, success, or protocol conformance beyond signed receipts.",
    };
  } finally {
    ledger.close();
  }
}
