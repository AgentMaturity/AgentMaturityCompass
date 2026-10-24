import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AssurancePackResult, AssuranceReport, EvidenceEvent } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { openLedger } from "../ledger/ledger.js";
import { readUtf8 } from "../utils/fs.js";

/** The existing audit selection/count recipe, shared by compatibility and readonly observations. */
export function countBenchAuditRows(events: readonly Pick<EvidenceEvent, "event_type" | "meta_json">[], auditTypes: readonly string[]): number {
  const auditSet = new Set(auditTypes);
  return events.filter(event => event.event_type === "audit").filter(event => {
    let meta: Record<string, unknown> = {};
    try { const parsed = JSON.parse(event.meta_json) as unknown; if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>; } catch { /* Same inherited malformed metadata treatment. */ }
    const auditType = typeof meta.auditType === "string" ? meta.auditType : null;
    return Boolean(auditType && auditSet.has(auditType));
  }).length;
}

/** Actual independent readonly handle. Never initializes/migrates a ledger or invokes a private signer. */
export function countReadonlyBenchAuditEvents(params: { workspace: string; startTs: number; endTs: number; auditTypes: string[] }): number {
  // Genuine absence is the same empty observation as the old newly-created empty store; it causes no creation now.
  if (lstatSync(join(params.workspace, ".amc", "evidence.sqlite"), { throwIfNoEntry: false }) === undefined) return 0;
  const ledger = openLedger(params.workspace, { readonly: true });
  try { return countBenchAuditRows(ledger.getEventsBetween(params.startTs, params.endTs), params.auditTypes); }
  finally { ledger.close(); }
}

/** Exact assurance timestamp/tie/order recipe without assuranceReportsDir's ensureDir side effect. */
export function latestReadonlyBenchAssuranceByPack(params: { workspace: string; agentId?: string; windowStartTs: number; windowEndTs: number }): Map<string, AssurancePackResult> {
  const agentId = resolveAgentId(params.workspace, params.agentId), reportsDir = join(getAgentPaths(params.workspace, agentId).reportsDir, "assurance");
  if (lstatSync(reportsDir, { throwIfNoEntry: false }) === undefined) return new Map();
  const files = readdirSync(reportsDir).filter(file => file.endsWith(".json")).map(file => join(reportsDir, file)).sort((a, b) => a.localeCompare(b));
  const map = new Map<string, { ts: number; pack: AssurancePackResult }>();
  for (const file of files) { const report = JSON.parse(readUtf8(file)) as AssuranceReport;
    if (report.agentId !== agentId || report.ts < params.windowStartTs || report.ts > params.windowEndTs) continue;
    for (const pack of report.packResults) { const prior = map.get(pack.packId); if (!prior || report.ts > prior.ts) map.set(pack.packId, { ts: report.ts, pack }); }
  }
  return new Map<string, AssurancePackResult>([...map.entries()].map(([packId, row]) => [packId, row.pack]));
}
