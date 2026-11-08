import { eventMeta } from "../claims/evidenceProvenance.js";
import { createOperationalEvidenceVerifier, legacyLedgerRowKeys } from "../keys/operationalLedgerReader.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { verifyRowIntegrity, verifySeal } from "../transparency/sessionRootDescriptor.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { AssuranceScenarioResult, EvidenceEvent } from "../types.js";
import { isExecutedReportPack } from "./executed/reportValidation.js";

/**
 * The one definition of "this scored report is backed by the exchange it graded" (SH-TRUST-02, the pi comparator's
 * deciding item 2). A seal proves who wrote a report; provenance proves the graded rows exist in the writer's own
 * sealed ledger session. Every reader that feeds a pack score forward (compliance, governor, drift, certificates,
 * passports, dashboards) calls this next to `sealedRunReportVerifies`; a report that fails it counts for nothing.
 *
 * A scored row is a graded one (`inconclusive !== true`) of a pack that is not an executed-fixture pack. Its three
 * evidence ids must be the stdin, stdout and test rows the runner wrote for that scenario, in the report's session,
 * sealed, with meta naming the same source, pack, scenario and agent. A pack that claims a score or a pass/fail
 * count with no scored row behind it is refused: a score from missing evidence is the exact thing this gate exists
 * to stop. A report whose every pack claims nothing (all inconclusive, score 0) has nothing to prove and passes.
 *
 * Only the runner session's own rows are verified, O(session) per report, because this gate sits on the governor's
 * per-intent path and must not rehash the whole ledger on every call: each row's hash pre-image and writer signature,
 * its link to the stored row just before it (runner rows carry no session envelope, so their order and enclosure are the
 * global chain's: a reordered, spliced or gapped session fails even under a valid seal), the seal, and the delegated
 * signing authority of exactly those rows under the caller's trust (fix3 S12b). The rest of the ledger-wide chain stays
 * `verifyLedgerIntegrity`'s job, which both runners call at run time.
 *
 * A gateway receipt on a stdout row is extra, not provenance: the runner verified it when the reply arrived and stores
 * only receipts bound to their exchange (`admitGatewayReceipts`), so this gate never re-judges one. An agent under test could otherwise
 * get its own report refused by answering with a bad receipt (fix3 S12).
 */
export type ProvenanceRefusal =
  | "PROVENANCE_MISSING"
  | "PROVENANCE_UNRESOLVED"
  | "PROVENANCE_UNSIGNED_STORE"
  | "PROVENANCE_SESSION_UNSEALED"
  | "PROVENANCE_LEDGER_INVALID";

export type ProvenanceResult = { ok: true } | { ok: false; reason: ProvenanceRefusal; detail: string };

/** Which runner wrote the session and which `meta.source` its rows carry. */
export interface ProvenanceKind {
  binaryPath: "amc-assurance-runner" | "amc-redteam-runner";
  source: "assurance" | "redteam";
}
export const ASSURANCE_PROVENANCE: ProvenanceKind = { binaryPath: "amc-assurance-runner", source: "assurance" };
export const REDTEAM_PROVENANCE: ProvenanceKind = { binaryPath: "amc-redteam-runner", source: "redteam" };

/** The shape both assurance reports and red-team reports share for this check. */
export interface ProvenancedReport {
  agentId?: unknown;
  sessionId?: unknown;
  evidenceStore?: unknown;
  packResults?: unknown;
}

interface PackLike { packId?: unknown; passCount?: unknown; failCount?: unknown; score0to100?: unknown; scenarioResults?: unknown }

function scoredRows(pack: PackLike): AssuranceScenarioResult[] {
  const rows = Array.isArray(pack.scenarioResults) ? (pack.scenarioResults as AssuranceScenarioResult[]) : [];
  return rows.filter((row) => row && typeof row === "object" && row.inconclusive !== true);
}

function claimsAScore(pack: PackLike): boolean {
  const count = (typeof pack.passCount === "number" ? pack.passCount : 0) + (typeof pack.failCount === "number" ? pack.failCount : 0);
  return count > 0 || (typeof pack.score0to100 === "number" && pack.score0to100 > 0);
}

type SessionVerdict = { ok: true } | { ok: false; reason: "PROVENANCE_SESSION_UNSEALED" | "PROVENANCE_LEDGER_INVALID"; detail: string };

/**
 * One ledger handle per reader call, shared across the reports it checks; each runner session is verified once.
 * Close it when the reader is done.
 */
export class ProvenanceChecker {
  private ledger: Ledger | null = null;
  private keys: string[] | null = null;
  private operational: ((rows: readonly EvidenceEvent[]) => string[]) | null = null;
  private readonly sessions = new Map<string, SessionVerdict>();

  constructor(private readonly workspace: string, private readonly options: { ledger?: Ledger; trust?: TrustContext } = {}) {}

  private open(): Ledger { return (this.ledger ??= this.options.ledger ?? openLedger(this.workspace)); }
  private rowKeys(): string[] { return (this.keys ??= legacyLedgerRowKeys(this.workspace)); }
  /** Delegated (provider-bound) row authority under the caller's trust; a no-op for a workspace with no bound provider. */
  private authority(): (rows: readonly EvidenceEvent[]) => string[] {
    return (this.operational ??= createOperationalEvidenceVerifier(this.workspace, { ledger: this.open(), trust: this.options.trust }));
  }

  /** The session's rows in stored order (ledger `rowid`), each with the `event_hash` of the stored row just before it. */
  private sessionRows(sessionId: string): Array<EvidenceEvent & { predecessor_hash: string }> {
    return this.open().db.prepare(`SELECT e.*, COALESCE((SELECT p.event_hash FROM evidence_events p WHERE p.rowid < e.rowid
      ORDER BY p.rowid DESC LIMIT 1), 'GENESIS') AS predecessor_hash FROM evidence_events e WHERE e.session_id = ? ORDER BY e.rowid ASC`)
      .all(sessionId) as Array<EvidenceEvent & { predecessor_hash: string }>;
  }

  /** Is `sessionId` a sealed session of this runner whose rows hash, are signed, link into the chain and end at the seal? */
  private session(sessionId: string, kind: ProvenanceKind): SessionVerdict {
    const cached = this.sessions.get(sessionId);
    if (cached !== undefined) return cached;
    const record = this.open().getSessionById(sessionId);
    let verdict: SessionVerdict;
    if (record === null || record.binary_path !== kind.binaryPath || record.ended_ts === null
      || record.session_final_event_hash === null || record.session_seal_sig === null) {
      verdict = { ok: false, reason: "PROVENANCE_SESSION_UNSEALED", detail: `session ${sessionId} is not a sealed ${kind.binaryPath} session` };
    } else {
      const rows = this.sessionRows(sessionId), keys = this.rowKeys(), errors: string[] = [];
      if (rows.length === 0) errors.push(`session ${sessionId} has no rows`);
      for (const row of rows) {
        verifyRowIntegrity(keys, row, errors);
        if (row.prev_event_hash !== row.predecessor_hash) errors.push(`Event ${row.id} previous hash mismatch`);
      }
      verifySeal(keys, record, rows, sessionId, errors);
      errors.push(...this.authority()(rows));
      verdict = errors.length === 0 ? { ok: true } : { ok: false, reason: "PROVENANCE_LEDGER_INVALID", detail: errors.slice(0, 3).join("; ") };
    }
    this.sessions.set(sessionId, verdict);
    return verdict;
  }

  private rowBacked(row: AssuranceScenarioResult, sessionId: string, agentId: string, packId: string, kind: ProvenanceKind): string | null {
    const ids = row.evidenceEventIds;
    if (!Array.isArray(ids) || ids.length < 3 || ids.slice(0, 3).some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      return `${packId}/${row.scenarioId}: a graded row needs its stdin, stdout and test event ids`;
    }
    const expected = [
      { type: "stdin", direction: "assurance_to_agent" },
      { type: "stdout", direction: "agent_to_assurance" },
      { type: "test", direction: null }
    ] as const;
    for (const [index, want] of expected.entries()) {
      const event = this.open().getEventById(ids[index]!);
      if (!event || event.session_id !== sessionId || event.event_type !== want.type) return `${packId}/${row.scenarioId}: event ${ids[index]} is not the ${want.type} row of its session`;
      const meta = eventMeta(event);
      if (meta.source !== kind.source || meta.packId !== packId || meta.scenarioId !== row.scenarioId || meta.agentId !== agentId
        || (want.direction !== null && meta.direction !== want.direction)) return `${packId}/${row.scenarioId}: event ${ids[index]} names another exchange`;
      if (want.type === "test" && (meta.testType !== "ASSURANCE_SCENARIO_RESULT" || meta.pass !== row.pass)) return `${packId}/${row.scenarioId}: test row disagrees with the graded result`;
    }
    return null;
  }

  check(report: ProvenancedReport, kind: ProvenanceKind = ASSURANCE_PROVENANCE): ProvenanceResult {
    const refuse = (reason: ProvenanceRefusal, detail: string): ProvenanceResult => ({ ok: false, reason, detail });
    if (typeof report.evidenceStore === "string" && report.evidenceStore.length > 0) return refuse("PROVENANCE_UNSIGNED_STORE", "report names an unsigned evidence store");
    const packs = Array.isArray(report.packResults) ? (report.packResults as PackLike[]) : [];
    const agentId = typeof report.agentId === "string" ? report.agentId : "";
    const scored: Array<{ packId: string; row: AssuranceScenarioResult }> = [];
    for (const pack of packs) {
      const packId = typeof pack?.packId === "string" ? pack.packId : "";
      if (packId === "" || isExecutedReportPack(packId)) continue;
      const rows = scoredRows(pack);
      if (rows.length === 0 && claimsAScore(pack)) return refuse("PROVENANCE_MISSING", `${packId}: a score with no graded row behind it`);
      for (const row of rows) scored.push({ packId, row });
    }
    if (scored.length === 0) return { ok: true };
    const sessionId = typeof report.sessionId === "string" && report.sessionId.length > 0 ? report.sessionId : null;
    if (sessionId === null) return refuse("PROVENANCE_MISSING", "report names no ledger session");
    if (agentId === "") return refuse("PROVENANCE_MISSING", "report names no agent");
    try {
      const session = this.session(sessionId, kind);
      if (!session.ok) return refuse(session.reason, session.detail);
      for (const { packId, row } of scored) {
        const problem = this.rowBacked(row, sessionId, agentId, packId, kind);
        if (problem !== null) return refuse("PROVENANCE_UNRESOLVED", problem);
      }
      return { ok: true };
    } catch (error) {
      return refuse("PROVENANCE_LEDGER_INVALID", error instanceof Error ? error.message : String(error));
    }
  }

  close(): void {
    if (this.ledger && !this.options.ledger) this.ledger.close();
    this.ledger = null;
    this.operational = null;
    this.sessions.clear();
  }
}

/** One-shot form for a single report (certificates, CLI verify). */
export function assuranceReportProvenance(workspace: string, report: ProvenancedReport,
  options: { kind?: ProvenanceKind; ledger?: Ledger; trust?: TrustContext } = {}): ProvenanceResult {
  const checker = new ProvenanceChecker(workspace, options);
  try { return checker.check(report, options.kind); } finally { checker.close(); }
}
