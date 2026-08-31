/**
 * Locating a recorded diagnostic run by id or alias ("latest", "prev").
 *
 * Split from runner.ts with G9-02: these readers SELECT which report a command
 * like `amc report latest` displays — they do not score, which is why they are
 * deliberately permissive where scoring consumers go through
 * `sealedRunReportVerifies` instead. Keeping them in their own module keeps
 * that boundary visible.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { resolveRunAlias } from "./runAliases.js";
import type { DiagnosticReport } from "../types.js";

export function loadRunReport(workspace: string, runId: string, agentId?: string): DiagnosticReport {
  const agentPaths = getAgentPaths(workspace, agentId);
  const scopedFile = join(agentPaths.runsDir, `${runId}.json`);
  if (pathExists(scopedFile)) {
    return JSON.parse(readUtf8(scopedFile)) as DiagnosticReport;
  }
  const legacyFile = join(workspace, ".amc", "runs", `${runId}.json`);
  return JSON.parse(readUtf8(legacyFile)) as DiagnosticReport;
}

export interface ResolvedRunReport {
  requestedRunId: string;
  resolvedRunId: string;
  resolvedBy: "exact" | "latest" | "alias" | "prefix";
  alias?: string;
  report: DiagnosticReport;
}

function listRunReportCandidates(workspace: string, agentId?: string): DiagnosticReport[] {
  const resolvedAgentId = resolveAgentId(workspace, agentId);
  const agentPaths = getAgentPaths(workspace, resolvedAgentId);
  const legacyRunsDir = join(workspace, ".amc", "runs");
  const dirs = Array.from(new Set([agentPaths.runsDir, legacyRunsDir]));
  const reports: DiagnosticReport[] = [];

  for (const dir of dirs) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) {
        continue;
      }
      // Deliberately UNVERIFIED: this resolves which report a command like
      // `amc report latest` displays — it selects, it does not score. Refusing
      // unsigned files here would brick lookup on noSign workspaces; scoring
      // consumers go through sealedRunReportVerifies instead (G9-02).
      try {
        const report = JSON.parse(readUtf8(join(dir, file))) as DiagnosticReport;
        if (report.agentId && report.agentId !== resolvedAgentId) {
          continue;
        }
        reports.push(report);
      } catch {
        // Ignore corrupt legacy run files when resolving convenience aliases.
      }
    }
  }

  return reports.sort((a, b) => b.ts - a.ts);
}

export function resolveRunReport(workspace: string, runId: string, agentId?: string): ResolvedRunReport {
  const requestedRunId = runId.trim();
  if (!requestedRunId) {
    throw new Error("runId is required.");
  }

  if (requestedRunId.toLowerCase() === "latest") {
    const reports = listRunReportCandidates(workspace, agentId);
    const report = reports.find((row) => row.status === "VALID") ?? reports[0];
    if (!report) {
      throw new Error(`No diagnostic runs found for agent ${resolveAgentId(workspace, agentId)}.`);
    }
    return {
      requestedRunId,
      resolvedRunId: report.runId,
      resolvedBy: "latest",
      report
    };
  }

  try {
    const report = loadRunReport(workspace, requestedRunId, agentId);
    return {
      requestedRunId,
      resolvedRunId: report.runId,
      resolvedBy: "exact",
      report
    };
  } catch {
    const alias = resolveRunAlias(workspace, requestedRunId, agentId);
    if (alias) {
      try {
        const report = loadRunReport(workspace, alias.runId, agentId);
        return {
          requestedRunId,
          resolvedRunId: report.runId,
          resolvedBy: "alias",
          alias: alias.alias,
          report
        };
      } catch {
        throw new Error(`Run alias "${alias.alias}" points to missing run "${alias.runId}".`);
      }
    }

    const matches = listRunReportCandidates(workspace, agentId).filter((report) => report.runId.startsWith(requestedRunId));
    if (matches.length === 1) {
      return {
        requestedRunId,
        resolvedRunId: matches[0]!.runId,
        resolvedBy: "prefix",
        report: matches[0]!
      };
    }
    if (matches.length > 1) {
      throw new Error(`Run ID prefix "${requestedRunId}" is ambiguous; matched ${matches.length} runs.`);
    }
    throw new Error(`No runId found matching "${requestedRunId}".`);
  }
}
