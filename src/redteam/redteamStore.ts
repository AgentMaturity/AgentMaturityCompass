import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ProvenanceChecker, REDTEAM_PROVENANCE, type ProvenanceRefusal } from "../assurance/reportProvenance.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import type { RedTeamReport } from "./runner.js";

/**
 * Readers of sealed red-team runs (SH-TRUST-03). A run counts only when it was signed, its ledger verified at run time
 * (SIGNED_VALID), its report seal verifies (`sealedRunReportVerifies`, the same discipline as assurance reports) and
 * every graded attack row resolves to the run's own sealed `amc-redteam-runner` session (`ProvenanceChecker`).
 * An unsigned run (`--no-sign`, the CI default) is local evidence and is never returned here.
 */
export type RedTeamRefusal = "REDTEAM_UNSIGNED" | "REDTEAM_SEAL_INVALID" | `REDTEAM_${ProvenanceRefusal}` | "REDTEAM_UNREADABLE";

export const redTeamReportsDir = (workspace: string, agentId: string): string => join(workspace, ".amc", "redteam", agentId);

/** Checks one red-team report file; `ok` only when it is signed, sealed and backed by its ledger session. */
export function verifyRedTeamReportFile(workspace: string, file: string, checker?: ProvenanceChecker): { ok: true; report: RedTeamReport } | { ok: false; reason: RedTeamRefusal; detail: string } {
  let report: RedTeamReport;
  try {
    report = JSON.parse(readUtf8(file)) as RedTeamReport;
  } catch (error) {
    return { ok: false, reason: "REDTEAM_UNREADABLE", detail: error instanceof Error ? error.message : String(error) };
  }
  if (report?.verification?.signed !== true || report.verification.status !== "SIGNED_VALID") return { ok: false, reason: "REDTEAM_UNSIGNED", detail: "run was not signed, or its ledger did not verify" };
  if (!sealedRunReportVerifies(workspace, report as unknown as Record<string, unknown>)) return { ok: false, reason: "REDTEAM_SEAL_INVALID", detail: "report hash or artifact-seal signature does not verify" };
  const own = checker ?? new ProvenanceChecker(workspace);
  try {
    const provenance = own.check({ ...report, packResults: report.pluginResults }, REDTEAM_PROVENANCE);
    if (!provenance.ok) return { ok: false, reason: `REDTEAM_${provenance.reason}`, detail: provenance.detail };
  } finally {
    if (checker === undefined) own.close();
  }
  return { ok: true, report };
}

/** This agent's verified red-team runs in the window, newest first, with the files that were refused and why. */
export function verifiedRedTeamReports(params: { workspace: string; agentId: string; windowStartTs: number; windowEndTs: number }):
  { reports: RedTeamReport[]; refused: Array<{ file: string; reason: RedTeamRefusal }> } {
  const dir = redTeamReportsDir(params.workspace, params.agentId);
  const out = { reports: [] as RedTeamReport[], refused: [] as Array<{ file: string; reason: RedTeamRefusal }> };
  if (!pathExists(dir)) return out;
  const checker = new ProvenanceChecker(params.workspace);
  try {
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b))) {
      const file = join(dir, name);
      const verified = verifyRedTeamReportFile(params.workspace, file, checker);
      if (!verified.ok) { out.refused.push({ file, reason: verified.reason }); continue; }
      const { report } = verified;
      if (report.agentId !== params.agentId || typeof report.ts !== "number" || report.ts < params.windowStartTs || report.ts > params.windowEndTs) continue;
      out.reports.push(report);
    }
  } finally {
    checker.close();
  }
  out.reports.sort((a, b) => b.ts - a.ts);
  return out;
}
