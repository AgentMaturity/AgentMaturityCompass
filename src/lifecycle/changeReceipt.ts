import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentPaths } from "../fleet/paths.js";
import { evaluateDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import type { DiagnosticReport } from "../types.js";
import { readUtf8, writeFileAtomic } from "../utils/fs.js";
import { trySignArtifactFile } from "./artifactSignature.js";
import type { DecisionReceipt } from "./decisionReceipt.js";
import type { FindingProofSetRef } from "./findingProof.js";

export type LifecycleChangeReceiptType = "proposal" | "validation" | "commit" | "rollback" | "monitor";
export type LifecycleChangeReceiptStatus = "proposed" | "accepted" | "blocked" | "rolled-back" | "observed";

export interface LifecycleChangeReceipt {
  schemaVersion: "2026-05-22";
  receiptId: string;
  receiptType: LifecycleChangeReceiptType;
  status: LifecycleChangeReceiptStatus;
  runId: string | null;
  lifecycleRunId: string | null;
  agentId: string;
  workspace: string;
  command: string;
  createdAt: string;
  subject: {
    resourceManifestIds: string[];
    decisionReceiptIds: string[];
    findingProofSetIds: string[];
    rollbackTargetManifestId: string | null;
  };
  policyChecks: Array<{
    policyId: string;
    passed: boolean;
    summary: string;
    evidenceRefs: string[];
  }>;
  evaluationEvidence: {
    diagnosticRunId: string | null;
    diagnosticStatus: DiagnosticReport["status"] | null;
    evidenceStatus: NonNullable<DiagnosticReport["evidenceReadiness"]>["status"] | null;
    claimEligible: boolean;
    integrityIndex: number | null;
    evidenceCoverage: number | null;
  };
  rollback: {
    targetManifestId: string | null;
    restoreReceiptPath: string | null;
    reason: string | null;
  };
  monitor: {
    health: "healthy" | "warning" | "critical" | "unknown";
    driftState: "stable" | "needs-evidence" | "regressed" | "unknown";
    summary: string;
  };
  refs: string[];
}

export interface LifecycleChangeReceiptRef {
  receiptId: string;
  receiptType: LifecycleChangeReceiptType;
  status: LifecycleChangeReceiptStatus;
  path: string;
}

export interface WriteLifecycleChangeReceiptsInput {
  workspace: string;
  report: DiagnosticReport;
  command: string;
  resourceManifestIds?: string[];
  decisionReceipts?: DecisionReceipt[];
  findingProofs?: FindingProofSetRef[];
}

export interface WriteLifecycleChangeReceiptsResult {
  receipts: LifecycleChangeReceipt[];
  receiptsPath: string;
  signaturePath: string | null;
  refs: LifecycleChangeReceiptRef[];
}

export interface LifecycleChangeReceiptExportResult {
  receipts: LifecycleChangeReceipt[];
  outputPath: string;
  redacted: boolean;
}

function baseReceipt(input: WriteLifecycleChangeReceiptsInput, type: LifecycleChangeReceiptType): LifecycleChangeReceipt {
  const workspace = resolve(input.workspace);
  const createdAt = new Date(input.report.ts).toISOString();
  const decisionReceiptIds = (input.decisionReceipts ?? []).map((receipt) => receipt.receiptId);
  const findingProofSetIds = (input.findingProofs ?? []).map((proofSet) => proofSet.proofSetId);
  const readiness = input.report.evidenceReadiness ?? evaluateDiagnosticEvidenceReadiness(input.report);
  return {
    schemaVersion: "2026-05-22",
    receiptId: `lifecycle-${type}-${input.report.runId}`,
    receiptType: type,
    status: type === "proposal" ? "proposed" : "observed",
    runId: input.report.runId,
    lifecycleRunId: `lifecycle-${input.report.runId}`,
    agentId: input.report.agentId,
    workspace,
    command: input.command,
    createdAt,
    subject: {
      resourceManifestIds: input.resourceManifestIds ?? [],
      decisionReceiptIds,
      findingProofSetIds,
      rollbackTargetManifestId: null
    },
    policyChecks: [],
    evaluationEvidence: {
      diagnosticRunId: input.report.runId,
      diagnosticStatus: input.report.status,
      evidenceStatus: readiness.status,
      claimEligible: readiness.claimEligible,
      integrityIndex: input.report.integrityIndex,
      evidenceCoverage: input.report.evidenceCoverage
    },
    rollback: {
      targetManifestId: null,
      restoreReceiptPath: null,
      reason: null
    },
    monitor: {
      health: "unknown",
      driftState: "unknown",
      summary: ""
    },
    refs: []
  };
}

function validationPolicyChecks(input: WriteLifecycleChangeReceiptsInput): LifecycleChangeReceipt["policyChecks"] {
  const report = input.report;
  const readiness = report.evidenceReadiness ?? evaluateDiagnosticEvidenceReadiness(report);
  return [
    {
      policyId: "vault-report-signature",
      passed: report.status === "VALID",
      summary: report.status === "VALID" ? "Diagnostic report is valid and sealed." : `Diagnostic report status is ${report.status}.`,
      evidenceRefs: [report.reportJsonSha256]
    },
    {
      policyId: "evidence-coverage-present",
      passed: report.evidenceCoverage > 0,
      summary: report.evidenceCoverage > 0 ? "Evidence is linked to at least one scored question." : "No direct evidence was linked to scored questions.",
      evidenceRefs: report.questionScores.flatMap((score) => score.evidenceEventIds).slice(0, 25)
    },
    {
      policyId: "evidence-claim-readiness",
      passed: readiness.claimEligible,
      summary: readiness.claimEligible
        ? "Evidence readiness is READY for the configured scope."
        : `Evidence readiness is ${readiness.status}; promotion remains blocked. ${readiness.claimBoundary}`,
      evidenceRefs: report.questionScores.flatMap((score) => score.evidenceEventIds).slice(0, 25)
    },
    {
      policyId: "resource-manifest-present",
      passed: Boolean(input.resourceManifestIds?.length),
      summary: input.resourceManifestIds?.length ? "Enforce resource manifest is attached." : "No Enforce resource manifest was attached.",
      evidenceRefs: input.resourceManifestIds ?? []
    }
  ];
}

function monitorHealth(report: DiagnosticReport): LifecycleChangeReceipt["monitor"] {
  const readiness = report.evidenceReadiness ?? evaluateDiagnosticEvidenceReadiness(report);
  if (readiness.status === "UNVERIFIED" || readiness.status === "INSUFFICIENT_EVIDENCE") {
    return {
      health: "critical",
      driftState: report.evidenceCoverage > 0 ? "regressed" : "needs-evidence",
      summary: "Post-score state needs attention before promotion."
    };
  }
  if (!readiness.claimEligible || report.integrityIndex < 0.7 || report.evidenceCoverage < 0.5) {
    return {
      health: "warning",
      driftState: report.evidenceCoverage > 0 ? "stable" : "needs-evidence",
      summary: "Post-score state is usable but needs stronger evidence coverage."
    };
  }
  return {
    health: "healthy",
    driftState: "stable",
    summary: "Post-score state is stable under current evidence."
  };
}

export function buildLifecycleChangeReceipts(input: WriteLifecycleChangeReceiptsInput): LifecycleChangeReceipt[] {
  const proposal = baseReceipt(input, "proposal");
  proposal.refs = [
    ...proposal.subject.decisionReceiptIds,
    ...proposal.subject.findingProofSetIds
  ];
  proposal.monitor.summary = "Improvement proposal recorded from full-score findings and evidence requests.";

  const validation = baseReceipt(input, "validation");
  validation.policyChecks = validationPolicyChecks(input);
  validation.status = validation.policyChecks.every((check) => check.passed) ? "accepted" : "blocked";
  validation.refs = validation.policyChecks.flatMap((check) => check.evidenceRefs);
  validation.monitor.summary = validation.status === "accepted"
    ? "Validation checks passed for lifecycle commit."
    : "Validation checks blocked lifecycle commit.";

  const receipts = [proposal, validation];
  if (validation.status === "accepted") {
    const commit = baseReceipt(input, "commit");
    commit.status = "accepted";
    commit.policyChecks = validation.policyChecks;
    commit.refs = [
      input.report.runId,
      ...commit.subject.resourceManifestIds,
      ...commit.subject.findingProofSetIds
    ];
    commit.monitor.summary = "Lifecycle commit accepted with validation evidence.";
    receipts.push(commit);
  }

  const monitor = baseReceipt(input, "monitor");
  monitor.status = "observed";
  monitor.policyChecks = validation.policyChecks;
  monitor.monitor = monitorHealth(input.report);
  monitor.refs = [input.report.runId, ...monitor.subject.resourceManifestIds];
  receipts.push(monitor);

  return receipts;
}

export function lifecycleChangeReceiptsDir(workspace: string, agentId?: string): string {
  return join(getAgentPaths(workspace, agentId).rootDir, "lifecycle-receipts");
}

export function lifecycleChangeReceiptsPath(workspace: string, agentId: string | undefined, runId: string): string {
  return join(lifecycleChangeReceiptsDir(workspace, agentId), `${runId}.json`);
}

export function writeLifecycleChangeReceipts(input: WriteLifecycleChangeReceiptsInput): WriteLifecycleChangeReceiptsResult {
  const receipts = buildLifecycleChangeReceipts(input);
  const receiptsPath = lifecycleChangeReceiptsPath(input.workspace, input.report.agentId, input.report.runId);
  writeFileAtomic(receiptsPath, `${JSON.stringify(receipts, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({
    workspace: input.workspace,
    path: receiptsPath,
    artifactKind: "lifecycle-receipt-bundle"
  });
  return {
    receipts,
    receiptsPath,
    signaturePath: signed?.sigPath ?? null,
    refs: receipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      receiptType: receipt.receiptType,
      status: receipt.status,
      path: receiptsPath
    }))
  };
}

export function buildRollbackLifecycleReceipt(input: {
  workspace: string;
  agentId: string;
  command: string;
  targetManifestId: string;
  restoreReceiptPath: string | null;
  reason: string;
  refs?: string[];
}): LifecycleChangeReceipt {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2026-05-22",
    receiptId: `lifecycle-rollback-${Date.now()}`,
    receiptType: "rollback",
    status: "rolled-back",
    runId: null,
    lifecycleRunId: null,
    agentId: input.agentId,
    workspace: resolve(input.workspace),
    command: input.command,
    createdAt: now,
    subject: {
      resourceManifestIds: [input.targetManifestId],
      decisionReceiptIds: [],
      findingProofSetIds: [],
      rollbackTargetManifestId: input.targetManifestId
    },
    policyChecks: [{
      policyId: "rollback-target-manifest-present",
      passed: Boolean(input.targetManifestId),
      summary: "Rollback points to an exact Enforce resource manifest.",
      evidenceRefs: [input.targetManifestId]
    }],
    evaluationEvidence: {
      diagnosticRunId: null,
      diagnosticStatus: null,
      evidenceStatus: null,
      claimEligible: false,
      integrityIndex: null,
      evidenceCoverage: null
    },
    rollback: {
      targetManifestId: input.targetManifestId,
      restoreReceiptPath: input.restoreReceiptPath,
      reason: input.reason
    },
    monitor: {
      health: "unknown",
      driftState: "unknown",
      summary: "Run a fresh full score after rollback to record post-change health."
    },
    refs: input.refs ?? []
  };
}

export function writeRollbackLifecycleReceipt(input: {
  workspace: string;
  agentId: string;
  command: string;
  targetManifestId: string;
  restoreReceiptPath: string | null;
  reason: string;
  refs?: string[];
}): { receipt: LifecycleChangeReceipt; receiptPath: string; signaturePath: string | null } {
  const receipt = buildRollbackLifecycleReceipt(input);
  const receiptPath = join(lifecycleChangeReceiptsDir(input.workspace, input.agentId), `${receipt.receiptId}.json`);
  writeFileAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 0o644);
  const signed = trySignArtifactFile({
    workspace: input.workspace,
    path: receiptPath,
    artifactKind: "lifecycle-receipt-bundle"
  });
  return { receipt, receiptPath, signaturePath: signed?.sigPath ?? null };
}

function parseReceiptFile(path: string): LifecycleChangeReceipt[] {
  const parsed = JSON.parse(readUtf8(path)) as LifecycleChangeReceipt | LifecycleChangeReceipt[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function listLifecycleChangeReceipts(input: { workspace: string; agentId?: string; limit?: number }): LifecycleChangeReceipt[] {
  const dir = lifecycleChangeReceiptsDir(input.workspace, input.agentId);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .flatMap((entry) => parseReceiptFile(join(dir, entry)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, input.limit ?? Number.POSITIVE_INFINITY);
}

export function loadLifecycleChangeReceipt(input: { workspace: string; selector: string; agentId?: string }): LifecycleChangeReceipt {
  const found = listLifecycleChangeReceipts({ workspace: input.workspace, agentId: input.agentId })
    .find((receipt) => receipt.receiptId === input.selector || receipt.runId === input.selector || receipt.lifecycleRunId === input.selector);
  if (!found) {
    throw new Error(`Lifecycle change receipt not found: ${input.selector}`);
  }
  return found;
}

function redactPathForExport(path: string | null, workspace: string): string | null {
  if (!path) return null;
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

export function redactLifecycleChangeReceipt(receipt: LifecycleChangeReceipt): LifecycleChangeReceipt {
  return {
    ...receipt,
    workspace: "$WORKSPACE",
    rollback: {
      ...receipt.rollback,
      restoreReceiptPath: redactPathForExport(receipt.rollback.restoreReceiptPath, receipt.workspace)
    }
  };
}

export function exportLifecycleChangeReceipts(input: {
  workspace: string;
  outputPath: string;
  agentId?: string;
  runId?: string;
  redacted?: boolean;
}): LifecycleChangeReceiptExportResult {
  const receipts = listLifecycleChangeReceipts({ workspace: input.workspace, agentId: input.agentId })
    .filter((receipt) => !input.runId || receipt.runId === input.runId)
    .map((receipt) => input.redacted ? redactLifecycleChangeReceipt(receipt) : receipt);
  writeFileAtomic(resolve(input.outputPath), `${JSON.stringify(receipts, null, 2)}\n`, 0o644);
  return { receipts, outputPath: resolve(input.outputPath), redacted: Boolean(input.redacted) };
}
