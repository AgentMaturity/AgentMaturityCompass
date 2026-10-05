import {
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

export type GovernanceExceptionApprovalDecision = "approved" | "rejected";
export type GovernanceExceptionRenewalOutcome = "renewed" | "denied" | "not_requested";

export interface GovernanceExceptionLifecycleSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface GovernanceExceptionLifecycleEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface GovernanceExceptionCompensatingControl {
  controlId: string;
  owner: string;
  description: string;
  dueAt?: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface GovernanceExceptionRenewalDecision {
  decision: GovernanceExceptionRenewalOutcome;
  decidedAt: string;
  approverId: string;
  reason: string;
  signedEvidenceRef: string;
  signatureSha256: string;
}

export interface GovernanceExceptionLifecycleRecord {
  exceptionId: string;
  policyId: string;
  controlId: string;
  owner: string;
  requesterId: string;
  requestReason: string;
  requestedAt: string;
  requestSignedEvidenceRef: string;
  requestSignatureSha256: string;
  approverId: string;
  approvalDecision: GovernanceExceptionApprovalDecision;
  approvedAt: string;
  approvalSignedEvidenceRef: string;
  approvalSignatureSha256: string;
  expiresAt: string;
  expiryCheckedAt: string;
  expirySignedEvidenceRef: string;
  expirySignatureSha256: string;
  compensatingControls: GovernanceExceptionCompensatingControl[];
  renewalDecision: GovernanceExceptionRenewalDecision;
  evidenceRefs: GovernanceExceptionLifecycleEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface GovernanceExceptionLifecycleRow {
  exceptionId: string;
  policyId: string;
  controlId: string;
  owner: string;
  requesterId: string;
  approverId: string;
  approvalDecision: GovernanceExceptionApprovalDecision;
  requestedAt: string;
  approvedAt: string;
  expiresAt: string;
  expiryCheckedAt: string;
  compensatingControlIds: string[];
  renewalOutcome: GovernanceExceptionRenewalOutcome;
  renewalDecidedAt: string;
  sourceCitationIds: string[];
  evidenceRefs: GovernanceExceptionLifecycleEvidenceLink[];
  compensatingControlsHash: string;
  evidenceChainHash: string;
  rowHash: string;
}

export interface GovernanceExceptionLifecycleReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: GovernanceExceptionLifecycleSourceCitation[];
  rows: GovernanceExceptionLifecycleRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface GovernanceExceptionLifecycleVerification {
  valid: boolean;
  reasons: string[];
}

function rowHash(row: Omit<GovernanceExceptionLifecycleRow, "rowHash">): string {
  return hashAuditEvidence(row);
}

function receiptHash(receipt: Omit<GovernanceExceptionLifecycleReceipt, "receiptHash">): string {
  return hashAuditEvidence(receipt);
}

function compensatingControlValid(control: GovernanceExceptionCompensatingControl): boolean {
  return Boolean(
    control.controlId
    && control.owner
    && control.description
    && signedRefValid(control)
  );
}

function renewalDecisionValid(decision: GovernanceExceptionRenewalDecision): boolean {
  return Boolean(
    decision
    && decision.decision
    && timestampPresent(decision.decidedAt)
    && decision.approverId
    && decision.reason
    && signedRefValid(decision)
  );
}

export function buildGovernanceExceptionLifecycleReceipt(input: {
  receiptId: string;
  sourceCitations: GovernanceExceptionLifecycleSourceCitation[];
  exceptions: GovernanceExceptionLifecycleRecord[];
  generatedAt?: string;
}): GovernanceExceptionLifecycleReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = collectAuditSourceIds(input.sourceCitations, failClosedReasons);

  const rows = input.exceptions.map((exception): GovernanceExceptionLifecycleRow => {
    const sourceCitationIds = exception.sourceCitationIds ?? [...sourceIds];
    if (sourceCitationIds.length === 0) {
      failClosedReasons.push(`${exception.exceptionId}:sourceCitation:missing`);
    }
    if (sourceCitationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${exception.exceptionId}:sourceCitation:unknown`);
    }
    if (!exception.policyId) {
      failClosedReasons.push(`${exception.exceptionId}:policyId:missing`);
    }
    if (!exception.controlId) {
      failClosedReasons.push(`${exception.exceptionId}:controlId:missing`);
    }
    if (!exception.owner) {
      failClosedReasons.push(`${exception.exceptionId}:owner:missing`);
    }
    if (
      !exception.requesterId
      || !exception.requestReason
      || !timestampPresent(exception.requestedAt)
      || !signedRefValid({
        signedEvidenceRef: exception.requestSignedEvidenceRef,
        signatureSha256: exception.requestSignatureSha256,
      })
    ) {
      failClosedReasons.push(`${exception.exceptionId}:request:missing`);
    }
    if (
      !exception.approverId
      || !exception.approvalDecision
      || !timestampPresent(exception.approvedAt)
      || !signedRefValid({
        signedEvidenceRef: exception.approvalSignedEvidenceRef,
        signatureSha256: exception.approvalSignatureSha256,
      })
    ) {
      failClosedReasons.push(`${exception.exceptionId}:approval:missing`);
    }
    if (
      !timestampPresent(exception.expiresAt)
      || !timestampPresent(exception.expiryCheckedAt)
      || !signedRefValid({
        signedEvidenceRef: exception.expirySignedEvidenceRef,
        signatureSha256: exception.expirySignatureSha256,
      })
    ) {
      failClosedReasons.push(`${exception.exceptionId}:expiry:missing`);
    }
    if (
      exception.compensatingControls.length === 0
      || exception.compensatingControls.some((control) => !compensatingControlValid(control))
    ) {
      failClosedReasons.push(`${exception.exceptionId}:compensatingControl:missing`);
    }
    if (!renewalDecisionValid(exception.renewalDecision)) {
      failClosedReasons.push(`${exception.exceptionId}:renewalDecision:missing`);
    }
    if (exception.evidenceRefs.length === 0) {
      failClosedReasons.push(`${exception.exceptionId}:evidenceChain:missing`);
    } else if (!evidenceRefsValid(exception.evidenceRefs)) {
      failClosedReasons.push(`${exception.exceptionId}:evidenceChain:invalid`);
    }

    const baseRow: Omit<GovernanceExceptionLifecycleRow, "rowHash"> = {
      exceptionId: exception.exceptionId,
      policyId: exception.policyId,
      controlId: exception.controlId,
      owner: exception.owner,
      requesterId: exception.requesterId,
      approverId: exception.approverId,
      approvalDecision: exception.approvalDecision,
      requestedAt: exception.requestedAt,
      approvedAt: exception.approvedAt,
      expiresAt: exception.expiresAt,
      expiryCheckedAt: exception.expiryCheckedAt,
      compensatingControlIds: exception.compensatingControls.map((control) => control.controlId),
      renewalOutcome: exception.renewalDecision.decision,
      renewalDecidedAt: exception.renewalDecision.decidedAt,
      sourceCitationIds,
      evidenceRefs: exception.evidenceRefs,
      compensatingControlsHash: hashAuditEvidence(exception.compensatingControls),
      evidenceChainHash: hashAuditEvidence(exception.evidenceRefs),
    };

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("exceptions:missing");
  }

  return finalizeAuditEvidenceReceipt(input, rows, failClosedReasons);
}

export function verifyGovernanceExceptionLifecycleReceipt(
  receipt: GovernanceExceptionLifecycleReceipt
): GovernanceExceptionLifecycleVerification {
  const reasons = beginAuditReceiptVerification(receipt, "exceptions:missing");
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.exceptionId}:rowHash:mismatch`);
    }
    if (!row.owner) {
      reasons.push(`${row.exceptionId}:owner:missing`);
    }
    if (!row.approverId) {
      reasons.push(`${row.exceptionId}:approval:missing`);
    }
    if (!timestampPresent(row.expiresAt)) {
      reasons.push(`${row.exceptionId}:expiry:missing`);
    }
    if (row.compensatingControlIds.length === 0) {
      reasons.push(`${row.exceptionId}:compensatingControl:missing`);
    }
    if (!evidenceRefsValid(row.evidenceRefs)) {
      reasons.push(`${row.exceptionId}:evidenceChain:invalid`);
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

export function renderGovernanceExceptionLifecycleAuditExport(
  receipt: GovernanceExceptionLifecycleReceipt
): string {
  const lines: string[] = [];
  lines.push("# AMC Governance Exception Lifecycle Audit Export");
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
  lines.push("## Exception Rows");
  lines.push("");
  lines.push("| Exception | Control | Owner | Approver | Decision | Expires | Compensating controls | Renewal | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      row.exceptionId,
      row.controlId,
      row.owner || "MISSING",
      row.approverId || "MISSING",
      row.approvalDecision,
      row.expiresAt || "MISSING",
      row.compensatingControlIds.join(", ") || "MISSING",
      row.renewalOutcome,
      `Evidence chain ${row.evidenceChainHash}`,
    ];
    lines.push(`| ${values.map((value) => value.replace(/\|/g, "\\|")).join(" | ")} |`);
  }
  return finalizeAuditEvidenceExport(lines, receipt);
}
