/**
 * The evidence a domain assessment may use (P0-15): the agent's latest sealed
 * diagnostic run. Domain-rubric questions have no evidence source yet.
 */
import { envelopeForDiagnosticReport } from "../claims/eligibility/adapters.js";
import type { ClaimEnvelope } from "../claims/eligibility/types.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { resolveRunReport } from "../diagnostic/runReportResolution.js";

export interface DomainEvidence {
  runId: string | null;
  /** questionId → the run's final level (0-5). Null without a sealed run. */
  baseScores: Record<string, number> | null;
  envelope: ClaimEnvelope | null;
  reasons: string[];
}

export function loadDomainEvidence(workspace: string, agentId: string, now = Date.now()): DomainEvidence {
  let resolved: ReturnType<typeof resolveRunReport>;
  try {
    resolved = resolveRunReport(workspace, "latest", agentId);
  } catch {
    return { runId: null, baseScores: null, envelope: null,
      reasons: ["no diagnostic run for this agent; run `amc quickscore` to evaluate the base part"] };
  }
  const report = resolved.report;
  if (!sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)) {
    return { runId: report.runId, baseScores: null, envelope: null,
      reasons: [`run ${report.runId} is not sealed by this workspace's auditor key, so it is not evidence`] };
  }
  const baseScores = Object.fromEntries((report.questionScores ?? []).map((row) => [row.questionId, row.finalLevel]));
  return { runId: report.runId, baseScores, envelope: envelopeForDiagnosticReport(report, now), reasons: [] };
}
