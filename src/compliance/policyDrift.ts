import {
  isAuditEvidenceSha256 as isSha256,
  auditTimestampPresent as timestampPresent,
  uniqueAuditReasons as unique,
  auditSignedRefValid as signedRefValid,
  auditEvidenceRefsValid as evidenceRefsValid,
  hashAuditEvidence,
  collectAuditSourceIds,
  finalizeAuditEvidenceReceipt,
  beginAuditReceiptVerification,
  finalizeAuditEvidenceExport
} from "../audit/auditEvidenceAccounting.js";

export type PolicyDriftImpactLevel = "low" | "medium" | "high" | "critical";
export type PolicyDriftEnvironment = "development" | "staging" | "production";
export type PolicyDriftControlChangeType = "added" | "removed" | "strengthened" | "relaxed" | "renamed";
export type PolicyDriftRecheckStatus = "open" | "in_progress" | "done" | "waived";

export interface PolicyDriftImpactSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface PolicyDriftImpactEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface PolicyDriftAffectedAgent {
  agentId: string;
  environment: PolicyDriftEnvironment;
  currentPolicyVersion: string;
  requiredPolicyVersion: string;
  impactLevel: PolicyDriftImpactLevel;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftAffectedControl {
  controlId: string;
  framework: string;
  owner: string;
  changeType: PolicyDriftControlChangeType;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftAffectedTest {
  testId: string;
  command: string;
  owner: string;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftPriorDecision {
  decisionId: string;
  agentId: string;
  decisionType: string;
  decidedAt: string;
  invalidated: boolean;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftRecheckItem {
  recheckId: string;
  owner: string;
  dueAt: string;
  action: string;
  status: PolicyDriftRecheckStatus;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftRolloutReceipt {
  rolloutId: string;
  approvedBy: string;
  approvedAt: string;
  rolloutWindowId: string;
  rollbackPlanRef: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface PolicyDriftImpactChange {
  changeId: string;
  policyId: string;
  previousPolicyVersion: string;
  nextPolicyVersion: string;
  previousPolicyHash: string;
  nextPolicyHash: string;
  changeOwner: string;
  changedAt: string;
  rationale: string;
  diffSummary: string;
  signedEvidenceRef: string;
  signatureSha256: string;
  affectedAgents: PolicyDriftAffectedAgent[];
  affectedControls: PolicyDriftAffectedControl[];
  affectedTests: PolicyDriftAffectedTest[];
  priorDecisions: PolicyDriftPriorDecision[];
  recheckItems: PolicyDriftRecheckItem[];
  rolloutReceipt: PolicyDriftRolloutReceipt;
  evidenceRefs: PolicyDriftImpactEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface PolicyDriftImpactRow {
  changeId: string;
  policyId: string;
  previousPolicyVersion: string;
  nextPolicyVersion: string;
  changeOwner: string;
  changedAt: string;
  affectedAgentIds: string[];
  affectedControlIds: string[];
  affectedTestIds: string[];
  priorDecisionIds: string[];
  invalidatedPriorDecisionIds: string[];
  recheckIds: string[];
  rolloutId: string;
  sourceCitationIds: string[];
  evidenceRefs: PolicyDriftImpactEvidenceLink[];
  policyDiffHash: string;
  impactHash: string;
  rolloutHash: string;
  evidenceChainHash: string;
  rowHash: string;
}

export interface PolicyDriftImpactReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: PolicyDriftImpactSourceCitation[];
  rows: PolicyDriftImpactRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface PolicyDriftImpactVerification {
  valid: boolean;
  reasons: string[];
}

function rowHash(row: Omit<PolicyDriftImpactRow, "rowHash">): string {
  return hashAuditEvidence(row);
}

function receiptHash(receipt: Omit<PolicyDriftImpactReceipt, "receiptHash">): string {
  return hashAuditEvidence(receipt);
}

function policyDiffValid(change: PolicyDriftImpactChange): boolean {
  return Boolean(
    change.policyId
    && change.previousPolicyVersion
    && change.nextPolicyVersion
    && isSha256(change.previousPolicyHash)
    && isSha256(change.nextPolicyHash)
    && change.previousPolicyHash !== change.nextPolicyHash
    && change.changeOwner
    && timestampPresent(change.changedAt)
    && change.rationale
    && change.diffSummary
    && signedRefValid(change)
  );
}

function affectedAgentValid(agent: PolicyDriftAffectedAgent): boolean {
  return Boolean(
    agent.agentId
    && agent.environment
    && agent.currentPolicyVersion
    && agent.requiredPolicyVersion
    && agent.impactLevel
    && agent.reason
    && signedRefValid(agent)
  );
}

function affectedControlValid(control: PolicyDriftAffectedControl): boolean {
  return Boolean(
    control.controlId
    && control.framework
    && control.owner
    && control.changeType
    && signedRefValid(control)
  );
}

function affectedTestValid(test: PolicyDriftAffectedTest): boolean {
  return Boolean(
    test.testId
    && test.command
    && test.owner
    && test.reason
    && signedRefValid(test)
  );
}

function priorDecisionValid(decision: PolicyDriftPriorDecision): boolean {
  return Boolean(
    decision.decisionId
    && decision.agentId
    && decision.decisionType
    && timestampPresent(decision.decidedAt)
    && decision.reason
    && signedRefValid(decision)
  );
}

function recheckItemValid(item: PolicyDriftRecheckItem): boolean {
  return Boolean(
    item.recheckId
    && item.owner
    && timestampPresent(item.dueAt)
    && item.action
    && item.status
    && signedRefValid(item)
  );
}

function rolloutReceiptValid(receipt: PolicyDriftRolloutReceipt): boolean {
  return Boolean(
    receipt
    && receipt.rolloutId
    && receipt.approvedBy
    && timestampPresent(receipt.approvedAt)
    && receipt.rolloutWindowId
    && receipt.rollbackPlanRef
    && signedRefValid(receipt)
  );
}

export function buildPolicyDriftImpactReceipt(input: {
  receiptId: string;
  sourceCitations: PolicyDriftImpactSourceCitation[];
  changes: PolicyDriftImpactChange[];
  generatedAt?: string;
}): PolicyDriftImpactReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = collectAuditSourceIds(input.sourceCitations, failClosedReasons);

  const rows = input.changes.map((change): PolicyDriftImpactRow => {
    const sourceCitationIds = change.sourceCitationIds ?? [...sourceIds];
    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${change.changeId}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${change.changeId}:sourceCitation:unknown`);
    }
    if (!policyDiffValid(change)) {
      failClosedReasons.push(`${change.changeId}:policyDiff:missing`);
    }
    if (change.affectedAgents.length === 0 || change.affectedAgents.some((agent) => !affectedAgentValid(agent))) {
      failClosedReasons.push(`${change.changeId}:affectedAgents:missing`);
    }
    if (change.affectedControls.length === 0 || change.affectedControls.some((control) => !affectedControlValid(control))) {
      failClosedReasons.push(`${change.changeId}:affectedControls:missing`);
    }
    if (change.affectedTests.length === 0 || change.affectedTests.some((test) => !affectedTestValid(test))) {
      failClosedReasons.push(`${change.changeId}:affectedTests:missing`);
    }
    if (change.priorDecisions.length === 0 || change.priorDecisions.some((decision) => !priorDecisionValid(decision))) {
      failClosedReasons.push(`${change.changeId}:priorDecisions:missing`);
    }
    const invalidatedPriorDecisionIds = change.priorDecisions.filter((decision) => decision.invalidated).map((decision) => decision.decisionId);
    if (
      change.recheckItems.length === 0
      || change.recheckItems.some((item) => !recheckItemValid(item))
      || (invalidatedPriorDecisionIds.length > 0 && change.recheckItems.length === 0)
    ) {
      failClosedReasons.push(`${change.changeId}:recheckList:missing`);
    }
    if (!rolloutReceiptValid(change.rolloutReceipt)) {
      failClosedReasons.push(`${change.changeId}:rolloutReceipt:missing`);
    }
    if (!evidenceRefsValid(change.evidenceRefs)) {
      failClosedReasons.push(`${change.changeId}:evidenceChain:missing`);
    }

    const policyDiff = {
      policyId: change.policyId,
      previousPolicyVersion: change.previousPolicyVersion,
      nextPolicyVersion: change.nextPolicyVersion,
      previousPolicyHash: change.previousPolicyHash,
      nextPolicyHash: change.nextPolicyHash,
      changeOwner: change.changeOwner,
      changedAt: change.changedAt,
      rationale: change.rationale,
      diffSummary: change.diffSummary,
      signedEvidenceRef: change.signedEvidenceRef,
      signatureSha256: change.signatureSha256,
    };
    const impact = {
      affectedAgents: change.affectedAgents,
      affectedControls: change.affectedControls,
      affectedTests: change.affectedTests,
      priorDecisions: change.priorDecisions,
      recheckItems: change.recheckItems,
    };
    const baseRow: Omit<PolicyDriftImpactRow, "rowHash"> = {
      changeId: change.changeId,
      policyId: change.policyId,
      previousPolicyVersion: change.previousPolicyVersion,
      nextPolicyVersion: change.nextPolicyVersion,
      changeOwner: change.changeOwner,
      changedAt: change.changedAt,
      affectedAgentIds: change.affectedAgents.map((agent) => agent.agentId),
      affectedControlIds: change.affectedControls.map((control) => control.controlId),
      affectedTestIds: change.affectedTests.map((test) => test.testId),
      priorDecisionIds: change.priorDecisions.map((decision) => decision.decisionId),
      invalidatedPriorDecisionIds,
      recheckIds: change.recheckItems.map((item) => item.recheckId),
      rolloutId: change.rolloutReceipt.rolloutId,
      sourceCitationIds,
      evidenceRefs: change.evidenceRefs,
      policyDiffHash: hashAuditEvidence(policyDiff),
      impactHash: hashAuditEvidence(impact),
      rolloutHash: hashAuditEvidence(change.rolloutReceipt),
      evidenceChainHash: hashAuditEvidence(change.evidenceRefs),
    };

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("changes:missing");
  }

  return finalizeAuditEvidenceReceipt(input, rows, failClosedReasons);
}

export function verifyPolicyDriftImpactReceipt(
  receipt: PolicyDriftImpactReceipt
): PolicyDriftImpactVerification {
  const reasons = beginAuditReceiptVerification(receipt, "changes:missing");
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.changeId}:rowHash:mismatch`);
    }
    if (!row.policyId || !row.previousPolicyVersion || !row.nextPolicyVersion || !row.changeOwner) {
      reasons.push(`${row.changeId}:policyDiff:missing`);
    }
    if (row.affectedAgentIds.length === 0) {
      reasons.push(`${row.changeId}:affectedAgents:missing`);
    }
    if (row.affectedControlIds.length === 0) {
      reasons.push(`${row.changeId}:affectedControls:missing`);
    }
    if (row.affectedTestIds.length === 0) {
      reasons.push(`${row.changeId}:affectedTests:missing`);
    }
    if (row.priorDecisionIds.length === 0) {
      reasons.push(`${row.changeId}:priorDecisions:missing`);
    }
    if (row.recheckIds.length === 0) {
      reasons.push(`${row.changeId}:recheckList:missing`);
    }
    if (!row.rolloutId) {
      reasons.push(`${row.changeId}:rolloutReceipt:missing`);
    }
    if (!evidenceRefsValid(row.evidenceRefs)) {
      reasons.push(`${row.changeId}:evidenceChain:missing`);
    }
  }
  const { receiptHash: actualReceiptHash, ...withoutReceiptHash } = receipt;
  if (receiptHash(withoutReceiptHash) !== actualReceiptHash) {
    reasons.push("receiptHash:mismatch");
  }
  return {
    valid: reasons.length === 0,
    reasons: unique(reasons),
  };
}

export function renderPolicyDriftImpactAuditExport(receipt: PolicyDriftImpactReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Policy Drift Impact Audit Export");
  lines.push("");
  lines.push(`- Receipt: \`${receipt.receiptId}\``);
  lines.push(`- Generated: \`${receipt.generatedAt}\``);
  lines.push(`- Status: ${receipt.failClosed ? "FAIL-CLOSED" : "VALID"}`);
  lines.push(`- Receipt hash: \`${receipt.receiptHash}\``);
  lines.push("");
  lines.push("## Source Citations");
  for (const citation of receipt.sourceCitations) {
    lines.push(`- ${citation.sourceId}: ${citation.title} (${citation.url})`);
  }
  lines.push("");
  lines.push("## Policy Drift Rows");
  lines.push("");
  lines.push("| Policy diff | Affected agents | Affected controls | Affected tests | Prior decisions | Recheck list | Rollout receipt | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      `${row.policyId} ${row.previousPolicyVersion}->${row.nextPolicyVersion}`,
      row.affectedAgentIds.join(", ") || "MISSING",
      row.affectedControlIds.join(", ") || "MISSING",
      row.affectedTestIds.join(", ") || "MISSING",
      row.priorDecisionIds.join(", ") || "MISSING",
      row.recheckIds.join(", ") || "MISSING",
      row.rolloutId || "MISSING",
      `Evidence chain ${row.evidenceChainHash}`,
    ];
    lines.push(`| ${values.map((value) => value.replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return finalizeAuditEvidenceExport(lines, receipt);
}
