/**
 * Claim labels for MCP tool results (P0-23). Every successful tool result carries the
 * canonical claim line as text and the claim fields as structuredContent; the kind and
 * dimensions come from the shared service in src/claims/eligibility, never from the tool.
 */
import { claimFields, envelopeForUnboundResult, type ClaimEnvelope, type ClaimMethod } from "../claims/eligibility/index.js";
import { envelopeForStoredRun } from "../claims/eligibility/adapters/results.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { resolveRunReport } from "../diagnostic/runReportResolution.js";

export const CLAIM_KINDS_POINTER = "Claim kinds: see docs/CLAIM_KINDS.md";

/**
 * The result text, then the claim line in its own text block so JSON output stays parseable.
 * Some clients ignore structuredContent without an outputSchema; the text line is the guaranteed label.
 */
export function withClaim(text: string, envelope: ClaimEnvelope, structured: Record<string, unknown> = {}) {
  const fields = claimFields(envelope);
  return {
    content: [
      { type: "text" as const, text },
      { type: "text" as const, text: `${fields.claimLabel}\n${CLAIM_KINDS_POINTER}` }
    ],
    structuredContent: { ...structured, ...fields }
  };
}

/** A result no adapter binds to evidence: not evaluated, never a pass. */
export function unboundClaim(producer: string, method: ClaimMethod, regulated = false): ClaimEnvelope {
  return envelopeForUnboundResult({ producer, method, regulated, now: Date.now() });
}

/** The canonical stored-run claim: legacy and unsealed records cannot become observed through MCP. */
export function agentRunClaim(workspace: string, agentId: string, runId = "latest"): ClaimEnvelope {
  try {
    const { report } = resolveRunReport(workspace, runId, agentId);
    return envelopeForStoredRun(report, {
      sealVerified: sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>),
      now: Date.now()
    });
  } catch {
    return unboundClaim(`diagnostic:${agentId}`, "runtime_observation");
  }
}
