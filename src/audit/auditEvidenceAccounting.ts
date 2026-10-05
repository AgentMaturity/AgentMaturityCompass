import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export function isAuditEvidenceSha256(value: string | undefined): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function auditTimestampPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function uniqueAuditReasons(values: string[]): string[] {
  return [...new Set(values)];
}

export function auditSignedRefValid(value: { signedEvidenceRef?: string; signatureSha256?: string }): boolean {
  return Boolean(value.signedEvidenceRef && isAuditEvidenceSha256(value.signatureSha256));
}

/** Preserve the every-based domains' access order and sparse-array behavior. */
export function auditEvidenceRefsValid(evidenceRefs: Array<{
  eventId: string; eventHash: string; eventType: string; signedEvidenceRef: string;
}>): boolean {
  return evidenceRefs.length > 0 && evidenceRefs.every((evidence) => (
    Boolean(evidence.eventId)
    && Boolean(evidence.eventType)
    && Boolean(evidence.signedEvidenceRef)
    && isAuditEvidenceSha256(evidence.eventHash)
  ));
}

export function hashAuditEvidence(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

export function collectAuditSourceIds(sourceCitations: Array<{ sourceId: string }>, reasons: string[]): Set<string> {
  const sourceIds = new Set(sourceCitations.map((citation) => citation.sourceId).filter(Boolean));
  if (sourceIds.size === 0) {
    reasons.push("sourceCitations:missing");
  }
  return sourceIds;
}

/** Read the original input fields in receipt order, retaining array identities. */
export function finalizeAuditEvidenceReceipt<Row, Citation>(
  input: { receiptId: string; generatedAt?: string; sourceCitations: Citation[] },
  rows: Row[],
  failClosedReasons: string[]
) {
  const withoutHash = {
    receiptId: input.receiptId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceCitations: input.sourceCitations,
    rows,
    failClosed: failClosedReasons.length > 0,
    failClosedReasons: uniqueAuditReasons(failClosedReasons)
  };
  return { ...withoutHash, receiptHash: hashAuditEvidence(withoutHash) };
}

export function beginAuditReceiptVerification(
  receipt: { failClosed: boolean; failClosedReasons: string[]; sourceCitations: unknown[]; rows: unknown[] },
  missingRowsReason: string
): string[] {
  const reasons: string[] = [];
  if (receipt.failClosed) {
    reasons.push(...receipt.failClosedReasons);
  }
  if (receipt.sourceCitations.length === 0) {
    reasons.push("sourceCitations:missing");
  }
  if (receipt.rows.length === 0) {
    reasons.push(missingRowsReason);
  }
  return reasons;
}

export function finalizeAuditEvidenceExport(lines: string[], receipt: { failClosedReasons: string[] }): string {
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
