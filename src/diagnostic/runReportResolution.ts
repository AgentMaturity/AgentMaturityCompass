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
import { basename, join } from "node:path";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { resolveRunAlias } from "./runAliases.js";
import { sealedRunReportVerifies } from "./reportSeal.js";
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

/**
 * The agent's run files, oldest name first, in the runs directory the runner writes (getAgentPaths): `.amc/runs` for a
 * root-scoped default agent, `.amc/agents/<id>/runs` otherwise. Every "latest run" reader goes through here.
 */
export function agentRunFiles(workspace: string, agentId: string): string[] {
  const runsDir = getAgentPaths(workspace, agentId).runsDir;
  if (!pathExists(runsDir)) return [];
  return readdirSync(runsDir).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b))
    .map((name) => join(runsDir, name));
}

/** The newest run file's id (its name), or null when the agent has none. */
export function latestRunId(workspace: string, agentId: string): string | null {
  const latest = agentRunFiles(workspace, agentId).at(-1);
  return latest ? basename(latest, ".json") : null;
}

/** The newest run file's summary, for the "Latest run" lines and `--run latest`. */
export function latestRunSummary(workspace: string, agentId: string): { runId: string; integrityIndex: number; trustLabel: string } | null {
  const latest = agentRunFiles(workspace, agentId).at(-1);
  if (!latest) return null;
  try {
    const parsed = JSON.parse(readUtf8(latest)) as { runId?: string; integrityIndex?: number; trustLabel?: string };
    if (!parsed.runId) return null;
    return { runId: parsed.runId, integrityIndex: Number(parsed.integrityIndex ?? 0), trustLabel: String(parsed.trustLabel ?? "UNKNOWN") };
  } catch {
    return null;
  }
}

/** A run file the verifying reader refused: unparseable, unsealed, or sealed but failing (tampered). */
export interface RefusedRun {
  file: string;
  /** The ts the file claims, or null when unreadable. Attacker-controlled: never trusted to place a tampered file in time. */
  ts: number | null;
  /** Unreadable, or it carries a seal that fails: evidence of tampering rather than an honest unsigned run. */
  tampered: boolean;
}

/**
 * The scoring/signing run reader (WP37): the agent's runs whose seal verifies (`sealedRunReportVerifies`), newest
 * first, and every file it refused. Anything that gates, signs or scores reads runs here, not through
 * `agentRunFiles`/`loadRunReport`, which select for display.
 */
export function scanVerifiedRuns(workspace: string, agentId: string): { runs: DiagnosticReport[]; refused: RefusedRun[] } {
  const runs: DiagnosticReport[] = [], refused: RefusedRun[] = [];
  for (const file of agentRunFiles(workspace, agentId)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(readUtf8(file)) as Record<string, unknown>;
    } catch {
      refused.push({ file, ts: null, tampered: true });
      continue;
    }
    if (parsed !== null && typeof parsed === "object" && sealedRunReportVerifies(workspace, parsed)) {
      runs.push(parsed as unknown as DiagnosticReport);
      continue;
    }
    const seal = parsed?.runSealSig;
    refused.push({ file, ts: typeof parsed?.ts === "number" && Number.isFinite(parsed.ts) ? parsed.ts : null,
      tampered: typeof seal === "string" && seal.length > 0 && seal !== "unsigned" });
  }
  runs.sort((a, b) => b.ts - a.ts || b.runId.localeCompare(a.runId));
  return { runs, refused };
}

/** The sealed runs only, newest first; see `scanVerifiedRuns` for the refused files. */
export function listVerifiedRuns(workspace: string, agentId: string): DiagnosticReport[] {
  return scanVerifiedRuns(workspace, agentId).runs;
}

/**
 * Refused runs that block using `selectedTs` as the latest evidence: anything tampered or unreadable (its claimed ts
 * cannot be trusted), and any honest unsigned run newer than the selection. Non-empty means a consumer would roll
 * back to stale evidence, so signing refuses and gates report INSUFFICIENT_EVIDENCE.
 */
export function refusedRunsBlocking(refused: readonly RefusedRun[], selectedTs: number | null): RefusedRun[] {
  return refused.filter((row) => row.tampered || row.ts === null || selectedTs === null || row.ts > selectedTs);
}

/**
 * The newest sealed run for a signing or gating consumer, or null with the refused files that block it: a tampered or
 * newer unverifiable run must not silently roll the consumer back to an older sealed run.
 */
export function latestVerifiedRun(workspace: string, agentId: string): { run: DiagnosticReport | null; blocking: RefusedRun[] } {
  const { runs, refused } = scanVerifiedRuns(workspace, agentId);
  const blocking = refusedRunsBlocking(refused, runs[0]?.ts ?? null);
  return { run: blocking.length > 0 ? null : runs[0] ?? null, blocking };
}

/** `loadRunReport` for scoring and signing: the run, or null when it is missing, unreadable or its seal fails. */
export function loadVerifiedRunReport(workspace: string, runId: string, agentId?: string): DiagnosticReport | null {
  try {
    const report = loadRunReport(workspace, runId, agentId);
    return sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>) ? report : null;
  } catch {
    return null;
  }
}
