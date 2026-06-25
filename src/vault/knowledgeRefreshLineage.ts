import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { trySignArtifactFile } from "../lifecycle/artifactSignature.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type KnowledgeRefreshSurface = "Score" | "Watch" | "Enforce";
export type KnowledgeRefreshApprovalDecision = "approved" | "denied";
export type KnowledgeRefreshDeletionStatus = "requested" | "completed" | "rejected";

export interface KnowledgeRefreshSourceApproval {
  approvalId: string;
  sourceId: string;
  decision: KnowledgeRefreshApprovalDecision;
  approvedBy: string;
  approvedAt: string;
  evidenceRef: string;
}

export interface KnowledgeRefreshDeletionRequest {
  requestId: string;
  sourceId: string;
  status: KnowledgeRefreshDeletionStatus;
  requestedAt: string;
  completedAt?: string | null;
  evidenceRef: string;
}

export interface KnowledgeRefreshAffectedScore {
  scoreId: string;
  questionId?: string | null;
  previousScore0to100: number;
  refreshedScore0to100: number;
  reason: string;
}

export interface BuildKnowledgeRefreshLineageReceiptInput {
  receiptId: string;
  agentId: string;
  corpusId: string;
  previousCorpusVersion: string;
  refreshedCorpusVersion: string;
  ingestionJobId: string;
  ingestionReceiptId: string;
  sourceApprovals: KnowledgeRefreshSourceApproval[];
  deletionRequests: KnowledgeRefreshDeletionRequest[];
  affectedScores: KnowledgeRefreshAffectedScore[];
  sourceRefs: string[];
  evidenceRefs: string[];
  createdAt?: string;
}

export interface KnowledgeRefreshLineageReceipt {
  schemaVersion: "2026-06-25";
  receiptType: "knowledge-refresh-lineage";
  receiptId: string;
  agentId: string;
  createdAt: string;
  surfaces: KnowledgeRefreshSurface[];
  corpus: {
    corpusId: string;
    previousVersion: string;
    refreshedVersion: string;
  };
  ingestion: {
    jobId: string;
    receiptId: string;
  };
  sourceApprovals: KnowledgeRefreshSourceApproval[];
  deletionRequests: KnowledgeRefreshDeletionRequest[];
  affectedScores: KnowledgeRefreshAffectedScore[];
  scoreImpact: {
    changedScoreCount: number;
    maxAbsDelta0to100: number;
    averageAbsDelta0to100: number;
  };
  sourceRefs: string[];
  evidenceRefs: string[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
  receiptPath: string | null;
  signaturePath: string | null;
}

export interface KnowledgeRefreshLineageVerification {
  valid: boolean;
  failClosedReasons: string[];
}

export interface WrittenKnowledgeRefreshLineageReceipt {
  receipt: KnowledgeRefreshLineageReceipt;
  receiptPath: string;
}

const SURFACES: KnowledgeRefreshSurface[] = ["Score", "Watch", "Enforce"];

function nowIso(): string {
  return new Date().toISOString();
}

function cleanId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "receipt";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function validIso(value: string | null | undefined): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function delta(score: KnowledgeRefreshAffectedScore): number {
  return Math.abs(score.refreshedScore0to100 - score.previousScore0to100);
}

function scoreImpact(scores: KnowledgeRefreshAffectedScore[]): KnowledgeRefreshLineageReceipt["scoreImpact"] {
  const deltas = scores.map(delta);
  const total = deltas.reduce((sum, value) => sum + value, 0);
  return {
    changedScoreCount: scores.length,
    maxAbsDelta0to100: round(deltas.length > 0 ? Math.max(...deltas) : 0),
    averageAbsDelta0to100: round(deltas.length > 0 ? total / deltas.length : 0)
  };
}

function validateInput(input: BuildKnowledgeRefreshLineageReceiptInput): string[] {
  const reasons: string[] = [];
  if (!input.receiptId.trim()) reasons.push("knowledge-refresh-lineage:receipt-id:missing");
  if (!input.agentId.trim()) reasons.push("knowledge-refresh-lineage:agent-id:missing");
  if (!input.corpusId.trim()) reasons.push("knowledge-refresh-lineage:corpus-id:missing");
  if (!input.previousCorpusVersion.trim()) reasons.push("knowledge-refresh-lineage:previous-corpus-version:missing");
  if (!input.refreshedCorpusVersion.trim()) reasons.push("knowledge-refresh-lineage:refreshed-corpus-version:missing");
  if (input.previousCorpusVersion.trim() === input.refreshedCorpusVersion.trim()) {
    reasons.push("knowledge-refresh-lineage:corpus-version:unchanged");
  }
  if (!input.ingestionJobId.trim()) reasons.push("knowledge-refresh-lineage:ingestion-job:missing");
  if (!input.ingestionReceiptId.trim()) reasons.push("knowledge-refresh-lineage:ingestion-receipt:missing");
  if (input.sourceApprovals.length === 0) reasons.push("knowledge-refresh-lineage:source-approvals:missing");
  if (input.deletionRequests.length === 0) reasons.push("knowledge-refresh-lineage:deletion-requests:missing");
  if (input.affectedScores.length === 0) reasons.push("knowledge-refresh-lineage:affected-scores:missing");
  if (unique(input.sourceRefs).length === 0) reasons.push("knowledge-refresh-lineage:source-refs:missing");
  if (unique(input.evidenceRefs).length === 0) reasons.push("knowledge-refresh-lineage:evidence:missing");

  for (const approval of input.sourceApprovals) {
    const id = approval.approvalId.trim() || "unknown";
    if (!approval.approvalId.trim()) reasons.push("knowledge-refresh-lineage:source-approval:approval-id:missing");
    if (!approval.sourceId.trim()) reasons.push(`knowledge-refresh-lineage:source-approval:${id}:source-id:missing`);
    if (approval.decision !== "approved") reasons.push(`knowledge-refresh-lineage:source-approval:${id}:not-approved`);
    if (!approval.approvedBy.trim()) reasons.push(`knowledge-refresh-lineage:source-approval:${id}:approved-by:missing`);
    if (!validIso(approval.approvedAt)) reasons.push(`knowledge-refresh-lineage:source-approval:${id}:approved-at:invalid`);
    if (!approval.evidenceRef.trim()) reasons.push(`knowledge-refresh-lineage:source-approval:${id}:evidence:missing`);
  }

  for (const request of input.deletionRequests) {
    const id = request.requestId.trim() || "unknown";
    if (!request.requestId.trim()) reasons.push("knowledge-refresh-lineage:deletion-request:request-id:missing");
    if (!request.sourceId.trim()) reasons.push(`knowledge-refresh-lineage:deletion-request:${id}:source-id:missing`);
    if (!["requested", "completed", "rejected"].includes(request.status)) {
      reasons.push(`knowledge-refresh-lineage:deletion-request:${id}:status:invalid`);
    }
    if (!validIso(request.requestedAt)) reasons.push(`knowledge-refresh-lineage:deletion-request:${id}:requested-at:invalid`);
    if (request.status === "completed" && !validIso(request.completedAt ?? null)) {
      reasons.push(`knowledge-refresh-lineage:deletion-request:${id}:completed-at:missing`);
    }
    if (!request.evidenceRef.trim()) reasons.push(`knowledge-refresh-lineage:deletion-request:${id}:evidence:missing`);
  }

  for (const score of input.affectedScores) {
    const id = score.scoreId.trim() || "unknown";
    if (!score.scoreId.trim()) reasons.push("knowledge-refresh-lineage:affected-score:score-id:missing");
    if (!validScore(score.previousScore0to100)) reasons.push(`knowledge-refresh-lineage:affected-score:${id}:previous-score:invalid`);
    if (!validScore(score.refreshedScore0to100)) reasons.push(`knowledge-refresh-lineage:affected-score:${id}:refreshed-score:invalid`);
    if (!score.reason.trim()) reasons.push(`knowledge-refresh-lineage:affected-score:${id}:reason:missing`);
  }

  return [...new Set(reasons)];
}

function receiptDigest(receipt: KnowledgeRefreshLineageReceipt): string {
  return sha256Hex(canonicalize({
    ...receipt,
    receiptHash: "",
    receiptPath: null,
    signaturePath: null
  }));
}

export function buildKnowledgeRefreshLineageReceipt(
  input: BuildKnowledgeRefreshLineageReceiptInput
): KnowledgeRefreshLineageReceipt {
  const failClosedReasons = validateInput(input);
  const withoutHash: KnowledgeRefreshLineageReceipt = {
    schemaVersion: "2026-06-25",
    receiptType: "knowledge-refresh-lineage",
    receiptId: input.receiptId,
    agentId: input.agentId,
    createdAt: input.createdAt ?? nowIso(),
    surfaces: [...SURFACES],
    corpus: {
      corpusId: input.corpusId,
      previousVersion: input.previousCorpusVersion,
      refreshedVersion: input.refreshedCorpusVersion
    },
    ingestion: {
      jobId: input.ingestionJobId,
      receiptId: input.ingestionReceiptId
    },
    sourceApprovals: input.sourceApprovals,
    deletionRequests: input.deletionRequests,
    affectedScores: input.affectedScores,
    scoreImpact: scoreImpact(input.affectedScores),
    sourceRefs: unique(input.sourceRefs),
    evidenceRefs: unique(input.evidenceRefs),
    failClosed: failClosedReasons.length > 0,
    failClosedReasons,
    receiptHash: "",
    receiptPath: null,
    signaturePath: null
  };
  return {
    ...withoutHash,
    receiptHash: receiptDigest(withoutHash)
  };
}

function receiptsDir(workspace: string, agentId: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "vault", "knowledge-refresh-lineage");
}

export function knowledgeRefreshLineageReceiptPath(workspace: string, agentId: string, receiptId: string): string {
  return join(receiptsDir(resolve(workspace), resolveAgentId(workspace, agentId)), `${cleanId(receiptId)}.json`);
}

export function writeKnowledgeRefreshLineageReceipt(
  input: BuildKnowledgeRefreshLineageReceiptInput & { workspace: string }
): WrittenKnowledgeRefreshLineageReceipt {
  const workspace = resolve(input.workspace);
  const agentId = resolveAgentId(workspace, input.agentId);
  const base = buildKnowledgeRefreshLineageReceipt(input);
  const receiptPath = knowledgeRefreshLineageReceiptPath(workspace, agentId, base.receiptId);
  ensureDir(receiptsDir(workspace, agentId));
  const receipt = { ...base, receiptPath };
  writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({
    workspace,
    path: receiptPath,
    artifactKind: "knowledge-refresh-lineage-receipt"
  });
  const signedReceipt = { ...receipt, signaturePath: signed?.sigPath ?? null };
  writeFileAtomic(receiptPath, `${JSON.stringify(signedReceipt, null, 2)}\n`, 0o644);
  trySignArtifactFile({
    workspace,
    path: receiptPath,
    artifactKind: "knowledge-refresh-lineage-receipt"
  });
  return { receipt: signedReceipt, receiptPath };
}

export function verifyKnowledgeRefreshLineageReceipt(
  receipt: KnowledgeRefreshLineageReceipt
): KnowledgeRefreshLineageVerification {
  const reasons = [...receipt.failClosedReasons];
  if (receipt.schemaVersion !== "2026-06-25") reasons.push("knowledge-refresh-lineage:schema-version:invalid");
  if (receipt.receiptType !== "knowledge-refresh-lineage") reasons.push("knowledge-refresh-lineage:receipt-type:invalid");
  if (canonicalize(receipt.surfaces) !== canonicalize(SURFACES)) reasons.push("knowledge-refresh-lineage:surfaces:invalid");
  if (receipt.receiptHash !== receiptDigest(receipt)) reasons.push("knowledge-refresh-lineage:receipt-hash:mismatch");
  if (!receipt.failClosed && receipt.failClosedReasons.length > 0) reasons.push("knowledge-refresh-lineage:fail-open:invalid");
  if (receipt.receiptPath === null) {
    reasons.push("knowledge-refresh-lineage:receipt-path:missing");
  } else if (!existsSync(receipt.receiptPath)) {
    reasons.push("knowledge-refresh-lineage:receipt-path:not-found");
  }
  if (receipt.signaturePath === null) {
    reasons.push("knowledge-refresh-lineage:signature:missing");
  } else if (!existsSync(receipt.signaturePath)) {
    reasons.push("knowledge-refresh-lineage:signature:not-found");
  }
  const uniqueReasons = [...new Set(reasons)];
  return {
    valid: uniqueReasons.length === 0 && !receipt.failClosed,
    failClosedReasons: uniqueReasons
  };
}

export function renderKnowledgeRefreshLineageAuditExport(receipt: KnowledgeRefreshLineageReceipt): string {
  const verification = verifyKnowledgeRefreshLineageReceipt(receipt);
  const status = verification.valid ? "VALID" : "FAIL-CLOSED";
  const lines = [
    "# AMC Knowledge Refresh Lineage",
    "",
    `- Receipt: \`${receipt.receiptId}\``,
    `- Agent: \`${receipt.agentId}\``,
    `- Status: ${status}`,
    `- Surfaces: ${receipt.surfaces.join(", ")}`,
    `- Corpus: \`${receipt.corpus.corpusId}\``,
    `- Versions: \`${receipt.corpus.previousVersion}\` -> \`${receipt.corpus.refreshedVersion}\``,
    `- Ingestion receipt: \`${receipt.ingestion.receiptId}\``,
    `- Changed scores: ${receipt.scoreImpact.changedScoreCount}`,
    `- Max score delta: ${receipt.scoreImpact.maxAbsDelta0to100}`,
    `- Receipt hash: \`${receipt.receiptHash}\``,
    "",
    "## Source Approvals",
    ...receipt.sourceApprovals.map((approval) =>
      `- ${approval.sourceId}: ${approval.decision} by ${approval.approvedBy} (${approval.evidenceRef})`
    ),
    "",
    "## Deletion Requests",
    ...receipt.deletionRequests.map((request) =>
      `- ${request.sourceId}: ${request.status} (${request.evidenceRef})`
    )
  ];
  if (verification.failClosedReasons.length > 0) {
    lines.push("", "## Fail-Closed Reasons", ...verification.failClosedReasons.map((reason) => `- ${reason}`));
  }
  return `${lines.join("\n")}\n`;
}
