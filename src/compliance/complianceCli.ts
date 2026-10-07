import type { ComplianceFramework } from "./frameworks.js";
import type { Station } from "../domains/stations.js";
import { generateComplianceReport, initComplianceMaps, verifyComplianceMapsSignature } from "./complianceEngine.js";
import { writeComplianceReport, diffComplianceReports } from "./complianceReport.js";
import { listAgents } from "../fleet/registry.js";
import { envelopeForComplianceReport } from "../claims/eligibility/adapters/results.js";
import type { ClaimEnvelope } from "../claims/eligibility/types.js";

export function initComplianceMapsCli(workspace: string): { path: string; sigPath: string } {
  return initComplianceMaps(workspace);
}

export function verifyComplianceMapsCli(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return verifyComplianceMapsSignature(workspace);
}

export function complianceReportCli(params: {
  workspace: string;
  framework: ComplianceFramework;
  window: string;
  outFile: string;
  format: "md" | "json";
  agentId?: string;
  station?: Station;
}): {
  outFile: string;
  report: ReturnType<typeof generateComplianceReport>;
} {
  const report = generateComplianceReport({
    workspace: params.workspace,
    framework: params.framework,
    window: params.window,
    agentId: params.agentId,
    station: params.station
  });
  const outFile = writeComplianceReport({
    workspace: params.workspace,
    outFile: params.outFile,
    report,
    format: params.format
  });
  return {
    outFile,
    report
  };
}

export function complianceFleetReportCli(params: {
  workspace: string;
  framework: ComplianceFramework;
  window: string;
}): {
  framework: ComplianceFramework;
  generatedTs: number;
  agents: Array<{
    agentId: string;
    /** Null when no category was evaluated for this agent. */
    score: number | null;
    satisfied: number;
    partial: number;
    missing: number;
    unknown: number;
    notEvaluated: number;
    configTrusted: boolean;
    /** The agent's report claim: no more than its weakest category. */
    claim: ClaimEnvelope;
  }>;
} {
  const agents = [...new Set([...listAgents(params.workspace).map((row) => row.id), "default"])];
  return {
    framework: params.framework,
    generatedTs: Date.now(),
    agents: agents.map((agentId) => {
      const report = generateComplianceReport({
        workspace: params.workspace,
        framework: params.framework,
        window: params.window,
        agentId
      });
      return {
        agentId,
        score: report.coverage.score,
        satisfied: report.coverage.satisfied,
        partial: report.coverage.partial,
        missing: report.coverage.missing,
        unknown: report.coverage.unknown,
        notEvaluated: report.coverage.notEvaluated,
        configTrusted: report.configTrusted,
        claim: envelopeForComplianceReport(report, report.ts)
      };
    })
  };
}

export function complianceDiffCli(a: string, b: string): ReturnType<typeof diffComplianceReports> {
  const reportA = JSON.parse(a) as Parameters<typeof diffComplianceReports>[0];
  const reportB = JSON.parse(b) as Parameters<typeof diffComplianceReports>[1];
  return diffComplianceReports(reportA, reportB);
}
