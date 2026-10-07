import { readdirSync } from "node:fs";
import { join } from "node:path";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { sealedRunReportVerifies } from "../diagnostic/reportSeal.js";
import { getAgentPaths } from "../fleet/paths.js";
import type { AssurancePackResult, AssuranceReport, EvidenceEvent } from "../types.js";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { ComplianceEvidenceRequirement, ComplianceMapping } from "./mappingSchema.js";

/**
 * Which ledger evidence may count for a compliance control (P0-17, gap G21). An event counts only
 * when it is bound to the control, belongs to the subject, and (checked by the engine) comes from an
 * admitted producer inside the window. Coincidental event types prove nothing.
 */

export type BindingScope = "agent" | "workspace";
export type SubjectRole = "positive" | "violation-only" | "none";

/** The audit type of an `audit` event: payload first, then meta. */
export function auditTypeOf(event: EvidenceEvent): string | null {
  if (event.event_type !== "audit") return null;
  try {
    const parsed = event.payload_inline ? (JSON.parse(event.payload_inline) as Record<string, unknown>) : {};
    if (typeof parsed.auditType === "string" && parsed.auditType.length > 0) return parsed.auditType;
  } catch {
    // fall back to meta
  }
  const meta = eventMeta(event);
  return typeof meta.auditType === "string" ? meta.auditType : null;
}

/** True when `meta.controlIds` names the mapping, or an audit event's type is in the requirement's `auditTypes`. */
export function isBoundToControl(
  event: EvidenceEvent,
  mapping: Pick<ComplianceMapping, "id">,
  requirement: ComplianceEvidenceRequirement
): boolean {
  const controlIds = eventMeta(event).controlIds;
  if (Array.isArray(controlIds) && controlIds.includes(mapping.id)) return true;
  if (requirement.type !== "requires_evidence_event" || !requirement.auditTypes) return false;
  const auditType = auditTypeOf(event);
  return auditType !== null && requirement.auditTypes.includes(auditType);
}

/**
 * Workspace `system` session events (diagnostic findings) are positive evidence only for a
 * workspace-scoped control; for an agent they can only count against it. An event without an
 * agent id belongs to nobody.
 */
export function subjectRole(event: EvidenceEvent, agentId: string, scope: BindingScope): SubjectRole {
  if (event.session_id === "system") return scope === "workspace" ? "positive" : "violation-only";
  return eventMeta(event).agentId === agentId ? "positive" : "none";
}

export interface VerifiedAssurance {
  packs: Map<string, AssurancePackResult>;
  /** The sealed run each entry of `packs` came from: its id, its time and its verified seal hash. */
  runs: Map<string, { runId: string; ts: number; reportSha256: string }>;
  /**
   * In-window reports (or unreadable files) whose hash, seal or ledger integrity did not verify; they count for nothing.
   * `sha256` is of the file bytes.
   */
  unverifiable: Array<{ file: string; packIds: string[]; sha256: string }>;
}

function readReport(file: string): { report: Partial<AssuranceReport> | null; sha256: string } {
  let text = "";
  try {
    text = readUtf8(file);
    const parsed: unknown = JSON.parse(text);
    return { report: parsed && typeof parsed === "object" ? (parsed as Partial<AssuranceReport>) : null, sha256: sha256Hex(text) };
  } catch {
    return { report: null, sha256: sha256Hex(text) };
  }
}

/**
 * The window logic of `latestAssuranceByPack`, but a report counts only when its seal verifies
 * (`sealedRunReportVerifies`), the run itself verified (status VALID, verificationPassed) and it
 * measured something (evidenceStatus MEASURED; a missing or unknown status counts for nothing).
 */
export function verifiedAssuranceByPack(params: {
  workspace: string;
  agentId: string;
  windowStartTs: number;
  windowEndTs: number;
}): VerifiedAssurance {
  const out: VerifiedAssurance = { packs: new Map(), runs: new Map(), unverifiable: [] };
  const dir = join(getAgentPaths(params.workspace, params.agentId).reportsDir, "assurance");
  if (!pathExists(dir)) return out;
  const latest = new Map<string, { ts: number; pack: AssurancePackResult; runId: string; reportSha256: string }>();
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort((a, b) => a.localeCompare(b))) {
    const file = join(dir, name);
    const { report, sha256 } = readReport(file);
    if (!report) {
      out.unverifiable.push({ file, packIds: [], sha256 });
      continue;
    }
    if (report.agentId !== params.agentId || typeof report.ts !== "number"
      || report.ts < params.windowStartTs || report.ts > params.windowEndTs) continue;
    const packResults = Array.isArray(report.packResults) ? report.packResults : [];
    // A seal proves who wrote the report, not that the run was sound: the runner seals INVALID runs too.
    if (!sealedRunReportVerifies(params.workspace, report as Record<string, unknown>)
      || report.status !== "VALID" || report.verificationPassed !== true) {
      out.unverifiable.push({ file, packIds: packResults.map((pack) => String(pack?.packId)), sha256 });
      continue;
    }
    if (report.evidenceStatus !== "MEASURED") continue;
    for (const pack of packResults) {
      const prior = latest.get(pack.packId);
      if (!prior || report.ts > prior.ts) {
        latest.set(pack.packId, { ts: report.ts, pack, runId: String(report.assuranceRunId), reportSha256: String(report.reportJsonSha256) });
      }
    }
  }
  for (const [packId, row] of latest) {
    out.packs.set(packId, row.pack);
    out.runs.set(packId, { runId: row.runId, ts: row.ts, reportSha256: row.reportSha256 });
  }
  return out;
}
