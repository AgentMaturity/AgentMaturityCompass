/**
 * The A4 readiness evaluator (P1-57; design §7). Pure: it reads rows and a live-facts object and never a clock, file or
 * the environment, so the GET view, the decide transaction and the complete transaction compute the same answer from the
 * same rows (C-26). A source the caller could not read arrives as null and becomes NOT_EVALUATED / source_unavailable,
 * never "all clear". The one claim envelope comes only from the resolved refs' envelopes and the decisions' own
 * (always self_reported) envelopes, folded weakest-first; integrity items carry no claim and sit outside every lane.
 */
import type { z } from "zod";
import { approvalDecisionSchema, approvalRequestSchema, type ApprovalDecisionRecord, type ApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import type { ApprovalA4Floor, ApprovalPolicy } from "../approvals/approvalPolicySchema.js";
import { evaluateApprovalQuorum } from "../approvals/approvalQuorum.js";
import type { UserRole } from "../auth/roles.js";
import { envelopeForUnboundResult } from "../claims/eligibility/adapters.js";
import { envelopeForAggregate } from "../claims/eligibility/adapters/results.js";
import { evaluateClaimEligibility } from "../claims/eligibility/evaluate.js";
import type { ClaimEnvelope, ClaimEvidenceTier, ClaimMethod } from "../claims/eligibility/types.js";
import type { VerifierReportV1 } from "../trust/verifierReport.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { A4ResolvedRef } from "./a4Evidence.js";
import {
  A4_BOUND_ITEMS, A4_STAGES, deriveSelfApprovalAllowed, gatePolicyFloorViolations, gatePolicyOf, gateSupersededBy, ratchetedFromChain, type A4_BLOCKER_KINDS,
  type A4ChainLink, type A4GatePolicyV1, type A4Member, type A4Principal, type A4ProjectRow, type A4ReadinessV1, type A4Stage,
  type a4DecisionRowSchema, type a4EffectRowSchema, type a4GateRowSchema, type a4ReadinessItemSchema, type a4RevisionRowSchema
} from "./a4Schema.js";
import { SOD_SENTENCE } from "./a4SoD.js";

export { A4_BOUND_ITEMS };
/** P2-22's blocker vocabulary plus the A4-only kinds; P2-22's blocker inbox imports it from here (design §7 rule 3). */
export type BlockerKind = (typeof A4_BLOCKER_KINDS)[number];
export type A4ReadinessItem = z.infer<typeof a4ReadinessItemSchema>;
export type A4GateRow = z.infer<typeof a4GateRowSchema>;
export type A4DecisionRow = z.infer<typeof a4DecisionRowSchema>;
export type A4RevisionRow = z.infer<typeof a4RevisionRowSchema>;
export type A4EffectRow = z.infer<typeof a4EffectRowSchema>;
export type A4RequiredReview = A4GatePolicyV1["gates"]["policy"]["requiredReviews"][number];

export const A4_ACTIONS = [
  "ask", "understand", "explain", "propose", "requestGate", "decide", "requestChanges", "build", "review", "progress", "hold", "resume",
  "reopen", "tune", "retire", "addMember", "changeGatePolicy", "acknowledge", "openEffect", "retryEffect", "release", "recordDeployment",
  "verifyDeployment", "rollback", "observeHypothesis"
] as const;
export type A4Action = (typeof A4_ACTIONS)[number];

/** Items an owner may acknowledge (D-21 pattern, design §7 item 6): they stay WAITING, labelled, for 90 days. */
export const ACKNOWLEDGEABLE_ITEMS: readonly string[] = ["lineage.independent_approvals", "sod.self_provisioned", "regulatory_sources_status",
  "deployment.amc_check", "plan_unresolved"];
export const ACKNOWLEDGEMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Decided by this gate's own votes; never bound (design §7 item 7), so a first APPROVE never stales the second. */
const GATE_DERIVED = new Set(["gate.direction", "gate.completion", "gate.required_reviews", "approvals.fresh", "sod"]);
const EXPIRING_GUARD_MS = 60_000;

/** The rows one evaluation reads; loaded by the caller (inside the write transaction for writes). */
export interface A4ReadinessState {
  readonly project: A4ProjectRow;
  readonly chain: readonly A4ChainLink[];
  readonly members: readonly A4Member[];
  readonly revisions: readonly A4RevisionRow[];
  readonly gates: readonly A4GateRow[];
  readonly decisions: readonly A4DecisionRow[];
  /** Every chain-named ref, resolved at load: tier recomputed, lane re-derived (src/a4/a4Evidence.ts). */
  readonly refs: readonly (A4ResolvedRef & { readonly revisionNo: number })[];
  readonly effects: readonly A4EffectRow[];
}
/** Live facts the caller gathered (a4Gates.collectFacts); null = could not be read. */
export interface A4LiveFacts {
  readonly activeLocal: string[] | null;
  readonly hostPrincipals: number | null;
  readonly hostedRouter: boolean;
  readonly hostMode: boolean;
  readonly freeze: { readonly active: boolean; readonly incidentIds: string[] } | null;
  readonly readOnly: boolean | null;
  readonly approvalPolicy: "valid" | "missing" | "unsigned";
  readonly vaultUnlocked: boolean | null;
  readonly signingRoute: "vault" | "notary" | null;
  readonly notaryReachable: boolean | null;
  /** `report` is verifyA4Chain's full report (GET, complete, verify); incremental writes carry none. */
  readonly integrity: { readonly valid: boolean; readonly problems: readonly string[]; readonly report?: VerifierReportV1 | null };
  /** Slots of the head revision whose live recomputation differs; null when they could not be recomputed. */
  readonly driftedSlots: readonly string[] | null;
  /** users.yaml records (any status) created since the project's CREATED transition; null when unreadable. */
  readonly usersAddedSinceCreated: number | null;
  /** WORKSPACE_ROUTER session records (any state) issued since the project's CREATED transition; null when unreadable. */
  readonly hostSessionsSinceCreated: number | null;
  /** Running effect attempts whose owner is lost under the sweeper's liveness rule (a4Gates.effectOwnerLost). */
  readonly lostEffects: readonly string[];
}
export interface A4ReadinessQuery {
  readonly stage: A4Stage;
  readonly principal: A4Principal | null;
  readonly policy: ApprovalPolicy;
  readonly gatePolicy: A4GatePolicyV1;
  readonly floor: ApprovalA4Floor;
  readonly now: number;
  readonly live: A4LiveFacts;
}

/**
 * Stage lanes (P1-59…P1-62) append their item builders here through `register(registry)` in src/a4/stages/*.ts, which
 * src/a4/a4Stages.ts runs before the first evaluation (a4Gates.evaluateFor); governance items are built below.
 */
export const STAGE_ITEMS: Record<A4Stage, Array<(state: A4ReadinessState, query: A4ReadinessQuery) => A4ReadinessItem[]>> = {
  aspire: [], assemble: [], adapt: [], activate: []
};
/**
 * The lifecycle bridge (design §7 item 9): the only controls A4 evidence may satisfy, and what satisfies each. Every
 * other control stays not_evaluated. `a4Lifecycle.advance` (P1-62) computes `controlsSatisfied` from this table only.
 */
export const LIFECYCLE_BRIDGE: ReadonlyArray<{ readonly target: "testing" | "staging" | "production"; readonly controlId: string; readonly satisfiedBy: string }> = [
  { target: "testing", controlId: "owner_charter_defined", satisfiedBy: "Aspire completion gate consumed" },
  { target: "testing", controlId: "unit_tests_passing", satisfiedBy: "executed_test validation result, every check passed, non-stub provider" },
  { target: "testing", controlId: "risk_assessment_documented", satisfiedBy: "brief revision with a populated misuse/failure-modes section" },
  { target: "staging", controlId: "integration_tests_passing", satisfiedBy: "executed_test result crossing a component boundary, non-stub provider" },
  { target: "staging", controlId: "security_review_signed", satisfiedBy: "review_record entry satisfied by an admitted external record" },
  { target: "staging", controlId: "deployment_plan_approved", satisfiedBy: "Activate direction gate (release approval) consumed" },
  { target: "production", controlId: "assurance_pack_passing", satisfiedBy: "assurance run artifact with a non-inconclusive VALID result" },
  { target: "production", controlId: "rollback_plan_validated", satisfiedBy: "rollback drill receipt plus a staging rollback row with amc_check_status passed" },
  { target: "production", controlId: "monitoring_slo_enabled", satisfiedBy: "monitor ref carrying a first SLO measurement (self_reported)" },
  { target: "production", controlId: "operator_handoff_acknowledged", satisfiedBy: "OWNER deployment approval with a deploy row whose amc_check_status is passed" }
];

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};
export const gateRequestOf = (row: A4GateRow): ApprovalRequestRecord => approvalRequestSchema.parse(JSON.parse(row.request_json));
const decisionRecordOf = (row: A4DecisionRow): ApprovalDecisionRecord | null => {
  const parsed = approvalDecisionSchema.safeParse(parseJson(row.decision_json));
  return parsed.success ? parsed.data : null;
};

export interface A4GateStatus {
  readonly row: A4GateRow;
  readonly request: ApprovalRequestRecord;
  readonly requestedSeq: number;
  readonly status: "PENDING" | "QUORUM_MET" | "DENIED" | "EXPIRED" | "CONSUMED" | "STALE" | "CHANGES_REQUESTED";
  readonly supersededBy: A4ChainLink | null;
  /** Decisions that count: bound to this gate's binding digest (a digest-less decision counts for nothing, design §6.4). */
  readonly counted: readonly A4DecisionRow[];
  readonly approvals: number;
  readonly required: number;
}

/** One gate's state from the chain and its decisions; the inner quorum EXPIRED surfaces as the gate's status. */
export function gateStatus(state: A4ReadinessState, row: A4GateRow, policy: ApprovalPolicy, now: number): A4GateStatus {
  const request = gateRequestOf(row);
  const requestedSeq = state.chain.find((link) => link.kind === "GATE_REQUESTED" && link.body.gateId === row.gate_id)?.seq ?? Number.MAX_SAFE_INTEGER;
  const supersededBy = gateSupersededBy(state.chain, { gateId: row.gate_id, revisionNo: row.revision_no, requestedSeq });
  const counted = state.decisions.filter((decision) => decision.gate_id === row.gate_id && decision.request_digest === row.binding_digest
    && decisionRecordOf(decision)?.requestDigestSha256 === row.binding_digest);
  const quorum = evaluateApprovalQuorum({ request, decisions: counted.map((decision) => decisionRecordOf(decision)!), policy, now });
  const status = supersededBy === null ? (["PENDING", "QUORUM_MET", "DENIED", "EXPIRED"].includes(quorum.status) ? quorum.status : "STALE")
    : supersededBy.kind === "GATE_CONSUMED" ? "CONSUMED" : supersededBy.kind === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : "STALE";
  return { row, request, requestedSeq, status: status as A4GateStatus["status"], supersededBy, counted, approvals: quorum.received, required: quorum.required };
}

/**
 * The `requiredReviews` entries of the rule in force when the gate was requested that it does not satisfy yet (design
 * §6.3): a `role_vote` by a counted APPROVE whose recorded roles hold that role (an acknowledgement, never a review); a
 * `review_record` by a verified-lane ref on the gate's revision (an admitted external record, re-admitted at every read).
 */
export function pendingReviews(state: A4ReadinessState, gate: A4GateStatus): A4RequiredReview[] {
  const key = gate.row.gate === "policy" ? "policy" : `${gate.row.stage}.${gate.row.gate}` as `${A4Stage}.${"direction" | "completion"}`;
  const rule = gatePolicyOf(state.chain.filter((link) => link.seq < gate.requestedSeq)).gates[key];
  const roles = gate.counted.map(decisionRecordOf).flatMap((record) => record?.decision === "APPROVE_EXECUTE" ? record.roles : []);
  const reviewed = state.refs.some((ref) => ref.revisionNo === gate.row.revision_no && ref.lane === "verified");
  return rule.requiredReviews.filter((entry) => entry.kind === "role_vote" ? entry.role === undefined || !roles.includes(entry.role) : !reviewed);
}

/** The newest gate of a kind at a stage (side rows arrive in chain order). */
export const latestGate = (state: A4ReadinessState, stage: string, gate: string): A4GateRow | null =>
  state.gates.filter((row) => row.stage === stage && row.gate === gate).at(-1) ?? null;
const latestRevision = (state: A4ReadinessState, stage: A4Stage): A4RevisionRow | null =>
  state.revisions.filter((revision) => revision.stage === stage).at(-1) ?? null;

/**
 * The brief's risk tier from the newest Aspire revision (`riskTier`, `brief.riskTier`); null when none states one, when
 * one is not a string, or when the two disagree (fail closed: neither may hide the other).
 */
export function riskTierOf(state: A4ReadinessState): string | null {
  const brief = latestRevision(state, "aspire");
  const spec = brief ? parseJson(brief.spec_json) as { riskTier?: unknown; brief?: { riskTier?: unknown } } | null : null;
  const declared = [spec?.riskTier, spec?.brief?.riskTier].filter((tier) => tier !== undefined);
  const tier = declared[0];
  return typeof tier === "string" && declared.every((other) => other === tier) ? tier : null;
}

/**
 * D-21 default, re-evaluated per decision: the workspace `a4.regulated` floor, a brief risk tier other than low or
 * medium (an unstated, unknown or differently spelled tier counts: unknown risk is not low risk, as engineRiskTier maps
 * it to high), or a head Adapt revision carrying an activated plan.
 */
export function isRegulated(state: A4ReadinessState, floor: ApprovalA4Floor): boolean {
  if (floor.regulated === true) return true;
  const tier = riskTierOf(state);
  if (tier !== "low" && tier !== "med" && tier !== "medium") return true;
  const adapt = latestRevision(state, "adapt");
  const digests = adapt ? parseJson(adapt.resource_digests_json) as { plan?: { journalEntrySha256?: unknown } } | null : null;
  return typeof digests?.plan?.journalEntrySha256 === "string";
}

/**
 * The single-user facts of design §5.3, derived now for `principal`; recorded on CREATED and on every decision row. A
 * user added, or a host session issued, since the project was created ratchets too (null: unreadable, which is not
 * "none"), so an add and a revoke, or a host sign-in that expires, with no A4 write between them gain nothing.
 */
export function selfApprovalFacts(state: A4ReadinessState, query: A4ReadinessQuery, principal: A4Principal | null) {
  const regulated = isRegulated(state, query.floor);
  const ratcheted = ratchetedFromChain(state.chain) || query.live.usersAddedSinceCreated !== 0 || query.live.hostSessionsSinceCreated !== 0;
  const { activeLocal, hostPrincipals, hostedRouter } = query.live;
  const selfApprovalAllowed = deriveSelfApprovalAllowed({ activeLocal, hostPrincipals, hostedRouter, regulated,
    workspaceFloor: query.floor.allowSelfApproval, ratcheted, decidingPrincipal: principal });
  return { activeUserCount: activeLocal?.length ?? null, hostPrincipals, hostedRouter, ratcheted, regulated, selfApprovalAllowed };
}

/** sha256 over exactly `ids`, in that order; an id with no item binds as NOT_EVALUATED (design §7 item 7). */
export function readinessBindingDigest(items: readonly A4ReadinessItem[], ids: readonly string[]): string {
  return sha256Hex(canonicalize(ids.map((id) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? { id, status: item.status, reasonCodes: item.reasonCodes, acknowledged: item.acknowledged,
      evidence: item.evidence.map((ref) => ref.sha256), dimensions: item.claim?.statusDimensions ?? null } : { id, status: "NOT_EVALUATED", missing: true };
  })));
}

const METHODS = new Set<ClaimMethod>(["synthetic", "numeric_self_answer", "keyword_match", "unkeyed_checksum", "path_presence",
  "runtime_observation", "executed_test", "human_review"]);
const TIERS = new Set<string>(["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED", "UNVERIFIED"]);

/** A resolved ref's envelope, through the eligibility service: the method and tier are the referenced row's. */
function refEnvelope(ref: A4ResolvedRef, regulated: boolean, now: number): ClaimEnvelope {
  const method: ClaimMethod = ref.claimKind === "synthetic_example" ? "synthetic"
    : ref.method !== null && METHODS.has(ref.method as ClaimMethod) ? ref.method as ClaimMethod : "human_review";
  return evaluateClaimEligibility({
    producer: `a4-ref:${ref.refKind}:${ref.refId}`, method, regulated, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: ref.status === "dangling" ? 0 : 1, tiers: [(ref.trustTier !== null && TIERS.has(ref.trustTier) ? ref.trustTier : "UNVERIFIED") as ClaimEvidenceTier],
      newestTs: null, boundToControl: true, sameScope: true, contradictory: false,
      signatureValid: ref.status === "unsigned" ? false : ref.status === "dangling" ? null : true, issuerPinned: ref.lane === "verified" ? true : null },
    evidenceRefs: [ref.sha256], review: ref.lane === "verified" ? { state: "approved", independent: true } : undefined, now
  });
}

/** A gate decision's own envelope: always self_reported (review.independent = false, REVIEW_NOT_INDEPENDENT). */
function decisionEnvelope(decision: A4DecisionRow, regulated: boolean, now: number): ClaimEnvelope {
  const record = decisionRecordOf(decision);
  return evaluateClaimEligibility({
    producer: `a4-decision:${decision.decision_id}`, method: "human_review", regulated, proposed: { result: "not_evaluated", level: null },
    evidence: { eventCount: 1, tiers: ["SELF_REPORTED"], newestTs: decision.ts, boundToControl: true, sameScope: true, contradictory: false,
      signatureValid: null, issuerPinned: null },
    evidenceRefs: [decision.decision_id], review: { state: record?.decision === "DENY" ? "rejected" : "approved", independent: false }, now
  });
}

type ItemFields = Partial<Omit<A4ReadinessItem, "id" | "status">>;
const item = (id: string, status: A4ReadinessItem["status"], fields: ItemFields = {}): A4ReadinessItem => ({
  id, status, kind: null, reasonCodes: [], section: "governance", evidence: [], claim: null, report: null, acknowledged: null,
  nextAction: null, mandatory: true, bound: false, ...fields
} as A4ReadinessItem);
const unread = (id: string, reason: string, mandatory = true): A4ReadinessItem =>
  item(id, "NOT_EVALUATED", { kind: "source_unavailable", reasonCodes: [reason], mandatory });

const GATE_ITEM_STATUS: Record<A4GateStatus["status"], [A4ReadinessItem["status"], string | null, BlockerKind | null]> = {
  PENDING: ["WAITING", "GATE_PENDING", "review_pending"], QUORUM_MET: ["READY", null, null], CONSUMED: ["COMPLETE", null, null],
  DENIED: ["BLOCKED", "GATE_DENIED", "review_pending"], EXPIRED: ["WAITING", "GATE_EXPIRED", "review_pending"],
  STALE: ["WAITING", "GATE_STALE", "evidence_stale"], CHANGES_REQUESTED: ["WAITING", "GATE_CHANGES_REQUESTED", "review_pending"]
};

/** Governance items present at every stage (design §7 item 11), plus the gate-derived ones for this stage's open gates. */
function governanceItems(state: A4ReadinessState, query: A4ReadinessQuery, gates: { direction: A4GateStatus | null; completion: A4GateStatus | null },
  regulated: boolean): A4ReadinessItem[] {
  const { live, now } = query;
  const owners = state.members.filter((member) => member.roles.includes("owner"));
  const approvers = state.members.filter((member) => member.roles.includes("approver") || member.roles.includes("owner"));
  const items: A4ReadinessItem[] = [
    owners.length > 0 ? item("members.present", "READY") : item("members.present", "BLOCKED", { kind: "evidence_missing", reasonCodes: ["NO_OWNER"] }),
    live.activeLocal === null || live.hostPrincipals === null ? unread("members.candidates", "MEMBER_CANDIDATES_LIMITED", false)
      : item("members.candidates", "READY", { reasonCodes: live.hostMode ? ["MEMBER_CANDIDATES_LIMITED"] : [], mandatory: false }),
    live.vaultUnlocked === null ? unread("signing.available", "VAULT_LOCKED")
      : item("signing.available", live.vaultUnlocked ? "READY" : "WAITING", live.vaultUnlocked ? {} : { kind: "source_unavailable", reasonCodes: ["VAULT_LOCKED"] }),
    live.signingRoute === null ? item("signing.notary_route", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["CONFIG_UNTRUSTED"] })
      : item("signing.notary_route", "READY", { reasonCodes: live.signingRoute === "vault" ? ["NOTARY_ROUTE_VAULT"] : [] }),
    live.signingRoute === "notary" && live.notaryReachable === false
      ? item("signing.notary_reachable", "WAITING", { kind: "source_unavailable", reasonCodes: ["NOTARY_UNREACHABLE"] }) : item("signing.notary_reachable", "READY"),
    // Integrity of bytes, checked against this workspace's own keys: a self-check, never anchored, never a claim.
    item("store.integrity", live.integrity.valid ? "READY" : "BLOCKED", { section: "integrity", report: live.integrity.report ?? null,
      reasonCodes: live.integrity.valid ? ["SELF_CHECK", "UNANCHORED"] : ["A4_INTEGRITY_FAILED", ...live.integrity.problems.slice(0, 8)] }),
    live.approvalPolicy === "valid" ? item("approvals.policy_signed", "READY") : item("approvals.policy_signed", "BLOCKED", {
      kind: "evidence_missing", reasonCodes: [live.approvalPolicy === "missing" ? "APPROVAL_POLICY_MISSING" : "APPROVAL_POLICY_UNSIGNED"],
      nextAction: { label: "Create and sign the workspace approval policy", command: "amc policy approval init" } }),
    gatePolicyFloorViolations(query.gatePolicy, query.floor).length > 0
      ? item("gate.policy_floor", "BLOCKED", { kind: "evidence_untrusted", reasonCodes: ["GATE_POLICY_BELOW_FLOOR"] }) : item("gate.policy_floor", "READY"),
    live.freeze === null ? unread("hold.none", "FREEZE_ACTIVE")
      : live.freeze.active ? item("hold.none", "BLOCKED", { kind: "hold", reasonCodes: ["FREEZE_ACTIVE", ...live.freeze.incidentIds] })
        : state.project.hold === 1 ? item("hold.none", "WAITING", { kind: "hold", reasonCodes: ["ON_HOLD"] }) : item("hold.none", "READY"),
    state.members.some((member) => member.authSource === "WORKSPACE_ROUTER")
      ? item("identity.check", "WAITING", { kind: "source_unavailable", reasonCodes: ["IDENTITY_CHECK_LIMITED"], mandatory: false }) : item("identity.check", "READY"),
    effectsItem(state, live.lostEffects),
    live.driftedSlots === null ? unread("resources.current", "RESOURCE_MISSING")
      : live.driftedSlots.length > 0 ? item("resources.current", "BLOCKED", { kind: "scope_changed", reasonCodes: ["RESOURCE_DRIFTED", ...live.driftedSlots] })
        : item("resources.current", "READY"),
    // A regulated project refuses WORKSPACE_ROUTER decisions until P2-33 (recordDecision, verifyAndConsumeEffect), so every
    // quorum it can count is LOCAL_USER keys, whoever the members are. Derive it from the counted quorum once that lifts.
    regulated && approvers.length > 0
      ? item("sod.self_provisioned", "WAITING", { kind: "review_pending", reasonCodes: ["SOD_DEGRADED_SELF_PROVISIONED", "REVIEW_NOT_INDEPENDENT"] })
      : item("sod.self_provisioned", "READY", { mandatory: regulated })
  ];
  for (const kind of ["direction", "completion"] as const) {
    const gate = gates[kind];
    const [status, reason, blocker] = gate ? GATE_ITEM_STATUS[gate.status] : ["WAITING", "GATE_PENDING", "review_pending"] as const;
    const expiring = gate?.status === "PENDING" && now >= gate.row.expires_ts - EXPIRING_GUARD_MS;
    items.push(item(`gate.${kind}`, status, { kind: blocker, reasonCodes: [reason, expiring ? "GATE_EXPIRING" : null].filter((code): code is string => code !== null) }));
  }
  const open = [gates.direction, gates.completion].filter((gate): gate is A4GateStatus => gate !== null && (gate.status === "PENDING" || gate.status === "QUORUM_MET"));
  const pending = open.flatMap((gate) => pendingReviews(state, gate));
  items.push(pending.length > 0 ? item("gate.required_reviews", "WAITING", { kind: "review_pending",
    reasonCodes: ["REQUIRED_REVIEW_PENDING", ...pending.map((entry) => entry.role === undefined ? entry.kind : `${entry.kind}:${entry.role}`)],
    nextAction: { label: `Required on this gate: ${pending.map((entry) => entry.label).join("; ")}` } }) : item("gate.required_reviews", "READY"));
  const stale = open.some((gate) => gate.counted.length < state.decisions.filter((decision) => decision.gate_id === gate.row.gate_id).length);
  items.push(stale ? item("approvals.fresh", "WAITING", { kind: "evidence_stale", reasonCodes: ["GATE_STALE"], mandatory: false }) : item("approvals.fresh", "READY", { mandatory: false }));
  items.push(sodItem(state, open, regulated));
  if (query.stage === "activate") items.push(lineageItem(state, query, regulated));
  return items;
}

const EFFECT_KINDS = new Set(["EFFECT_STARTED", "EFFECT_FINISHED", "EFFECT_FAILED"]);
/**
 * The stages a REOPEN or TUNE (back to its target and later) or a REVISION (its own stage) sends back through their gates;
 * null for any other link. Readiness clears a settled effect outcome on it, and retry, re-open and re-run refuse with it.
 */
export function redoneStages(link: A4ChainLink): ((stage: unknown) => boolean) | null {
  if (link.kind === "REVISION") return (stage) => stage === link.body.stage;
  if (link.kind !== "REOPEN" && link.kind !== "TUNE") return null;
  const to = A4_STAGES.indexOf((link.body.headAfter as { stage?: unknown } | undefined)?.stage as A4Stage);
  return (stage) => to >= 0 && A4_STAGES.indexOf(stage as A4Stage) >= to;
}

/**
 * A failed effect blocks until it is retried or re-run, or its stage is redone; a running one keeps the project waiting
 * (BUILD_RUNNING). A later REOPEN or TUNE back to the effect's stage or earlier, or a new revision of that stage, clears
 * a settled outcome: that stage's gates, and so its effect, must complete again (design §6.5: a second failure requires
 * a new revision). One that lands while the attempt runs clears its outcome once it settles, as retry refuses it
 * (a4Effects.assertNotRedone). A revision of a later stage clears nothing, and a running attempt is never cleared. A
 * running attempt whose owner is lost is BLOCKED (PROCESS_LOST) with retry as the next action: retry settles it first,
 * since nothing else runs the sweeper.
 */
function effectsItem(state: A4ReadinessState, lost: readonly string[]): A4ReadinessItem {
  const latest = new Map<string, A4ChainLink>();
  const redoneWhileRunning = new Set<unknown>();
  for (const link of state.chain) {
    const executionId = link.body.executionId;
    if (EFFECT_KINDS.has(link.kind) && typeof executionId === "string") {
      if (link.kind !== "EFFECT_STARTED" && redoneWhileRunning.has(link.body.effectId)) latest.delete(executionId);
      else if (latest.get(executionId)?.kind !== "EFFECT_FINISHED") latest.set(executionId, link);
      continue;
    }
    const redone = redoneStages(link);
    if (redone === null) continue;
    for (const [executionId, outcome] of latest) {
      if (!redone(outcome.body.stage)) continue;
      if (outcome.kind === "EFFECT_STARTED") redoneWhileRunning.add(outcome.body.effectId);
      else latest.delete(executionId);
    }
  }
  const states = [...latest.values()].map((link) => link.kind);
  if (states.includes("EFFECT_FAILED")) return item("effects.failed", "BLOCKED", { kind: "effect_failed", reasonCodes: ["EFFECT_FAILED"] });
  if ([...latest.values()].some((link) => link.kind === "EFFECT_STARTED" && lost.includes(String(link.body.effectId)))) {
    return item("effects.failed", "BLOCKED", { kind: "outcome_unknown", reasonCodes: ["PROCESS_LOST"], nextAction: {
      label: "Retry the effect: the retry first settles the lost attempt as process_lost (an effect that consumes its own grant is then re-opened and completed)" } });
  }
  if (states.includes("EFFECT_STARTED")) return item("effects.failed", "WAITING", { kind: "outcome_unknown", reasonCodes: ["BUILD_RUNNING"] });
  return item("effects.failed", "READY");
}

/** The gate-derived SoD view: a regulated gate that the member set cannot satisfy waits with SOD_VIOLATION (design §5.3). */
function sodItem(state: A4ReadinessState, open: readonly A4GateStatus[], regulated: boolean): A4ReadinessItem {
  const selfApproved = open.some((gate) => gate.counted.some((decision) => decision.self_approved === 1));
  for (const gate of open) {
    const excluded = new Set<string>(parseJson(gate.row.excluded_keys_json) as string[] ?? []);
    const eligible = state.members.filter((member) => (member.roles.includes("approver") || member.roles.includes("owner")) && !excluded.has(member.principalKey));
    if (regulated && new Set(eligible.map((member) => member.principalKey)).size < gate.required) {
      return item("sod", "WAITING", { kind: "sod_violation", reasonCodes: ["SOD_VIOLATION"],
        nextAction: { label: "Add a second member (`amc user add` or a host membership), then re-request the gate", command: "amc user add" } });
    }
  }
  return item("sod", "READY", { kind: selfApproved ? "self_approved" : null,
    reasonCodes: selfApproved ? ["SOD_DEGRADED_SINGLE_USER", "REVIEW_NOT_INDEPENDENT"] : ["REVIEW_NOT_INDEPENDENT"] });
}

/** Regulated only: a self-approved consumed gate in the lineage holds activate.direction until re-approved or acknowledged. */
function lineageItem(state: A4ReadinessState, query: A4ReadinessQuery, regulated: boolean): A4ReadinessItem {
  const latestConsumed = new Map<string, A4GateStatus>();
  for (const row of state.gates) {
    const status = gateStatus(state, row, query.policy, query.now);
    if (status.status === "CONSUMED") latestConsumed.set(`${row.stage}.${row.gate}`, status);
  }
  const selfApproved = [...latestConsumed.values()].some((gate) => gate.counted.some((decision) => decision.self_approved === 1));
  return regulated && selfApproved
    ? item("lineage.independent_approvals", "WAITING", { kind: "self_approved", reasonCodes: ["SOD_DEGRADED_SINGLE_USER"] })
    : item("lineage.independent_approvals", "READY", { mandatory: regulated });
}

const ROLE_CLASSES = {
  owner: [["owner"], ["OWNER"]],
  builder: [["builder", "owner"], ["OPERATOR", "OWNER"]],
  approver: [["approver", "owner"], ["APPROVER", "AUDITOR", "OWNER"]],
  reviewer: [["reviewer", "approver", "owner"], ["APPROVER", "AUDITOR", "OWNER"]]
} as const satisfies Record<string, readonly [readonly string[], readonly UserRole[]]>;
const ACTION_CLASS: Record<A4Action, keyof typeof ROLE_CLASSES> = {
  ask: "builder", understand: "builder", explain: "builder", propose: "builder", requestGate: "builder", decide: "approver",
  requestChanges: "reviewer", build: "builder", review: "builder", progress: "builder", hold: "owner", resume: "owner", reopen: "owner",
  tune: "owner", retire: "owner", addMember: "owner", changeGatePolicy: "owner", acknowledge: "owner", openEffect: "owner", retryEffect: "owner",
  release: "owner", recordDeployment: "builder", verifyDeployment: "builder", rollback: "owner", observeHypothesis: "builder"
};

/**
 * Per-principal permission map: role classes on live roles and membership, then the global and action-specific blockers.
 * `decide` covers approve and deny alike, so it carries the regulated live-identity refusal (both are refused) but not
 * the gate's SoD exclusions: an excluded requester, author or builder may still deny, and recordDecision refuses their
 * approval at write (400 SOD_VIOLATION; `selfApprovalAllowed` says whether self-approval is open).
 */
function allowedFor(state: A4ReadinessState, query: A4ReadinessQuery, items: readonly A4ReadinessItem[],
  gates: { direction: A4GateStatus | null; completion: A4GateStatus | null }, regulated: boolean): A4ReadinessV1["allowed"] {
  const { principal, live } = query;
  const held = new Set<string>(state.members.find((member) => member.principalKey === principal?.key)?.roles ?? []);
  if (principal?.roles.includes("OWNER")) held.add("owner");
  if (principal?.roles.includes("AUDITOR")) held.add("reviewer");
  const ids = (predicate: (candidate: A4ReadinessItem) => boolean): string[] => items.filter(predicate).map((candidate) => candidate.id);
  const nonGate = (candidate: A4ReadinessItem): boolean => candidate.mandatory && !GATE_DERIVED.has(candidate.id);
  const blocked = ids((candidate) => nonGate(candidate) && candidate.status === "BLOCKED");
  // Bound items that settle on their own, with no superseding transition (an effect finishing, the notary retry window):
  // a gate bound while they wait would go stale on every decision while still reading PENDING, so it waits for them.
  const transient = ids((candidate) => (candidate.id === "effects.failed" || candidate.id === "signing.notary_reachable") && candidate.status !== "READY");
  const gateList = [gates.direction, gates.completion];
  const specific: Partial<Record<A4Action, string[]>> = {
    requestGate: [...blocked, ...transient],
    decide: [
      ...(gateList.some((gate) => gate?.status === "PENDING") ? [] : ["GATE_NOT_OPEN"]),
      ...ids((candidate) => candidate.mandatory && candidate.bound && candidate.status === "NOT_EVALUATED"), ...blocked,
      ...ids((candidate) => (candidate.id === "signing.available" || candidate.id === "signing.notary_reachable") && candidate.status !== "READY"),
      // recordDecision's rule: a regulated project takes decisions from live-checked (users.yaml) identities only, until P2-33.
      ...(regulated && principal?.identityCheck !== "users_yaml" ? ["IDENTITY_CHECK_LIMITED"] : [])
    ],
    progress: [
      ...(gateList.some((gate) => gate?.status === "QUORUM_MET") ? [] : ["GATE_PENDING"]),
      ...ids((candidate) => (nonGate(candidate) || candidate.id === "sod" || candidate.id === "gate.required_reviews") && candidate.status !== "READY"
        && candidate.status !== "COMPLETE" && candidate.acknowledged === null)
    ]
  };
  return Object.fromEntries(A4_ACTIONS.map((action) => {
    const [projectRoles, workspaceRoles] = action === "progress" && (query.stage === "adapt" || query.stage === "activate")
      ? ROLE_CLASSES.owner : ROLE_CLASSES[ACTION_CLASS[action]];
    const reasons = principal === null ? ["ADMIN_TOKEN_REFUSED"] : [
      ...(principal.roles.some((role) => (workspaceRoles as readonly string[]).includes(role)) ? [] : ["PRINCIPAL_ROLE_INSUFFICIENT"]),
      ...(projectRoles.some((role) => held.has(role)) ? [] : ["PRINCIPAL_NOT_MEMBER"]),
      ...(live.integrity.valid ? [] : ["A4_INTEGRITY_FAILED"]),
      ...(state.project.stage === "retired" ? ["RETIRED"] : []),
      ...(live.readOnly === false ? [] : ["READ_ONLY_MODE"]),
      ...(live.freeze?.active === false ? [] : ["FREEZE_ACTIVE"]),
      ...(state.project.hold === 1 && action !== "resume" && action !== "addMember" ? ["ON_HOLD"] : []),
      ...(action === "resume" && state.project.hold !== 1 ? ["NOT_ON_HOLD"] : []),
      ...(specific[action] ?? [])
    ];
    return [action, { allowed: reasons.length === 0, reasonCodes: [...new Set(reasons)] }];
  }));
}

/** The latest unexpired owner acknowledgement per item on the head revision. */
function acknowledgements(state: A4ReadinessState, now: number): Map<string, NonNullable<A4ReadinessItem["acknowledged"]>> {
  const out = new Map<string, NonNullable<A4ReadinessItem["acknowledged"]>>();
  for (const link of state.chain) {
    const { itemId, reason, expiresTs, actorKey, ts } = link.body;
    if (link.kind !== "ACKNOWLEDGED" || link.revisionNo !== state.project.revision_no || typeof itemId !== "string" || typeof reason !== "string"
      || typeof expiresTs !== "number" || typeof actorKey !== "string" || typeof ts !== "number" || expiresTs <= now) continue;
    out.set(itemId, { by: actorKey, ts, expiresTs, reason });
  }
  return out;
}

/** The one readiness evaluator (design §7). */
export function evaluateA4Readiness(state: A4ReadinessState, query: A4ReadinessQuery): A4ReadinessV1 {
  const { stage, now, live } = query;
  const regulated = isRegulated(state, query.floor);
  const direction = latestGate(state, stage, "direction");
  const completion = latestGate(state, stage, "completion");
  const gates = { direction: direction ? gateStatus(state, direction, query.policy, now) : null,
    completion: completion ? gateStatus(state, completion, query.policy, now) : null };
  const boundIds = A4_BOUND_ITEMS[stage];
  const acks = acknowledgements(state, now);
  const built = [...governanceItems(state, query, gates, regulated), ...STAGE_ITEMS[stage].flatMap((builder) => builder(state, query))];
  for (const id of boundIds) if (!built.some((candidate) => candidate.id === id)) built.push(item(id, "NOT_EVALUATED", { kind: "not_evaluated", reasonCodes: ["ITEM_NOT_PRODUCED"] }));
  const items = built.map((candidate) => {
    const ack = acks.get(candidate.id);
    const acknowledged = ack !== undefined && candidate.status === "WAITING" && ACKNOWLEDGEABLE_ITEMS.includes(candidate.id);
    return { ...candidate, bound: boundIds.includes(candidate.id),
      ...(acknowledged ? { acknowledged: ack, reasonCodes: [...candidate.reasonCodes, "OWNER_ACKNOWLEDGED"] } : {}) } as A4ReadinessItem;
  });
  const mandatory = items.filter((candidate) => candidate.mandatory && candidate.section !== "integrity");
  const status: A4ReadinessV1["status"] = !live.integrity.valid ? "BLOCKED" : state.project.hold === 1 ? "ON_HOLD"
    : gates.direction?.status === "CONSUMED" && gates.completion?.status === "CONSUMED" ? "COMPLETE"
      : mandatory.some((candidate) => candidate.status === "BLOCKED") ? "BLOCKED"
        : mandatory.some((candidate) => (candidate.status === "WAITING" || candidate.status === "NOT_EVALUATED") && candidate.acknowledged === null) ? "WAITING" : "READY";
  const stageDecisions = state.decisions.filter((decision) => decision.gate_id === direction?.gate_id || decision.gate_id === completion?.gate_id);
  const members = [...state.refs.filter((ref) => ref.revisionNo === state.project.revision_no).map((ref) => refEnvelope(ref, regulated, now)),
    ...stageDecisions.map((decision) => decisionEnvelope(decision, regulated, now))];
  const producer = `a4:${state.project.project_id}:readiness:${stage}`;
  const claim = members.length > 0 ? envelopeForAggregate(producer, members, now) : envelopeForUnboundResult({ producer, method: "human_review", regulated, now });
  const staleApprovals = [gates.direction, gates.completion].flatMap((gate) => gate === null ? [] : state.decisions
    .filter((decision) => decision.gate_id === gate.row.gate_id && (gate.status === "STALE" || !gate.counted.includes(decision)
      || ((gate.status === "PENDING" || gate.status === "QUORUM_MET") && (live.driftedSlots?.length ?? 1) > 0)))
    .map((decision) => ({ gateId: gate.row.gate_id, decisionId: decision.decision_id,
      reasonCodes: [gate.status === "STALE" ? "GATE_STALE" : !gate.counted.includes(decision) ? "GATE_STALE" : "RESOURCE_DRIFTED"] })));
  const view = (gate: A4GateStatus | null) => gate === null ? null : { gateId: gate.row.gate_id, gate: gate.row.gate, status: gate.status,
    approvals: gate.approvals, required: gate.required, revisionNo: gate.row.revision_no, requestedSeq: gate.requestedSeq, expiresTs: gate.row.expires_ts,
    supersededBy: gate.supersededBy ? { seq: gate.supersededBy.seq, kind: gate.supersededBy.kind } : null,
    selfApproved: gate.counted.some((decision) => decision.self_approved === 1) };
  const facts = selfApprovalFacts(state, query, query.principal);
  const body = {
    schema: "amc.a4-readiness/v1" as const, status, items,
    nextAction: mandatory.find((candidate) => candidate.status !== "READY" && candidate.status !== "COMPLETE" && candidate.nextAction !== null)?.nextAction ?? null,
    gates: { direction: view(gates.direction), completion: view(gates.completion) }, staleApprovals,
    integrity: { valid: live.integrity.valid, reasonCodes: live.integrity.valid ? [] : ["A4_INTEGRITY_FAILED"] }, claim,
    claimBoundary: `Readiness of A4 records. Gate decisions are self-reported acknowledgements, never independent reviews; ${SOD_SENTENCE}. Integrity items are about bytes, not evidence about the agent.`,
    selfApproved: stageDecisions.some((decision) => decision.self_approved === 1), selfApprovalAllowed: facts.selfApprovalAllowed,
    identityCheck: query.principal?.identityCheck ?? "users_yaml", bindingDigest: readinessBindingDigest(items, boundIds)
  };
  // The attached verifier report is timestamped per read; the digest covers the evaluation, not the report.
  const digested = { ...body, items: items.map((entry) => ({ ...entry, report: null })) };
  return { ...body, allowed: allowedFor(state, query, items, gates, regulated), evaluatedAt: new Date(now).toISOString(), fullDigest: sha256Hex(canonicalize(digested)) };
}
