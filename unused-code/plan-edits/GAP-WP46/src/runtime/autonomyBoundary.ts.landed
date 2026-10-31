import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { artifactSigPath, trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { appendRuntimeRunEvent, type RuntimeRunSource } from "./runManager.js";

export const runtimeAutonomyAuthorityLevels = ["observe", "read", "write_low", "write_high", "external_side_effect", "admin"] as const;
export const runtimeAutonomyRiskTiers = ["low", "medium", "high", "critical"] as const;

export type RuntimeAutonomyAuthority = typeof runtimeAutonomyAuthorityLevels[number];
export type RuntimeAutonomyRiskTier = typeof runtimeAutonomyRiskTiers[number];
export type RuntimeAutonomyBoundaryAction = "approve" | "block";

export interface RuntimeAutonomyBoundarySourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface RuntimeAutonomyBoundaryLimit {
  riskTier: RuntimeAutonomyRiskTier;
  maxAuthority: RuntimeAutonomyAuthority;
  approvalRequired: boolean;
}

export interface RuntimeAutonomyBoundaryPolicy {
  schemaVersion: "2026-06-25";
  policyId: string;
  limits: RuntimeAutonomyBoundaryLimit[];
  updatedAt: string;
}

export interface RuntimeAutonomyPlanStep {
  planId: string;
  stepId: string;
  description: string;
  riskTier: RuntimeAutonomyRiskTier;
  requestedAuthority: RuntimeAutonomyAuthority;
  evidenceRefs: string[];
}

export interface RuntimeAutonomyApprovalReceipt {
  receiptId: string;
  approvedAuthority: RuntimeAutonomyAuthority;
  reviewerId: string;
  evidenceRefs: string[];
}

export interface RuntimeAutonomyBoundaryDecision {
  schemaVersion: "2026-06-25";
  decisionId: string;
  createdAt: string;
  workspace: string;
  source: RuntimeRunSource;
  agentId: string;
  policyId: string;
  policyHash: string;
  planId: string;
  stepId: string;
  description: string;
  riskTier: RuntimeAutonomyRiskTier;
  requestedAuthority: RuntimeAutonomyAuthority;
  approvedAuthority: RuntimeAutonomyAuthority;
  approvalRequired: boolean;
  approvalReceiptId: string | null;
  action: RuntimeAutonomyBoundaryAction;
  reasons: string[];
  sourceCitations: RuntimeAutonomyBoundarySourceCitation[];
  evidenceRefs: string[];
  links: {
    runId: string | null;
    episodeId: string | null;
    lifecycleRunId: string | null;
    receiptId: string;
    receiptSha256: string;
  };
  surfaceBinding: ["Enforce", "Shield", "Vault", "Fleet", "Watch", "Studio"];
  eventPath: string | null;
  signaturePath: string | null;
}

export interface RuntimeAutonomyBoundaryVerification {
  valid: boolean;
  failClosedReasons: string[];
}

const authorityRank: Record<RuntimeAutonomyAuthority, number> = {
  observe: 0,
  read: 1,
  write_low: 2,
  write_high: 3,
  external_side_effect: 4,
  admin: 5
};

function nowIso(): string {
  return new Date().toISOString();
}

function autonomyBoundaryRoot(workspace: string): string {
  return join(resolve(workspace), ".amc", "autonomy-boundaries");
}

function autonomyBoundaryDecisionDir(workspace: string): string {
  return join(autonomyBoundaryRoot(workspace), "decisions");
}

export function runtimeAutonomyBoundaryDecisionPath(workspace: string, decisionId: string): string {
  return join(autonomyBoundaryDecisionDir(workspace), `${decisionId}.json`);
}

function defaultLimits(): RuntimeAutonomyBoundaryLimit[] {
  return [
    { riskTier: "low", maxAuthority: "write_low", approvalRequired: false },
    { riskTier: "medium", maxAuthority: "write_low", approvalRequired: false },
    { riskTier: "high", maxAuthority: "write_high", approvalRequired: true },
    { riskTier: "critical", maxAuthority: "read", approvalRequired: true }
  ];
}

export function defaultRuntimeAutonomyBoundaryPolicy(input?: {
  policyId?: string;
  limits?: RuntimeAutonomyBoundaryLimit[];
  updatedAt?: string;
}): RuntimeAutonomyBoundaryPolicy {
  return {
    schemaVersion: "2026-06-25",
    policyId: input?.policyId ?? "runtime-autonomy-boundary-default",
    limits: input?.limits ?? defaultLimits(),
    updatedAt: input?.updatedAt ?? nowIso()
  };
}

function policyHash(policy: RuntimeAutonomyBoundaryPolicy): string {
  return sha256Hex(canonicalize(policy));
}

function limitFor(policy: RuntimeAutonomyBoundaryPolicy, riskTier: RuntimeAutonomyRiskTier): RuntimeAutonomyBoundaryLimit {
  return policy.limits.find((limit) => limit.riskTier === riskTier) ?? defaultLimits().find((limit) => limit.riskTier === riskTier)!;
}

function receiptHashFor(decision: RuntimeAutonomyBoundaryDecision): string {
  return sha256Hex(canonicalize({
    ...decision,
    links: {
      ...decision.links,
      receiptSha256: ""
    },
    eventPath: null,
    signaturePath: null
  }));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function recordRuntimeRunDecision(input: {
  workspace: string;
  decision: RuntimeAutonomyBoundaryDecision;
}): void {
  const runId = input.decision.links.runId;
  if (!runId) return;
  try {
    appendRuntimeRunEvent({
      workspace: input.workspace,
      runId,
      agentId: input.decision.agentId,
      episodeId: input.decision.links.episodeId,
      lifecycleRunId: input.decision.links.lifecycleRunId,
      source: input.decision.source,
      type: "policy.decision",
      stage: "runtime.autonomy-boundary",
      severity: input.decision.action === "block" ? "high" : "info",
      message: `Runtime Autonomy Boundary ${input.decision.action} decision for ${input.decision.stepId}.`,
      payload: {
        decisionId: input.decision.decisionId,
        action: input.decision.action,
        riskTier: input.decision.riskTier,
        requestedAuthority: input.decision.requestedAuthority,
        approvedAuthority: input.decision.approvedAuthority,
        reasons: input.decision.reasons,
        eventPath: input.decision.eventPath,
        receiptSha256: input.decision.links.receiptSha256
      },
      links: {
        receiptId: input.decision.links.receiptId,
        decisionId: input.decision.decisionId,
        policyDecisionId: input.decision.decisionId
      },
      createIfMissing: true
    });
  } catch {
    // Autonomy boundary decisions must still be emitted even if optional run-state logging is unavailable.
  }
}

export function evaluateRuntimeAutonomyBoundary(input: {
  workspace: string;
  agentId?: string | null;
  runId?: string | null;
  episodeId?: string | null;
  lifecycleRunId?: string | null;
  source: RuntimeRunSource;
  policy: RuntimeAutonomyBoundaryPolicy;
  planStep: RuntimeAutonomyPlanStep;
  approval?: RuntimeAutonomyApprovalReceipt | null;
  sourceCitations?: RuntimeAutonomyBoundarySourceCitation[];
  record?: boolean;
}): RuntimeAutonomyBoundaryDecision {
  const workspace = resolve(input.workspace);
  const agentId = input.agentId && input.agentId.trim().length > 0 ? input.agentId : "default";
  const limit = limitFor(input.policy, input.planStep.riskTier);
  const approvedAuthority = input.approval?.approvedAuthority ?? limit.maxAuthority;
  const reasons: string[] = [];
  if (authorityRank[input.planStep.requestedAuthority] > authorityRank[approvedAuthority]) {
    reasons.push(`Requested authority ${input.planStep.requestedAuthority} exceeds approved authority ${approvedAuthority}.`);
  }
  if (limit.approvalRequired && !input.approval) {
    reasons.push(`Risk tier ${input.planStep.riskTier} requires approval receipt.`);
  }
  const action: RuntimeAutonomyBoundaryAction = reasons.length > 0 ? "block" : "approve";
  if (reasons.length === 0) {
    reasons.push("Requested authority is within approved autonomy boundary.");
  }

  const decisionId = `ab_${randomUUID()}`;
  const createdAt = nowIso();
  const eventPath = runtimeAutonomyBoundaryDecisionPath(workspace, decisionId);
  const receiptId = `abrec_${sha256Hex(`${decisionId}:${createdAt}`).slice(0, 16)}`;
  const signaturePath = artifactSigPath(eventPath);
  const baseDecision: RuntimeAutonomyBoundaryDecision = {
    schemaVersion: "2026-06-25",
    decisionId,
    createdAt,
    workspace,
    source: input.source,
    agentId,
    policyId: input.policy.policyId,
    policyHash: policyHash(input.policy),
    planId: input.planStep.planId,
    stepId: input.planStep.stepId,
    description: input.planStep.description,
    riskTier: input.planStep.riskTier,
    requestedAuthority: input.planStep.requestedAuthority,
    approvedAuthority,
    approvalRequired: limit.approvalRequired,
    approvalReceiptId: input.approval?.receiptId ?? null,
    action,
    reasons,
    sourceCitations: input.sourceCitations ?? [],
    evidenceRefs: unique([
      ...input.planStep.evidenceRefs,
      ...(input.approval?.evidenceRefs ?? []),
      input.approval?.receiptId ?? ""
    ]),
    links: {
      runId: input.runId ?? null,
      episodeId: input.episodeId ?? null,
      lifecycleRunId: input.lifecycleRunId ?? null,
      receiptId,
      receiptSha256: ""
    },
    surfaceBinding: ["Enforce", "Shield", "Vault", "Fleet", "Watch", "Studio"],
    eventPath,
    signaturePath
  };
  const decision: RuntimeAutonomyBoundaryDecision = {
    ...baseDecision,
    links: {
      ...baseDecision.links,
      receiptSha256: receiptHashFor(baseDecision)
    }
  };

  if (input.record === false) {
    return decision;
  }
  ensureDir(autonomyBoundaryDecisionDir(workspace));
  writeFileAtomic(eventPath, `${JSON.stringify(decision, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({ workspace, path: eventPath, artifactKind: "runtime-autonomy-boundary-decision" });
  const recorded = { ...decision, signaturePath: signed?.sigPath ?? signaturePath };
  recordRuntimeRunDecision({ workspace, decision: recorded });
  return recorded;
}

export function verifyRuntimeAutonomyBoundaryDecision(decision: RuntimeAutonomyBoundaryDecision): RuntimeAutonomyBoundaryVerification {
  const reasons: string[] = [];
  if (!runtimeAutonomyRiskTiers.includes(decision.riskTier)) {
    reasons.push("runtime-autonomy-boundary:risk-tier:invalid");
  }
  if (!runtimeAutonomyAuthorityLevels.includes(decision.requestedAuthority)) {
    reasons.push("runtime-autonomy-boundary:requested-authority:invalid");
  }
  if (!runtimeAutonomyAuthorityLevels.includes(decision.approvedAuthority)) {
    reasons.push("runtime-autonomy-boundary:approved-authority:invalid");
  }
  if (decision.action !== "approve" && decision.action !== "block") {
    reasons.push("runtime-autonomy-boundary:action:invalid");
  }
  if (decision.evidenceRefs.length === 0) {
    reasons.push("runtime-autonomy-boundary:step-evidence:missing");
  }
  if (decision.links.receiptSha256 !== receiptHashFor(decision)) {
    reasons.push("runtime-autonomy-boundary:receipt-hash:mismatch");
  }
  if (!decision.eventPath) {
    reasons.push("runtime-autonomy-boundary:event-path:missing");
  } else if (!existsSync(decision.eventPath)) {
    reasons.push("runtime-autonomy-boundary:event-path:not-found");
  }
  if (!decision.signaturePath) {
    reasons.push("runtime-autonomy-boundary:signature:missing");
  } else if (!existsSync(decision.signaturePath)) {
    reasons.push("runtime-autonomy-boundary:signature:not-found");
  }
  if (decision.action === "approve" && authorityRank[decision.requestedAuthority] > authorityRank[decision.approvedAuthority]) {
    reasons.push("runtime-autonomy-boundary:fail-open:invalid");
  }
  const uniqueReasons = [...new Set(reasons)];
  return { valid: uniqueReasons.length === 0, failClosedReasons: uniqueReasons };
}

export function renderRuntimeAutonomyBoundaryAuditExport(decision: RuntimeAutonomyBoundaryDecision): string {
  const verification = verifyRuntimeAutonomyBoundaryDecision(decision);
  const status = decision.action === "approve" ? "APPROVED" : "BLOCKED";
  const lines = [
    "# AMC Runtime Autonomy Boundary Decision",
    "",
    `- Decision: ${decision.decisionId}`,
    `- Status: ${status}`,
    `- Agent: ${decision.agentId}`,
    `- Plan step: ${decision.planId}/${decision.stepId}`,
    `- risk tier: ${decision.riskTier}`,
    `- requested authority: ${decision.requestedAuthority}`,
    `- approved authority: ${decision.approvedAuthority}`,
    `- receipt: ${decision.links.receiptId}`,
    `- receipt hash: ${decision.links.receiptSha256}`,
    "",
    "## Reasons",
    ...decision.reasons.map((reason) => `- ${reason}`),
    "",
    "## Verification",
    verification.valid ? "- VALID" : `- FAIL_CLOSED: ${verification.failClosedReasons.join("; ")}`
  ];
  return `${lines.join("\n")}\n`;
}
