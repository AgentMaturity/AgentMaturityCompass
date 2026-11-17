import { latestRunFile } from "../diagnostic/runReportResolution.js";
import { summarizeDiagnosticEvidenceReadiness } from "../diagnostic/evidenceReadiness.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { readUtf8 } from "../utils/fs.js";

interface AgentLatestRunSummary {
  runId: string;
  ts: number;
  integrityIndex: number;
  trustLabel: string;
  status: string;
  /** Whether the run file's seal verifies under this workspace's keys; `status` is what the file says about itself. */
  sealVerified: boolean;
}

export interface AgentStatusResponse {
  agentId: string;
  latestRun: (AgentLatestRunSummary & ReturnType<typeof summarizeDiagnosticEvidenceReadiness>) | null;
}

/** The newest run file's summary for Studio's agent status routes, with whether its seal verifies. */
export function agentLastStatus(workspace: string, agentId: string): AgentStatusResponse {
  const latest = latestRunFile(workspace, agentId);
  if (!latest) {
    return { agentId, latestRun: null };
  }
  const last = JSON.parse(readUtf8(latest)) as Record<string, unknown>;
  return {
    agentId,
    latestRun: {
      runId: String(last.runId ?? ""),
      ts: Number(last.ts ?? 0),
      integrityIndex: Number(last.integrityIndex ?? 0),
      trustLabel: String(last.trustLabel ?? "UNKNOWN"),
      status: String(last.status ?? "INVALID"),
      sealVerified: sealedRunReportVerifies(workspace, last),
      ...summarizeDiagnosticEvidenceReadiness(last as Parameters<typeof summarizeDiagnosticEvidenceReadiness>[0])
    }
  };
}
