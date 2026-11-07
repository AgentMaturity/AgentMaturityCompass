import { ledgerChainError } from "../catalog/evidence/mappingAdapter.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import { verifyHexDigestAny } from "../crypto/keys.js";
import { legacyLedgerRowKeys } from "../keys/operationalLedgerReader.js";
import { getPurposeKeyHistory } from "../keys/signingKeys.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { verifyReceipt } from "../receipts/receipt.js";
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
 */
export type ProvenanceRefusal =
  | "PROVENANCE_MISSING"
  | "PROVENANCE_UNRESOLVED"
  | "PROVENANCE_UNSIGNED_STORE"
  | "PROVENANCE_SESSION_UNSEALED"
  | "PROVENANCE_LEDGER_INVALID"
  | "PROVENANCE_RECEIPT_INVALID";

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

/**
 * One ledger read per reader call, shared across the reports it checks: the chain is rehashed once, the session
 * seals are verified per session. Close it when the reader is done.
 */
export class ProvenanceChecker {
  private ledger: Ledger | null = null;
  private snapshot: { events: EvidenceEvent[]; keys: string[]; chainError: string | null } | null = null;
  private receiptKeys: string[] | null = null;
  private readonly sessions = new Map<string, boolean>();

  constructor(private readonly workspace: string, private readonly options: { trust?: TrustContext; ledger?: Ledger } = {}) {}

  private load() {
    if (this.snapshot) return this.snapshot;
    this.ledger = this.options.ledger ?? openLedger(this.workspace);
    const keys = legacyLedgerRowKeys(this.workspace);
    const events = this.ledger.getAllEvents();
    // ponytail: rehashes the whole chain once per reader call; cache by verified head hash if readers get hot.
    const chainError = ledgerChainError(events, keys, { workspace: this.workspace, ledger: this.ledger, trust: this.options.trust });
    this.snapshot = { events, keys, chainError };
    return this.snapshot;
  }

  private sealedSession(sessionId: string, kind: ProvenanceKind): boolean {
    const cached = this.sessions.get(sessionId);
    if (cached !== undefined) return cached;
    const { events, keys } = this.load();
    const session = this.ledger!.getSessionById(sessionId);
    const last = events.filter((event) => event.session_id === sessionId).at(-1);
    const ok = session !== null && session.binary_path === kind.binaryPath && session.ended_ts !== null
      && typeof session.session_final_event_hash === "string" && session.session_final_event_hash === last?.event_hash
      && typeof session.session_seal_sig === "string" && verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, keys);
    this.sessions.set(sessionId, ok);
    return ok;
  }

  private rowBacked(row: AssuranceScenarioResult, sessionId: string, agentId: string, packId: string, kind: ProvenanceKind): string | null {
    const ids = row.evidenceEventIds;
    if (!Array.isArray(ids) || ids.length < 3 || ids.slice(0, 3).some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      return `${packId}/${row.scenarioId}: a graded row needs its stdin, stdout and test event ids`;
    }
    const { events } = this.load();
    const expected = [
      { type: "stdin", direction: "assurance_to_agent" },
      { type: "stdout", direction: "agent_to_assurance" },
      { type: "test", direction: null }
    ] as const;
    for (const [index, want] of expected.entries()) {
      const event = events.find((candidate) => candidate.id === ids[index]);
      if (!event || event.session_id !== sessionId || event.event_type !== want.type) return `${packId}/${row.scenarioId}: event ${ids[index]} is not the ${want.type} row of its session`;
      const meta = eventMeta(event);
      if (meta.source !== kind.source || meta.packId !== packId || meta.scenarioId !== row.scenarioId || meta.agentId !== agentId
        || (want.direction !== null && meta.direction !== want.direction)) return `${packId}/${row.scenarioId}: event ${ids[index]} names another exchange`;
      if (want.type === "test" && (meta.testType !== "ASSURANCE_SCENARIO_RESULT" || meta.pass !== row.pass)) return `${packId}/${row.scenarioId}: test row disagrees with the graded result`;
      if (want.type === "stdout" && typeof meta.requestReceipt === "string") {
        const receipt = this.verifyRequestReceipt(meta.requestReceipt, agentId);
        if (receipt !== null) return `${packId}/${row.scenarioId}: ${receipt}`;
      }
    }
    return null;
  }

  /** A gateway request receipt the stdout row carries must verify against this workspace's receipt keys and name the agent. */
  private verifyRequestReceipt(receipt: string, agentId: string): string | null {
    this.receiptKeys ??= (() => { try { return getPurposeKeyHistory(this.workspace, "receipt"); } catch { return []; } })();
    const verified = verifyReceipt(receipt, this.receiptKeys);
    if (!verified.ok || verified.payload === null) return `gateway receipt does not verify (${verified.error ?? "no payload"})`;
    if (verified.payload.agentId !== agentId) return "gateway receipt names another agent";
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
      const { chainError } = this.load();
      if (chainError !== null) return refuse("PROVENANCE_LEDGER_INVALID", chainError);
      if (!this.sealedSession(sessionId, kind)) return refuse("PROVENANCE_SESSION_UNSEALED", `session ${sessionId} is not a sealed ${kind.binaryPath} session`);
      for (const { packId, row } of scored) {
        const problem = this.rowBacked(row, sessionId, agentId, packId, kind);
        if (problem !== null) return refuse(problem.includes("receipt") ? "PROVENANCE_RECEIPT_INVALID" : "PROVENANCE_UNRESOLVED", problem);
      }
      return { ok: true };
    } catch (error) {
      return refuse("PROVENANCE_LEDGER_INVALID", error instanceof Error ? error.message : String(error));
    }
  }

  close(): void {
    if (this.ledger && !this.options.ledger) this.ledger.close();
    this.ledger = null;
    this.snapshot = null;
  }
}

/** One-shot form for a single report (certificates, CLI verify). */
export function assuranceReportProvenance(workspace: string, report: ProvenancedReport, options: { kind?: ProvenanceKind; trust?: TrustContext; ledger?: Ledger } = {}): ProvenanceResult {
  const checker = new ProvenanceChecker(workspace, options);
  try { return checker.check(report, options.kind); } finally { checker.close(); }
}
