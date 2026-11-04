/**
 * Activate's monitor record (P1-62 slice C; design §14.4). Each Review writes one, signed `a4-stage-output` under
 * `a4-releases/<projectId>/monitors/<releaseId>/`, and records it as a `monitor` ref: A4 wrote it, so it resolves to lane
 * implementation, self_reported, whatever its sources say. Its body carries one ClaimEnvelope per source, each decided by
 * the eligibility service from that source's own tier (the action journal's rows; approvals per effect, human statements;
 * the freeze incidents; AMC's own check; the SLO state, self_reported with evidence incomplete: in-memory measurements,
 * unsigned, process-wide, so only summarised, and context only: it labels no agent), folded with envelopeForAggregate for
 * display. Every field is `{ value, source, trustTier, window }`; a source
 * that is missing is `source_unavailable` with `value: null`, never a default. Nothing counts as having observed the
 * deployed agent before the release's succeeded deploy receipt is recorded (the bound one): the journal counts only
 * executions started since that receipt's server-recorded time, outside A4's own probe sessions. The newest such row of
 * this agent is named for Review's post-commit step (src/a4/a4Value.ts) to record as its own ledger_event ref, whose lane
 * derives from that row; nothing here labels a lane. The kill switch field states the hold rule (KILL_SWITCH_HOLD, P2-34).
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
import { ledgerRefClaim } from "./a4Evidence.js";
import { readReleaseRecord } from "./a4Package.js";
import { latestGate, type A4ReadinessState } from "./a4Readiness.js";
import { A4_PROBE_SESSION_PREFIX, type A4ChainLink } from "./a4Schema.js";
import { KILL_SWITCH_HOLD } from "./a4RuntimeLifecycle.js";
import { blockingExecutionsIn } from "./assembleLockout.js";
import { boundReceipt, cycleLinks, monitorResolves, PRODUCTION_LEASE_EFFECT_ID, RELEASE_EFFECT_ID } from "./spec/activate.js";

const MONITOR_SCHEMA = "amc.a4-monitor/v1";
const KILL_SWITCH = KILL_SWITCH_HOLD;
const SLO_NOTE = "in-memory measurements, unsigned: governanceSlo keeps its state in this process and writes no ledger row";
/** governanceSlo's report covers every agent of this Studio and labels none, so it cannot be scoped to one project. */
const SLO_SCOPE = "process_wide: this Studio process's SLO report labels no agent, so it is not scoped to this agent";
const ALERT_SEVERITIES = ["WARN", "CRITICAL", "RECOVERY"] as const;
/** Design §14.4's alert rules, as labelled proposals: nothing here evaluates them. */
const ALERT_RULES = ["pod not ready", "ledger verify failure", "open outcome_unknown", "stale backup", "gateway failures", "/readyz"];

type Window = { readonly from: string; readonly to: string };
interface Field { readonly value: unknown; readonly source: string; readonly trustTier: string | null; readonly window: Window | null; readonly reason?: string }
/**
 * `monitors`: the source observed the deployed agent once its succeeded deploy receipt was recorded (a journal execution
 * started since then at its row's own tier, AMC's check of that receipt that connected and found the destination
 * answering). Only those count toward `nonNullSources`; A4's own approvals, the freeze reading and the process-wide SLO
 * report (it labels no agent and spans no window tied to the receipt) are context.
 */
interface Source { readonly fields: Record<string, Field>; readonly envelope: ClaimEnvelope; readonly available: boolean; readonly monitors: boolean }
/** A ledger row a monitor source rests on, for Review's post-commit step to record as its own ref. */
export interface MonitorLedgerRef { readonly refId: string; readonly sha256: string; readonly source: string }

const iso = (ts: number): string => new Date(ts).toISOString();
const field = (value: unknown, source: string, trustTier: string | null, window: Window | null): Field => ({ value, source, trustTier, window });
const unavailable = (reason: string): Field => ({ value: null, source: "source_unavailable", trustTier: null, window: null, reason });

/** One source's envelope from the eligibility service: the tiers its rows carry decide its kind, never this module; the project's regulated flag as read. */
function envelopeOf(producer: string, method: ClaimMethod, tiers: readonly ClaimEvidenceTier[], count: number, newestTs: number | null, now: number,
  regulated: boolean, review?: { state: "approved"; independent: false }): ClaimEnvelope {
  return evaluateClaimEligibility({ producer, method, regulated, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: count, tiers, newestTs, boundToControl: true, sameScope: true, contradictory: false, signatureValid: null, issuerPinned: null },
    ...(review === undefined ? {} : { review }), now });
}

/**
 * The SLO state this process holds (generateSloReport; evaluateSloAlerts is not called, since it advances the shared alert
 * state). It is context, never a signal of the deployed agent: the report is Studio-wide, labels no agent and is not
 * limited to the time since the bound deploy receipt. This record is served to every project viewer, so it keeps only the
 * report's digest, window, measurement count and overall status and the alerts counted by severity, never the metrics,
 * definitions, violations, alert bodies or the cost-of-trust and ROI figures.
 */
function sloSource(producer: string, now: number, regulated: boolean): Source & { measurements: number; summary: Record<string, unknown>; sha256: string } {
  const report = generateSloReport();
  const measurements = report.metrics.reduce((sum, metric) => sum + metric.count, 0);
  const window = { from: iso(report.ts - report.windowMs), to: iso(report.ts) };
  const sha256 = sha256Hex(canonicalize(report));
  const alertsBySeverity = Object.fromEntries(ALERT_SEVERITIES.map((severity) => [severity, report.recentAlerts.filter((alert) => alert.severity === severity).length]));
  const summary = { scope: "process_wide", scopeNote: SLO_SCOPE, measurements, window, reportSha256: sha256, overallStatus: report.overallStatus };
  const base = envelopeOf(`${producer}:slo`, "runtime_observation", ["SELF_REPORTED"], measurements, report.ts, now, regulated);
  // Never sufficient: nothing signs these measurements (the diagnostic adapter's EVIDENCE_NOT_CLAIM_READY precedent).
  const envelope = { ...base, statusDimensions: { ...base.statusDimensions, evidence: "incomplete" as const },
    reasons: [...new Set([...base.reasons, "EVIDENCE_NOT_CLAIM_READY" as const])] };
  const none = unavailable(`no SLO measurement in this process's window (${SLO_NOTE})`);
  return { measurements, summary, sha256, envelope, available: measurements > 0, monitors: false, fields: measurements > 0
    ? { sloReportSha256: { ...field(sha256, "slo", "SELF_REPORTED", window), reason: `${SLO_NOTE}; ${SLO_SCOPE}` },
      alertCounts: { ...field(alertsBySeverity, "slo", "SELF_REPORTED", window), reason: SLO_SCOPE } }
    : { sloReportSha256: none, alertCounts: none } };
}

/**
 * The action journal of this agent, read-only: the open outcome_unknown executions (agent-wide context) and, from `since`
 * (the bound deploy receipt's server-recorded time; null when none succeeded, which counts nothing), the executions
 * started in that window outside A4's own probe sessions and the newest such row's own tier. A row of a turn A4 ran
 * itself has no tier (ledgerRefClaim), so it never counts.
 */
function journalSource(workspace: string, agentId: string, producer: string, now: number, regulated: boolean, since: number | null): Source & { ledgerRef: MonitorLedgerRef | null } {
  let ledger: ReturnType<typeof openLedger> | null = null;
  try {
    ledger = openLedger(workspace, { readonly: true });
    const workspaceId = workspaceIdFromDirectory(workspace);
    const open = blockingExecutionsIn(ledger.db, workspace, agentId).length;
    if (since === null) {
      return { available: true, monitors: false, ledgerRef: null, envelope: envelopeOf(`${producer}:actionJournal`, "runtime_observation", [], 0, null, now, regulated),
        fields: { openOutcomeUnknown: field(open, "actionJournal", null, null),
          actionExecutions: unavailable("no succeeded deploy receipt of this release is recorded, so no execution is attributed to the deployed agent") } };
    }
    const window = { from: iso(since), to: iso(now) };
    const scope = "e.workspace_id = ? AND e.agent_id = ? AND e.created_ts >= ? AND (e.session_id IS NULL OR substr(e.session_id, 1, ?) <> ?)";
    const params = [workspaceId, agentId, since, A4_PROBE_SESSION_PREFIX.length, A4_PROBE_SESSION_PREFIX];
    const stats = ledger.db.prepare(`SELECT COUNT(*) AS n, MAX(e.updated_ts) AS newest FROM action_executions e WHERE ${scope}`).get(...params) as { n: number; newest: number | null };
    const newest = ledger.db.prepare(`SELECT t.evidence_event_id AS id FROM action_transitions t JOIN action_executions e ON e.execution_id = t.execution_id
      WHERE ${scope} ORDER BY e.updated_ts DESC, t.seq DESC LIMIT 1`).get(...params) as { id: string } | undefined;
    const row = newest === undefined ? null : ledger.getEventById(newest.id);
    // A row whose signed meta names another agent never speaks for this one.
    const own = row !== null && (eventMeta(row).agentId ?? eventMeta(row).agent_id) === agentId ? row : null;
    const tier = own === null ? null : ledgerRefClaim(own, "self_reported", null, effectiveTrustTier(own, readerTrustFor(workspace))).trustTier as ClaimEvidenceTier | null;
    // An execution of this agent since the receipt, at its own row's tier, observed it; a count of 0, or a row with no tier, did not.
    const monitors = stats.n > 0 && tier !== null;
    return { available: true, monitors, ledgerRef: monitors ? { refId: own!.id, sha256: own!.event_hash, source: "actionJournal" } : null,
      envelope: envelopeOf(`${producer}:actionJournal`, "runtime_observation", tier === null ? [] : [tier], stats.n, stats.newest, now, regulated),
      fields: { openOutcomeUnknown: field(open, "actionJournal", tier, null), actionExecutions: field(stats.n, "actionJournal", tier, window) } };
  } catch {
    const none = unavailable("the action journal could not be read");
    return { available: false, monitors: false, ledgerRef: null, envelope: envelopeOf(`${producer}:actionJournal`, "runtime_observation", [], 0, null, now, regulated),
      fields: { openOutcomeUnknown: none, actionExecutions: none } };
  } finally {
    ledger?.close();
  }
}

/** The counted APPROVEs of each Activate effect's gate (human statements, self_reported; never independent). */
function approvalsSource(state: A4ReadinessState, producer: string, now: number, regulated: boolean): Source {
  const rows = ([["direction", RELEASE_EFFECT_ID], ["completion", PRODUCTION_LEASE_EFFECT_ID]] as const).map(([gate, effect]) => {
    const row = latestGate(state, "activate", gate);
    const approvals = row === null ? 0 : state.decisions.filter((decision) => decision.gate_id === row.gate_id && decision.request_digest === row.binding_digest
      && (JSON.parse(decision.decision_json) as { decision?: unknown }).decision === "APPROVE_EXECUTE").length;
    return { effect, gateId: row?.gate_id ?? null, approvals };
  });
  const count = rows.reduce((sum, row) => sum + row.approvals, 0);
  // A4's own gate votes are context, never a signal of the deployed agent.
  return { available: true, monitors: false, envelope: envelopeOf(`${producer}:approvals`, "human_review", ["SELF_REPORTED"], count, null, now, regulated,
    { state: "approved", independent: false }),
    fields: { approvals: field(rows, "approvals", "SELF_REPORTED", null) } };
}

/** The agent's freeze and its incidents as the freeze engine reads them (signed incident files; unreadable ones count as a freeze). */
function freezeSource(workspace: string, agentId: string, producer: string, now: number, regulated: boolean): Source {
  try {
    const freeze = activeFreezeStatus(workspace, agentId);
    // The freeze status reads a value whether or not anything observed the agent: context, not a monitoring signal.
    return { available: true, monitors: false, envelope: envelopeOf(`${producer}:freeze`, "runtime_observation", ["SELF_REPORTED"], 1, now, now, regulated),
      fields: { freezeStatus: field({ active: freeze.active, incidentIds: freeze.incidentIds, integrityProblems: freeze.integrityProblems.length }, "freeze", "SELF_REPORTED", null) } };
  } catch {
    return { available: false, monitors: false, envelope: envelopeOf(`${producer}:freeze`, "runtime_observation", [], 0, null, now, regulated),
      fields: { freezeStatus: unavailable("the freeze state could not be read") } };
  }
}

/**
 * AMC's own newest check of this release's destination (reachability at best before P2-40); A4 recorded it, so
 * self_reported. It observed the deployment only when it checked the bound receipt, connected (a response digest) and
 * found the destination answering; a failed or unconnected check (DESTINATION_MISMATCH, DESTINATION_UNRESOLVED) is context.
 */
function checkSource(state: A4ReadinessState, releaseId: string, receipt: A4ChainLink | null, producer: string, now: number, regulated: boolean): Source {
  const check = cycleLinks(state.chain, "VERIFICATION").filter((link) => link.body.releaseId === releaseId).at(-1);
  if (check === undefined) {
    return { available: false, monitors: false, envelope: envelopeOf(`${producer}:amcCheck`, "executed_test", [], 0, null, now, regulated),
      fields: { readyzSnapshot: unavailable("AMC has not checked this release's destination") } };
  }
  const observed = receipt !== null && check.body.receiptId === receipt.body.deploymentId && typeof check.body.responseSha256 === "string"
    && (check.body.amcCheckStatus === "reachable" || check.body.amcCheckStatus === "passed");
  return { available: true, monitors: observed, envelope: envelopeOf(`${producer}:amcCheck`, "executed_test", ["SELF_REPORTED"], 1, Number(check.body.ts) || null, now, regulated),
    fields: { readyzSnapshot: field({ checkId: check.body.checkId, receiptId: check.body.receiptId, amcCheckStatus: check.body.amcCheckStatus,
      reasonCodes: check.body.reasonCodes, resolvedAddress: check.body.resolvedAddress, responseSha256: check.body.responseSha256 }, "amcCheck", "SELF_REPORTED", null) } };
}

/**
 * The monitor record of one review (design §14.4), built from reads only. `note` is what the ref's signed body carries
 * for readiness and the lifecycle bridge: the release, how many sources observed the deployed agent since its succeeded
 * deploy receipt (A4's own approvals, the freeze reading and the process-wide SLO report never count; none before that
 * receipt), and the SLO measurement count (context). `regulated` is the project's flag as Review read it (fail closed), so no source envelope is decided
 * as unregulated.
 */
export function monitorRecord(workspace: string, state: A4ReadinessState, releaseId: string, now: number, regulated: boolean): { doc: Record<string, unknown>;
  note: Record<string, unknown>; ledgerRefs: MonitorLedgerRef[] } {
  const { project_id: projectId, agent_id: agentId } = state.project;
  const producer = `a4:${projectId}:monitor:${releaseId}`;
  // The bound deploy receipt, recorded succeeded: before it nothing observed a deployed agent (MONITOR_NO_SOURCE).
  const bound = boundReceipt(state.chain, releaseId);
  const receipt = bound?.body.recordedStatus === "succeeded" && typeof bound.body.ts === "number" ? bound : null;
  const slo = sloSource(producer, now, regulated);
  const journal = journalSource(workspace, agentId, producer, now, regulated, receipt === null ? null : Number(receipt.body.ts));
  const runtime: Source = { available: false, monitors: false, envelope: envelopeOf(`${producer}:runtime`, "runtime_observation", [], 0, null, now, regulated),
    fields: { runtimeRunId: unavailable("no lease-bound session has run the deployed runtime; runtimeRunIds stay empty (a receipt never creates a run)") } };
  const backup: Source = { available: false, monitors: false, envelope: envelopeOf(`${producer}:backup`, "executed_test", [], 0, null, now, regulated),
    fields: { lastBackupAge: unavailable("verifyBackup needs the backup file; the age of the last backup is not read here") } };
  const sources: Record<string, Source> = { slo, actionJournal: journal, approvals: approvalsSource(state, producer, now, regulated),
    freeze: freezeSource(workspace, agentId, producer, now, regulated), amcCheck: checkSource(state, releaseId, receipt, producer, now, regulated), runtime, backup };
  const fields = Object.assign({}, ...Object.values(sources).map((source) => source.fields)) as Record<string, Field>;
  const monitoring = Object.entries(sources).filter(([, source]) => source.monitors).map(([name]) => name);
  const nonNullSources = monitoring.length;
  const envelopes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.envelope]));
  const doc = { schema: MONITOR_SCHEMA, projectId, releaseId, revisionNo: state.project.revision_no, recordedAt: iso(now), fields,
    sources: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.available ? "ok" : "unavailable"])), envelopes,
    claim: envelopeForAggregate(producer, Object.values(envelopes), now), nonNullSources, monitoringSources: monitoring, contextSources: ["slo", "approvals", "freeze"],
    observedSince: receipt === null ? null : { deploymentId: receipt.body.deploymentId, recordedAt: iso(Number(receipt.body.ts)) },
    sloMeasurements: slo.measurements, sloSummary: slo.available ? slo.summary : null,
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
