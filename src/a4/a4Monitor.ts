/**
 * Activate's monitor record (P1-62 slice C; design §14.4). Each Review writes one, signed `a4-stage-output` under
 * `a4-releases/<projectId>/monitors/<releaseId>/`, and records it as a `monitor` ref: A4 wrote it, so it resolves to lane
 * implementation, self_reported, whatever its sources say. Its body carries one ClaimEnvelope per source, each decided by
 * the eligibility service from that source's own tier (the action journal's rows; approvals per effect, human statements;
 * the freeze incidents; AMC's own check; the SLO state, self_reported with evidence incomplete: in-memory measurements,
 * unsigned), folded with envelopeForAggregate for display. Every field is `{ value, source, trustTier, window }`; a source
 * that is missing is `source_unavailable` with `value: null`, never a default. The action journal's newest row of this
 * agent is named for Review's post-commit step (src/a4/a4Value.ts) to record as its own ledger_event ref, whose lane
 * derives from that row; nothing here labels a lane. The kill switch is not available in this release (P2-26).
 */
import { envelopeForAggregate } from "../claims/eligibility/adapters/results.js";
import { evaluateClaimEligibility } from "../claims/eligibility/evaluate.js";
import type { ClaimEnvelope, ClaimEvidenceTier, ClaimMethod } from "../claims/eligibility/types.js";
import { effectiveTrustTier, eventMeta, readerTrustFor } from "../claims/evidenceProvenance.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { openLedger } from "../ledger/ledger.js";
import { generateSloReport } from "../ops/governanceSlo.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { readReleaseRecord } from "./a4Package.js";
import { latestGate, type A4ReadinessState } from "./a4Readiness.js";
import { blockingExecutionsIn } from "./assembleLockout.js";
import { cycleLinks, monitorResolves, PRODUCTION_LEASE_EFFECT_ID, RELEASE_EFFECT_ID } from "./spec/activate.js";

const MONITOR_SCHEMA = "amc.a4-monitor/v1";
const KILL_SWITCH = "not available in this release (P2-26)";
const SLO_NOTE = "in-memory measurements, unsigned: governanceSlo keeps its state in this process and writes no ledger row";
/** Design §14.4's alert rules, as labelled proposals: nothing here evaluates them. */
const ALERT_RULES = ["pod not ready", "ledger verify failure", "open outcome_unknown", "stale backup", "gateway failures", "/readyz"];

type Window = { readonly from: string; readonly to: string };
interface Field { readonly value: unknown; readonly source: string; readonly trustTier: string | null; readonly window: Window | null; readonly reason?: string }
interface Source { readonly fields: Record<string, Field>; readonly envelope: ClaimEnvelope; readonly available: boolean }
/** A ledger row a monitor source rests on, for Review's post-commit step to record as its own ref. */
export interface MonitorLedgerRef { readonly refId: string; readonly sha256: string; readonly source: string }

const iso = (ts: number): string => new Date(ts).toISOString();
const field = (value: unknown, source: string, trustTier: string | null, window: Window | null): Field => ({ value, source, trustTier, window });
const unavailable = (reason: string): Field => ({ value: null, source: "source_unavailable", trustTier: null, window: null, reason });

/** One source's envelope from the eligibility service: the tiers its rows carry decide its kind, never this module. */
function envelopeOf(producer: string, method: ClaimMethod, tiers: readonly ClaimEvidenceTier[], count: number, newestTs: number | null, now: number,
  review?: { state: "approved"; independent: false }): ClaimEnvelope {
  return evaluateClaimEligibility({ producer, method, regulated: false, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: count, tiers, newestTs, boundToControl: true, sameScope: true, contradictory: false, signatureValid: null, issuerPinned: null },
    ...(review === undefined ? {} : { review }), now });
}

/** The SLO state this process holds (generateSloReport; evaluateSloAlerts is not called, since it advances the shared alert state). */
function sloSource(producer: string, now: number): Source & { measurements: number; report: unknown; sha256: string } {
  const report = generateSloReport();
  const measurements = report.metrics.reduce((sum, metric) => sum + metric.count, 0);
  const window = { from: iso(report.ts - report.windowMs), to: iso(report.ts) };
  const sha256 = sha256Hex(canonicalize(report));
  const base = envelopeOf(`${producer}:slo`, "runtime_observation", ["SELF_REPORTED"], measurements, report.ts, now);
  // Never sufficient: nothing signs these measurements (the diagnostic adapter's EVIDENCE_NOT_CLAIM_READY precedent).
  const envelope = { ...base, statusDimensions: { ...base.statusDimensions, evidence: "incomplete" as const },
    reasons: [...new Set([...base.reasons, "EVIDENCE_NOT_CLAIM_READY" as const])] };
  const none = unavailable(`no SLO measurement in this process's window (${SLO_NOTE})`);
  return { measurements, report, sha256, envelope, available: measurements > 0, fields: measurements > 0
    ? { sloReportSha256: { ...field(sha256, "slo", "SELF_REPORTED", window), reason: SLO_NOTE },
      alerts: field(report.recentAlerts.map((alert) => ({ alertId: alert.alertId, severity: alert.severity, sloId: alert.sloId, status: alert.status, ts: alert.ts })),
        "slo", "SELF_REPORTED", window) }
    : { sloReportSha256: none, alerts: none } };
}

/** The action journal of this agent, read-only: its executions, the open outcome_unknown ones and its newest row's own tier. */
function journalSource(workspace: string, agentId: string, producer: string, now: number): Source & { ledgerRef: MonitorLedgerRef | null } {
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(workspace, { readonly: true });
    const workspaceId = workspaceIdFromDirectory(workspace);
    const blocking = blockingExecutionsIn(ledger.db, workspace, agentId);
    const stats = ledger.db.prepare("SELECT COUNT(*) AS n, MAX(updated_ts) AS newest FROM action_executions WHERE workspace_id = ? AND agent_id = ?")
      .get(workspaceId, agentId) as { n: number; newest: number | null };
    const newest = ledger.db.prepare(`SELECT t.evidence_event_id AS id FROM action_transitions t JOIN action_executions e ON e.execution_id = t.execution_id
      WHERE e.workspace_id = ? AND e.agent_id = ? ORDER BY e.updated_ts DESC, t.seq DESC LIMIT 1`).get(workspaceId, agentId) as { id: string } | undefined;
    const row = newest === undefined ? null : ledger.getEventById(newest.id);
    // A row whose signed meta names another agent never speaks for this one.
    const own = row !== null && (eventMeta(row).agentId ?? eventMeta(row).agent_id) === agentId ? row : null;
    const tier = own === null ? null : effectiveTrustTier(own, readerTrustFor(workspace));
    return { available: true, ledgerRef: own === null ? null : { refId: own.id, sha256: own.event_hash, source: "actionJournal" },
      envelope: envelopeOf(`${producer}:actionJournal`, "runtime_observation", tier === null ? [] : [tier], stats.n, stats.newest, now),
      fields: { openOutcomeUnknown: field(blocking.length, "actionJournal", tier, null), actionExecutions: field(stats.n, "actionJournal", tier, null) } };
  } catch {
    const none = unavailable("the action journal could not be read");
    return { available: false, ledgerRef: null, envelope: envelopeOf(`${producer}:actionJournal`, "runtime_observation", [], 0, null, now),
      fields: { openOutcomeUnknown: none, actionExecutions: none } };
  } finally {
    ledger?.close();
  }
}

/** The counted APPROVEs of each Activate effect's gate (human statements, self_reported; never independent). */
function approvalsSource(state: A4ReadinessState, producer: string, now: number): Source {
  const rows = ([["direction", RELEASE_EFFECT_ID], ["completion", PRODUCTION_LEASE_EFFECT_ID]] as const).map(([gate, effect]) => {
    const row = latestGate(state, "activate", gate);
    const approvals = row === null ? 0 : state.decisions.filter((decision) => decision.gate_id === row.gate_id && decision.request_digest === row.binding_digest
      && (JSON.parse(decision.decision_json) as { decision?: unknown }).decision === "APPROVE_EXECUTE").length;
    return { effect, gateId: row?.gate_id ?? null, approvals };
  });
  const count = rows.reduce((sum, row) => sum + row.approvals, 0);
  return { available: true, envelope: envelopeOf(`${producer}:approvals`, "human_review", ["SELF_REPORTED"], count, null, now, { state: "approved", independent: false }),
    fields: { approvals: field(rows, "approvals", "SELF_REPORTED", null) } };
}

/** The agent's freeze and its incidents as the freeze engine reads them (signed incident files; unreadable ones count as a freeze). */
function freezeSource(workspace: string, agentId: string, producer: string, now: number): Source {
  try {
    const freeze = activeFreezeStatus(workspace, agentId);
    return { available: true, envelope: envelopeOf(`${producer}:freeze`, "runtime_observation", ["SELF_REPORTED"], 1, now, now),
      fields: { freezeStatus: field({ active: freeze.active, incidentIds: freeze.incidentIds, integrityProblems: freeze.integrityProblems.length }, "freeze", "SELF_REPORTED", null) } };
  } catch {
    return { available: false, envelope: envelopeOf(`${producer}:freeze`, "runtime_observation", [], 0, null, now),
      fields: { freezeStatus: unavailable("the freeze state could not be read") } };
  }
}

/** AMC's own newest check of this release's destination (reachability at best before P2-40); A4 recorded it, so self_reported. */
function checkSource(state: A4ReadinessState, releaseId: string, producer: string, now: number): Source {
  const check = cycleLinks(state.chain, "VERIFICATION").filter((link) => link.body.releaseId === releaseId).at(-1);
  if (check === undefined) {
    return { available: false, envelope: envelopeOf(`${producer}:amcCheck`, "executed_test", [], 0, null, now),
      fields: { readyzSnapshot: unavailable("AMC has not checked this release's destination") } };
  }
  return { available: true, envelope: envelopeOf(`${producer}:amcCheck`, "executed_test", ["SELF_REPORTED"], 1, Number(check.body.ts) || null, now),
    fields: { readyzSnapshot: field({ checkId: check.body.checkId, receiptId: check.body.receiptId, amcCheckStatus: check.body.amcCheckStatus,
      reasonCodes: check.body.reasonCodes, resolvedAddress: check.body.resolvedAddress, responseSha256: check.body.responseSha256 }, "amcCheck", "SELF_REPORTED", null) } };
}

/**
 * The monitor record of one review (design §14.4), built from reads only. `note` is what the ref's signed body carries
 * for readiness and the lifecycle bridge: the release, how many sources hold a value, and the SLO measurement count.
 */
export function monitorRecord(workspace: string, state: A4ReadinessState, releaseId: string, now: number): { doc: Record<string, unknown>;
  note: Record<string, unknown>; ledgerRefs: MonitorLedgerRef[] } {
  const { project_id: projectId, agent_id: agentId } = state.project;
  const producer = `a4:${projectId}:monitor:${releaseId}`;
  const slo = sloSource(producer, now);
  const journal = journalSource(workspace, agentId, producer, now);
  const runtime: Source = { available: false, envelope: envelopeOf(`${producer}:runtime`, "runtime_observation", [], 0, null, now),
    fields: { runtimeRunId: unavailable("no lease-bound session has run the deployed runtime; runtimeRunIds stay empty (a receipt never creates a run)") } };
  const backup: Source = { available: false, envelope: envelopeOf(`${producer}:backup`, "executed_test", [], 0, null, now),
    fields: { lastBackupAge: unavailable("verifyBackup needs the backup file; the age of the last backup is not read here") } };
  const sources: Record<string, Source> = { slo, actionJournal: journal, approvals: approvalsSource(state, producer, now), freeze: freezeSource(workspace, agentId, producer, now),
    amcCheck: checkSource(state, releaseId, producer, now), runtime, backup };
  const fields = Object.assign({}, ...Object.values(sources).map((source) => source.fields)) as Record<string, Field>;
  const nonNullSources = Object.values(sources).filter((source) => source.available && Object.values(source.fields).some((entry) => entry.value !== null)).length;
  const envelopes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.envelope]));
  const doc = { schema: MONITOR_SCHEMA, projectId, releaseId, revisionNo: state.project.revision_no, recordedAt: iso(now), fields,
    sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.available ? "ok" : "unavailable"])), envelopes,
    claim: envelopeForAggregate(producer, Object.values(envelopes), now), nonNullSources, sloMeasurements: slo.measurements, sloReport: slo.available ? slo.report : null,
    alertRules: ALERT_RULES.map((rule) => ({ rule, status: "proposal" })), killSwitch: KILL_SWITCH,
    claimKind: "self_reported", lane: "implementation",
    boundary: "A4 wrote this record from what this Studio could read at Review; it is self_reported. A ledger-backed source enters another lane only as its own ledger_event ref." };
  return { doc, note: { releaseId, nonNullSources, sloMeasurements: slo.measurements, sloReportSha256: slo.available ? slo.sha256 : null },
    ledgerRefs: journal.ledgerRef === null ? [] : [journal.ledgerRef] };
}

/** GET …/monitor: the newest monitor record of this cycle's release, read only while it resolves; nothing is recomputed here. */
export function monitorView(workspace: string, state: A4ReadinessState, releaseId: string | null): Record<string, unknown> {
  const link = cycleLinks(state.chain, "EVIDENCE_REF").filter((candidate) => candidate.body.refKind === "monitor" && candidate.body.releaseId === releaseId).at(-1);
  if (link === undefined) return { status: "not_evaluated", reasonCodes: [releaseId === null ? "NO_RELEASE" : "MONITOR_NOT_RECORDED"], monitor: null, killSwitch: KILL_SWITCH };
  const ref = { refId: link.body.refId, sha256: link.body.sha256, seq: link.seq };
  const read = readReleaseRecord(workspace, String(link.body.refId), String(link.body.sha256), "a4-stage-output");
  if ("reason" in read || !monitorResolves(state, link)) {
    return { status: "integrity_failed", reasonCodes: ["MONITOR_REF_UNRESOLVED", ..."reason" in read ? [read.reason] : []], ref, monitor: null, killSwitch: KILL_SWITCH };
  }
  return { status: "recorded", reasonCodes: [], ref, monitor: JSON.parse(read.bytes.toString("utf8")) as Record<string, unknown>, killSwitch: KILL_SWITCH };
}
