/**
 * Library-only, not enforced: parses untrusted text markers and builds traces.
 * A marker is not approval evidence. Canonical execution approval is
 * verifyApprovalForExecution in src/approvals/approvalEngine.ts.
 */
import type { TraceInput } from "./traceLogger.js";

const APPROVAL_TOKEN_RE = /\bAPPROVED_BY_OWNER:([A-Za-z0-9_-]{6,})\b/;

export function extractApprovalToken(text: string): string | null {
  const match = APPROVAL_TOKEN_RE.exec(text);
  return match?.[1] ?? null;
}

/** Detects marker syntax only; it does not verify a signed approval. */
export function hasApprovalTokenMarker(text: string): boolean {
  return extractApprovalToken(text) !== null;
}

/**
 * @deprecated Use hasApprovalTokenMarker for syntax only. This alias does not
 * validate approval; use verifyApprovalForExecution in src/approvals/approvalEngine.ts.
 */
export const hasValidApprovalToken = hasApprovalTokenMarker;

export function withApprovalTrace(params: {
  agentId: string;
  providerId?: string;
  token: string | null;
  note?: string;
}): TraceInput {
  return {
    agentId: params.agentId,
    event: "verification_step",
    providerId: params.providerId,
    note: params.token
      ? `approval token attached (${params.token.slice(0, 4)}***). ${params.note ?? ""}`.trim()
      : `approval token missing. ${params.note ?? ""}`.trim()
  };
}
