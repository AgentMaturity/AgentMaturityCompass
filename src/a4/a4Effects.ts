/**
 * A4 effects (P1-57 slice A; design §6.1, §6.5). An effect gate is a second, separately decided approval-engine
 * request that the owner opens explicitly; `complete` consumes the documentary gate and writes GATE_CONSUMED +
 * EFFECT_STARTED + the a4_effects liveness row in one transaction after re-checking every counted engine decision
 * against A4's separation of duties and the project's membership (the engine request is decidable from
 * /console/approvals by any APPROVER, so its own fold is not trusted). The executor runs after commit, outside the
 * project lock: step 0 consumes the engine grant (for `consumes: "A4"`), then the shared preamble re-reads the freeze
 * and read-only facts and recomputes every bound resource slot before anything is touched. Orphans are swept by
 * owner liveness and heartbeat, never by a wall-clock bound alone. Stage lanes register the executors; none lives here.
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { ownerAlive } from "../actions/actionJournal.js";
import { DEFAULT_ACTION_STALE_AFTER_MS } from "../actions/actionRecovery.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalConsumed } from "../approvals/approvalChainStore.js";
import { approvalStatusPayload, consumeApprovedExecution, createApprovalForIntent, verifyApprovalForExecution, type ApprovalRequestInput } from "../approvals/approvalEngine.js";
import { assertOwnerMode } from "../mode/mode.js";
import type { ActionClass } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  A4_RUNTIME, assertAllowed, autoHold, consumeGate, driftedSlots, effectOwnerLost, engineRiskTier, evaluateFor, gateRowOf, governed, livePrincipal, loadA4State,
  signedA4Floor, withFullIntegrity, type A4Call
} from "./a4Gates.js";
import { assertMember, liveRolesFor } from "./a4Identity.js";
import { gateStatus, isRegulated, type A4GateRow, type A4ReadinessState } from "./a4Readiness.js";
import type { A4ChainLink, A4Principal, A4RefKind, A4Stage } from "./a4Schema.js";
import { buildersOf, evaluateSod, type SodDecision } from "./a4SoD.js";
import { ensureA4Stages } from "./a4Stages.js";
import { A4StoreError, refreshVolatileFacts, type A4Store, type A4TransitionResult } from "./a4Store.js";

const HEARTBEAT_MS = 5_000;

export interface A4EffectContext {
  readonly workspace: string;
  readonly state: A4ReadinessState;
  readonly gate: A4GateRow;
  readonly executionId: string;
  readonly approvalRequestId: string;
  /** Extra heartbeat for long steps; the runner already beats every 5 s. */
  readonly heartbeat: () => void;
}
export interface A4EffectOutcome {
  /** Recorded on EFFECT_FINISHED as an implementation-lane, self_reported ref. */
  readonly receipt?: { readonly refKind: A4RefKind; readonly refId: string; readonly sha256: string; readonly label: string };
  /** `consumes: "executor"` only: the engine's consumed record's executionId (design §6.1). */
  readonly consumedExecutionId?: string;
}
/** One effect a stage lane registers (design §6.1 table). */
export interface A4EffectDef {
  readonly id: string;
  readonly toolName: string;
  readonly actionClass: ActionClass;
  /** "A4": the runner consumes the engine grant as step 0. "executor": the executor consumes it itself and is never retried. */
  readonly consumes: "A4" | "executor";
  /**
   * The documentary gate whose consumption runs this effect: the only gate it may be opened on, and `complete` refuses to
   * consume that gate without it. An effect without one cannot be opened.
   */
  readonly completes?: `${A4Stage}.${"direction" | "completion"}`;
  /** Deterministic from the rows, e.g. `a4-apply-<manifestId>`. */
  readonly executionId: (state: A4ReadinessState, gate: A4GateRow) => string;
  /** The engine intent; the default binds the documentary gate's binding digest and the execution id. */
  readonly intent?: (state: A4ReadinessState, gate: A4GateRow) => Record<string, unknown>;
  /** Opens the engine request when createApprovalForIntent does not fit (activate_plan: signPlan({ requestReview, quorumFloor })). */
  readonly openRequest?: (ctx: { workspace: string; state: A4ReadinessState; gate: A4GateRow; intentPayload: Record<string, unknown>;
    quorumFloor: ApprovalRequestInput["quorumFloor"] }) => string;
  readonly run: (ctx: A4EffectContext) => Promise<A4EffectOutcome>;
}

const EFFECTS = new Map<string, A4EffectDef>();
export function registerA4Effect(def: A4EffectDef): void {
  if (EFFECTS.has(def.id)) throw new Error(`A4 effect ${def.id} is already registered`);
  EFFECTS.set(def.id, def);
}

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const randomId = (prefix: string): string => `${prefix}_${randomBytes(16).toString("hex")}`;
/** A registered effect, after the stage lanes registered theirs. */
const lookupEffect = (id: string): A4EffectDef | undefined => {
  ensureA4Stages();
  return EFFECTS.get(id);
};
const effectDef = (id: string): A4EffectDef => {
  const def = lookupEffect(id);
  if (def === undefined) throw fail(404, "A4_EFFECT_UNKNOWN", `no A4 effect ${id} is registered`);
  return def;
};
const effectIntent = (def: A4EffectDef, state: A4ReadinessState, gate: A4GateRow): Record<string, unknown> =>
  def.intent?.(state, gate) ?? { schema: "amc.a4-effect-intent/v1", projectId: state.project.project_id, gateId: gate.gate_id, effect: def.id,
    bindingDigest: gate.binding_digest, executionId: def.executionId(state, gate) };
const latestOpened = (state: A4ReadinessState, gateId: string, effect: string): A4ChainLink | undefined =>
  [...state.chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.gateId === gateId && link.body.effect === effect);
const startedLink = (chain: readonly A4ChainLink[], attemptId: string): A4ChainLink => {
  const link = chain.find((candidate) => candidate.kind === "EFFECT_STARTED" && candidate.body.effectId === attemptId);
  if (link === undefined) throw fail(404, "A4_EFFECT_NOT_FOUND", `no effect attempt ${attemptId}`);
  return link;
};

/**
 * Re-open is allowed only while the previous engine request is EXPIRED or CANCELLED, or after an executor that consumes
 * its own grant failed (activateControlPlan: the only path after its failure); never over a live or consumed grant.
 */
function assertReopenable(store: A4Store, state: A4ReadinessState, gate: A4GateRow, def: A4EffectDef): void {
  const opened = latestOpened(state, gate.gate_id, def.id);
  if (opened === undefined) return;
  const approvalId = String(opened.body.approvalRequestId);
  const status = approvalStatusPayload({ workspace: store.workspace, agentId: state.project.agent_id, approvalId }).status;
  const executorFailed = def.consumes === "executor" && state.chain.some((link) => link.kind === "EFFECT_FAILED" && link.body.approvalRequestId === approvalId);
  if (status !== "EXPIRED" && status !== "CANCELLED" && !executorFailed) throw fail(409, "EFFECT_GATE_OPEN", `the effect's engine request is ${status}`, { approvalRequestId: approvalId });
}

/**
 * Opens (or re-opens) an effect gate (owner): a second engine request, created with `quorumFloor { requiredApprovals: 2,
 * requireDistinctUsers: true }` when the project is regulated, and an EFFECT_GATE_OPENED transition naming it. Only on
 * the gate the effect `completes`, named under its own stage: `complete` runs whatever effect is opened on the gate, so
 * any other effect would stand in for the stage's own (409 A4_STEP_ORDER).
 * ponytail: the engine request is written before the project lock (files and a signature); one whose transition then
 * fails stays PENDING until it expires and is never consumed.
 */
export function openEffectGate(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; effectId: string; gateId: string;
  expectedHeadSeq: number }): A4TransitionResult {
  const def = effectDef(input.effectId);
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 complete");
  const now = Date.now();
  const state0 = loadA4State(store, projectId, now);
  const gate0 = gateRowOf(state0, input.gateId);
  if (gate0.stage !== input.stage || def.completes !== `${gate0.stage}.${gate0.gate}`) {
    throw fail(409, "A4_STEP_ORDER", `effect ${def.id} is not opened on the ${gate0.stage} ${gate0.gate} gate`);
  }
  assertReopenable(store, state0, gate0, def);
  const intentPayload = effectIntent(def, state0, gate0);
  const quorumFloor = isRegulated(state0, signedA4Floor(store.workspace)) ? { requiredApprovals: 2, requireDistinctUsers: true } : undefined;
  const approvalRequestId = def.openRequest?.({ workspace: store.workspace, state: state0, gate: gate0, intentPayload, quorumFloor })
    ?? createApprovalForIntent({ workspace: store.workspace, agentId: state0.project.agent_id, intentId: `a4-${projectId}-${def.id}-${gate0.gate_id}`,
      toolName: def.toolName, actionClass: def.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: engineRiskTier(state0),
      intentPayload, quorumFloor }).approval.approvalRequestId;
  return governed(store, projectId, principal, input, (_ts, load) => {
    const state = load(now);
    const row = gateRowOf(state, input.gateId);
    const { readiness, query } = evaluateFor(store, state, principal, input, row.stage, now);
    assertAllowed(readiness, "openEffect");
    const gate = gateStatus(state, row, query.policy, now);
    const consumedForExecutor = gate.status === "CONSUMED" && def.consumes === "executor";
    if (gate.status !== "QUORUM_MET" && !consumedForExecutor) throw fail(409, "A4_NOT_READY", `the documentary gate is ${gate.status}`, { reasonCodes: ["GATE_PENDING"] });
    assertReopenable(store, state, row, def);
    return { readiness, specs: { kind: "EFFECT_GATE_OPENED", stage: row.stage, revisionNo: row.revision_no,
      payload: { gateId: row.gate_id, effect: def.id, approvalRequestId, intentHash: sha256Hex(canonicalize(intentPayload)) } } };
  });
}

/** An engine decision's userId as a principal with its plane: users.yaml or a live host session, exactly one, live roles. */
function resolveApprover(workspace: string, userId: string): Pick<A4Principal, "key" | "username" | "roles" | "authSource"> | null {
  const local = liveRolesFor(workspace, { authSource: "LOCAL_USER", userId });
  const router = liveRolesFor(workspace, { authSource: "WORKSPACE_ROUTER", userId });
  if ((local.length > 0) === (router.length > 0)) return null;
  const authSource = local.length > 0 ? "LOCAL_USER" : "WORKSPACE_ROUTER";
  return { key: `${authSource}:${userId}`, username: userId, roles: local.length > 0 ? local : router, authSource };
}

/**
 * Design §6.1 steps 1–3, inside the consume transaction: the engine grant verifies for this exact intent; every
 * APPROVE_EXECUTE resolves to one live principal and plane, holds no recorded role it no longer has, is a project
 * approver or owner and passes A4's SoD with the gate's exclusions plus the `complete` caller and every builder of the
 * revision (else 400 SOD_VIOLATION); only decisions bound to the request's digest count, and a regulated effect needs
 * two distinct keys in one plane (else 409 EFFECT_QUORUM_INSUFFICIENT) and takes LOCAL_USER decisions only (else 403
 * IDENTITY_CHECK_LIMITED, as on documentary gates). Returns the counted keys.
 */
export function verifyAndConsumeEffect(store: A4Store, state: A4ReadinessState, input: { def: A4EffectDef; gate: A4GateRow; approvalRequestId: string;
  callerKey: string; regulated: boolean }): string[] {
  const { workspace } = store;
  const agentId = state.project.agent_id;
  const verified = verifyApprovalForExecution({ workspace, approvalId: input.approvalRequestId, expectedAgentId: agentId,
    expectedIntentHash: sha256Hex(canonicalize(effectIntent(input.def, state, input.gate))), expectedToolName: input.def.toolName, expectedActionClass: input.def.actionClass });
  if (!verified.ok || verified.approval === null) throw fail(409, "EFFECT_QUORUM_INSUFFICIENT", verified.error ?? "the effect is not approved");
  const binding = approvalRequestBindingDigest(verified.approval);
  const excludedKeys = [...(JSON.parse(input.gate.excluded_keys_json) as string[]), ...buildersOf(state.chain, input.gate.revision_no)];
  const counted: SodDecision[] = [];
  const checked: SodDecision[] = [];
  for (const decision of listApprovalDecisions({ workspace, agentId, approvalRequestId: input.approvalRequestId })) {
    if (decision.decision !== "APPROVE_EXECUTE") continue;
    const refuse = (why: string): A4StoreError => fail(400, "SOD_VIOLATION", `${decision.username}: ${why}`);
    const approver = resolveApprover(workspace, decision.userId);
    if (approver === null) throw refuse("the approver does not resolve to exactly one live principal");
    // The documentary rule (recordDecision): a session record is not a live check, so a regulated effect counts no host session.
    if (input.regulated && approver.authSource !== "LOCAL_USER") {
      throw fail(403, "IDENTITY_CHECK_LIMITED", `${decision.username}: a regulated effect takes decisions from live-checked identities only (host sessions wait for P2-33)`);
    }
    if (!decision.roles.every((role) => approver.roles.includes(role))) throw refuse("recorded roles exceed the approver's live roles");
    try {
      assertMember(state.members, approver, ["approver", "owner"]);
    } catch {
      throw refuse("not an approver or owner of this project");
    }
    const sod = evaluateSod({ gate: { gateId: input.gate.gate_id, gate: input.gate.gate, revisionNo: input.gate.revision_no,
      requesterKeys: [input.gate.requested_by_key, input.callerKey], excludedKeys }, decisions: checked, transitions: state.chain,
      regulated: input.regulated, selfApprovalAllowed: false, approver, effect: true });
    if (!sod.ok) throw refuse(sod.violations.map((rule) => rule === "one_plane" ? "CROSS_PLANE" : rule).join(", "));
    const entry: SodDecision = { approverKey: approver.key, authSource: approver.authSource, decision: "APPROVE_EXECUTE" };
    checked.push(entry);
    if (decision.requestDigestSha256 === binding) counted.push(entry);
  }
  const keys = [...new Set(counted.map((entry) => entry.approverKey))];
  if (keys.length < Math.max(verified.approval.requiredApprovals, input.regulated ? 2 : 1)) {
    throw fail(409, "EFFECT_QUORUM_INSUFFICIENT", `two_person_for_effects: ${keys.length} bound approval(s) from distinct project approvers`);
  }
  return keys;
}

/**
 * `complete` for a stage whose completion triggers an effect (design §6.5): GATE_CONSUMED (with the resolved effect
 * approver keys) + EFFECT_STARTED (owner pid/host, heartbeat, engine request id, execution id) + the a4_effects row, in
 * one transaction. The caller then runs `runA4Effect(store, projectId, attemptId)` after the response, outside the lock.
 */
export function completeWithEffect(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; gateId: string; effectId: string;
  expectedHeadSeq: number }): { result: A4TransitionResult; attemptId: string } {
  const def = effectDef(input.effectId);
  const attemptId = randomId("a4e");
  const result = consumeGate(store, projectId, { ...input, response: { attemptId } }, ({ state, row, principal, regulated, ts }) => {
    const opened = latestOpened(state, row.gate_id, def.id);
    if (opened === undefined) throw fail(409, "EFFECT_GATE_NOT_OPEN", "An owner opens the effect gate before completing this stage.");
    const approvalRequestId = String(opened.body.approvalRequestId);
    const keys = verifyAndConsumeEffect(store, state, { def, gate: row, approvalRequestId, callerKey: principal.key, regulated });
    const executionId = def.executionId(state, row);
    return { payload: { effect: def.id, effectApproverKeys: keys }, specs: [{ kind: "EFFECT_STARTED", stage: row.stage, revisionNo: row.revision_no,
      payload: { effectId: attemptId, effect: def.id, gateId: row.gate_id, executionId, approvalRequestId, ownerPid: process.pid, ownerHost: hostname(), heartbeatTs: ts },
      startEffect: { effectId: attemptId, gateId: row.gate_id, executionId, approvalRequestId } }] };
  });
  return { result, attemptId };
}

/**
 * `complete` on a gate already consumed, after an effect whose executor consumes its own grant failed and an owner
 * re-opened its effect gate (design §6.1: the only path after an activateControlPlan failure). The new engine request is
 * verified as at consumption (verifyAndConsumeEffect) and only EFFECT_STARTED is written: the documentary gate is never
 * consumed twice. Without a failure before that re-open, or once it has run, it is 409 A4_GATE_STALE (consumed).
 */
function rerunExecutorEffect(store: A4Store, projectId: string, def: A4EffectDef, input: A4Call & { stage: A4Stage; gateId: string;
  expectedHeadSeq: number }): { result: A4TransitionResult; attemptId: string } {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 complete");
  const now = Date.now();
  const attemptId = randomId("a4e");
  const call = withFullIntegrity(store, projectId, input);
  const result = governed(store, projectId, principal, { ...input, response: { attemptId } }, (ts, load) => {
    const state = load(now);
    const row = gateRowOf(state, input.gateId);
    if (row.stage !== input.stage) throw fail(409, "A4_STEP_ORDER", "That gate does not complete this stage.");
    const opened = latestOpened(state, row.gate_id, def.id);
    const attempts = state.chain.filter((link) => link.kind === "EFFECT_STARTED" && link.body.gateId === row.gate_id && link.body.effect === def.id);
    const outcomes = state.chain.filter((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED")
      && attempts.some((start) => start.body.effectId === link.body.effectId));
    if (opened === undefined || outcomes.length < attempts.length || outcomes.some((link) => link.kind === "EFFECT_FINISHED")
      || !outcomes.some((link) => link.kind === "EFFECT_FAILED" && link.seq < opened.seq) || attempts.some((start) => start.seq > opened.seq)) {
      throw fail(409, "A4_GATE_STALE", "consumed", { supersededBy: "GATE_CONSUMED", moved: ["consumed"] });
    }
    const { readiness, query } = evaluateFor(store, state, principal, call, row.stage, now);
    assertAllowed(readiness, "retryEffect");
    if (row.revision_no !== state.project.revision_no) throw fail(409, "A4_GATE_STALE", "the gate is bound to an earlier revision", { moved: ["revision"] });
    const approvalRequestId = String(opened.body.approvalRequestId);
    const keys = verifyAndConsumeEffect(store, state, { def, gate: row, approvalRequestId, callerKey: principal.key, regulated: isRegulated(state, query.floor) });
    const executionId = def.executionId(state, row);
    return { readiness, specs: { kind: "EFFECT_STARTED", stage: row.stage, revisionNo: row.revision_no,
      payload: { effectId: attemptId, effect: def.id, gateId: row.gate_id, executionId, approvalRequestId, effectApproverKeys: keys, rerunOf: opened.seq,
        ownerPid: process.pid, ownerHost: hostname(), heartbeatTs: ts },
      startEffect: { effectId: attemptId, gateId: row.gate_id, executionId, approvalRequestId } } };
  });
  return { result, attemptId };
}

/**
 * `complete` (design §6.5; the body names no effect): the effect is the one an owner opened on this gate
 * (EFFECT_GATE_OPENED), else a registered effect that `completes` it (refused EFFECT_GATE_NOT_OPEN until opened); a gate
 * with neither is consumed plainly. consumeGate re-checks the opened row inside its transaction (EFFECT_REQUIRED). On a
 * consumed gate whose re-opened effect consumes its own grant, it re-runs that effect (`rerunExecutorEffect`).
 */
export function completeStage(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; gateId: string; expectedHeadSeq: number }): {
  result: A4TransitionResult; attemptId: string | null;
} {
  const chain = store.readChain(projectId);
  const requested = chain.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === input.gateId);
  const opened = [...chain].reverse().find((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.gateId === input.gateId);
  ensureA4Stages();
  const openedDef = opened === undefined ? undefined : EFFECTS.get(String(opened.body.effect));
  if (openedDef?.consumes === "executor" && chain.some((link) => link.kind === "GATE_CONSUMED" && link.body.gateId === input.gateId)) {
    return rerunExecutorEffect(store, projectId, openedDef, input);
  }
  const effectId = opened !== undefined ? String(opened.body.effect)
    : [...EFFECTS.values()].find((def) => requested !== undefined && def.completes === `${String(requested.body.stage)}.${String(requested.body.gate)}`)?.id;
  if (effectId === undefined) return { result: consumeGate(store, projectId, input), attemptId: null };
  return completeWithEffect(store, projectId, { ...input, effectId });
}

/** EFFECT_FINISHED / EFFECT_FAILED by amc-runtime, settling the liveness row in the same transaction; once per attempt. */
function settleEffect(store: A4Store, projectId: string, attemptId: string, kind: "EFFECT_FINISHED" | "EFFECT_FAILED", payload: Record<string, unknown>,
  receipt?: A4EffectOutcome["receipt"]): A4TransitionResult {
  return store.transition(projectId, A4_RUNTIME, ({ seq, ts }) => {
    const chain = store.readChain(projectId);
    const started = startedLink(chain, attemptId);
    if (chain.some((link) => (link.kind === "EFFECT_FINISHED" || link.kind === "EFFECT_FAILED") && link.body.effectId === attemptId)) {
      throw fail(409, "EFFECT_SETTLED", `effect attempt ${attemptId} already settled`);
    }
    const stage = started.body.stage as A4Stage;
    return { kind, stage, revisionNo: started.revisionNo,
      payload: { effectId: attemptId, effect: started.body.effect, executionId: started.body.executionId, approvalRequestId: started.body.approvalRequestId, ...payload },
      settleEffect: { effectId: attemptId, state: kind === "EFFECT_FINISHED" ? "finished" : "failed" },
      sideRows: receipt === undefined ? [] : [{ table: "a4_evidence_refs", values: { project_id: projectId, seq, revision_no: started.revisionNo, stage,
        lane: "implementation", ref_kind: receipt.refKind, ref_id: receipt.refId, sha256: receipt.sha256, claim_kind: "self_reported", trust_tier: null,
        method: null, label: receipt.label, actor_key: A4_RUNTIME.key, ts } }] };
  });
}

/**
 * The executor (design §6.5), after commit and outside the project lock: step 0 consumes the engine grant (a replay
 * whose executionId is this effect's means "already consumed by this effect"), then the preamble — freeze and read-only
 * re-read (a freeze is EFFECT_FAILED: FREEZE_ACTIVE plus the automatic hold), every bound resource slot recomputed
 * (EFFECT_FAILED: RESOURCE_DRIFTED <slot>) — then the registered executor with 5 s heartbeats, then the outcome row.
 */
export async function runA4Effect(store: A4Store, projectId: string, attemptId: string): Promise<A4TransitionResult> {
  const { workspace } = store;
  const state = loadA4State(store, projectId, Date.now());
  const started = startedLink(state.chain, attemptId);
  const executionId = String(started.body.executionId);
  const approvalRequestId = String(started.body.approvalRequestId);
  const failWith = (error: string): A4TransitionResult => settleEffect(store, projectId, attemptId, "EFFECT_FAILED", { error: error.slice(0, 500) });
  const def = lookupEffect(String(started.body.effect));
  if (def === undefined) return failWith("EFFECT_UNKNOWN");
  try {
    if (def.consumes === "A4") {
      const grant = consumeApprovedExecution({ workspace, approvalId: approvalRequestId, expectedAgentId: state.project.agent_id, executionId });
      if (grant.replay && loadApprovalConsumed({ workspace, agentId: state.project.agent_id, approvalRequestId })?.executionId !== executionId) {
        return failWith("GRANT_ALREADY_USED");
      }
    }
    const volatile = refreshVolatileFacts(workspace, state.project);
    if (volatile.freeze === null || volatile.freeze.active) {
      const result = failWith("FREEZE_ACTIVE");
      autoHold(store, projectId, volatile.freeze?.incidentIds ?? []);
      return result;
    }
    if (volatile.readOnly !== false) return failWith("READ_ONLY_MODE");
    const gate = gateRowOf(state, String(started.body.gateId));
    const bound = (JSON.parse(gate.intent_json) as { resourceDigests: Record<string, string | null> }).resourceDigests;
    const drifted = driftedSlots(workspace, bound);
    if (drifted.length > 0) return failWith(`RESOURCE_DRIFTED ${drifted.join(" ")}`);
    // A beat that throws (SQLITE_BUSY, a closed ledger) is a missed beat, never an uncaught timer exception that exits Studio.
    const beat = (): void => {
      try {
        store.heartbeatEffect(attemptId);
      } catch {
        // The sweeper's liveness rule decides; a live local owner is never swept for a stale heartbeat.
      }
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    timer.unref();
    let outcome: A4EffectOutcome;
    try {
      outcome = await def.run({ workspace, state, gate, executionId, approvalRequestId, heartbeat: beat });
    } finally {
      clearInterval(timer);
    }
    return settleEffect(store, projectId, attemptId, "EFFECT_FINISHED", { consumedExecutionId: outcome.consumedExecutionId ?? null,
      receipt: outcome.receipt ?? null, slotChecks: Object.entries(bound).filter(([, value]) => value !== null).map(([slot, expected]) => ({ slot, expected, ok: true })) },
    outcome.receipt);
  } catch (error) {
    return failWith(error instanceof Error ? error.message : String(error));
  }
}

/**
 * The liveness sweeper (the action-journal rule, `recoverUnsettled`): a running effect whose owner process is gone on
 * this host, or whose owner's liveness cannot be read (another host) and whose heartbeat is older than `staleAfterMs`,
 * is written EFFECT_FAILED: process_lost. A live local owner is never swept, however long a synchronous step keeps its
 * heartbeat from firing. Returns the swept attempt ids.
 */
export function sweepA4Effects(store: A4Store, staleAfterMs = DEFAULT_ACTION_STALE_AFTER_MS, only?: { projectId: string; executionId: string }): string[] {
  const staleBefore = Date.now() - staleAfterMs;
  return store.runningEffects().filter((row) => (only === undefined || (row.project_id === only.projectId && row.execution_id === only.executionId))
    && effectOwnerLost(row, staleBefore)).flatMap((row) => {
    try {
      settleEffect(store, row.project_id, row.effect_id, "EFFECT_FAILED", { error: "process_lost" });
      return [row.effect_id];
    } catch {
      return [];
    }
  });
}

/**
 * Retry (owner; design §6.5): only for effects A4 consumes, and only when the chain has a failure and no finish for
 * this execution id, no attempt of it is still running under a live owner, and the engine grant, if consumed, was
 * consumed by this execution id. A new attempt with the same execution id; executors that consume their own grant
 * re-open the effect gate instead, and `complete` on the consumed gate runs them again (`rerunExecutorEffect`).
 */
export function retryEffect(store: A4Store, projectId: string, input: A4Call & { attemptId: string; expectedHeadSeq: number }): { result: A4TransitionResult; attemptId: string } {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 complete");
  const now = Date.now();
  const nextAttempt = randomId("a4e");
  // A dead or silent earlier attempt of this execution is settled first, as amc-runtime under the liveness rule, so the
  // retry rule sees its failure; the head the client saw moves by exactly those rows (anything else is still stale).
  const executionId0 = String(startedLink(store.readChain(projectId), input.attemptId).body.executionId);
  const swept = sweepA4Effects(store, DEFAULT_ACTION_STALE_AFTER_MS, { projectId, executionId: executionId0 }).length;
  const result = governed(store, projectId, principal, { ...input, expectedHeadSeq: input.expectedHeadSeq + swept, response: { attemptId: nextAttempt } }, (ts, load) => {
    const state = load(now);
    const started = startedLink(state.chain, input.attemptId);
    const def = effectDef(String(started.body.effect));
    const executionId = String(started.body.executionId);
    const approvalRequestId = String(started.body.approvalRequestId);
    if (def.consumes !== "A4") throw fail(409, "EFFECT_NOT_RETRYABLE", "This executor consumes its own grant; re-open the effect gate, then complete runs it again.");
    const runs = state.chain.filter((link) => link.body.executionId === executionId);
    if (!runs.some((link) => link.kind === "EFFECT_FAILED") || runs.some((link) => link.kind === "EFFECT_FINISHED")) {
      throw fail(409, "EFFECT_NOT_RETRYABLE", "Only a failed, unfinished effect is retried.");
    }
    if (state.effects.some((row) => row.execution_id === executionId && row.state === "running" && ownerAlive(row.owner_pid, row.owner_host) !== false)) {
      throw fail(409, "EFFECT_RUNNING", "A previous attempt may still be running; the sweeper settles it first.");
    }
    const consumed = loadApprovalConsumed({ workspace: store.workspace, agentId: state.project.agent_id, approvalRequestId });
    if (consumed !== null && consumed.executionId !== executionId) throw fail(409, "GRANT_ALREADY_USED", "The engine grant was consumed by another execution.");
    const row = gateRowOf(state, String(started.body.gateId));
    const { readiness } = evaluateFor(store, state, principal, input, row.stage, now);
    assertAllowed(readiness, "retryEffect");
    return { readiness, specs: { kind: "EFFECT_STARTED", stage: row.stage, revisionNo: row.revision_no,
      payload: { effectId: nextAttempt, effect: def.id, gateId: row.gate_id, executionId, approvalRequestId, retryOf: input.attemptId,
        ownerPid: process.pid, ownerHost: hostname(), heartbeatTs: ts },
      startEffect: { effectId: nextAttempt, gateId: row.gate_id, executionId, approvalRequestId } } };
  });
  return { result, attemptId: nextAttempt };
}
