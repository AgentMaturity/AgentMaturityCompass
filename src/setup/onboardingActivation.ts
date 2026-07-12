import { join } from "node:path";
import { z } from "zod";
import {
  loadAdaptersConfig,
  verifyAdaptersConfigSignature,
} from "../adapters/adapterConfigStore.js";
import {
  getHookIntegrationStatus,
  type HookIntegrationStatus,
  type HookProvider,
} from "../adapters/hookIntegration.js";
import { openLedger, verifyEvidenceEventIntegrity } from "../ledger/ledger.js";
import type { EvidenceEvent, EvidenceEventType } from "../types.js";
import { pathExists } from "../utils/fs.js";
import { inspectHookActionLifecycle } from "../watch/hookActionLifecycle.js";

export type OnboardingActivationMilestoneId =
  | "connected_agent"
  | "observed_action"
  | "control_decision"
  | "signed_proof";

export type OnboardingActivationMilestoneStatus = "WAITING" | "READY" | "COMPLETE" | "BLOCKED";
export type OnboardingActivationStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED";
export type OnboardingActivationReasonCode =
  | "ADAPTER_CONFIG_INVALID"
  | "EVIDENCE_CHAIN_INVALID"
  | "EVIDENCE_METADATA_INVALID"
  | "EVIDENCE_RECEIPT_INVALID"
  | "HOOK_AGENT_MISMATCH"
  | "HOOK_INTEGRATION_INVALID";

export interface OnboardingActivationEvidenceRef {
  eventId: string;
  eventType: EvidenceEventType;
  receiptId: string;
  receiptSha256: string;
  observedAt: string;
  source: "gateway" | "hook" | "hook_control" | "toolhub";
  studioPath: string;
}

export interface OnboardingActivationMilestone {
  id: OnboardingActivationMilestoneId;
  label: string;
  status: OnboardingActivationMilestoneStatus;
  summary: string;
  evidence: OnboardingActivationEvidenceRef | null;
}

export interface OnboardingActivationProjection {
  schemaVersion: "2026-07-11";
  agentId: string;
  status: OnboardingActivationStatus;
  progress: {
    completed: number;
    total: 4;
    percent: number;
  };
  milestones: [
    OnboardingActivationMilestone,
    OnboardingActivationMilestone,
    OnboardingActivationMilestone,
    OnboardingActivationMilestone,
  ];
  nextAction: {
    label: string;
    command: string;
  } | null;
  integrity: {
    valid: boolean;
    reasonCodes: OnboardingActivationReasonCode[];
  };
  claimBoundary: string;
}

const receiptMetaSchema = z.object({
  trustTier: z.literal("OBSERVED"),
  agentId: z.string().min(1),
  receipt_id: z.string().min(1),
  receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: z.string().min(1),
}).passthrough();

const candidateMetaSchema = z.object({
  trustTier: z.literal("OBSERVED"),
  agentId: z.string().min(1),
}).passthrough();

const gatewayRequestMetaSchema = receiptMetaSchema.extend({
  request_id: z.string().min(1).optional(),
}).passthrough();

const hookRequestMetaSchema = receiptMetaSchema.extend({
  sourceProtocol: z.literal("aep"),
  sourceEventType: z.literal("action.requested"),
  actionId: z.string().min(1),
  provider: z.enum(["claude-code", "gemini-cli"]),
  rawPayloadStored: z.literal(false),
}).passthrough();

const hookDecisionMetaV1Schema = receiptMetaSchema.extend({
  controlSchemaVersion: z.literal(1),
  provider: z.enum(["claude-code", "gemini-cli"]),
  actionId: z.string().min(1),
  decision: z.enum(["allow", "deny", "ask"]),
  rawPayloadStored: z.literal(false),
}).passthrough();

const hookDecisionMetaV2Schema = receiptMetaSchema.extend({
  controlSchemaVersion: z.literal(2),
  provider: z.enum(["claude-code", "gemini-cli"]),
  actionId: z.string().min(1),
  requestedDecision: z.enum(["allow", "deny", "ask", "steer"]),
  decision: z.enum(["allow", "deny", "ask"]),
  effectiveOutcome: z.enum(["allow", "deny", "ask", "steer"]),
  providerMapping: z.enum(["native", "corrective_deny", "fail_closed_deny"]),
  capabilityLossy: z.boolean(),
  rawPayloadStored: z.literal(false),
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

const hookDecisionMetaSchema = z.union([hookDecisionMetaV2Schema, hookDecisionMetaV1Schema]);

const toolActionMetaSchema = receiptMetaSchema.extend({
  requestedMode: z.enum(["SIMULATE", "EXECUTE"]),
  effectiveMode: z.enum(["SIMULATE", "EXECUTE"]),
  actionClass: z.string().min(1),
}).passthrough();

const hookRequestCandidateSchema = candidateMetaSchema.extend({
  sourceProtocol: z.literal("aep"),
  sourceEventType: z.literal("action.requested"),
  actionId: z.string().min(1),
  provider: z.enum(["claude-code", "gemini-cli"]),
  rawPayloadStored: z.literal(false),
}).passthrough();

const hookDecisionCandidateSchema = candidateMetaSchema.extend({
  controlSchemaVersion: z.union([z.literal(1), z.literal(2)]),
  provider: z.enum(["claude-code", "gemini-cli"]),
  actionId: z.string().min(1),
  decision: z.enum(["allow", "deny", "ask"]),
  rawPayloadStored: z.literal(false),
}).passthrough();

const toolActionCandidateSchema = candidateMetaSchema.extend({
  requestedMode: z.enum(["SIMULATE", "EXECUTE"]),
  effectiveMode: z.enum(["SIMULATE", "EXECUTE"]),
  actionClass: z.string().min(1),
}).passthrough();

interface ClassifiedEvent {
  event: EvidenceEvent;
  source: OnboardingActivationEvidenceRef["source"];
  actionId: string | null;
  decision: boolean;
  meta: z.infer<typeof receiptMetaSchema>;
}

const MILESTONE_LABELS: Record<OnboardingActivationMilestoneId, string> = {
  connected_agent: "Connected agent",
  observed_action: "First observed action",
  control_decision: "First control decision",
  signed_proof: "First signed proof",
};

const REASON_ORDER: OnboardingActivationReasonCode[] = [
  "ADAPTER_CONFIG_INVALID",
  "HOOK_AGENT_MISMATCH",
  "HOOK_INTEGRATION_INVALID",
  "EVIDENCE_METADATA_INVALID",
  "EVIDENCE_CHAIN_INVALID",
  "EVIDENCE_RECEIPT_INVALID",
];

function parseMetadata(event: EvidenceEvent): unknown {
  try {
    return JSON.parse(event.meta_json) as unknown;
  } catch {
    return null;
  }
}

function metadataAgentId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>).agentId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function classifyEvent(event: EvidenceEvent): ClassifiedEvent | null {
  const meta = parseMetadata(event);
  if (event.event_type === "llm_request") {
    const parsed = gatewayRequestMetaSchema.safeParse(meta);
    return parsed.success
      ? { event, source: "gateway", actionId: null, decision: false, meta: parsed.data }
      : null;
  }
  if (event.event_type === "tool_action") {
    const hook = hookRequestMetaSchema.safeParse(meta);
    if (hook.success) {
      return { event, source: "hook", actionId: hook.data.actionId, decision: false, meta: hook.data };
    }
    const parsed = toolActionMetaSchema.safeParse(meta);
    return parsed.success
      ? { event, source: "toolhub", actionId: null, decision: true, meta: parsed.data }
      : null;
  }
  if (event.event_type === "audit") {
    const decision = hookDecisionMetaSchema.safeParse(meta);
    if (decision.success) {
      return {
        event,
        source: "hook_control",
        actionId: decision.data.actionId,
        decision: true,
        meta: decision.data,
      };
    }
  }
  return null;
}

function candidateShape(event: EvidenceEvent): { candidate: boolean; valid: boolean; agentId: string | null } {
  const meta = parseMetadata(event);
  const rawAgentId = metadataAgentId(meta);
  if (event.event_type === "llm_request") {
    const parsed = candidateMetaSchema.safeParse(meta);
    return { candidate: true, valid: parsed.success, agentId: parsed.success ? parsed.data.agentId : rawAgentId };
  }
  if (event.event_type === "tool_action") {
    const hookRequest = hookRequestCandidateSchema.safeParse(meta);
    if (hookRequest.success) {
      return { candidate: true, valid: true, agentId: hookRequest.data.agentId };
    }
    const parsed = toolActionCandidateSchema.safeParse(meta);
    return { candidate: true, valid: parsed.success, agentId: parsed.success ? parsed.data.agentId : rawAgentId };
  }
  if (event.event_type !== "audit") return { candidate: false, valid: true, agentId: null };
  if (!meta || typeof meta !== "object") return { candidate: false, valid: true, agentId: null };
  const row = meta as Record<string, unknown>;
  if (row.controlSchemaVersion !== 1 && row.controlSchemaVersion !== 2) {
    return { candidate: false, valid: true, agentId: null };
  }
  const decision = hookDecisionCandidateSchema.safeParse(meta);
  return { candidate: true, valid: decision.success, agentId: decision.success ? decision.data.agentId : rawAgentId };
}

function candidateMetadataInvalid(event: EvidenceEvent, agentId: string): boolean {
  const shape = candidateShape(event);
  return shape.candidate && !shape.valid && (shape.agentId === null || shape.agentId === agentId);
}

function candidateReceiptInvalid(event: EvidenceEvent, agentId: string): boolean {
  const shape = candidateShape(event);
  return shape.candidate && shape.valid && shape.agentId === agentId && classifyEvent(event) === null;
}

function evidenceRef(row: ClassifiedEvent): OnboardingActivationEvidenceRef {
  return {
    eventId: row.event.id,
    eventType: row.event.event_type,
    receiptId: row.meta.receipt_id,
    receiptSha256: row.meta.receipt_sha256,
    observedAt: new Date(row.event.ts).toISOString(),
    source: row.source,
    studioPath: `/console/evidence?agent=${encodeURIComponent(row.meta.agentId)}&receipt=${encodeURIComponent(row.meta.receipt_id)}`,
  };
}

function hookArtifactsExist(status: HookIntegrationStatus): boolean {
  return [status.files.token, status.files.manifest, status.files.signature].some((path) => pathExists(path));
}

function connectionReadiness(workspace: string, agentId: string): {
  ready: boolean;
  reasons: OnboardingActivationReasonCode[];
} {
  let ready = false;
  const reasons = new Set<OnboardingActivationReasonCode>();
  const adapterSignature = verifyAdaptersConfigSignature(workspace);
  if (adapterSignature.signatureExists && !adapterSignature.valid) {
    reasons.add("ADAPTER_CONFIG_INVALID");
  } else if (adapterSignature.valid) {
    try {
      ready = Boolean(loadAdaptersConfig(workspace).adapters.perAgent[agentId]);
    } catch {
      reasons.add("ADAPTER_CONFIG_INVALID");
    }
  }

  for (const provider of ["claude-code", "gemini-cli"] as HookProvider[]) {
    const status = getHookIntegrationStatus({ workspace, provider });
    if (status.state === "not-installed" || !hookArtifactsExist(status)) continue;
    if (status.state !== "installed") {
      reasons.add("HOOK_INTEGRATION_INVALID");
      continue;
    }
    if (status.agentId !== agentId) {
      reasons.add("HOOK_AGENT_MISMATCH");
      continue;
    }
    ready = true;
  }
  return { ready, reasons: [...reasons] };
}

function milestone(
  id: OnboardingActivationMilestoneId,
  status: OnboardingActivationMilestoneStatus,
  summary: string,
  evidence: OnboardingActivationEvidenceRef | null = null,
): OnboardingActivationMilestone {
  return { id, label: MILESTONE_LABELS[id], status, summary, evidence };
}

function blockedProjection(agentId: string, reasons: Set<OnboardingActivationReasonCode>): OnboardingActivationProjection {
  const reasonCodes = REASON_ORDER.filter((reason) => reasons.has(reason));
  return {
    schemaVersion: "2026-07-11",
    agentId,
    status: "BLOCKED",
    progress: { completed: 0, total: 4, percent: 0 },
    milestones: [
      milestone("connected_agent", "BLOCKED", "Current signed connection or evidence integrity is not trustworthy."),
      milestone("observed_action", "BLOCKED", "Observed runtime evidence is withheld until integrity is restored."),
      milestone("control_decision", "BLOCKED", "No control decision is claimed from untrusted evidence."),
      milestone("signed_proof", "BLOCKED", "No proof is claimed from untrusted evidence."),
    ],
    nextAction: {
      label: "Repair and verify signed state",
      command: "amc doctor --strict --json",
    },
    integrity: { valid: false, reasonCodes },
    claimBoundary: "Activation fails closed. Configuration and metadata-only records cannot complete an outcome milestone.",
  };
}

function nextAction(agentId: string, completed: number, ready: boolean): OnboardingActivationProjection["nextAction"] {
  if (completed === 4) return null;
  if (!ready && completed === 0) {
    return { label: "Configure a connection", command: `amc connect --agent ${agentId}` };
  }
  if (completed < 2) {
    return { label: "Run one agent action through AMC", command: `amc connect --agent ${agentId}` };
  }
  return {
    label: "Run one controlled action",
    command: `amc connect hooks install --provider <claude-code|gemini-cli> --agent ${agentId} --mode control`,
  };
}

export function projectOnboardingActivation(input: {
  workspace: string;
  agentId: string;
}): OnboardingActivationProjection {
  const readiness = connectionReadiness(input.workspace, input.agentId);
  const reasons = new Set<OnboardingActivationReasonCode>(readiness.reasons);
  if (reasons.size > 0) return blockedProjection(input.agentId, reasons);

  const ledgerFile = join(input.workspace, ".amc", "evidence.sqlite");
  if (!pathExists(ledgerFile)) {
    const connectedStatus = readiness.ready ? "READY" : "WAITING";
    const projection: OnboardingActivationProjection = {
      schemaVersion: "2026-07-11",
      agentId: input.agentId,
      status: readiness.ready ? "IN_PROGRESS" : "NOT_STARTED",
      progress: { completed: 0, total: 4, percent: 0 },
      milestones: [
        milestone("connected_agent", connectedStatus, readiness.ready
          ? "Signed connection state is ready; runtime traffic has not been observed."
          : "Configure an agent connection, then run one real action."),
        milestone("observed_action", "WAITING", "Waiting for a signed runtime action receipt."),
        milestone("control_decision", "WAITING", "Waiting for a signed runtime control decision."),
        milestone("signed_proof", "WAITING", "Proof appears only after a verified decision receipt."),
      ],
      nextAction: nextAction(input.agentId, 0, readiness.ready),
      integrity: { valid: true, reasonCodes: [] },
      claimBoundary: "Signed configuration may report READY but cannot complete activation without verified runtime evidence.",
    };
    return projection;
  }

  let ledger: ReturnType<typeof openLedger>;
  try {
    ledger = openLedger(input.workspace);
  } catch {
    reasons.add("EVIDENCE_CHAIN_INVALID");
    return blockedProjection(input.agentId, reasons);
  }
  try {
    const events = ledger.getAllEvents();
    const lastEvent = events.at(-1);
    if (lastEvent) {
      const chain = verifyEvidenceEventIntegrity({ ledger, eventId: lastEvent.id });
      if (!chain.ok) reasons.add("EVIDENCE_CHAIN_INVALID");
    }
    if (events.some((event) => candidateMetadataInvalid(event, input.agentId))) {
      reasons.add("EVIDENCE_METADATA_INVALID");
    }
    if (events.some((event) => candidateReceiptInvalid(event, input.agentId))) {
      reasons.add("EVIDENCE_RECEIPT_INVALID");
    }
    if (reasons.size > 0) return blockedProjection(input.agentId, reasons);

    const classified = events
      .map(classifyEvent)
      .filter((row): row is ClassifiedEvent => row !== null)
      .filter((row) => row.meta.agentId === input.agentId);

    const verifiedRows: ClassifiedEvent[] = [];
    for (const row of classified) {
      const verified = verifyEvidenceEventIntegrity({
        ledger,
        eventId: row.event.id,
        requireReceipt: true,
      });
      if (!verified.ok) {
        reasons.add("EVIDENCE_RECEIPT_INVALID");
        continue;
      }
      verifiedRows.push(row);
    }
    if (reasons.size > 0) return blockedProjection(input.agentId, reasons);

    const observed = verifiedRows.find((row) => !row.decision || row.source === "toolhub") ?? null;
    let decision = verifiedRows.find((row) => row.source === "toolhub") ?? null;
    for (const row of verifiedRows.filter((candidate) => candidate.source === "hook_control" && candidate.actionId)) {
      const lifecycle = inspectHookActionLifecycle({
        workspace: input.workspace,
        agentId: input.agentId,
        actionId: row.actionId!,
      });
      if (!lifecycle.valid || !lifecycle.phases.requested || !lifecycle.phases.decision) {
        reasons.add("EVIDENCE_CHAIN_INVALID");
        continue;
      }
      decision = row;
      break;
    }
    if (reasons.size > 0) return blockedProjection(input.agentId, reasons);

    const observedEvidence = observed ? evidenceRef(observed) : null;
    const decisionEvidence = decision ? evidenceRef(decision) : null;
    const connectedStatus: OnboardingActivationMilestoneStatus = observedEvidence
      ? "COMPLETE"
      : readiness.ready ? "READY" : "WAITING";
    const completed = (observedEvidence ? 2 : 0) + (decisionEvidence ? 2 : 0);
    const status: OnboardingActivationStatus = completed === 4
      ? "COMPLETE"
      : completed > 0 || readiness.ready ? "IN_PROGRESS" : "NOT_STARTED";

    return {
      schemaVersion: "2026-07-11",
      agentId: input.agentId,
      status,
      progress: { completed, total: 4, percent: completed * 25 },
      milestones: [
        milestone("connected_agent", connectedStatus, observedEvidence
          ? "Verified runtime traffic is bound to this agent."
          : readiness.ready
            ? "Signed connection state is ready; runtime traffic has not been observed."
            : "Configure an agent connection, then run one real action.", observedEvidence),
        milestone("observed_action", observedEvidence ? "COMPLETE" : "WAITING", observedEvidence
          ? "A signed runtime action receipt was verified."
          : "Waiting for a signed runtime action receipt.", observedEvidence),
        milestone("control_decision", decisionEvidence ? "COMPLETE" : "WAITING", decisionEvidence
          ? "A signed runtime control decision was verified."
          : "Waiting for a signed runtime control decision.", decisionEvidence),
        milestone("signed_proof", decisionEvidence ? "COMPLETE" : "WAITING", decisionEvidence
          ? "The decision receipt is available for authenticated evidence review."
          : "Proof appears only after a verified decision receipt.", decisionEvidence),
      ],
      nextAction: nextAction(input.agentId, completed, readiness.ready),
      integrity: { valid: true, reasonCodes: [] },
      claimBoundary: "Signed configuration may report READY but cannot complete activation without verified runtime evidence.",
    };
  } catch {
    reasons.add("EVIDENCE_CHAIN_INVALID");
    return blockedProjection(input.agentId, reasons);
  } finally {
    ledger.close();
  }
}

export function renderOnboardingActivationText(projection: OnboardingActivationProjection): string {
  const lines = [
    `Activation ${projection.progress.completed}/${projection.progress.total} (${projection.status})`,
    ...projection.milestones.map((row) => {
      const marker = row.status === "COMPLETE" ? "x" : row.status === "BLOCKED" ? "!" : " ";
      return `[${marker}] ${row.label} - ${row.status}: ${row.summary}`;
    }),
  ];
  if (projection.nextAction) {
    lines.push(`Next: ${projection.nextAction.command}`);
  }
  return lines.join("\n");
}
