import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ProvenanceChecker, REDTEAM_PROVENANCE, type ProvenanceRefusal } from "../assurance/reportProvenance.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { refusedRunsBlocking, type RefusedRun } from "../diagnostic/runReportResolution.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { EVIL_MCP_PACK_ID } from "./mcpAgentProvider.js";
import type { RedTeamReport } from "./runner.js";

/**
 * Readers of sealed red-team runs (SH-TRUST-03). A run counts only when it was signed, its ledger verified at run time
 * (SIGNED_VALID), its report seal verifies (`sealedRunReportVerifies`, the same discipline as assurance reports) and
 * every graded attack row, Evil MCP scenarios included, resolves to the run's own sealed `amc-redteam-runner` session
 * (`ProvenanceChecker`). An unsigned run (`--no-sign`, the CI default) is local evidence and is never returned here.
 */
export type RedTeamRefusal = "REDTEAM_UNSIGNED" | "REDTEAM_SEAL_INVALID" | `REDTEAM_${ProvenanceRefusal}` | "REDTEAM_UNREADABLE";

/** A refused file with what `refusedRunsBlocking` needs: its claimed time and whether it reads as tampered. */
export interface RefusedRedTeamRun extends RefusedRun { reason: RedTeamRefusal }

export const redTeamReportsDir = (workspace: string, agentId: string): string => join(workspace, ".amc", "redteam", agentId);

/** The report's packs as the provenance check reads them: the plugin packs plus the Evil MCP scenarios as pack `evil-mcp`. */
function provenancedPacks(report: RedTeamReport): unknown[] {
  const evil = report.evilMcp;
  return [...report.pluginResults, ...(evil === undefined ? [] : [{ packId: EVIL_MCP_PACK_ID, passCount: evil.passedScenarios, failCount: evil.failedScenarios,
    score0to100: evil.overallScore0to100, scenarioResults: evil.scenarioResults ?? [] }])];
}

/** Checks one red-team report file; `ok` only when it is signed, sealed and backed by its ledger session. */
export function verifyRedTeamReportFile(workspace: string, file: string, checker?: ProvenanceChecker): { ok: true; report: RedTeamReport } | { ok: false; reason: RedTeamRefusal; detail: string } {
  let report: RedTeamReport;
  try {
    report = JSON.parse(readUtf8(file)) as RedTeamReport;
  } catch (error) {
    return { ok: false, reason: "REDTEAM_UNREADABLE", detail: error instanceof Error ? error.message : String(error) };
  }
  return verifyRedTeamReport(workspace, report, checker);
}

function verifyRedTeamReport(workspace: string, report: RedTeamReport, checker?: ProvenanceChecker): { ok: true; report: RedTeamReport } | { ok: false; reason: RedTeamRefusal; detail: string } {
  if (report?.verification?.signed !== true || report.verification.status !== "SIGNED_VALID") return { ok: false, reason: "REDTEAM_UNSIGNED", detail: "run was not signed, or its ledger did not verify" };
  if (!sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)) return { ok: false, reason: "REDTEAM_SEAL_INVALID", detail: "report hash or artifact-seal signature does not verify" };
  const own = checker ?? new ProvenanceChecker(workspace);
  try {
    const provenance = own.check({ ...report, packResults: provenancedPacks(report) }, REDTEAM_PROVENANCE);
    if (!provenance.ok) return { ok: false, reason: `REDTEAM_${provenance.reason}`, detail: provenance.detail };
  } finally {
    if (checker === undefined) own.close();
  }
  return { ok: true, report };
}

/**
 * This agent's verified red-team runs in the window, newest first, with the files that were refused and why.
 * `blocking` is the subset that must stop a consumer from using `reports[0]` (the same rule as the assurance readers,
 * `refusedRunsBlocking`): a tampered or unreadable file, whose claimed time cannot be trusted, or an honest unsigned run
 * newer than the newest verified one. Tampering with the newest run must never roll a reader back to an older one.
 */
export function verifiedRedTeamReports(params: { workspace: string; agentId: string; windowStartTs: number; windowEndTs: number }):
  { reports: RedTeamReport[]; refused: RefusedRedTeamRun[]; blocking: RefusedRedTeamRun[] } {
  const dir = redTeamReportsDir(params.workspace, params.agentId);
  const out = { reports: [] as RedTeamReport[], refused: [] as RefusedRedTeamRun[], blocking: [] as RefusedRedTeamRun[] };
  if (!pathExists(dir)) return out;
  const checker = new ProvenanceChecker(params.workspace);
  try {
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b))) {
      const file = join(dir, name);
      let report: RedTeamReport | null;
      try { report = JSON.parse(readUtf8(file)) as RedTeamReport | null; } catch { report = null; }
      const ts = typeof report?.ts === "number" && Number.isFinite(report.ts) ? report.ts : null;
      if (report === null || typeof report !== "object" || ts === null) { out.refused.push({ file, reason: "REDTEAM_UNREADABLE", ts: null, tampered: true }); continue; }
      if (report.agentId !== params.agentId || ts < params.windowStartTs || ts > params.windowEndTs) continue;
      const verified = verifyRedTeamReport(params.workspace, report, checker);
      if (!verified.ok) { out.refused.push({ file, reason: verified.reason, ts, tampered: verified.reason !== "REDTEAM_UNSIGNED" }); continue; }
      out.reports.push(report);
    }
  } finally {
    checker.close();
  }
  out.reports.sort((a, b) => b.ts - a.ts);
  out.blocking = refusedRunsBlocking(out.refused, out.reports[0]?.ts ?? null) as RefusedRedTeamRun[];
  return out;
}
