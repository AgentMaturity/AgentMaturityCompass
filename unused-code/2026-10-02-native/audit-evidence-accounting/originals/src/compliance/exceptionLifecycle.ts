import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

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

function isSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function timestampPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function signedRefValid(value: { signedEvidenceRef?: string; signatureSha256?: string }): boolean {
  return Boolean(value.signedEvidenceRef && isSha256(value.signatureSha256));
}

function rowHash(row: Omit<GovernanceExceptionLifecycleRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<GovernanceExceptionLifecycleReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function evidenceRefsValid(evidenceRefs: GovernanceExceptionLifecycleEvidenceLink[]): boolean {
  return evidenceRefs.length > 0 && evidenceRefs.every((evidence) => (
    Boolean(evidence.eventId)
    && Boolean(evidence.eventType)
    && Boolean(evidence.signedEvidenceRef)
    && isSha256(evidence.eventHash)
  ));
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
  const sourceIds = new Set(input.sourceCitations.map((citation) => citation.sourceId).filter(Boolean));
  if (sourceIds.size === 0) {
    failClosedReasons.push("sourceCitations:missing");
  }

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
      compensatingControlsHash: sha256Hex(canonicalize(exception.compensatingControls)),
      evidenceChainHash: sha256Hex(canonicalize(exception.evidenceRefs)),
    };

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("exceptions:missing");
  }

  const withoutHash: Omit<GovernanceExceptionLifecycleReceipt, "receiptHash"> = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCitations: input.sourceCitations,
    rows,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons: unique(failClosedReasons),
  };

  return {
    ...withoutHash,
    receiptHash: receiptHash(withoutHash),
  };
}

export function verifyGovernanceExceptionLifecycleReceipt(
  receipt: GovernanceExceptionLifecycleReceipt
): GovernanceExceptionLifecycleVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.rows.length === 0) {
    reasons.push("exceptions:missing");
  }
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
  if (receipt.failClosedReasons.length > 0) {
    lines.push("");
    lines.push("## Fail-Closed Reasons");
    for (const reason of receipt.failClosedReasons) {
      lines.push(`- ${reason}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
