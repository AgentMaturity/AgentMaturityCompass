import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type ReviewerIndependenceRiskTier = "low" | "medium" | "high" | "critical";
export type ReviewerIndependenceDecision = "approved" | "rejected" | "escalated";

export interface ReviewerIndependenceSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  retrievedAt: string;
}

export interface ReviewerIndependenceEvidenceLink {
  eventId: string;
  eventHash: string;
  eventType: string;
  signedEvidenceRef: string;
}

export interface ReviewerConflictCheck {
  checkedAt: string;
  flags: string[];
  reviewerIsRequester?: boolean;
  reviewerSharesOrgUnitWithRequester?: boolean;
  signedEvidenceRef?: string;
  signatureSha256?: string;
}

export interface ReviewerSecondReview {
  required: boolean;
  reviewerId?: string;
  reviewerRole?: string;
  reviewerOrgUnit?: string;
  decision?: ReviewerIndependenceDecision;
  decidedAt?: string;
  approvalReceiptRef?: string;
  signedEvidenceRef?: string;
  signatureSha256?: string;
}

export interface ReviewerIndependenceApproval {
  approvalId: string;
  actionId: string;
  controlId: string;
  riskTier: ReviewerIndependenceRiskTier;
  requesterId: string;
  requesterRole: string;
  requesterOrgUnit: string;
  reviewerId: string;
  reviewerRole: string;
  reviewerOrgUnit: string;
  separationRuleId: string;
  decision: ReviewerIndependenceDecision;
  decidedAt: string;
  approvalReceiptRef: string;
  approvalSignatureSha256: string;
  conflictCheck?: ReviewerConflictCheck;
  secondReview?: ReviewerSecondReview;
  evidenceRefs: ReviewerIndependenceEvidenceLink[];
  sourceCitationIds?: string[];
}

export interface ReviewerIndependenceRow {
  approvalId: string;
  actionId: string;
  controlId: string;
  riskTier: ReviewerIndependenceRiskTier;
  requesterId: string;
  requesterRole: string;
  requesterOrgUnit: string;
  reviewerId: string;
  reviewerRole: string;
  reviewerOrgUnit: string;
  separationRuleId: string;
  decision: ReviewerIndependenceDecision;
  decidedAt: string;
  approvalReceiptRef: string;
  sourceCitationIds: string[];
  conflictFlags: string[];
  secondReviewerId: string | null;
  secondReviewRequired: boolean;
  roleSeparationPassed: boolean;
  conflictFree: boolean;
  secondReviewSatisfied: boolean;
  evidenceRefs: ReviewerIndependenceEvidenceLink[];
  evidenceChainHash: string;
  rowHash: string;
}

export interface ReviewerIndependenceReceipt {
  receiptId: string;
  generatedAt: string;
  sourceCitations: ReviewerIndependenceSourceCitation[];
  rows: ReviewerIndependenceRow[];
  failClosed: boolean;
  failClosedReasons: string[];
  receiptHash: string;
}

export interface ReviewerIndependenceVerification {
  valid: boolean;
  reasons: string[];
}

const HIGH_RISK_TIERS = new Set<ReviewerIndependenceRiskTier>(["high", "critical"]);

function isSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function rowHash(row: Omit<ReviewerIndependenceRow, "rowHash">): string {
  return sha256Hex(canonicalize(row));
}

function receiptHash(receipt: Omit<ReviewerIndependenceReceipt, "receiptHash">): string {
  return sha256Hex(canonicalize(receipt));
}

function validateEvidenceRefs(approvalId: string, evidenceRefs: ReviewerIndependenceEvidenceLink[], reasons: string[]): void {
  if (evidenceRefs.length === 0) {
    reasons.push(`${approvalId}:evidenceChain:missing`);
    return;
  }
  for (const evidence of evidenceRefs) {
    if (!evidence.eventId || !isSha256(evidence.eventHash) || !evidence.eventType || !evidence.signedEvidenceRef) {
      reasons.push(`${approvalId}:evidenceChain:invalid`);
      return;
    }
  }
}

function conflictFree(conflictCheck: ReviewerConflictCheck | undefined): boolean {
  return Boolean(
    conflictCheck
    && conflictCheck.checkedAt
    && conflictCheck.flags.length === 0
    && !conflictCheck.reviewerIsRequester
    && !conflictCheck.reviewerSharesOrgUnitWithRequester
  );
}

function conflictSignaturePresent(conflictCheck: ReviewerConflictCheck | undefined): boolean {
  return Boolean(conflictCheck?.signedEvidenceRef && isSha256(conflictCheck.signatureSha256));
}

function secondReviewSatisfied(approval: ReviewerIndependenceApproval): boolean {
  if (!HIGH_RISK_TIERS.has(approval.riskTier)) {
    return true;
  }
  const second = approval.secondReview;
  return Boolean(
    second?.required
    && second.reviewerId
    && second.reviewerRole
    && second.decision
    && second.decidedAt
    && second.approvalReceiptRef
    && second.signedEvidenceRef
    && isSha256(second.signatureSha256)
    && second.reviewerId !== approval.reviewerId
    && second.reviewerId !== approval.requesterId
  );
}

function roleSeparationPassed(approval: ReviewerIndependenceApproval): boolean {
  return Boolean(
    approval.separationRuleId
    && approval.reviewerId
    && approval.reviewerRole
    && approval.reviewerOrgUnit
    && approval.reviewerId !== approval.requesterId
    && approval.reviewerRole !== approval.requesterRole
  );
}

export function buildReviewerIndependenceReceipt(input: {
  receiptId: string;
  sourceCitations: ReviewerIndependenceSourceCitation[];
  approvals: ReviewerIndependenceApproval[];
  generatedAt?: string;
}): ReviewerIndependenceReceipt {
  const failClosedReasons: string[] = [];
  const sourceIds = new Set(input.sourceCitations.map((citation) => citation.sourceId).filter(Boolean));
  if (sourceIds.size === 0) {
    failClosedReasons.push("sourceCitations:missing");
  }

  const rows = input.approvals.map((approval): ReviewerIndependenceRow => {
    const citationIds = approval.sourceCitationIds ?? [...sourceIds];
    const roleSeparated = roleSeparationPassed(approval);
    const noConflicts = conflictFree(approval.conflictCheck);
    const secondSatisfied = secondReviewSatisfied(approval);
    const baseRow: Omit<ReviewerIndependenceRow, "rowHash"> = {
      approvalId: approval.approvalId,
      actionId: approval.actionId,
      controlId: approval.controlId,
      riskTier: approval.riskTier,
      requesterId: approval.requesterId,
      requesterRole: approval.requesterRole,
      requesterOrgUnit: approval.requesterOrgUnit,
      reviewerId: approval.reviewerId,
      reviewerRole: approval.reviewerRole,
      reviewerOrgUnit: approval.reviewerOrgUnit,
      separationRuleId: approval.separationRuleId,
      decision: approval.decision,
      decidedAt: approval.decidedAt,
      approvalReceiptRef: approval.approvalReceiptRef,
      sourceCitationIds: citationIds,
      conflictFlags: approval.conflictCheck?.flags ?? [],
      secondReviewerId: approval.secondReview?.reviewerId || null,
      secondReviewRequired: HIGH_RISK_TIERS.has(approval.riskTier),
      roleSeparationPassed: roleSeparated,
      conflictFree: noConflicts,
      secondReviewSatisfied: secondSatisfied,
      evidenceRefs: approval.evidenceRefs,
      evidenceChainHash: sha256Hex(canonicalize(approval.evidenceRefs)),
    };

    if (citationIds.length === 0) {
      failClosedReasons.push(`${approval.approvalId}:sourceCitation:missing`);
    }
    if (citationIds.some((sourceId) => !sourceIds.has(sourceId))) {
      failClosedReasons.push(`${approval.approvalId}:sourceCitation:unknown`);
    }
    if (!approval.separationRuleId) {
      failClosedReasons.push(`${approval.approvalId}:separationRule:missing`);
    }
    if (!roleSeparated) {
      failClosedReasons.push(`${approval.approvalId}:roleSeparation:failed`);
    }
    if (!approval.conflictCheck) {
      failClosedReasons.push(`${approval.approvalId}:conflictCheck:missing`);
    } else {
      if (!noConflicts) {
        failClosedReasons.push(`${approval.approvalId}:conflictCheck:failed`);
      }
      if (!conflictSignaturePresent(approval.conflictCheck)) {
        failClosedReasons.push(`${approval.approvalId}:conflictCheckSignature:missing`);
      }
    }
    if (HIGH_RISK_TIERS.has(approval.riskTier) && !secondSatisfied) {
      failClosedReasons.push(`${approval.approvalId}:secondReview:missing`);
    }
    if (!approval.approvalReceiptRef || !isSha256(approval.approvalSignatureSha256)) {
      failClosedReasons.push(`${approval.approvalId}:approvalReceipt:missing`);
    }
    validateEvidenceRefs(approval.approvalId, approval.evidenceRefs, failClosedReasons);

    return {
      ...baseRow,
      rowHash: rowHash(baseRow),
    };
  });

  if (rows.length === 0) {
    failClosedReasons.push("approvals:missing");
  }

  const withoutHash: Omit<ReviewerIndependenceReceipt, "receiptHash"> = {
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

export function verifyReviewerIndependenceReceipt(
  receipt: ReviewerIndependenceReceipt
): ReviewerIndependenceVerification {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.rows.length === 0) {
    reasons.push("approvals:missing");
  }
  for (const row of receipt.rows) {
    const { rowHash: actualRowHash, ...withoutRowHash } = row;
    if (rowHash(withoutRowHash) !== actualRowHash) {
      reasons.push(`${row.approvalId}:rowHash:mismatch`);
    }
    if (!row.roleSeparationPassed) {
      reasons.push(`${row.approvalId}:roleSeparation:failed`);
    }
    if (!row.conflictFree) {
      reasons.push(`${row.approvalId}:conflictCheck:failed`);
    }
    if (!row.secondReviewSatisfied) {
      reasons.push(`${row.approvalId}:secondReview:missing`);
    }
    if (!row.approvalReceiptRef) {
      reasons.push(`${row.approvalId}:approvalReceipt:missing`);
    }
    validateEvidenceRefs(row.approvalId, row.evidenceRefs, reasons);
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

export function renderReviewerIndependenceAuditExport(receipt: ReviewerIndependenceReceipt): string {
  const lines: string[] = [];
  lines.push("# AMC Reviewer Independence Audit Export");
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
  lines.push("## Reviewer Rows");
  lines.push("");
  lines.push("| Approval | Control | Risk | Reviewer | Separation Rule | Conflicts | Second Review | Evidence chain |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of receipt.rows) {
    const values = [
      row.approvalId,
      row.controlId,
      row.riskTier,
      row.reviewerId || "MISSING",
      row.separationRuleId || "MISSING",
      row.conflictFree ? "none" : row.conflictFlags.join(", ") || "failed",
      row.secondReviewRequired ? row.secondReviewerId || "MISSING" : "not required",
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
