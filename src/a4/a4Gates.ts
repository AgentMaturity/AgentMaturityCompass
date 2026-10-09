/**
 * A4 documentary gates and the governed transitions around them (P1-57 slice A; design §6). Every function resolves
 * the caller's roles live, refuses (and holds the project automatically) under an active freeze, plans on rows read
 * under the project lock, lets the store sign envelopes outside the ledger transaction, and re-plans on the rows read
 * inside it (`governed`), so a readiness or intent that moved in between rebuilds once and then refuses. Gates reuse the
 * approval engine's shapes and quorum; A4 never writes an engine decision. Effects live in src/a4/a4Effects.ts.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { ownerAlive } from "../actions/actionJournal.js";
import { DEFAULT_ACTION_STALE_AFTER_MS } from "../actions/actionRecovery.js";
import { approvalDecisionSchema, approvalRequestBindingDigest, approvalRequestSchema, type ApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { a4FloorFor, approvalRuleForAction, defaultApprovalPolicy, loadApprovalPolicy, loadVerifiedApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import type { ApprovalA4Floor } from "../approvals/approvalPolicySchema.js";
import { evaluateApprovalQuorum } from "../approvals/approvalQuorum.js";
import { getPrivateKeyPem } from "../crypto/keys.js";
import { signingRoute } from "../crypto/signing/signer.js";
import { assertOwnerMode } from "../mode/mode.js";
import { runtimeFirewallPolicyPath } from "../runtime/firewall.js";
import { loadTrustContext } from "../trust/trustContext.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { auditA4 } from "./a4Audit.js";
import { resolveRefs } from "./a4Evidence.js";
import { hostSessionsSince, liveRolesFor, usersCreatedSince } from "./a4Identity.js";
import { verifyA4Chain } from "./a4Verify.js";
import {
  A4_BOUND_ITEMS, ACKNOWLEDGEABLE_ITEMS, ACKNOWLEDGEMENT_TTL_MS, evaluateA4Readiness, gateStatus, isRegulated, pendingReviews, readinessBindingDigest,
  riskTierOf, selfApprovalFacts, type A4Action, type A4EffectRow, type A4GateRow, type A4LiveFacts, type A4ReadinessQuery, type A4ReadinessState
} from "./a4Readiness.js";
import {
  A4_STAGES, DEFAULT_A4_GATE_POLICY, a4DecisionRowSchema, a4EvidenceRefRowSchema, a4GatePolicyV1Schema, a4GateRowSchema, a4IntentV1Schema,
  a4RevisionRowSchema, gatePolicyDigestOf, gatePolicyFloorViolations, gatePolicyOf, mapRiskTier, type A4GatePolicyV1, type A4IntentV1,
  type A4Principal, type A4ReadinessV1, type A4Stage
} from "./a4Schema.js";
import { authorOf, buildersOf, evaluateSod } from "./a4SoD.js";
import { ensureA4Stages } from "./a4Stages.js";
import {
  A4StoreError, collectLiveFacts, refreshVolatileFacts, type A4Actor, type A4ChangeSpec, type A4RequestKey, type A4Store, type A4TransitionOptions,
  type A4TransitionResult
} from "./a4Store.js";

/** The authenticated caller of one gate call. Roles are re-read live; the router resolved the rest (src/a4/a4Identity.ts). */
export interface A4Call {
  readonly principal: A4Principal;
  readonly request?: A4RequestKey;
  /** The request reached this workspace through the hosted router (`/w/<id>/…`). */
  readonly hostedRouter?: boolean;
  readonly hostMode?: boolean;
  /** Integrity from the full verifyA4Chain (GET, complete, verify) rather than the snapshot's incremental check. */
  readonly fullIntegrity?: boolean;
  /** That full report, computed once before the lock and the transaction so neither plan run repeats it (complete). */
  readonly integrity?: A4LiveFacts["integrity"];
}
type Facts = Pick<A4Call, "hostedRouter" | "hostMode" | "fullIntegrity" | "integrity">;
/** Writes the server makes on its own behalf (automatic hold, effect outcomes); never a person. */
export const A4_RUNTIME: A4Actor = { key: "amc-runtime", username: "amc-runtime" };
const DAY_MS = 86_400_000;
const EXPIRING_GUARD_MS = 60_000;
const NOTARY_RETRY_MS = 5 * 60_000;
/** ponytail: in-process memory of the last failed notary envelope, per workspace; no probe. A shared health record if processes multiply. */
const notaryFailures = new Map<string, number>();
const NEXT_STAGE: Partial<Record<A4Stage, A4Stage>> = { aspire: "assemble", assemble: "adapt", adapt: "activate" };
/** Intent fields as the 409 names them. */
const SLOT_NAMES: Record<string, string> = { memberSetDigest: "memberSet", evidenceRefDigests: "evidenceRefs", readinessBindingDigest: "readiness",
  gatePolicyDigest: "policy", excludedKeys: "excludedKeys", specDigest: "spec", resourceDigests: "resources" };
/** A superseding transition as the slot it moves, so a superseded gate's 409 names `moved` like a rebuilt intent's. */
const SLOT_OF_KIND: Record<string, string> = { MEMBER: "memberSet", EVIDENCE_REF: "evidenceRefs", ACKNOWLEDGED: "readiness", REVISION: "spec",
  GATE_POLICY_CHANGED: "policy", GATE_CONSUMED: "consumed" };

const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
const randomId = (prefix: string): string => `${prefix}_${randomBytes(16).toString("hex")}`;
/** A file's sha256, null only when it is absent; any other read error is 409 RESOURCE_UNREADABLE, never "absent". */
const fileSha = (path: string): string | null => {
  try {
    return sha256Hex(readFileSync(path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw fail(409, "RESOURCE_UNREADABLE", `a signed workspace config could not be read (${code ?? "unknown error"})`);
  }
};
const parseList = (json: string): string[] => JSON.parse(json) as string[];

/**
 * Slot recomputers (design §8): A4 recomputes a producer's digest only to compare it. Stage lanes add theirs; a filled
 * slot without one counts as drifted (fail closed). A recomputer answers null exactly when the resource is absent, the
 * value a revision binds for it then, and throws when it cannot be read. The gate-policy slot is bound through the intent.
 */
export const RESOURCE_SLOTS: Record<string, (workspace: string) => string | null> = {
  "signedConfigs.tools": (workspace) => fileSha(join(workspace, ".amc", "tools.yaml")),
  "signedConfigs.approvalPolicy": (workspace) => fileSha(join(workspace, ".amc", "approval-policy.yaml")),
  "signedConfigs.budgets": (workspace) => fileSha(join(workspace, ".amc", "budgets.yaml")),
  "signedConfigs.actionPolicy": (workspace) => fileSha(join(workspace, ".amc", "action-policy.yaml")),
  "signedConfigs.opsPolicy": (workspace) => fileSha(join(workspace, ".amc", "ops-policy.yaml")),
  "signedConfigs.firewall": (workspace) => fileSha(runtimeFirewallPolicyPath(workspace))
};

/** A4ResourceDigests as `group.slot` → value. */
export function flatSlots(digests: unknown, prefix = ""): Record<string, string | null> {
  if (digests === null || typeof digests !== "object") return {};
  return Object.fromEntries(Object.entries(digests as Record<string, unknown>).filter(([key]) => key !== "schema" && key !== "gatePolicyDigest")
    .flatMap(([key, value]) => value !== null && typeof value === "object" ? Object.entries(flatSlots(value, `${prefix}${key}.`))
      : [[`${prefix}${key}`, typeof value === "string" ? value : null]]));
}

/**
 * Slots whose live recomputation differs from the bound value, including a recomputable slot bound null (a signed config
 * absent at propose) whose resource now exists, and one that cannot be read now; a filled slot nothing can recompute
 * counts too. Only an unfilled slot with no recomputer (not produced) is skipped. Decide, complete and the executor
 * preamble all read this.
 */
export function driftedSlots(workspace: string, slots: Record<string, string | null>): string[] {
  return Object.entries(slots).filter(([slot, value]) => {
    const recompute = RESOURCE_SLOTS[slot];
    if (recompute === undefined) return value !== null;
    try {
      return recompute(workspace) !== value;
    } catch {
      return true; // unreadable data never reads as unchanged
    }
  }).map(([slot]) => slot);
}

/**
 * The rows of one verified snapshot as readiness reads them; refs resolved against the ledger and the trust list now.
 * `integrity` reuses a ledger row's chain verdict within one governed attempt (resolveLedgerEvent).
 */
function stateOf(store: A4Store, snapshot: ReturnType<A4Store["snapshot"]>, now: number, integrity?: Map<string, boolean>): A4ReadinessState {
  const refRows = snapshot.rows.a4_evidence_refs.map((row) => a4EvidenceRefRowSchema.parse(row));
  const resolved = resolveRefs(store.ledger, refRows, loadTrustContext(), now, undefined, integrity);
  return {
    project: snapshot.head, chain: snapshot.links, members: snapshot.members,
    revisions: snapshot.rows.a4_revisions.map((row) => a4RevisionRowSchema.parse(row)),
    gates: snapshot.rows.a4_gates.map((row) => a4GateRowSchema.parse(row)),
    decisions: snapshot.rows.a4_decisions.map((row) => a4DecisionRowSchema.parse(row)),
    refs: resolved.map((ref, index) => ({ ...ref, revisionNo: refRows[index]!.revision_no })), effects: snapshot.effects
  };
}
/** The project's rows, read in one verified snapshot; refs resolved against the ledger and the trust list now. */
export const loadA4State = (store: A4Store, projectId: string, now: number): A4ReadinessState => stateOf(store, store.snapshot(projectId), now);

/** Attempt ids whose executor promise is pending in this process (a4RouterStages adds one before it runs); see effectOwnerLost. */
export const pendingExecutors = new Set<string>();

/**
 * The action journal's liveness rule (`recoverUnsettled`), shared by the sweeper and readiness. An attempt this process
 * owns is lost once no executor here is pending for it (one that threw before writing its outcome): the process is
 * alive but the attempt is not. Another owner's attempt is lost when that owner is dead on this host, or cannot be
 * checked (another host) and its heartbeat is older than `staleBefore`. A pending executor is never lost, however stale
 * its heartbeat.
 */
export function effectOwnerLost(row: Pick<A4EffectRow, "effect_id" | "owner_pid" | "owner_host" | "heartbeat_ts">, staleBefore: number): boolean {
  if (row.owner_pid === process.pid && row.owner_host === hostname()) return !pendingExecutors.has(row.effect_id);
  const alive = ownerAlive(row.owner_pid, row.owner_host);
  return alive === false || (alive === null && row.heartbeat_ts < staleBefore);
}

/** The full chain verification as readiness's integrity section: valid only when every byte check passes. */
const fullIntegrity = (store: A4Store, projectId: string): A4LiveFacts["integrity"] => {
  const report = verifyA4Chain(store.ledger, projectId);
  return { valid: report.integrity.status === "pass", problems: report.integrity.errors, report };
};
/**
 * A `fullIntegrity` call with its verifier report computed once, here, outside the project lock and the ledger
 * transaction (design §7 rule 2), so neither plan run repeats it. The store commits only on the head it pins.
 */
export const withFullIntegrity = (store: A4Store, projectId: string, call: A4Call): A4Call =>
  call.fullIntegrity === true && call.integrity === undefined ? { ...call, integrity: fullIntegrity(store, projectId) } : call;

const vaultUnlocked = (workspace: string): boolean | null => {
  try {
    getPrivateKeyPem(workspace, "auditor");
    return true;
  } catch (error) {
    return /vault locked/i.test(error instanceof Error ? error.message : String(error)) ? false : null;
  }
};

/** Everything readiness reads that is not a row; each unreadable source is null. `approvalPolicy` is the verdict of the read evaluateFor used. */
export function collectFacts(store: A4Store, state: A4ReadinessState, call: Facts, approvalPolicy: A4LiveFacts["approvalPolicy"]): A4LiveFacts {
  const workspace = store.workspace;
  const live = collectLiveFacts(workspace, state.project, { hostedRouter: call.hostedRouter === true });
  let route: "vault" | "notary" | null;
  try {
    route = signingRoute(workspace, "A4_RECORD");
  } catch {
    route = null;
  }
  const revision = state.revisions.find((row) => row.revision_no === state.project.revision_no);
  const createdTs = state.chain.find((link) => link.kind === "CREATED")?.body.ts;
  return {
    activeLocal: live.activeLocal, hostPrincipals: live.hostPrincipals, hostedRouter: live.hostedRouter, hostMode: call.hostMode === true,
    freeze: live.freeze ? { active: live.freeze.active, incidentIds: live.freeze.incidentIds } : null, readOnly: live.readOnly,
    approvalPolicy,
    vaultUnlocked: vaultUnlocked(workspace), signingRoute: route,
    notaryReachable: route !== "notary" || (notaryFailures.get(workspace) ?? 0) < Date.now() - NOTARY_RETRY_MS,
    // The snapshot verified the chain and every side row whole, or it threw A4_INTEGRITY_FAILED before this point.
    integrity: call.integrity ?? (call.fullIntegrity === true ? fullIntegrity(store, state.project.project_id) : { valid: true, problems: [] }),
    driftedSlots: revision ? driftedSlots(workspace, flatSlots(JSON.parse(revision.resource_digests_json))) : [],
    // From the signed CREATED body, never the unsigned head row; a chain without one counts every user (fail closed).
    usersAddedSinceCreated: usersCreatedSince(workspace, typeof createdTs === "number" ? createdTs : 0),
    hostSessionsSinceCreated: hostSessionsSince(workspace, typeof createdTs === "number" ? createdTs : 0),
    lostEffects: state.effects.filter((row) => row.state === "running" && effectOwnerLost(row, Date.now() - DEFAULT_ACTION_STALE_AFTER_MS)).map((row) => row.effect_id)
  };
}

/** The floor read while the signed policy does not verify: the strictest (every project regulated, no self-approval, no gate change). */
const UNVERIFIED_FLOOR: ApprovalA4Floor = { ...a4FloorFor(defaultApprovalPolicy()), regulated: true, allowSelfApproval: false, allowedGateChanges: [] };

/** The signed policy's `a4` floor from one verified read; 409 APPROVAL_POLICY_MISSING / _UNSIGNED, never the defaults, when it does not verify. */
export function signedA4Floor(workspace: string): ApprovalA4Floor {
  const { policy, verdict, reason } = loadVerifiedApprovalPolicy(workspace);
  if (policy === null) throw fail(409, verdict === "missing" ? "APPROVAL_POLICY_MISSING" : "APPROVAL_POLICY_UNSIGNED", `the approval policy does not verify: ${reason ?? "unknown"}`);
  return a4FloorFor(policy);
}

/**
 * One evaluation for `principal` at `stage` on `state`, with the signed policy and the in-force gate policy. The rules,
 * the floor and `approvals.policy_signed` come from one verified read; an unverified policy lends nothing: the defaults
 * stand in for display under the strictest floor, and the BLOCKED item refuses every gate request, decision and progress.
 */
export function evaluateFor(store: A4Store, state: A4ReadinessState, principal: A4Principal | null, call: Facts,
  stage: A4Stage, now: number): { readiness: A4ReadinessV1; query: A4ReadinessQuery } {
  ensureA4Stages();
  const signed = loadVerifiedApprovalPolicy(store.workspace);
  const query: A4ReadinessQuery = { stage, principal, policy: signed.policy ?? defaultApprovalPolicy(), gatePolicy: gatePolicyOf(state.chain),
    floor: signed.policy ? a4FloorFor(signed.policy) : UNVERIFIED_FLOOR, now, live: collectFacts(store, state, call, signed.verdict) };
  return { readiness: evaluateA4Readiness(state, query), query };
}

/** The caller with live roles; a revoked or vanished user is refused even with a membership row (design §5.1). */
export function livePrincipal(store: A4Store, call: A4Call): A4Principal {
  const roles = liveRolesFor(store.workspace, call.principal);
  if (roles.length === 0) throw fail(403, "A4_USER_DISABLED", "This user has no live roles; a membership row is history, not authority.");
  return { ...call.principal, roles };
}

/** 403 for who-may-act refusals, 409 for everything readiness says is not ready, naming the items. `ignore` drops codes a caller has settled. */
export function assertAllowed(readiness: A4ReadinessV1, action: A4Action, ignore: readonly string[] = []): void {
  const codes = (readiness.allowed[action]?.reasonCodes ?? ["UNKNOWN_ACTION"]).filter((code) => !ignore.includes(code));
  if (codes.length === 0) return;
  const role = ["ADMIN_TOKEN_REFUSED", "PRINCIPAL_ROLE_INSUFFICIENT", "PRINCIPAL_NOT_MEMBER", "READ_ONLY_MODE"].find((code) => codes.includes(code));
  if (role !== undefined) {
    throw fail(403, role === "PRINCIPAL_NOT_MEMBER" ? "A4_NOT_A_MEMBER" : role === "READ_ONLY_MODE" ? "NATIVE_READ_ONLY" : role, `refused: ${codes.join(", ")}`, codes);
  }
  if (codes.includes("FREEZE_ACTIVE")) throw fail(409, "FREEZE_ACTIVE", "An incident freeze is active for this agent.", codes);
  throw fail(409, "A4_NOT_READY", `not ready: ${codes.join(", ")}`, { reasonCodes: codes, items: readiness.items.filter((entry) => codes.includes(entry.id)) });
}

/**
 * The automatic HOLD by amc-runtime naming the incidents (design §6.6); a project already held is left as it is. Like a
 * manual hold it is mirrored to the human action log and the A4_HOLD integration event, best effort.
 */
export function autoHold(store: A4Store, projectId: string, incidentIds: readonly string[]): void {
  let held: { agentId: string; name: string; reason: string } | null = null;
  try {
    const result = store.transition(projectId, A4_RUNTIME, ({ head }) => {
      if (head!.hold === 1) throw fail(409, "A4_ON_HOLD", "already held");
      const reason = `freeze ${incidentIds.join(", ") || "unreadable"}`;
      held = { agentId: head!.agent_id, name: head!.name, reason };
      return { kind: "HOLD", payload: { reason, automatic: true, incidentIds: [...incidentIds] }, head: { hold: 1, hold_reason: reason } };
    });
    if (held !== null && !result.replay) {
      const { agentId, name, reason } = held;
      auditA4(store.workspace, { type: "A4_HOLD", agentId, projectId, username: A4_RUNTIME.username, summary: `A4 project ${name} held automatically (${reason})`,
        details: { reason, automatic: true, incidentIds: [...incidentIds], seq: result.seq } });
    }
  } catch {
    // The refusal stands either way; the next attempt writes the hold if this one could not (e.g. a locked vault).
  }
}

/** Refuses under an active or unreadable freeze, writing the automatic hold first. */
export function refuseOnFreeze(store: A4Store, projectId: string): void {
  const head = store.readHead(projectId);
  if (head === null) throw fail(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
  const { freeze } = refreshVolatileFacts(store.workspace, head);
  if (freeze !== null && !freeze.active) return;
  autoHold(store, projectId, freeze?.incidentIds ?? []);
  throw fail(409, "FREEZE_ACTIVE", "An incident freeze is active for this agent; the project is held until it is lifted and an owner resumes.");
}

/** A governed write's plan; it reads the project only through `load`, which `governed` fills once per attempt. */
type Plan = (ts: number, load: (now: number) => A4ReadinessState) => { readiness: A4ReadinessV1; specs: A4ChangeSpec | readonly A4ChangeSpec[] };

/**
 * One governed write (design §4.3, C-26): the freeze refusal, the plan on rows read under the project lock, the store's
 * envelope signing outside the transaction, and the same plan again inside it. The transition records that evaluation's
 * fullDigest; one that moved rebuilds once, then 409 A4_STALE_HEAD. A freeze found inside writes the automatic hold; a
 * notary that cannot sign is 409 A4_NOT_READY (NOTARY_UNREACHABLE), never a 500.
 * Inside the transaction the plan reuses the rows this attempt verified before it (never a chain walk under the ledger
 * write lock, which the runtime action journal shares; design §4.3): the store has just checked that the head is
 * unmoved and still signed (`verifyIncremental`), so no transition is new. What the project lock does not cover is read
 * again there (design §7 rule 8): each evidence ref's ledger row, digest, pruning, tier and admission against the trust
 * list, with the row's O(ledger prefix) chain verdict reused per (id, event_hash) from this attempt's check before the
 * lock; the live facts (`collectFacts`: freeze, read-only, population, vault, notary, resources, lost effects); and an
 * effect's engine decisions.
 */
export function governed(store: A4Store, projectId: string, actor: A4Actor, options: Pick<A4TransitionOptions, "expectedHeadSeq" | "request" | "response">,
  plan: Plan): A4TransitionResult {
  refuseOnFreeze(store, projectId);
  let planned: string | null = null;
  let snapshot: ReturnType<A4Store["snapshot"]> | null = null;
  const integrity = new Map<string, boolean>();
  const load = (now: number): A4ReadinessState => stateOf(store, snapshot ??= store.snapshot(projectId), now, integrity);
  try {
    return store.transition(projectId, actor, ({ ts }) => {
      snapshot = null; // each attempt (a moved head rebuilds once) loads the rows it verified afresh
      integrity.clear();
      const result = plan(ts, load);
      planned = result.readiness.fullDigest;
      return result.specs;
    }, { ...options, readiness: () => {
      const digest = planned ?? plan(Date.now(), load).readiness.fullDigest;
      planned = null;
      return digest;
    } });
  } catch (error) {
    if (error instanceof A4StoreError && error.code === "FREEZE_ACTIVE") {
      autoHold(store, projectId, refreshVolatileFacts(store.workspace, store.readHead(projectId)!).freeze?.incidentIds ?? []);
    }
    if (error instanceof A4StoreError && error.code === "A4_SIGNING_UNAVAILABLE" && collectRoute(store.workspace) === "notary") {
      notaryFailures.set(store.workspace, Date.now());
      throw fail(409, "A4_NOT_READY", "The notary could not sign this record.", { reasonCodes: ["NOTARY_UNREACHABLE"] });
    }
    throw error;
  }
}
const collectRoute = (workspace: string): "vault" | "notary" | null => {
  try {
    return signingRoute(workspace, "A4_RECORD");
  } catch {
    return null;
  }
};

/** What a gate binds, rebuilt from rows (design §6.2, §6.4); `requesterKey` and `specDigest` come from the gate. */
export function intentOf(state: A4ReadinessState, gate: { stage: A4Stage; gate: "direction" | "completion" | "policy"; revisionNo: number;
  requesterKey: string; specDigest: string; boundItemIds: readonly string[] }, readiness: A4ReadinessV1): A4IntentV1 {
  const revision = state.revisions.find((row) => row.revision_no === gate.revisionNo) ?? null;
  // A policy gate approves the proposed policy, whose author is its requester, not the head revision (design §5.3).
  const author = gate.gate === "policy" ? null : authorOf(state.chain, gate.revisionNo);
  const excluded = [gate.requesterKey, ...(author === null ? [] : [author]), ...(gate.gate === "completion" ? buildersOf(state.chain, gate.revisionNo) : [])];
  return a4IntentV1Schema.parse({
    schema: "amc.a4-intent/v1", projectId: state.project.project_id, stage: gate.stage, gate: gate.gate, revisionNo: gate.revisionNo,
    specDigest: gate.specDigest, resourceDigests: revision ? flatSlots(JSON.parse(revision.resource_digests_json)) : {},
    memberSetDigest: sha256Hex(canonicalize([...state.members].sort((a, b) => a.principalKey.localeCompare(b.principalKey))
      .map((member) => ({ key: member.principalKey, roles: [...member.roles].sort() })))),
    evidenceRefDigests: state.refs.filter((ref) => ref.revisionNo === gate.revisionNo).map((ref) => sha256Hex(canonicalize([ref.refKind, ref.refId, ref.sha256]))),
    readinessBindingDigest: readinessBindingDigest(readiness.items, gate.boundItemIds), boundItemIds: [...gate.boundItemIds],
    gatePolicyDigest: gatePolicyDigestOf(state.chain) ?? sha256Hex(canonicalize(DEFAULT_A4_GATE_POLICY)), excludedKeys: [...new Set(excluded)].sort()
  });
}

/** The brief's risk tier in the engine's spelling; an unstated or unknown tier is "high" (C-25; unknown risk is not low risk). */
export function engineRiskTier(state: A4ReadinessState): "low" | "medium" | "high" | "critical" {
  const tier = riskTierOf(state);
  return mapRiskTier(tier === "low" || tier === "med" || tier === "medium" || tier === "critical" ? tier : "high");
}

/** The proposed policy a `policy` gate carries in its GATE_REQUESTED body. */
const proposalOf = (state: A4ReadinessState, gateId: string): A4GatePolicyV1 | null => {
  const parsed = a4GatePolicyV1Schema.safeParse(state.chain.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === gateId)?.body.proposedGatePolicy);
  return parsed.success ? parsed.data : null;
};

/** The intent rebuilt from the loaded rows over the gate's stored bound set; 409 A4_GATE_STALE naming what moved. */
function assertIntentUnchanged(state: A4ReadinessState, row: A4GateRow, request: ApprovalRequestRecord, readiness: A4ReadinessV1): void {
  const revision = state.revisions.find((candidate) => candidate.revision_no === row.revision_no);
  const proposal = row.gate === "policy" ? proposalOf(state, row.gate_id) : null;
  const rebuilt = intentOf(state, { stage: row.stage, gate: row.gate, revisionNo: row.revision_no, requesterKey: row.requested_by_key,
    specDigest: proposal ? sha256Hex(canonicalize(proposal)) : revision?.spec_digest ?? sha256Hex(""), boundItemIds: parseList(row.bound_items_json) }, readiness);
  if (sha256Hex(canonicalize(rebuilt)) === request.boundHashes.intentHash) return;
  const stored = JSON.parse(row.intent_json) as Record<string, unknown>;
  const moved = Object.entries(rebuilt).filter(([key, value]) => canonicalize(value) !== canonicalize(stored[key] ?? null)).map(([key]) => SLOT_NAMES[key] ?? key);
  throw fail(409, "A4_GATE_STALE", `the gate's bound bytes moved: ${moved.join(", ") || "intent"}`, { moved });
}

/** The checks decide and complete share (design §6.4 steps 2–4): live gate, unchanged intent, no drift, not expiring. */
function assertGateLive(state: A4ReadinessState, row: A4GateRow, gate: ReturnType<typeof gateStatus>, readiness: A4ReadinessV1, drifted: readonly string[] | null,
  now: number): void {
  if (gate.supersededBy !== null) {
    const { kind } = gate.supersededBy;
    throw fail(409, "A4_GATE_STALE", gate.status === "CONSUMED" ? "consumed" : `superseded by ${kind}`, { supersededBy: kind, moved: [SLOT_OF_KIND[kind] ?? kind] });
  }
  if (row.revision_no !== state.project.revision_no) throw fail(409, "A4_GATE_STALE", "the gate is bound to an earlier revision", { moved: ["revision"] });
  assertIntentUnchanged(state, row, gate.request, readiness);
  if (drifted === null || drifted.length > 0) throw fail(409, "RESOURCE_DRIFTED", `resources moved since the gate opened: ${drifted?.join(", ") ?? "not recomputable"}`, { slots: drifted });
  if (gate.status === "EXPIRED" || now >= row.expires_ts) throw fail(409, "GATE_EXPIRED", "The gate expired; request it again.");
}

/** 409 A4_NOT_READY (REQUIRED_REVIEW_PENDING) while an entry of the gate's `requiredReviews` is unsatisfied (design §6.3). */
function assertReviewsMet(state: A4ReadinessState, gate: ReturnType<typeof gateStatus>): void {
  const pending = pendingReviews(state, gate);
  if (pending.length > 0) {
    throw fail(409, "A4_NOT_READY", `required reviews pending: ${pending.map((entry) => entry.label).join("; ")}`, { reasonCodes: ["REQUIRED_REVIEW_PENDING"], pending });
  }
}

export const gateRowOf = (state: A4ReadinessState, gateId: string): A4GateRow => {
  const row = state.gates.find((candidate) => candidate.gate_id === gateId);
  if (row === undefined) throw fail(404, "A4_GATE_NOT_FOUND", `no gate ${gateId} on this project`);
  return row;
};

/**
 * Opens a documentary gate (design §6.2): an ApprovalRequestRecord whose floors come from the live signed approval policy
 * and the in-force gate policy (which may only raise them), whose `boundHashes.intentHash` binds the A4 intent and whose
 * readiness binding covers exactly `A4_BOUND_ITEMS[stage]`. One open gate per (revision, stage, gate): a repeat while it
 * is open answers 409 A4_GATE_OPEN naming it; a superseded or expired one is replaced. A `policy` gate carries the
 * proposed gate policy, is opened by an owner and always needs an approver distinct from the proposer.
 */
export function requestGate(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; gate: "direction" | "completion" | "policy";
  proposedGatePolicy?: unknown; expectedHeadSeq: number }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  const now = Date.now();
  const gateId = randomId("a4gate");
  const proposal = input.gate === "policy" ? a4GatePolicyV1Schema.safeParse(input.proposedGatePolicy) : null;
  if (proposal && !proposal.success) throw fail(400, "INPUT_INVALID", "proposedGatePolicy is not an amc.a4-gate-policy/v1 document.");
  if (input.gate !== "policy" && input.proposedGatePolicy !== undefined) throw fail(400, "INPUT_INVALID", "Only a policy gate carries a proposed policy.");
  return governed(store, projectId, principal, input, (ts, load) => {
    const state = load(now);
    const project = state.project;
    const stage = input.gate === "policy" ? project.stage : input.stage;
    if (stage === "retired") throw fail(409, "A4_RETIRED", "The project is retired.");
    const { readiness, query } = evaluateFor(store, state, principal, input, stage, now);
    assertAllowed(readiness, input.gate === "policy" ? "changeGatePolicy" : "requestGate");
    // A policy gate binds the stage's items too, so it waits on the same blockers and self-settling items as any gate,
    // all but the floor item: a policy gate is how a project left below a newly signed floor is brought back within it.
    if (input.gate === "policy") assertAllowed(readiness, "requestGate", ["gate.policy_floor"]);
    const revision = state.revisions.find((row) => row.revision_no === project.revision_no && row.stage === stage) ?? null;
    if (input.gate !== "policy" && (project.stage !== stage || project.step !== (input.gate === "direction" ? "proposed" : "reviewed") || revision === null)) {
      throw fail(409, "A4_STEP_ORDER", `a ${input.gate} gate opens at step ${input.gate === "direction" ? "proposed" : "reviewed"} of the current stage`);
    }
    const prior = state.gates.filter((row) => row.gate === input.gate && row.stage === stage && row.revision_no === project.revision_no)
      .map((row) => gateStatus(state, row, query.policy, now));
    const open = prior.find((gate) => gate.status === "PENDING" || gate.status === "QUORUM_MET");
    if (open) throw fail(409, "A4_GATE_OPEN", `gate ${open.row.gate_id} is already open`, { gateId: open.row.gate_id });
    // DENY is terminal for the revision (design §6.4 step 7): a new gate needs a new revision.
    if (input.gate !== "policy" && prior.some((gate) => gate.status === "DENIED")) throw fail(409, "A4_GATE_DENIED", "This revision's gate was denied; propose a new revision.");
    const proposed = proposal?.success ? proposal.data : null;
    if (proposed) {
      const below = gatePolicyFloorViolations(proposed, query.floor, query.gatePolicy);
      if (below.length > 0) throw fail(409, "GATE_POLICY_BELOW_FLOOR", below.join("; "), below);
    }
    const rule = query.gatePolicy.gates[input.gate === "policy" ? "policy" : `${stage}.${input.gate}` as `${A4Stage}.${"direction" | "completion"}`];
    const policyRule = approvalRuleForAction(query.policy, rule.actionClass);
    const regulated = isRegulated(state, query.floor);
    const rolesAllowed = rule.rolesAllowed ? policyRule.rolesAllowed.filter((role) => rule.rolesAllowed!.includes(role)) : policyRule.rolesAllowed;
    if (rolesAllowed.length === 0) throw fail(409, "A4_NOT_READY", "The gate policy leaves no role that may approve.", { reasonCodes: ["GATE_POLICY_BELOW_FLOOR"] });
    const boundItemIds = A4_BOUND_ITEMS[stage];
    const intent = intentOf(state, { stage, gate: input.gate, revisionNo: project.revision_no, requesterKey: principal.key,
      specDigest: proposed ? sha256Hex(canonicalize(proposed)) : revision!.spec_digest, boundItemIds }, readiness);
    const amc = (name: string): string => fileSha(join(store.workspace, ".amc", name)) ?? sha256Hex(`missing-${name}`);
    const request = approvalRequestSchema.parse({
      v: 1, approvalRequestId: gateId, agentId: project.agent_id, intentId: `a4-${projectId}-${stage}-${input.gate}-r${project.revision_no}`,
      toolName: `a4.${stage}.${input.gate}`, actionClass: rule.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
      riskTier: engineRiskTier(state),
      createdTs: now, expiresTs: now + Math.min(rule.ttlDays, query.floor.maxTtlDays ?? 90) * DAY_MS, status: "PENDING",
      requiredApprovals: Math.max(policyRule.requiredApprovals, rule.minApprovals ?? 0, 1),
      requireDistinctUsers: policyRule.requireDistinctUsers || rule.requireDistinctUsers === true || regulated || input.gate === "policy", rolesAllowed,
      boundHashes: { intentHash: sha256Hex(canonicalize(intent)), policyHash: amc("approval-policy.yaml"), toolsHash: amc("tools.yaml"),
        budgetsHash: amc("budgets.yaml"), leaseConstraintsHash: sha256Hex(canonicalize({})) },
      authorizationIntent: intent
    });
    const bindingDigest = approvalRequestBindingDigest(request);
    return { readiness, specs: {
      kind: "GATE_REQUESTED", stage, revisionNo: project.revision_no,
      payload: { gateId, gate: input.gate, bindingDigest, intentHash: request.boundHashes.intentHash, readinessBindingDigest: intent.readinessBindingDigest,
        // A regulated quorum that can only be LOCAL_USER keys is labelled on the gate from the start (design §5.2).
        degraded: readiness.items.some((entry) => entry.id === "sod.self_provisioned" && entry.status === "WAITING") ? ["SOD_DEGRADED_SELF_PROVISIONED"] : [],
        ...(proposed ? { proposedGatePolicy: proposed } : {}) },
      sideRows: [{ table: "a4_gates", values: { gate_id: gateId, project_id: projectId, revision_no: project.revision_no, stage, gate: input.gate,
        request_json: canonicalize(request), binding_digest: bindingDigest, intent_json: canonicalize(intent), readiness_sha256: intent.readinessBindingDigest,
        bound_items_json: JSON.stringify(boundItemIds), gate_policy_digest: intent.gatePolicyDigest, requested_by_key: principal.key,
        excluded_keys_json: JSON.stringify(intent.excludedKeys), expires_ts: request.expiresTs, envelope_json: null, ts } }]
    } };
  });
}

/**
 * Records one APPROVE or DENY on a documentary gate (design §6.4). The server derives the gate's seq from its own
 * GATE_REQUESTED row and refuses a body naming another; the request digest, the rebuilt intent, the resources and the
 * expiry guard are checked on rows read inside the transaction; SoD is refused at write; the decision row carries the
 * binding digest (mandatory), the identity provenance, the self-approval facts and the bound items the approver saw.
 */
export function recordDecision(store: A4Store, projectId: string, input: A4Call & { gateId: string; decision: "approve" | "deny"; reason: string;
  expectedRequestDigestSha256: string; expectedGateSeq: number; expectedReadinessBindingDigest?: string }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, input.decision === "approve" ? "a4 approve" : "a4 deny");
  const now = Date.now();
  const decisionId = randomId("a4d");
  if (input.reason.trim().length === 0) throw fail(400, "INPUT_INVALID", "A decision needs a reason.");
  return governed(store, projectId, principal, { request: input.request }, (ts, load) => {
    const state = load(now);
    const row = gateRowOf(state, input.gateId);
    const { readiness, query } = evaluateFor(store, state, principal, input, row.stage, now);
    const gate = gateStatus(state, row, query.policy, now);
    if (input.expectedGateSeq !== gate.requestedSeq) throw fail(409, "A4_GATE_SEQ_MISMATCH", `the gate was requested at seq ${gate.requestedSeq}`, { gateSeq: gate.requestedSeq });
    if (input.expectedRequestDigestSha256 !== row.binding_digest) throw fail(409, "A4_GATE_STALE", "That is not this gate's request digest.", { moved: ["request"] });
    assertGateLive(state, row, gate, readiness, query.live.driftedSlots, now);
    if (input.expectedReadinessBindingDigest !== undefined && input.expectedReadinessBindingDigest !== readinessBindingDigest(readiness.items, parseList(row.bound_items_json))) {
      throw fail(409, "A4_GATE_STALE", "readiness moved since you looked", { moved: ["readiness"] });
    }
    if (now >= row.expires_ts - EXPIRING_GUARD_MS) throw fail(409, "GATE_EXPIRING", "The gate expires within a minute; request it again.");
    if (state.decisions.some((decision) => decision.gate_id === row.gate_id && decision.approver_key === principal.key)) {
      throw fail(409, "A4_DUPLICATE_DECISION", "You already decided this gate.");
    }
    if (gate.status !== "PENDING") throw fail(409, "A4_GATE_CLOSED", `the gate is ${gate.status}`);
    // A policy gate is not one of the stage's direction/completion gates; its openness was just checked. Its proposal was
    // floor-checked at request and is again at GATE_POLICY_CHANGED, so a policy in force below the floor does not bar it.
    assertAllowed(readiness, "decide", row.gate === "policy" ? ["GATE_NOT_OPEN", "gate.policy_floor"] : []);
    if (!principal.roles.some((role) => gate.request.rolesAllowed.includes(role))) {
      throw fail(403, "PRINCIPAL_ROLE_INSUFFICIENT", `this gate accepts ${gate.request.rolesAllowed.join(", ")}`);
    }
    const facts = selfApprovalFacts(state, query, principal);
    if (facts.regulated && principal.identityCheck !== "users_yaml") {
      throw fail(403, "IDENTITY_CHECK_LIMITED", "A regulated project takes decisions from live-checked identities only (host sessions wait for P2-33).");
    }
    const approve = input.decision === "approve";
    const sod = evaluateSod({ gate: { gateId: row.gate_id, gate: row.gate, revisionNo: row.revision_no, requesterKeys: [row.requested_by_key],
      excludedKeys: parseList(row.excluded_keys_json) }, decisions: gate.counted.map((decision) => ({ approverKey: decision.approver_key,
      authSource: decision.auth_source, decision: approvalDecisionSchema.parse(JSON.parse(decision.decision_json)).decision as "APPROVE_EXECUTE" | "DENY" })),
      transitions: state.chain, regulated: facts.regulated, selfApprovalAllowed: facts.selfApprovalAllowed, approver: principal });
    if (approve && !sod.ok) throw fail(400, "SOD_VIOLATION", sod.violations.map((rule) => rule === "one_plane" ? "CROSS_PLANE" : rule).join(", "), sod);
    const record = approvalDecisionSchema.parse({ v: 1, approvalDecisionId: decisionId, approvalRequestId: gate.request.approvalRequestId, agentId: state.project.agent_id,
      userId: principal.userId, username: principal.username, roles: principal.roles, decision: approve ? "APPROVE_EXECUTE" : "DENY", reason: input.reason.trim(),
      requestDigestSha256: row.binding_digest, decisionTs: ts });
    const quorum = evaluateApprovalQuorum({ request: gate.request, now, policy: query.policy,
      decisions: [...gate.counted.map((decision) => approvalDecisionSchema.parse(JSON.parse(decision.decision_json))), record] });
    const selfApproved = approve && sod.degraded.includes("SOD_DEGRADED_SINGLE_USER");
    const degraded = approve ? sod.degraded : [];
    return { readiness, specs: {
      kind: "GATE_DECIDED", stage: row.stage, revisionNo: row.revision_no,
      payload: { gateId: row.gate_id, decisionId, approverKey: principal.key, decision: record.decision, quorum: quorum.status, selfApproved,
        selfApprovalFacts: facts, degraded, claimKind: "self_reported" },
      sideRows: [{ table: "a4_decisions", values: { decision_id: decisionId, gate_id: row.gate_id, project_id: projectId, decision_json: canonicalize(record),
        request_digest: row.binding_digest, approver_key: principal.key, auth_source: principal.authSource, admission: principal.admission,
        identity_check: principal.identityCheck, identity_provenance_json: canonicalize(principal.provenance), self_approved: selfApproved ? 1 : 0,
        self_approval_facts_json: canonicalize({ ...facts, degraded }),
        evaluated_items_json: canonicalize(readiness.items.filter((entry) => entry.bound).map((entry) => ({ id: entry.id, status: entry.status, reasonCodes: entry.reasonCodes }))),
        envelope_json: null, ts } }]
    } };
  });
}

/** The approver keys a consumed gate's quorum counted. */
const approverKeys = (gate: ReturnType<typeof gateStatus>): string[] =>
  gate.counted.filter((decision) => approvalDecisionSchema.parse(JSON.parse(decision.decision_json)).decision === "APPROVE_EXECUTE").map((decision) => decision.approver_key);

/** The head a consumed documentary gate moves to (design §9.1): direction → direction_approved; completion → the next stage. */
const headAfterConsume = (row: A4GateRow): { stage?: A4Stage; step: "direction_approved" | "completion_approved" | "asked" } =>
  row.gate === "direction" ? { step: "direction_approved" } : NEXT_STAGE[row.stage] ? { stage: NEXT_STAGE[row.stage], step: "asked" } : { step: "completion_approved" };

/**
 * Consumes a documentary gate once (design §6.5) on rows read inside the transaction: freeze and read-only re-read,
 * readiness must allow `progress`, the intent and the resources must be unchanged, the quorum met and every
 * `requiredReviews` entry of the gate's rule satisfied. `extra` adds the
 * EFFECT_STARTED that src/a4/a4Effects.ts writes in the same transaction. Returns the consumed gate's approver keys.
 */
export function consumeGate(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; gateId: string; expectedHeadSeq: number;
  response?: A4TransitionOptions["response"] },
  extra?: (ctx: { state: A4ReadinessState; row: A4GateRow; principal: A4Principal; regulated: boolean; ts: number }) => { payload: Record<string, unknown>; specs: A4ChangeSpec[] }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 complete");
  const now = Date.now();
  const call = withFullIntegrity(store, projectId, input);
  return governed(store, projectId, principal, input, (ts, load) => {
    const state = load(now);
    const row = gateRowOf(state, input.gateId);
    if (row.stage !== input.stage || row.gate === "policy") throw fail(409, "A4_STEP_ORDER", "That gate does not complete this stage.");
    const { readiness, query } = evaluateFor(store, state, principal, call, row.stage, now);
    const gate = gateStatus(state, row, query.policy, now);
    // store.integrity is bound from the incremental check at request and decide but from the full verifier here, so a
    // failure only the full verifier finds would otherwise read as a moved readiness digest; answer what GET shows.
    if (!readiness.integrity.valid) assertAllowed(readiness, "progress");
    assertGateLive(state, row, gate, readiness, query.live.driftedSlots, now);
    if (gate.status !== "QUORUM_MET") throw fail(409, "A4_NOT_READY", `the gate is ${gate.status}`, { reasonCodes: [gate.status === "DENIED" ? "GATE_DENIED" : "GATE_PENDING"] });
    assertReviewsMet(state, gate);
    assertAllowed(readiness, "progress");
    // An opened effect gate is consumed only with its effect, or its approved engine grant would be orphaned.
    if (extra === undefined && state.chain.some((link) => link.kind === "EFFECT_GATE_OPENED" && link.body.gateId === row.gate_id)) {
      throw fail(409, "EFFECT_REQUIRED", "An effect gate is open on this gate; complete runs its effect.");
    }
    const effect = extra?.({ state, row, principal, regulated: isRegulated(state, query.floor), ts });
    return { readiness, specs: [{ kind: "GATE_CONSUMED", stage: row.stage, revisionNo: row.revision_no,
      payload: { gateId: row.gate_id, gate: row.gate, approverKeys: approverKeys(gate), readinessBindingDigest: readiness.bindingDigest, ...effect?.payload },
      head: headAfterConsume(row) }, ...(effect?.specs ?? [])] };
  });
}

/**
 * Applies a consumed `policy` gate (design §4.4): GATE_CONSUMED and GATE_POLICY_CHANGED in one transaction, the policy
 * being the one the gate's request bound. The store refuses a policy below the floors and makes any loosening an
 * owner-mode, current-owner change.
 */
export function changeGatePolicy(store: A4Store, projectId: string, input: A4Call & { gateId: string; expectedHeadSeq: number }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 gate-policy");
  const now = Date.now();
  return governed(store, projectId, principal, input, (_ts, load) => {
    const state = load(now);
    const row = gateRowOf(state, input.gateId);
    const proposal = proposalOf(state, row.gate_id);
    if (row.gate !== "policy" || proposal === null) throw fail(409, "A4_STEP_ORDER", "That is not a policy gate.");
    const { readiness, query } = evaluateFor(store, state, principal, input, row.stage, now);
    const gate = gateStatus(state, row, query.policy, now);
    assertGateLive(state, row, gate, readiness, [], now);
    if (gate.status !== "QUORUM_MET") throw fail(409, "A4_NOT_READY", `the gate is ${gate.status}`, { reasonCodes: ["GATE_PENDING"] });
    assertReviewsMet(state, gate);
    assertAllowed(readiness, "changeGatePolicy");
    return { readiness, specs: [
      { kind: "GATE_CONSUMED", payload: { gateId: row.gate_id, gate: "policy", approverKeys: approverKeys(gate), readinessBindingDigest: readiness.bindingDigest } },
      { kind: "GATE_POLICY_CHANGED", payload: { gateId: row.gate_id, gatePolicy: proposal, gatePolicyDigest: sha256Hex(canonicalize(proposal)) } }
    ] };
  });
}

/** One plain owner (or reviewer) transition on the head, readiness-gated, with its owner-mode command path. */
function headTransition(store: A4Store, projectId: string, input: A4Call & { expectedHeadSeq: number; stage?: A4Stage }, action: A4Action,
  build: (state: A4ReadinessState, readiness: A4ReadinessV1, ts: number) => A4ChangeSpec, commandPath?: string): A4TransitionResult {
  const principal = livePrincipal(store, input);
  if (commandPath) assertOwnerMode(store.workspace, commandPath);
  const now = Date.now();
  return governed(store, projectId, principal, input, (ts, load) => {
    const state = load(now);
    const stage = input.stage ?? (state.project.stage === "retired" ? "activate" : state.project.stage);
    const { readiness } = evaluateFor(store, state, principal, input, stage, now);
    assertAllowed(readiness, action);
    return { readiness, specs: build(state, readiness, ts) };
  });
}

/**
 * CHANGES_REQUESTED (reviewer/approver/owner): supersedes the gate; the step returns to proposed or built (design §6.6).
 * A `policy` gate has no step to return to: its proposal is approved or denied (an approver), never sent back.
 */
export function requestChanges(store: A4Store, projectId: string, input: A4Call & { gateId: string; reason: string;
  findings?: ReadonlyArray<{ severity: "info" | "low" | "medium" | "high" | "critical"; message: string }>; expectedHeadSeq: number }): A4TransitionResult {
  return headTransition(store, projectId, input, "requestChanges", (state) => {
    const row = gateRowOf(state, input.gateId);
    if (row.gate === "policy") throw fail(409, "A4_STEP_ORDER", "A gate-policy proposal is approved or denied; deny it instead of requesting changes.");
    const status = gateStatus(state, row, loadApprovalPolicy(store.workspace), Date.now()).status;
    if (status !== "PENDING" && status !== "QUORUM_MET") throw fail(409, "A4_GATE_CLOSED", `the gate is ${status}`);
    return { kind: "CHANGES_REQUESTED", stage: row.stage, payload: { gateId: row.gate_id, reason: input.reason, findings: [...(input.findings ?? [])] },
      head: row.gate === "completion" ? { step: "built" } : { step: "proposed" } };
  }, "a4 request-changes");
}

/** HOLD (owner): refuses every transition but RESUME, MEMBER and comments until resumed. */
export function holdProject(store: A4Store, projectId: string, input: A4Call & { reason: string; expectedHeadSeq: number }): A4TransitionResult {
  return headTransition(store, projectId, input, "hold", () => ({ kind: "HOLD", payload: { reason: input.reason, automatic: false },
    head: { hold: 1, hold_reason: input.reason } }), "a4 hold");
}

/** RESUME (owner): only once any freeze is lifted; clears the hold's superseding effect (design §6.6). */
export function resumeProject(store: A4Store, projectId: string, input: A4Call & { reason: string; expectedHeadSeq: number }): A4TransitionResult {
  return headTransition(store, projectId, input, "resume", () => ({ kind: "RESUME", payload: { reason: input.reason }, head: { hold: 0, hold_reason: null } }), "a4 resume");
}

/** REOPEN (owner): moves back to an earlier stage; later stages' open gates are superseded by this transition. */
export function reopenStage(store: A4Store, projectId: string, input: A4Call & { toStage: A4Stage; reason: string; expectedHeadSeq: number }): A4TransitionResult {
  return headTransition(store, projectId, input, "reopen", (state) => {
    if (state.project.stage === "retired" || A4_STAGES.indexOf(input.toStage) >= A4_STAGES.indexOf(state.project.stage)) {
      throw fail(409, "A4_STEP_ORDER", "Reopen moves to an earlier stage.");
    }
    return { kind: "REOPEN", payload: { toStage: input.toStage, reason: input.reason },
      head: { stage: input.toStage, step: state.revisions.some((row) => row.stage === input.toStage) ? "proposed" : "asked" } };
  }, "a4 reopen");
}

/** The Assemble-bound slots: a TUNE whose head revision differs from the deployed one in any of them reopens Assemble. */
const ASSEMBLE_SLOTS = /^(enforce|composition|graph)\./;

/**
 * TUNE (owner, deployed projects only; design §6.6): the stage is derived — Assemble when the owner flags a capability
 * change or any Assemble-bound slot of the head revision differs from the deployed release's revision, else Adapt.
 */
export function tuneProject(store: A4Store, projectId: string, input: A4Call & { capabilityChange: boolean; mechanicPlanId?: string; reason: string;
  expectedHeadSeq: number }): A4TransitionResult {
  // Read once, outside the transaction (the plan runs again inside it); releases are append-only and expectedHeadSeq pins
  // the head. A release missing from this read widens the reopen to Assemble, never narrows it.
  const releases = store.snapshot(projectId).rows.a4_releases;
  return headTransition(store, projectId, input, "tune", (state) => {
    const releaseId = state.project.deployed_release_id;
    if (releaseId === null) throw fail(409, "A4_NOT_DEPLOYED", "Only a deployed project is tuned; retire it to start over.");
    const release = releases.find((row) => row.release_id === releaseId);
    const slotsOf = (revisionNo: unknown) => flatSlots(JSON.parse(state.revisions.find((row) => row.revision_no === revisionNo)?.resource_digests_json ?? "{}"));
    const deployed = slotsOf(release?.revision_no), head = slotsOf(state.project.revision_no);
    const assemble = input.capabilityChange || release === undefined
      || Object.keys({ ...deployed, ...head }).some((slot) => ASSEMBLE_SLOTS.test(slot) && deployed[slot] !== head[slot]);
    return { kind: "TUNE", payload: { baseReleaseId: releaseId, capabilityChange: input.capabilityChange, mechanicPlanId: input.mechanicPlanId ?? null, reason: input.reason },
      head: { stage: assemble ? "assemble" : "adapt", step: "asked", base_release_id: releaseId } };
  }, "a4 tune");
}

const PRE_PROPOSAL_STEPS = new Set(["asked", "understood", "explained"]);
/**
 * RETIRE (owner; or the creator of a project that never reached `proposed`, so an abandoned draft never holds the agent's
 * slot, answers or not). Refused while an effect is running unless an owner acceptance note is recorded.
 */
export function retireProject(store: A4Store, projectId: string, input: A4Call & { reason: string; acceptanceNote?: string; expectedHeadSeq: number }): A4TransitionResult {
  const principal = livePrincipal(store, input);
  assertOwnerMode(store.workspace, "a4 retire");
  const now = Date.now();
  return governed(store, projectId, principal, input, (_ts, load) => {
    const state = load(now);
    if (state.project.stage === "retired") throw fail(409, "A4_RETIRED", "The project is already retired.");
    const { readiness } = evaluateFor(store, state, principal, input, state.project.stage, now);
    // "Never reached proposed" from the signed head states (an answers REVISION keeps the step before proposed), and the
    // creator from the signed CREATED body, never the unsigned head row.
    const draftCreator = state.chain[0]?.kind === "CREATED" && state.chain[0].body.actorKey === principal.key
      && state.chain.every((link) => PRE_PROPOSAL_STEPS.has(String((link.body.headAfter as { step?: unknown } | undefined)?.step)));
    assertAllowed(readiness, "retire", draftCreator ? ["PRINCIPAL_ROLE_INSUFFICIENT"] : []);
    if (state.effects.some((effect) => effect.state === "running") && !input.acceptanceNote?.trim()) {
      throw fail(409, "OUTCOME_UNKNOWN_OPEN", "An effect is still running; record an owner acceptance note to retire anyway.");
    }
    return { readiness, specs: { kind: "RETIRE", payload: { reason: input.reason, acceptanceNote: input.acceptanceNote ?? null }, head: { stage: "retired" } } };
  });
}

/**
 * ACKNOWLEDGED (owner; D-21, design §7 item 6): an acknowledgeable WAITING item stays WAITING with OWNER_ACKNOWLEDGED for
 * 90 days and is bound into the next gate's intent; a BLOCKED item is never acknowledged. Record it before the request.
 */
export function acknowledgeItem(store: A4Store, projectId: string, input: A4Call & { stage: A4Stage; itemId: string; reason: string; expectedHeadSeq: number }): A4TransitionResult {
  if (!ACKNOWLEDGEABLE_ITEMS.includes(input.itemId)) throw fail(400, "INPUT_INVALID", `${input.itemId} cannot be acknowledged`);
  if (input.reason.trim().length === 0) throw fail(400, "INPUT_INVALID", "An acknowledgement needs a reason.");
  return headTransition(store, projectId, input, "acknowledge", (_state, readiness, ts) => {
    const target = readiness.items.find((entry) => entry.id === input.itemId);
    if (target?.status !== "WAITING") throw fail(409, "A4_NOT_ACKNOWLEDGEABLE", `${input.itemId} is ${target?.status ?? "absent"}; only a WAITING item is acknowledged`);
    return { kind: "ACKNOWLEDGED", stage: input.stage, payload: { itemId: input.itemId, reason: input.reason.trim(), expiresTs: ts + ACKNOWLEDGEMENT_TTL_MS } };
  }, "a4 acknowledge");
}

/** The readiness view for GET (design §7 rule 8): evaluated on a fresh snapshot for exactly this principal. */
export function readinessFor(store: A4Store, projectId: string, principal: A4Principal | null, call: Facts,
  stage?: A4Stage): A4ReadinessV1 {
  const now = Date.now();
  const state = loadA4State(store, projectId, now);
  const live = principal === null ? null : { ...principal, roles: liveRolesFor(store.workspace, principal) };
  return evaluateFor(store, state, live, call, stage ?? (state.project.stage === "retired" ? "activate" : state.project.stage), now).readiness;
}
