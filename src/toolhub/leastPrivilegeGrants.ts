import { randomUUID } from "node:crypto";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export interface LeastPrivilegeGrantSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface LeastPrivilegeScopeSet {
  scopes: string[];
  resources: string[];
  externalSystems: string[];
  dataClasses: string[];
}

export interface LeastPrivilegeToolGrantRequest {
  grantId: string;
  agentId: string;
  runId: string;
  taskId: string;
  toolName: string;
  actionClass: ActionClass;
  requestedAt: string;
  requestedDurationMs: number;
  requestedScope: LeastPrivilegeScopeSet;
  sourceCitations: LeastPrivilegeGrantSourceCitation[];
}

export interface SignedLeastPrivilegeToolGrant {
  schemaVersion: "2026-06-25";
  grantId: string;
  agentId: string;
  runId: string;
  taskId: string;
  toolName: string;
  actionClass: ActionClass;
  requestedAt: string;
  approvedAt: string;
  expiresAt: string;
  requestedDurationMs: number;
  requestedScope: LeastPrivilegeScopeSet;
  approvedScope: LeastPrivilegeScopeSet;
  approvalReceiptId: string;
  policyId: string;
  approvedBy: string;
  sourceCitations: LeastPrivilegeGrantSourceCitation[];
  grantDigestSha256: string;
  grantSignature: string;
  signer: "auditor";
  signedTs: number;
  metadataOnlyAccepted: false;
}

export type LeastPrivilegeGrantPhase = "beforeExecution" | "afterExecution";

export interface LeastPrivilegeToolGrantUsageReceipt {
  schemaVersion: "2026-06-25";
  receiptId: string;
  createdAt: string;
  phase: LeastPrivilegeGrantPhase;
  grant: SignedLeastPrivilegeToolGrant;
  grantId: string;
  agentId: string;
  runId: string;
  taskId: string;
  toolName: string;
  actionClass: ActionClass;
  policyId: string;
  approvalReceiptId: string | null;
  requestedScope: LeastPrivilegeScopeSet;
  approvedScope: LeastPrivilegeScopeSet;
  usedScope: LeastPrivilegeScopeSet;
  unusedPermissionReport: LeastPrivilegeScopeSet | null;
  expiresAt: string;
  evaluatedAt: string;
  expired: boolean;
  signatureValid: boolean;
  allowed: boolean;
  blockBeforeExecution: boolean;
  reasons: string[];
  driftFindings: string[];
  metadataOnlyAccepted: boolean;
  surfaceBinding: ["Enforce", "Shield", "Vault", "Watch"];
  receiptHash: string;
}

export interface LeastPrivilegeToolGrantReceiptVerification {
  valid: boolean;
  failClosedReasons: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeScopeSet(scope: LeastPrivilegeScopeSet): LeastPrivilegeScopeSet {
  return {
    scopes: unique(scope.scopes),
    resources: unique(scope.resources),
    externalSystems: unique(scope.externalSystems),
    dataClasses: unique(scope.dataClasses)
  };
}

function unsignedGrantPayload(grant: {
  schemaVersion?: "2026-06-25";
  grantId: string;
  agentId: string;
  runId: string;
  taskId: string;
  toolName: string;
  actionClass: ActionClass;
  requestedAt: string;
  approvedAt: string;
  expiresAt: string;
  requestedDurationMs: number;
  requestedScope: LeastPrivilegeScopeSet;
  approvedScope: LeastPrivilegeScopeSet;
  approvalReceiptId: string;
  policyId: string;
  approvedBy: string;
  sourceCitations: LeastPrivilegeGrantSourceCitation[];
}) {
  return {
    schemaVersion: grant.schemaVersion ?? "2026-06-25",
    grantId: grant.grantId,
    agentId: grant.agentId,
    runId: grant.runId,
    taskId: grant.taskId,
    toolName: grant.toolName,
    actionClass: grant.actionClass,
    requestedAt: grant.requestedAt,
    approvedAt: grant.approvedAt,
    expiresAt: grant.expiresAt,
    requestedDurationMs: grant.requestedDurationMs,
    requestedScope: normalizeScopeSet(grant.requestedScope),
    approvedScope: normalizeScopeSet(grant.approvedScope),
    approvalReceiptId: grant.approvalReceiptId,
    policyId: grant.policyId,
    approvedBy: grant.approvedBy,
    sourceCitations: grant.sourceCitations
  };
}

function grantDigest(grant: SignedLeastPrivilegeToolGrant): string {
  return sha256Hex(canonicalize(unsignedGrantPayload(grant)));
}

function receiptHashFor(receipt: LeastPrivilegeToolGrantUsageReceipt): string {
  return sha256Hex(canonicalize({ ...receipt, receiptHash: "" }));
}

function verifyGrantSignature(workspace: string, grant: SignedLeastPrivilegeToolGrant): boolean {
  if (!grant.grantDigestSha256 || !grant.grantSignature) {
    return false;
  }
  const digest = grantDigest(grant);
  if (digest !== grant.grantDigestSha256) {
    return false;
  }
  return verifyHexDigestAny(digest, grant.grantSignature, getPublicKeyHistory(workspace, "auditor"));
}

function expirationFrom(requestedAt: string, requestedDurationMs: number): string {
  const requestedAtMs = Date.parse(requestedAt);
  if (!Number.isFinite(requestedAtMs) || requestedDurationMs <= 0) {
    return requestedAt;
  }
  return new Date(requestedAtMs + requestedDurationMs).toISOString();
}

function missingFrom(approved: string[], used: string[]): string[] {
  const usedSet = new Set(unique(used));
  return unique(approved).filter((value) => !usedSet.has(value));
}

function notApproved(approved: string[], used: string[]): string[] {
  const approvedSet = new Set(unique(approved));
  return unique(used).filter((value) => !approvedSet.has(value));
}

function evaluateScope(input: {
  approved: LeastPrivilegeScopeSet;
  used: LeastPrivilegeScopeSet;
}): {
  reasons: string[];
  unusedPermissionReport: LeastPrivilegeScopeSet;
} {
  const reasons: string[] = [];
  const approved = normalizeScopeSet(input.approved);
  const used = normalizeScopeSet(input.used);

  for (const scope of notApproved(approved.scopes, used.scopes)) {
    reasons.push(`least-privilege-grant:scope:not-approved:${scope}`);
  }
  for (const resource of notApproved(approved.resources, used.resources)) {
    reasons.push(`least-privilege-grant:resource:not-approved:${resource}`);
  }
  for (const externalSystem of notApproved(approved.externalSystems, used.externalSystems)) {
    reasons.push(`least-privilege-grant:external-system:not-approved:${externalSystem}`);
  }
  for (const dataClass of notApproved(approved.dataClasses, used.dataClasses)) {
    reasons.push(`least-privilege-grant:data-class:not-approved:${dataClass}`);
  }

  return {
    reasons,
    unusedPermissionReport: {
      scopes: missingFrom(approved.scopes, used.scopes),
      resources: missingFrom(approved.resources, used.resources),
      externalSystems: missingFrom(approved.externalSystems, used.externalSystems),
      dataClasses: missingFrom(approved.dataClasses, used.dataClasses)
    }
  };
}

export function createSignedLeastPrivilegeToolGrant(input: {
  workspace: string;
  request: LeastPrivilegeToolGrantRequest;
  approvedScope: LeastPrivilegeScopeSet;
  approvalReceiptId: string;
  policyId: string;
  approvedBy: string;
  approvedAt?: string;
  expiresAt?: string;
}): SignedLeastPrivilegeToolGrant {
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const expiresAt = input.expiresAt ?? expirationFrom(input.request.requestedAt, input.request.requestedDurationMs);
  const payload = unsignedGrantPayload({
    schemaVersion: "2026-06-25",
    grantId: input.request.grantId,
    agentId: input.request.agentId,
    runId: input.request.runId,
    taskId: input.request.taskId,
    toolName: input.request.toolName,
    actionClass: input.request.actionClass,
    requestedAt: input.request.requestedAt,
    approvedAt,
    expiresAt,
    requestedDurationMs: input.request.requestedDurationMs,
    requestedScope: input.request.requestedScope,
    approvedScope: input.approvedScope,
    approvalReceiptId: input.approvalReceiptId,
    policyId: input.policyId,
    approvedBy: input.approvedBy,
    sourceCitations: input.request.sourceCitations
  });
  const digest = sha256Hex(canonicalize(payload));
  return {
    ...payload,
    grantDigestSha256: digest,
    grantSignature: signHexDigest(digest, getPrivateKeyPem(input.workspace, "auditor")),
    signer: "auditor",
    signedTs: Date.now(),
    metadataOnlyAccepted: false
  };
}

export function evaluateLeastPrivilegeToolGrantUsage(input: {
  workspace: string;
  grant: SignedLeastPrivilegeToolGrant;
  phase: LeastPrivilegeGrantPhase;
  now?: string;
  usedScope: LeastPrivilegeScopeSet;
}): LeastPrivilegeToolGrantUsageReceipt {
  const evaluatedAt = input.now ?? new Date().toISOString();
  const signatureValid = verifyGrantSignature(input.workspace, input.grant);
  const expired = Date.parse(evaluatedAt) > Date.parse(input.grant.expiresAt);
  const scopeEvaluation = evaluateScope({
    approved: input.grant.approvedScope,
    used: input.usedScope
  });
  const reasons: string[] = [];
  const driftFindings: string[] = [];
  const metadataOnlyAccepted = input.grant.metadataOnlyAccepted !== false;

  if (metadataOnlyAccepted) {
    reasons.push("least-privilege-grant:metadata-only:not-accepted");
    driftFindings.push("grant_metadata_only");
  }
  if (!signatureValid) {
    reasons.push("least-privilege-grant:signature:invalid");
    driftFindings.push("grant_signature_invalid");
  }
  if (expired) {
    reasons.push("least-privilege-grant:expired");
    driftFindings.push("grant_expired");
  }
  reasons.push(...scopeEvaluation.reasons);
  if (scopeEvaluation.reasons.length > 0) {
    driftFindings.push("grant_scope_exceeded");
  }

  const allowed = reasons.length === 0;
  const baseReceipt: LeastPrivilegeToolGrantUsageReceipt = {
    schemaVersion: "2026-06-25",
    receiptId: `lpgrant_${randomUUID().replace(/-/g, "")}`,
    createdAt: new Date().toISOString(),
    phase: input.phase,
    grant: input.grant,
    grantId: input.grant.grantId,
    agentId: input.grant.agentId,
    runId: input.grant.runId,
    taskId: input.grant.taskId,
    toolName: input.grant.toolName,
    actionClass: input.grant.actionClass,
    policyId: input.grant.policyId,
    approvalReceiptId: input.grant.approvalReceiptId || null,
    requestedScope: input.grant.requestedScope,
    approvedScope: input.grant.approvedScope,
    usedScope: normalizeScopeSet(input.usedScope),
    unusedPermissionReport: scopeEvaluation.unusedPermissionReport,
    expiresAt: input.grant.expiresAt,
    evaluatedAt,
    expired,
    signatureValid,
    allowed,
    blockBeforeExecution: input.phase === "beforeExecution" && !allowed,
    reasons: allowed ? ["least-privilege-grant:approved"] : unique(reasons),
    driftFindings: unique(driftFindings),
    metadataOnlyAccepted,
    surfaceBinding: ["Enforce", "Shield", "Vault", "Watch"],
    receiptHash: ""
  };

  return {
    ...baseReceipt,
    receiptHash: receiptHashFor(baseReceipt)
  };
}

export function verifyLeastPrivilegeToolGrantReceipt(input: {
  workspace: string;
  receipt: LeastPrivilegeToolGrantUsageReceipt;
}): LeastPrivilegeToolGrantReceiptVerification {
  const reasons: string[] = [];
  const receipt = input.receipt;

  if (receipt.metadataOnlyAccepted !== false) {
    reasons.push("least-privilege-grant:metadata-only:not-accepted");
  }
  if (receipt.receiptHash !== receiptHashFor(receipt)) {
    reasons.push("least-privilege-grant:receipt-hash:mismatch");
  }
  if (!verifyGrantSignature(input.workspace, receipt.grant) || receipt.signatureValid !== true) {
    reasons.push("least-privilege-grant:signature:invalid");
  }
  if (!receipt.unusedPermissionReport) {
    reasons.push("least-privilege-grant:unused-permission-report:missing");
  }
  if (!receipt.surfaceBinding.includes("Enforce") || !receipt.surfaceBinding.includes("Shield") || !receipt.surfaceBinding.includes("Vault")) {
    reasons.push("least-privilege-grant:surface-binding:missing");
  }

  const uniqueReasons = unique(reasons);
  return { valid: uniqueReasons.length === 0, failClosedReasons: uniqueReasons };
}
