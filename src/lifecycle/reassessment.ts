/**
 * Reassessment triggers and lifecycle admission (P2-23, backlog A13).
 *
 * At native session open the running components are digested into a version manifest and diffed against the manifest the
 * agent's approval bound. Each change kind is a catalog invalidation trigger (`model_version`, ...); the active plan's
 * controls whose `invalidatedBy` names one are invalidated, and if any is mandatory the agent is suspended
 * (reassessment_required) before the session's first turn, unless a P2-26 change envelope covers the change. A review
 * past its plan-derived due date suspends too (review_expired), or records a warning when only optional controls set it.
 *
 * Admission (P1-02's authorization stage, and every unbound call in the tool pipeline and ToolHub) reads the
 * materialized row only. A suspended or retired agent is denied every action class; an agent not yet active (proposed,
 * approved, migrated without approval) is denied consequential actions only. The message is `agent {id} is {state}
 * ({reason})` and the denial is the call's receipt. Suspended and retired agents are denied in every workspace. For an
 * agent not yet active, where the active plan does not carry LIFECYCLE_CONTROL_ID (or there is no plan) admission is
 * advisory: the call runs and a warning row is written.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { activeControlPlan } from "../catalog/compiler/activate.js";
import type { CompiledPlan } from "../catalog/compiler/types.js";
import { loadAdmittedCatalog } from "../catalog/admission/gate.js";
import type { InvalidationTrigger } from "../catalog/types.js";
import { openLedger } from "../ledger/ledger.js";
import type { ActionClass } from "../types.js";
import {
  appendLifecycleEvent, LIFECYCLE_AUDIT, LIFECYCLE_CONTROL_ID, lifecycleEvents, lifecycleView, recordObservedManifest, suspendAgent,
  transitionAgent, type LifecycleView, type TransitionInput
} from "./governanceLifecycle.js";
import { diffManifests, invalidationTrigger, manifestDigest, unpinnedComponents, type AgentVersionManifest, type ChangeKind } from "./versionManifest.js";

type ReassessmentTrigger = "invalidated_by" | "scheduled" | "manual" | "incident";
type ReassessmentStatus = "open" | "passed" | "failed";

export interface ReassessmentRecord {
  reassessmentId: string; agentId: string; trigger: ReassessmentTrigger; changed: ChangeKind[];
  invalidatedControls: string[]; requiredTests: string[]; status: ReassessmentStatus; createdTs: number; closedTs: number | null;
  /** The manifest the trigger saw, the components it could not pin, and the P2-26 envelope that covered the change. */
  manifestDigest: string | null; unpinned: ChangeKind[]; envelopeId: string | null; approvalId: string | null; note: string | null;
}

/** What reassessment reads from the active plan: requirement decisions, each control's `invalidatedBy`, the evidence plan. */
export interface PlanView {
  readonly plan: Pick<CompiledPlan, "digest" | "requirements" | "evidencePlan">;
  invalidatedBy(controlId: string): readonly InvalidationTrigger[];
}

/** P2-26 plugs its change envelopes in here; until then nothing pre-approves a change. */
export type ChangeEnvelopeLookup = (change: { agentId: string; bound: AgentVersionManifest; current: AgentVersionManifest; changed: readonly ChangeKind[] }) =>
  { readonly envelopeId: string } | null;
const NO_ENVELOPE: ChangeEnvelopeLookup = () => null;

/** The active plan and the shipped catalog's `invalidatedBy`, or null with no active plan. Throws when the plan does not verify. */
function activePlanView(workspace: string): PlanView | null {
  const plan = activeControlPlan(workspace);
  if (plan === null) return null;
  let catalog: ReturnType<typeof loadAdmittedCatalog> | null = null;
  return { plan, invalidatedBy: (controlId) => (catalog ??= loadAdmittedCatalog()).controls.get(controlId)?.invalidatedBy ?? [] };
}

/** The plan's controls a set of change kinds invalidates, which of them are mandatory, and the tests the evidence plan names. */
function invalidatedBy(view: PlanView | null, changed: readonly ChangeKind[]): { invalidatedControls: string[]; mandatory: string[]; requiredTests: string[] } {
  if (view === null || changed.length === 0) return { invalidatedControls: [], mandatory: [], requiredTests: [] };
  const triggers = new Set<string>(changed.map(invalidationTrigger));
  const hit = view.plan.requirements.filter((row) => row.applicability !== "not_applicable" && view.invalidatedBy(row.controlId).some((t) => triggers.has(t)));
  const ids = new Set(hit.map((row) => row.controlId));
  const requiredTests = view.plan.evidencePlan.tests.filter((test) => ids.has(test.controlId) && test.runOn.some((on) => triggers.has(on))).map((test) => test.testId);
  return { invalidatedControls: [...ids].sort(), mandatory: hit.filter((row) => row.mandatory).map((row) => row.controlId).sort(), requiredTests: [...new Set(requiredTests)].sort() };
}

function recordReassessment(workspace: string, agentId: string, fields: Omit<ReassessmentRecord, "reassessmentId" | "agentId" | "createdTs" | "closedTs">
  & { reassessmentId?: string; createdTs?: number }): ReassessmentRecord {
  const written = appendLifecycleEvent(workspace, agentId, LIFECYCLE_AUDIT.reassessment, () => {
    const now = Date.now();
    return { schema: "amc.lifecycle-reassessment/v1", ...fields, reassessmentId: fields.reassessmentId ?? `reas_${randomUUID().replace(/-/g, "")}`,
      createdTs: fields.createdTs ?? now, closedTs: fields.status === "open" ? null : now };
  });
  return written.record as unknown as ReassessmentRecord;
}

/** Every reassessment, each at its latest status, oldest first. */
export function listReassessments(workspace: string, agentId?: string): ReassessmentRecord[] {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return [];
  const ledger = openLedger(workspace);
  try {
    const latest = new Map<string, ReassessmentRecord>();
    for (const row of lifecycleEvents(ledger.db, LIFECYCLE_AUDIT.reassessment, agentId)) {
      const record = row.meta as unknown as ReassessmentRecord;
      latest.set(record.reassessmentId, record);
    }
    return [...latest.values()];
  } finally {
    ledger.close();
  }
}

/** The P1-11 invalidation feed: each change a reassessment saw, as `{ trigger, at, ref }` for EvaluationContext.invalidations. */
export function lifecycleInvalidations(workspace: string, agentId: string): Array<{ trigger: InvalidationTrigger; at: string; ref: string }> {
  return listReassessments(workspace, agentId).filter((row) => row.trigger === "invalidated_by")
    .flatMap((row) => row.changed.map((kind) => ({ trigger: invalidationTrigger(kind), at: new Date(row.createdTs).toISOString(), ref: row.reassessmentId })));
}

function closeOpen(workspace: string, agentId: string, status: "passed" | "failed", approvalId: string | null): void {
  for (const row of listReassessments(workspace, agentId).filter((record) => record.status === "open")) {
    recordReassessment(workspace, agentId, { ...row, status, approvalId });
  }
}

/** An owner transition; resuming closes the open reassessments as passed under the resuming approval. */
export function applyOwnerTransition(input: TransitionInput): ReturnType<typeof transitionAgent> {
  const from = lifecycleView(input.workspace, input.agentId).state;
  const result = transitionAgent(input);
  if (from === "suspended" && input.to === "active") closeOpen(input.workspace, input.agentId, "passed", input.approvalId ?? null);
  return result;
}

/** Retirement fails every reassessment still open. */
export function failOpenReassessments(workspace: string, agentId: string): void {
  closeOpen(workspace, agentId, "failed", null);
}

const alreadyRecorded = (workspace: string, agentId: string, match: (row: ReassessmentRecord) => boolean): boolean =>
  listReassessments(workspace, agentId).some(match);

/** The invalidated_by trigger for an active agent with a bound manifest: suspend, cite an envelope, or record a pass. */
function invalidationTriggerFor(workspace: string, view: LifecycleView, current: AgentVersionManifest, plan: PlanView | null, envelope: ChangeEnvelopeLookup): LifecycleView {
  const bound = view.boundManifest;
  if (bound === null) return view;
  const changed = diffManifests(bound, current);
  const digest = manifestDigest(current);
  if (changed.length === 0 || alreadyRecorded(workspace, view.agentId, (row) => row.trigger === "invalidated_by" && row.manifestDigest === digest
    && row.approvalId === view.approvalId)) return view;
  const hit = invalidatedBy(plan, changed);
  const covered = hit.mandatory.length === 0 ? null : envelope({ agentId: view.agentId, bound, current, changed });
  const suspend = hit.mandatory.length > 0 && covered === null;
  recordReassessment(workspace, view.agentId, { trigger: "invalidated_by", changed, invalidatedControls: hit.invalidatedControls, requiredTests: hit.requiredTests,
    status: suspend ? "open" : "passed", manifestDigest: digest, unpinned: unpinnedComponents(current), envelopeId: covered?.envelopeId ?? null,
    approvalId: view.approvalId, note: suspend ? `mandatory controls invalidated: ${hit.mandatory.join(", ")}` : covered ? "covered by a change envelope" : "no mandatory control invalidated" });
  return suspend ? suspendAgent(workspace, { agentId: view.agentId, reason: "reassessment_required" }) : view;
}

/** The scheduled trigger: an overdue mandatory review suspends; an overdue advisory one records one open warning per approval. */
function scheduledTrigger(workspace: string, view: LifecycleView, now: number): LifecycleView {
  if (view.state !== "active" || view.reviewDueTs === null || now <= view.reviewDueTs) return view;
  if (alreadyRecorded(workspace, view.agentId, (row) => row.trigger === "scheduled" && row.approvalId === view.approvalId)) {
    return view.reviewAdvisory ? view : suspendAgent(workspace, { agentId: view.agentId, reason: "review_expired" });
  }
  recordReassessment(workspace, view.agentId, { trigger: "scheduled", changed: [], invalidatedControls: [], requiredTests: [], status: "open",
    manifestDigest: null, unpinned: [], envelopeId: null, approvalId: view.approvalId,
    note: view.reviewAdvisory ? "advisory review overdue; the agent stays active" : "review overdue" });
  return view.reviewAdvisory ? view : suspendAgent(workspace, { agentId: view.agentId, reason: "review_expired" });
}

export class LifecycleRefusal extends Error {
  readonly code = "AGENT_NOT_ADMITTED" as const;
  constructor(message: string) {
    super(message);
    this.name = "LifecycleRefusal";
  }
}

/** A retired agent opens no session; anything else returns its view. */
export function refuseRetired(workspace: string, agentId: string): LifecycleView {
  const view = lifecycleView(workspace, agentId);
  if (view.state === "retired") throw new LifecycleRefusal(`agent ${view.agentId} is retired (${view.reason})`);
  return view;
}

/**
 * Native session open: a retired agent is refused; a governed agent's manifest is recorded when it changed, then its
 * triggers run, so a suspension lands before the first turn. A pre-P2-23 agent (no row) is untouched: no outage.
 */
export function admitNativeSession(input: { workspace: string; agentId: string; manifest: () => AgentVersionManifest; now?: number;
  plan?: PlanView | null; envelope?: ChangeEnvelopeLookup }): LifecycleView {
  const { workspace } = input;
  let view = refuseRetired(workspace, input.agentId);
  if (view.implicit) return view;
  // Computed only for a governed agent: reading the plan and tools config never refuses a pre-P2-23 agent's session.
  const manifest = input.manifest();
  if (manifest.agentId !== input.agentId) throw new LifecycleRefusal(`the session manifest names agent ${manifest.agentId}, not ${input.agentId}`);
  if (view.observedManifest === null || manifestDigest(view.observedManifest) !== manifestDigest(manifest)) recordObservedManifest(workspace, manifest);
  if (view.state !== "active") return lifecycleView(workspace, manifest.agentId);
  const plan = input.plan === undefined ? activePlanView(workspace) : input.plan;
  view = invalidationTriggerFor(workspace, lifecycleView(workspace, manifest.agentId), manifest, plan, input.envelope ?? NO_ENVELOPE);
  return scheduledTrigger(workspace, view, input.now ?? Date.now());
}

export type AdmissionResult = { readonly ok: true; readonly warning: string | null } | { readonly ok: false; readonly reason: string };

/**
 * Why an agent may not take a consequential action now, or null. Under an enforcing plan a migrated agent needs its
 * approval. An agent never migrated (no row) is not held: every activated plan carries Layer 0, so holding it would stop
 * every existing regulated workspace on upgrade; the operator opts in with migrateLegacyAgents (an open decision for Sid).
 */
function admissionProblem(view: LifecycleView, enforced: boolean): string | null {
  if (view.state !== "active") return `agent ${view.agentId} is ${view.state} (${view.reason})`;
  if (enforced && !view.implicit && view.reason === "legacy_migration" && view.approvalId === null) {
    return `agent ${view.agentId} is active (legacy_migration) without a bound approval; this plan requires one before consequential actions`;
  }
  return null;
}

const LOW_IMPACT: ReadonlySet<ActionClass> = new Set<ActionClass>(["READ_ONLY", "WRITE_LOW"]);

/**
 * Whether lifecycle admission enforces here: the workspace's verified active plan carries LIFECYCLE_CONTROL_ID as an
 * applicable control. Read from the workspace on every decision, never from a caller's context, so every entry point
 * (tool pipeline, ToolHub, provider hooks) decides alike. No active plan: advisory. A plan that cannot be read or
 * verified throws, and the caller denies.
 */
function lifecycleEnforcedIn(workspace: string): boolean {
  return activeControlPlan(workspace)?.requirements.some((row) => row.controlId === LIFECYCLE_CONTROL_ID && row.applicability !== "not_applicable") ?? false;
}

/**
 * Admission at P1-02's authorization stage, from the materialized row. `record` writes what admission decides (an overdue
 * mandatory review's suspension, an advisory warning); the recheck passes false so one call writes once. The plan is read
 * only when the agent could be held, so an active agent's call costs one row read. A state or plan that cannot be read
 * denies, unless the workspace verifiably has no enforcing plan.
 */
export function lifecycleAdmission(workspace: string, agentId: string, options: { record?: boolean; now?: number; actionClass?: ActionClass } = {}): AdmissionResult {
  const record = options.record ?? true;
  const enforcedOrRefusal = (): boolean | AdmissionResult => {
    try {
      return lifecycleEnforcedIn(workspace);
    } catch (error) {
      return { ok: false, reason: `agent ${agentId}: the active plan cannot be verified, so lifecycle admission fails closed (${error instanceof Error ? error.name : "error"})` };
    }
  };
  let view: LifecycleView;
  try {
    view = lifecycleView(workspace, agentId);
    if (record && view.state === "active" && !view.reviewAdvisory && view.reviewDueTs !== null && (options.now ?? Date.now()) > view.reviewDueTs) {
      view = scheduledTrigger(workspace, view, options.now ?? Date.now());
    }
  } catch (error) {
    const enforced = enforcedOrRefusal();
    if (enforced !== false) return enforced === true ? { ok: false, reason: `agent ${agentId} lifecycle state unavailable (${error instanceof Error ? error.name : "error"})` } : enforced;
    return { ok: true, warning: "lifecycle state unavailable" };
  }
  if (admissionProblem(view, true) === null) return { ok: true, warning: null };
  // Reads and low-impact writes stay open only before activation (proposed, approved, migrated without approval);
  // a suspended or retired agent is held for every action class.
  // An explicit suspension or retirement (a person's or an incident's act) denies everywhere, enforcing plan or not.
  if (view.state === "suspended" || view.state === "retired") return { ok: false, reason: `agent ${view.agentId} is ${view.state} (${view.reason})` };
  if (options.actionClass !== undefined && LOW_IMPACT.has(options.actionClass)) return { ok: true, warning: null };
  const enforced = enforcedOrRefusal();
  if (typeof enforced !== "boolean") return enforced;
  const problem = admissionProblem(view, enforced);
  if (problem === null) return { ok: true, warning: null };
  if (enforced) return { ok: false, reason: problem };
  if (record && !view.implicit) {
    appendLifecycleEvent(workspace, agentId, LIFECYCLE_AUDIT.warning, () => ({ schema: "amc.lifecycle-admission-warning/v1", state: view.state, reason: view.reason, problem }));
  }
  return { ok: true, warning: problem };
}
