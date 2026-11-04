/**
 * The governed agent lifecycle (P2-23, backlog A13): proposed, approved, active, suspended and retired, recorded as
 * signed ledger audit rows (LIFECYCLE_TRANSITION) and materialized in `agent_lifecycle_state`, which admission reads and
 * which `rebuildLifecycleRows` re-derives from the rows alone. The old stage commands (src/lifecycle/lifecycle.ts) keep
 * working unchanged and stay self_reported.
 *
 * Moving to approved, resuming a suspended agent and approving a migrated agent need a P2-24 bound approval (SECURITY
 * class, quorum, the actor never counts) for exactly `{ agentId, to, manifestDigest, planDigest }`. The actor is an
 * authenticated principal (an `amc approvals login` session or a Studio sign-in), never free text, and every time is
 * AMC's clock at the write. A signed row proves AMC recorded the transition, not that the agent is fit to run.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { activeControlPlan } from "../catalog/compiler/activate.js";
import type { CompiledPlan } from "../catalog/compiler/types.js";
import { listAgents } from "../fleet/registry.js";
import { assertRecordApproved, boundApprovalFor, BoundRecordError, raiseRecordApproval, type BoundApproval } from "../governor/boundRecords.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { agentVersionManifestSchema, manifestDigest, type AgentVersionManifest } from "./versionManifest.js";

export const GOVERNANCE_STATES = ["proposed", "approved", "active", "suspended", "retired"] as const;
export type GovernanceState = (typeof GOVERNANCE_STATES)[number];
type LifecycleReason = "registered" | "approval" | "activation" | "resumed" | "legacy_migration" | "reassessment_required"
  | "review_expired" | "manual" | "incident" | "retired";
type LifecycleClaimKind = "self_reported" | "observed";

/** The Layer 0 control whose presence in the active plan makes lifecycle admission enforcing rather than advisory. */
export const LIFECYCLE_CONTROL_ID = "L0-CHG-01";
export const LIFECYCLE_AUDIT = {
  transition: "LIFECYCLE_TRANSITION", reassessment: "LIFECYCLE_REASSESSMENT",
  observed: "LIFECYCLE_MANIFEST_OBSERVED", warning: "LIFECYCLE_ADMISSION_WARNING"
} as const;
const NO_PLAN = "none";

/** Who moved the agent: an authenticated principal, or AMC itself for a trigger it evaluated. */
export interface LifecycleActor { readonly userId: string; readonly username: string; readonly roles: readonly string[]; readonly via: "approvals-session" | "studio-session" | "amc" }
const AMC_ACTOR: LifecycleActor = { userId: "amc", username: "amc", roles: [], via: "amc" };

export interface LifecycleView {
  readonly agentId: string; readonly state: GovernanceState; readonly reason: LifecycleReason; readonly claimKind: LifecycleClaimKind;
  readonly approvalId: string | null; readonly boundManifest: AgentVersionManifest | null; readonly planDigest: string | null;
  readonly reviewDueTs: number | null; readonly reviewAdvisory: boolean; readonly observedManifest: AgentVersionManifest | null;
  readonly lastEventId: string | null; readonly updatedTs: number | null;
  /** No lifecycle row exists: a pre-P2-23 agent, read as active, legacy_migration, self_reported, with nothing bound. */
  readonly implicit: boolean;
}

/** The fields a transition row carries; the row after it is exactly these (see `foldLifecycleEvent`). */
interface TransitionRecord {
  readonly agentId: string; readonly from: GovernanceState | null; readonly to: GovernanceState; readonly reason: LifecycleReason;
  readonly manifestDigest: string | null; readonly planDigest: string | null; readonly approvalId: string | null;
  readonly actor: LifecycleActor; readonly claimKind: LifecycleClaimKind; readonly manifest: AgentVersionManifest | null;
  readonly reviewDueTs: number | null; readonly reviewAdvisory: boolean; readonly note: string | null;
  readonly retirement?: Record<string, unknown>;
}

export class LifecycleError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = "LifecycleError";
  }
}

/** One `agent_lifecycle_state` row. */
export interface LifecycleRow {
  agent_id: string; state: GovernanceState; reason: LifecycleReason; claim_kind: LifecycleClaimKind; approval_id: string | null;
  bound_manifest_json: string | null; plan_digest: string | null; review_due_ts: number | null; review_advisory: number;
  observed_manifest_json: string | null; last_event_id: string; updated_ts: number;
}
const ROW_COLUMNS = "agent_id, state, reason, claim_kind, approval_id, bound_manifest_json, plan_digest, review_due_ts, review_advisory, observed_manifest_json, last_event_id, updated_ts";
/** Matches the partial index of migration 15 term for term, so per-agent reads use it. */
const AUDIT_ROWS = "FROM evidence_events WHERE event_type = 'audit' AND json_valid(meta_json) AND json_extract(meta_json, '$.auditType') = ?";

const ledgerPath = (workspace: string): string => join(workspace, ".amc", "evidence.sqlite");
const parseManifest = (json: string | null): AgentVersionManifest | null => json === null ? null : agentVersionManifestSchema.parse(JSON.parse(json));

function implicitView(agentId: string): LifecycleView {
  return { agentId, state: "active", reason: "legacy_migration", claimKind: "self_reported", approvalId: null, boundManifest: null, planDigest: null,
    reviewDueTs: null, reviewAdvisory: false, observedManifest: null, lastEventId: null, updatedTs: null, implicit: true };
}

function viewOf(row: LifecycleRow): LifecycleView {
  return { agentId: row.agent_id, state: row.state, reason: row.reason, claimKind: row.claim_kind, approvalId: row.approval_id,
    boundManifest: parseManifest(row.bound_manifest_json), planDigest: row.plan_digest, reviewDueTs: row.review_due_ts,
    reviewAdvisory: row.review_advisory === 1, observedManifest: parseManifest(row.observed_manifest_json),
    lastEventId: row.last_event_id, updatedTs: row.updated_ts, implicit: false };
}

/** The row after one LIFECYCLE_* audit row: the live write and the rebuild both go through here. */
function foldLifecycleEvent(row: LifecycleRow | null, event: { id: string; ts: number; meta: Record<string, unknown> }): LifecycleRow | null {
  const meta = event.meta;
  if (meta.auditType === LIFECYCLE_AUDIT.observed) {
    return row === null ? null : { ...row, observed_manifest_json: JSON.stringify(meta.manifest), last_event_id: event.id };
  }
  if (meta.auditType !== LIFECYCLE_AUDIT.transition) return row;
  const record = meta as unknown as TransitionRecord;
  return { agent_id: record.agentId, state: record.to, reason: record.reason, claim_kind: record.claimKind, approval_id: record.approvalId,
    bound_manifest_json: record.manifest === null ? null : JSON.stringify(record.manifest), plan_digest: record.planDigest,
    review_due_ts: record.reviewDueTs, review_advisory: record.reviewAdvisory ? 1 : 0,
    observed_manifest_json: row?.observed_manifest_json ?? null, last_event_id: event.id, updated_ts: event.ts };
}

const ROW_TYPES = [LIFECYCLE_AUDIT.transition, LIFECYCLE_AUDIT.observed] as const;

function latestRowEventId(db: Database.Database, agentId: string): string | null {
  const ids = ROW_TYPES.map((type) => db.prepare(`SELECT id, rowid AS r ${AUDIT_ROWS} AND json_extract(meta_json, '$.agentId') = ? ORDER BY rowid DESC LIMIT 1`)
    .get(type, agentId) as { id: string; r: number } | undefined).filter((row) => row !== undefined);
  return ids.sort((a, b) => b.r - a.r)[0]?.id ?? null;
}

/**
 * The agent's state from the table, cross-checked against its newest lifecycle row in the signed ledger (one indexed read):
 * a row that does not name that event, or rows that exist with no table row, refuse rather than admit.
 */
function readLifecycleView(db: Database.Database, agentId: string): LifecycleView {
  const row = db.prepare(`SELECT ${ROW_COLUMNS} FROM agent_lifecycle_state WHERE agent_id = ?`).get(agentId) as LifecycleRow | undefined;
  const latest = latestRowEventId(db, agentId);
  if ((row?.last_event_id ?? null) !== latest) {
    throw new LifecycleError("lifecycle_state_mismatch", `the lifecycle state of agent ${agentId} does not match its ledger rows; run the rebuild`, 503);
  }
  return row === undefined ? implicitView(agentId) : viewOf(row);
}

/** The lifecycle view of one agent; no ledger yet is a pre-P2-23 agent. Throws when the state cannot be trusted. */
export function lifecycleView(workspace: string, agentId: string): LifecycleView {
  if (!existsSync(ledgerPath(workspace))) return implicitView(agentId);
  const ledger = openLedger(workspace);
  try {
    return readLifecycleView(ledger.db, agentId);
  } finally {
    ledger.close();
  }
}

export interface LifecycleEventRow { readonly id: string; readonly ts: number; readonly meta: Record<string, unknown> }

/** Every lifecycle audit row of `auditType`, oldest first, optionally for one agent. */
export function lifecycleEvents(db: Database.Database, auditType: string, agentId?: string): LifecycleEventRow[] {
  const rows = (agentId === undefined
    ? db.prepare(`SELECT id, ts, meta_json ${AUDIT_ROWS} ORDER BY rowid ASC`).all(auditType)
    : db.prepare(`SELECT id, ts, meta_json ${AUDIT_ROWS} AND json_extract(meta_json, '$.agentId') = ? ORDER BY rowid ASC`).all(auditType, agentId)
  ) as Array<{ id: string; ts: number; meta_json: string }>;
  return rows.map((row) => ({ id: row.id, ts: row.ts, meta: JSON.parse(row.meta_json) as Record<string, unknown> }));
}

/** The table as the signed rows alone define it, sorted by agent id. Compare with `liveLifecycleRows`. */
export function rebuildLifecycleRows(db: Database.Database): LifecycleRow[] {
  const events = db.prepare(`SELECT id, ts, meta_json FROM evidence_events WHERE event_type = 'audit' AND json_valid(meta_json)
    AND json_extract(meta_json, '$.auditType') IN (?, ?) ORDER BY rowid ASC`).all(...ROW_TYPES) as Array<{ id: string; ts: number; meta_json: string }>;
  const rows = new Map<string, LifecycleRow>();
  for (const event of events) {
    const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
    const agentId = String(meta.agentId);
    const next = foldLifecycleEvent(rows.get(agentId) ?? null, { id: event.id, ts: event.ts, meta });
    if (next !== null) rows.set(agentId, next);
  }
  return [...rows.values()].sort((a, b) => a.agent_id.localeCompare(b.agent_id));
}

export function liveLifecycleRows(db: Database.Database): LifecycleRow[] {
  return db.prepare(`SELECT ${ROW_COLUMNS} FROM agent_lifecycle_state ORDER BY agent_id`).all() as LifecycleRow[];
}

function upsert(db: Database.Database, row: LifecycleRow): void {
  db.prepare(`INSERT INTO agent_lifecycle_state (${ROW_COLUMNS}) VALUES (@agent_id, @state, @reason, @claim_kind, @approval_id,
    @bound_manifest_json, @plan_digest, @review_due_ts, @review_advisory, @observed_manifest_json, @last_event_id, @updated_ts)
    ON CONFLICT(agent_id) DO UPDATE SET state = excluded.state, reason = excluded.reason, claim_kind = excluded.claim_kind,
    approval_id = excluded.approval_id, bound_manifest_json = excluded.bound_manifest_json, plan_digest = excluded.plan_digest,
    review_due_ts = excluded.review_due_ts, review_advisory = excluded.review_advisory, observed_manifest_json = excluded.observed_manifest_json,
    last_event_id = excluded.last_event_id, updated_ts = excluded.updated_ts`).run(row);
}

/**
 * Append one signed LIFECYCLE_* audit row (in its own sealed ledger session, AMC's clock) and fold it into the table, in
 * one immediate transaction. `check` runs inside that transaction on the agent's current view and may refuse.
 */
export function appendLifecycleEvent(workspace: string, agentId: string, auditType: string, body: (view: LifecycleView) => Record<string, unknown>):
  { id: string; ts: number; view: LifecycleView; record: Record<string, unknown> } {
  const ledger: Ledger = openLedger(workspace);
  const sessionId = `lifecycle-${randomUUID()}`;
  try {
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-lifecycle", binarySha256: sha256Hex("amc-lifecycle") });
    try {
      return runImmediateTransaction(ledger.db, () => {
        const before = readLifecycleView(ledger.db, agentId);
        const ts = Date.now();
        const record = { ...body(before), auditType, agentId, ts };
        const appended = ledger.appendEvidenceDetailed({ sessionId, runtime: "unknown", eventType: "audit", ts, inline: true, payloadExt: "json",
          payload: JSON.stringify(record), meta: { ...record, trustTier: "OBSERVED" } });
        const prior = ledger.db.prepare(`SELECT ${ROW_COLUMNS} FROM agent_lifecycle_state WHERE agent_id = ?`).get(agentId) as LifecycleRow | undefined;
        const next = foldLifecycleEvent(prior ?? null, { id: appended.id, ts: appended.ts, meta: record });
        if (next !== null && (auditType === LIFECYCLE_AUDIT.transition || auditType === LIFECYCLE_AUDIT.observed)) upsert(ledger.db, next);
        return { id: appended.id, ts: appended.ts, view: next === null ? before : viewOf(next), record };
      });
    } finally {
      ledger.sealSession(sessionId);
    }
  } finally {
    ledger.close();
  }
}

/** Legal moves; `null` is an agent with no lifecycle row yet (registration). Migrated agents re-approve with active → active. */
const LEGAL: Record<GovernanceState | "none", readonly GovernanceState[]> = {
  none: ["proposed"], proposed: ["approved", "retired"], approved: ["active", "retired"], active: ["suspended", "retired"],
  suspended: ["active", "retired"], retired: []
};

function legalMove(view: LifecycleView, to: GovernanceState): { reason: LifecycleReason; needsApproval: boolean } {
  const from = view.implicit ? "none" : view.state;
  const legacyApproval = view.state === "active" && view.reason === "legacy_migration" && view.approvalId === null && to === "active";
  if (view.implicit && to !== "proposed" && !legacyApproval && !LEGAL.active.includes(to)) throw illegal(view, to);
  if (!view.implicit && !legacyApproval && !LEGAL[from].includes(to)) throw illegal(view, to);
  if (legacyApproval) return { reason: "approval", needsApproval: true };
  if (to === "proposed") return { reason: "registered", needsApproval: false };
  if (to === "approved") return { reason: "approval", needsApproval: true };
  if (to === "active") return view.state === "suspended" ? { reason: "resumed", needsApproval: true } : { reason: "activation", needsApproval: false };
  return { reason: to === "retired" ? "retired" : "manual", needsApproval: false };
}

const illegal = (view: LifecycleView, to: GovernanceState): LifecycleError =>
  new LifecycleError("transition_illegal", `agent ${view.agentId} cannot move from ${view.implicit ? "no lifecycle record" : view.state} to ${to}`);

/** The draft a lifecycle approval binds: exactly these four fields. */
function transitionDigest(input: { agentId: string; to: GovernanceState; manifestDigest: string; planDigest: string }): string {
  return sha256Hex(canonicalize({ kind: "lifecycle-transition", agentId: input.agentId, to: input.to, manifestDigest: input.manifestDigest, planDigest: input.planDigest }));
}

/** The active plan's digest, or NO_PLAN; an active plan that does not verify throws. */
function currentPlanDigest(workspace: string, plan: CompiledPlan | null = activeControlPlan(workspace)): string {
  return plan?.digest ?? NO_PLAN;
}

const DAY_MS = 86_400_000;
const CADENCE_DAYS: ReadonlyArray<[RegExp, number]> = [[/\bdaily\b/i, 1], [/\bweekly\b/i, 7], [/\bmonthly\b/i, 30], [/\bquarterly\b/i, 91], [/\b(annual|annually|yearly)\b/i, 365]];

/**
 * When the next review falls due, from the plan's manual-duty cadences: the shortest periodic cadence of a mandatory
 * control, else of an optional one (advisory), else none. Event-driven cadences ("on every release") set no date.
 */
function reviewSchedule(plan: CompiledPlan | null, fromTs: number): { reviewDueTs: number | null; reviewAdvisory: boolean } {
  if (plan === null) return { reviewDueTs: null, reviewAdvisory: false };
  const mandatory = new Map(plan.requirements.map((row) => [row.controlId, row.mandatory]));
  const periods = plan.evidencePlan.manualDuties.flatMap((duty) => {
    const days = CADENCE_DAYS.filter(([pattern]) => pattern.test(duty.cadence)).map(([, n]) => n);
    return days.length === 0 ? [] : [{ days: Math.min(...days), mandatory: mandatory.get(duty.controlId) === true }];
  });
  const pick = (rows: typeof periods): number | null => rows.length === 0 ? null : Math.min(...rows.map((row) => row.days));
  const binding = pick(periods.filter((row) => row.mandatory));
  const advisory = binding === null ? pick(periods) : null;
  const days = binding ?? advisory;
  return { reviewDueTs: days === null ? null : fromTs + days * DAY_MS, reviewAdvisory: binding === null && advisory !== null };
}

/** The manifest a transition binds: the one supplied, else the one AMC observed at the agent's last session open. */
function manifestFor(view: LifecycleView, supplied: AgentVersionManifest | undefined): AgentVersionManifest {
  const manifest = supplied === undefined ? view.observedManifest : agentVersionManifestSchema.parse(supplied);
  if (manifest === null) throw new LifecycleError("manifest_required", `no manifest was observed for agent ${view.agentId}; open a session or supply one`, 400);
  if (manifest.agentId !== view.agentId) throw new LifecycleError("manifest_mismatch", `the manifest names agent ${manifest.agentId}, not ${view.agentId}`, 400);
  return manifest;
}

function assertOwner(actor: LifecycleActor): void {
  if (actor.via === "amc" || !actor.roles.includes("OWNER")) throw new LifecycleError("owner_required", "lifecycle transitions need an authenticated OWNER", 403);
}

/** Raise the bound approval a transition needs (SECURITY quorum); decisions are recorded with `amc approvals decide`. */
export async function requestTransitionApproval(input: { workspace: string; agentId: string; to: GovernanceState; actor: LifecycleActor;
  manifest?: AgentVersionManifest }): Promise<{ approval: BoundApproval; manifestDigest: string; planDigest: string }> {
  assertOwner(input.actor);
  const view = lifecycleView(input.workspace, input.agentId);
  if (!legalMove(view, input.to).needsApproval) throw new LifecycleError("approval_not_needed", `moving agent ${input.agentId} to ${input.to} needs no approval`, 400);
  const digest = manifestDigest(manifestFor(view, input.manifest));
  const planDigest = currentPlanDigest(input.workspace);
  const approval = await raiseRecordApproval(input.workspace, { kind: "lifecycle-transition", recordId: `lc_${randomUUID().replace(/-/g, "")}`,
    digest: transitionDigest({ agentId: input.agentId, to: input.to, manifestDigest: digest, planDigest }), agentId: input.agentId, initiator: input.actor.userId });
  return { approval, manifestDigest: digest, planDigest };
}

export interface TransitionInput {
  workspace: string; agentId: string; to: GovernanceState; actor: LifecycleActor;
  approvalId?: string; manifest?: AgentVersionManifest; note?: string;
  /** Retirement only (src/lifecycle/retirement.ts); never set from a request. */
  retirement?: Record<string, unknown>;
}

/**
 * One owner transition. Retirement goes through retireAgent, which revokes credentials first. Approval-bound moves
 * verify and spend the approval for exactly this agent, target, manifest and active plan before anything is written.
 */
export function transitionAgent(input: TransitionInput): { id: string; ts: number; view: LifecycleView } {
  assertOwner(input.actor);
  if (input.to === "retired" && input.retirement === undefined) throw new LifecycleError("retire_via_retirement", "retire an agent with retireAgent", 400);
  const before = lifecycleView(input.workspace, input.agentId);
  const move = legalMove(before, input.to);
  const plan = activeControlPlan(input.workspace);
  const planDigest = currentPlanDigest(input.workspace, plan);
  let binding: Pick<TransitionRecord, "manifest" | "approvalId" | "planDigest" | "reviewDueTs" | "reviewAdvisory">
    = { manifest: before.boundManifest, approvalId: before.approvalId, planDigest: before.planDigest, reviewDueTs: before.reviewDueTs, reviewAdvisory: before.reviewAdvisory };
  if (move.needsApproval) {
    if (process.env.AMC_NO_SIGN === "1") throw new LifecycleError("signing_required", "AMC_NO_SIGN=1: an approval-bound transition is never recorded unsigned");
    if (input.approvalId === undefined) throw new LifecycleError("approval_required", `moving agent ${input.agentId} to ${input.to} needs a bound approval`, 403);
    const manifest = manifestFor(before, input.manifest);
    try {
      assertRecordApproved(input.workspace, boundApprovalFor(input.workspace, input.agentId, input.approvalId), { kind: "lifecycle-transition",
        recordId: `lc-${input.agentId}-${input.to}-${manifestDigest(manifest).slice(7, 23)}`, mode: "quorum", excluded: [input.actor.userId, input.actor.username],
        digest: transitionDigest({ agentId: input.agentId, to: input.to, manifestDigest: manifestDigest(manifest), planDigest }) });
    } catch (error) {
      if (error instanceof BoundRecordError) throw new LifecycleError(error.code, error.message, 403);
      throw new LifecycleError("approval_mismatch", `approval ${input.approvalId} does not verify for this transition`, 403);
    }
    binding = { manifest, approvalId: input.approvalId, planDigest, ...reviewSchedule(plan, Date.now()) };
  } else if (input.to === "active" && before.planDigest !== planDigest) {
    throw new LifecycleError("plan_changed", `the active plan changed since agent ${input.agentId} was approved; request a new approval`);
  }
  const written = appendLifecycleEvent(input.workspace, input.agentId, LIFECYCLE_AUDIT.transition, (view) => {
    if (view.lastEventId !== before.lastEventId) throw new LifecycleError("state_moved", `agent ${input.agentId} changed state during this transition; retry`);
    return transitionBody(view, { to: input.to, reason: move.reason, actor: input.actor, note: input.note ?? null, binding,
      claimKind: "observed", retirement: input.retirement });
  });
  return { id: written.id, ts: written.ts, view: written.view };
}

function transitionBody(view: LifecycleView, input: { to: GovernanceState; reason: LifecycleReason; actor: LifecycleActor; note: string | null;
  claimKind: LifecycleClaimKind; binding: Pick<TransitionRecord, "manifest" | "approvalId" | "planDigest" | "reviewDueTs" | "reviewAdvisory">;
  retirement?: Record<string, unknown> }): Record<string, unknown> {
  const record: Omit<TransitionRecord, "agentId"> = { from: view.implicit ? null : view.state, to: input.to, reason: input.reason,
    manifestDigest: input.binding.manifest === null ? null : manifestDigest(input.binding.manifest), ...input.binding,
    actor: input.actor, claimKind: input.claimKind, note: input.note, ...(input.retirement === undefined ? {} : { retirement: input.retirement }) };
  return { schema: "amc.lifecycle-transition/v1", ...record };
}

/**
 * Suspend an active agent (a reassessment trigger, an owner, or P2-26's kill switch). Synchronous and approval-free:
 * suspending only ever denies more. A suspension of an agent that is not active is a no-op.
 */
export function suspendAgent(workspace: string, input: { agentId: string; reason: "reassessment_required" | "review_expired" | "manual" | "incident";
  actor?: LifecycleActor; note?: string }): LifecycleView {
  const actor = input.actor ?? AMC_ACTOR;
  if (actor.via !== "amc") assertOwner(actor);
  const written = appendLifecycleEvent(workspace, input.agentId, LIFECYCLE_AUDIT.transition, (view) => {
    if (view.state !== "active") throw new LifecycleError("not_active", `agent ${input.agentId} is ${view.state}`);
    return transitionBody(view, { to: "suspended", reason: input.reason, actor, note: input.note ?? null, claimKind: "observed",
      binding: { manifest: view.boundManifest, approvalId: view.approvalId, planDigest: view.planDigest, reviewDueTs: view.reviewDueTs, reviewAdvisory: view.reviewAdvisory } });
  });
  return written.view;
}

/** Record the manifest a session opened with (governed agents only, on change); the default for the next approval. */
export function recordObservedManifest(workspace: string, manifest: AgentVersionManifest): void {
  appendLifecycleEvent(workspace, manifest.agentId, LIFECYCLE_AUDIT.observed, (view) => {
    // An observation needs a row to fold into; a pre-P2-23 agent is observed only once it is migrated or registered.
    if (view.implicit) throw new LifecycleError("not_governed", `agent ${manifest.agentId} has no lifecycle record`);
    return { manifest, manifestDigest: manifestDigest(manifest) };
  });
}

/**
 * Give every existing agent without a lifecycle row the legacy record: active, legacy_migration, self_reported, nothing
 * bound. Idempotent. Under an enforcing plan such an agent needs a bound approval (active → active) before its next
 * consequential action; elsewhere it keeps running.
 */
export function migrateLegacyAgents(workspace: string, agentIds: readonly string[] = ["default", ...listAgents(workspace).map((agent) => agent.id)]): string[] {
  const migrated: string[] = [];
  for (const agentId of [...new Set(agentIds)]) {
    if (!lifecycleView(workspace, agentId).implicit) continue;
    appendLifecycleEvent(workspace, agentId, LIFECYCLE_AUDIT.transition, (view) => {
      if (!view.implicit) throw new LifecycleError("state_moved", `agent ${agentId} was migrated concurrently`);
      return transitionBody(view, { to: "active", reason: "legacy_migration", actor: AMC_ACTOR, note: null, claimKind: "self_reported",
        binding: { manifest: null, approvalId: null, planDigest: null, reviewDueTs: null, reviewAdvisory: false } });
    });
    migrated.push(agentId);
  }
  return migrated;
}
