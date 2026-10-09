/**
 * A4 Forge shapes (P1-56; design §4.7, §6.3, §8): the published contracts re-exported, the ledger row schemas, and the
 * few derived rules every writer and reader shares — the lane refinement, the superseding set and the single-user
 * self-approval derivation. Nothing here reads a clock, a file or the environment.
 */
import { z } from "zod";
import type { ApprovalA4Floor } from "../approvals/approvalPolicySchema.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { claimKindSchema } from "../claims/eligibility/schemas.js";
import { nonEmpty, sha256HexSchema } from "../contracts/v1/common.js";
import { A4_GATE_POLICY_KEYS, a4GatePolicyV1Schema, type A4GatePolicyV1 } from "../contracts/v1/a4GatePolicy.js";
import { A4_ADMISSIONS, A4_GATES, A4_LANES, A4_STAGE_STATES, A4_STAGES, A4_STEPS, type A4Principal } from "../contracts/v1/a4Project.js";
import { A4_TRANSITION_KINDS, type A4TransitionKind } from "../contracts/v1/a4Transition.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { A4EffectDef } from "./a4Effects.js";
import type { A4ReadinessItem, A4ReadinessQuery, A4ReadinessState } from "./a4Readiness.js";

export * from "../contracts/v1/a4ConformanceStatement.js";
export * from "../contracts/v1/a4Decision.js";
export * from "../contracts/v1/a4DeploymentReceipt.js";
export * from "../contracts/v1/a4Gate.js";
export * from "../contracts/v1/a4GatePolicy.js";
export * from "../contracts/v1/a4IntegrationClaim.js";
export * from "../contracts/v1/a4Intent.js";
export * from "../contracts/v1/a4Package.js";
export * from "../contracts/v1/a4Project.js";
export * from "../contracts/v1/a4Readiness.js";
export * from "../contracts/v1/a4Release.js";
export * from "../contracts/v1/a4Revision.js";
export * from "../contracts/v1/a4RollbackReceipt.js";
export * from "../contracts/v1/a4Transition.js";
export * from "../contracts/v1/a4ValueClaim.js";

export type A4Stage = (typeof A4_STAGES)[number];
export type A4Step = (typeof A4_STEPS)[number];
export type A4Lane = (typeof A4_LANES)[number];
export type A4GateKind = (typeof A4_GATES)[number];

export const A4_REF_KINDS = [
  "stage_output", "ledger_event", "receipt", "session", "artifact", "approval", "manifest", "plan", "control_result", "package",
  "deployment_receipt", "verification", "rollback_receipt", "value_claim", "outcome_report", "monitor", "external"
] as const;
export type A4RefKind = (typeof A4_REF_KINDS)[number];

/** A later transition of one of these kinds supersedes an open gate (design §6.7); see `gateSupersededBy`. */
export const A4_SUPERSEDING_KINDS: readonly A4TransitionKind[] = [
  "REVISION", "CHANGES_REQUESTED", "REOPEN", "GATE_POLICY_CHANGED", "MEMBER", "HOLD", "EVIDENCE_REF", "ACKNOWLEDGED",
  "GATE_CONSUMED", "RELEASE", "TUNE", "RETIRE"
];
/** Transitions whose row also carries an A4_RECORD envelope, signed outside the ledger transaction (design §4.5). */
export const A4_ENVELOPE_KINDS: readonly A4TransitionKind[] = ["GATE_REQUESTED", "GATE_DECIDED", "RELEASE", "DEPLOYMENT", "ROLLBACK"];

/**
 * The governance items present at every stage that a gate binds (design §7 items 7 and 11). Stage lanes append their
 * own ids. Gate-derived items (`gate.direction`, `gate.completion`, `approvals.fresh`, `sod`) are never bound: the first
 * APPROVE would otherwise change the digest and every second vote would be stale. Nor are the three environment facts
 * of item 7 — VAULT_LOCKED on envelope writes (`signing.available`), READ_ONLY_MODE and presence — so an approval does not
 * go stale because the vault was locked at render time. Nor is `members.candidates`, a non-mandatory hint about who could
 * be added that depends on the caller's plane and on session churn: bound, it made the intent differ per caller. Do not
 * add them back.
 */
const GOVERNANCE_BOUND_ITEMS = [
  "members.present", "signing.notary_route", "signing.notary_reachable",
  "store.integrity", "approvals.policy_signed", "gate.policy_floor", "hold.none", "identity.check", "effects.failed",
  // Member-derived, not vote-derived (P1-57): a regulated quorum of LOCAL_USER keys is foreseeable before the request, and
  // its owner acknowledgement must precede the request (ACKNOWLEDGED supersedes an open gate), so the item is bound.
  "sod.self_provisioned"
] as const;
export const A4_BOUND_ITEMS: Readonly<Record<A4Stage, readonly string[]>> = {
  aspire: [...GOVERNANCE_BOUND_ITEMS],
  assemble: [...GOVERNANCE_BOUND_ITEMS],
  adapt: [...GOVERNANCE_BOUND_ITEMS],
  // Consumed gates of the lineage, not this gate's votes: stable while this gate is open.
  activate: [...GOVERNANCE_BOUND_ITEMS, "lineage.independent_approvals"]
};

const OBSERVED_TIERS = new Set(["OBSERVED", "OBSERVED_HARDENED"]);
const OBSERVING_METHODS = new Set(["runtime_observation", "executed_test"]);

/**
 * The one lane refinement every writer and reader uses (design §4.2). `observed` and `verified` are earned from the
 * claim kind, the referenced row's tier and its method, never chosen; anything that does not earn `observed` falls to
 * `fallback` as self_reported. A verified ref is re-admitted at every read (src/a4/a4Evidence.ts).
 */
export function laneForClaimKind(claimKind: ClaimKind, trustTier: string | null, method: string | null,
  fallback: "recommendation" | "implementation" = "implementation"): { lane: A4Lane; claimKind: ClaimKind } {
  if (claimKind === "independently_reviewed") return { lane: "verified", claimKind };
  if (claimKind === "observed" && trustTier !== null && OBSERVED_TIERS.has(trustTier) && method !== null && OBSERVING_METHODS.has(method)) {
    return { lane: "observed", claimKind };
  }
  return { lane: fallback, claimKind: claimKind === "synthetic_example" ? "synthetic_example" : "self_reported" };
}

/** What `gateSupersededBy` reads from a chain row. */
export interface A4ChainLink {
  readonly seq: number;
  readonly kind: string;
  readonly revisionNo: number;
  readonly body: Record<string, unknown>;
}

/**
 * The later transition that supersedes `gate`, or null (design §6.7). A HOLD cleared by a later RESUME does not
 * supersede; GATE_CONSUMED supersedes only its own gate; EVIDENCE_REF and ACKNOWLEDGED only on the bound revision.
 */
export function gateSupersededBy(chain: readonly A4ChainLink[], gate: { gateId: string; revisionNo: number; requestedSeq: number }): A4ChainLink | null {
  const later = chain.filter((link) => link.seq > gate.requestedSeq).sort((a, b) => a.seq - b.seq);
  for (const link of later) {
    if (!(A4_SUPERSEDING_KINDS as readonly string[]).includes(link.kind)) continue;
    if (link.kind === "HOLD" && later.some((resume) => resume.kind === "RESUME" && resume.seq > link.seq)) continue;
    if (link.kind === "GATE_CONSUMED" && link.body.gateId !== gate.gateId) continue;
    if ((link.kind === "EVIDENCE_REF" || link.kind === "ACKNOWLEDGED") && link.revisionNo !== gate.revisionNo) continue;
    return link;
  }
  return null;
}

/**
 * Once any transition recorded two or more active principals, or any gate holds two distinct decision keys, the
 * project never self-approves again (design §5.3 ratchet), whatever later revocations do. Recorded facts with a count
 * that is not a number (null: the source could not be read) ratchet too: an unknown population is not a small one.
 */
export function ratchetedFromChain(chain: readonly A4ChainLink[]): boolean {
  const votersByGate = new Map<string, Set<string>>();
  for (const link of chain) {
    const facts = link.body.selfApprovalFacts as { activeUserCount?: unknown; hostPrincipals?: unknown } | null | undefined;
    if (facts !== undefined) {
      if (typeof facts?.activeUserCount !== "number" || typeof facts.hostPrincipals !== "number") return true;
      if (facts.activeUserCount + facts.hostPrincipals >= 2) return true;
    }
    if (link.kind === "GATE_DECIDED" && typeof link.body.gateId === "string" && typeof link.body.approverKey === "string") {
      const voters = votersByGate.get(link.body.gateId) ?? new Set<string>();
      voters.add(link.body.approverKey);
      votersByGate.set(link.body.gateId, voters);
      if (voters.size >= 2) return true;
    }
  }
  return false;
}

/**
 * Single-user self-approval is derived, never supplied (design §5.3): true only for the one ACTIVE local user, with no
 * host session, not through the hosted router, not regulated, not refused by the workspace floor and not ratcheted.
 * An unreadable source (null) answers false. A WORKSPACE_ROUTER principal never self-approves in G1.
 */
export function deriveSelfApprovalAllowed(input: {
  activeLocal: readonly string[] | null;
  hostPrincipals: number | null;
  hostedRouter: boolean;
  regulated: boolean;
  workspaceFloor: boolean | undefined;
  ratcheted: boolean;
  decidingPrincipal: Pick<A4Principal, "authSource" | "userId"> | null;
}): boolean {
  return input.activeLocal !== null && input.activeLocal.length === 1 && input.hostPrincipals === 0 && !input.hostedRouter
    && !input.regulated && input.workspaceFloor !== false && !input.ratcheted
    && input.decidingPrincipal?.authSource === "LOCAL_USER" && input.decidingPrincipal.userId === input.activeLocal[0];
}

/** D-16 defaults. Entries are floors: a project policy may only tighten them. */
export const DEFAULT_A4_GATE_POLICY: A4GatePolicyV1 = a4GatePolicyV1Schema.parse({
  schema: "amc.a4-gate-policy/v1",
  gates: {
    "aspire.direction": { actionClass: "WRITE_LOW" },
    "aspire.completion": { actionClass: "WRITE_LOW" },
    "assemble.direction": { actionClass: "WRITE_LOW" },
    "assemble.completion": { actionClass: "WRITE_HIGH" },
    "adapt.direction": { actionClass: "WRITE_HIGH" },
    "adapt.completion": {
      actionClass: "SECURITY",
      requiredReviews: [{ kind: "role_vote", role: "AUDITOR", label: "applicability output acknowledged by a workspace auditor (not an expert review; D-08 pending)" }]
    },
    "activate.direction": { actionClass: "DEPLOY" },
    "activate.completion": { actionClass: "DEPLOY" },
    policy: { actionClass: "WRITE_HIGH", requireDistinctUsers: true }
  }
});

const policySource = (chain: readonly A4ChainLink[]): A4ChainLink | undefined =>
  [...chain].sort((a, b) => b.seq - a.seq).find((link) => link.kind === "GATE_POLICY_CHANGED" || (link.kind === "CREATED" && link.seq === 0));
/** The in-force gate policy's digest: the latest GATE_POLICY_CHANGED payload, else the seq-0 CREATED's (design §4.4). */
export function gatePolicyDigestOf(chain: readonly A4ChainLink[]): string | null {
  const source = policySource(chain);
  return source?.body.gatePolicy === undefined ? null : sha256Hex(canonicalize(source.body.gatePolicy));
}
/** The in-force gate policy; the D-16 defaults (the floors) when the chain carries none that parses. */
export function gatePolicyOf(chain: readonly A4ChainLink[]): A4GatePolicyV1 {
  const parsed = a4GatePolicyV1Schema.safeParse(policySource(chain)?.body.gatePolicy);
  return parsed.success ? parsed.data : DEFAULT_A4_GATE_POLICY;
}

/**
 * Every way `next` is looser than `prev` (design §6.3: rules may only tighten). Any action-class change is unclassified
 * and counts (fail closed); a removed `requiredReviews` entry counts; so does a longer TTL, a lower minimum, a wider role
 * set or a dropped distinct-user rule.
 */
export function gatePolicyWeakenings(prev: A4GatePolicyV1, next: A4GatePolicyV1): string[] {
  return A4_GATE_POLICY_KEYS.flatMap((key) => {
    const a = prev.gates[key], b = next.gates[key];
    const kept = new Set(b.requiredReviews.map((review) => canonicalize(review)));
    return [
      a.actionClass !== b.actionClass ? `${key}.actionClass ${a.actionClass} -> ${b.actionClass}` : null,
      (b.minApprovals ?? 0) < (a.minApprovals ?? 0) ? `${key}.minApprovals` : null,
      a.rolesAllowed && (!b.rolesAllowed || b.rolesAllowed.some((role) => !a.rolesAllowed!.includes(role))) ? `${key}.rolesAllowed` : null,
      a.requireDistinctUsers === true && b.requireDistinctUsers !== true ? `${key}.requireDistinctUsers` : null,
      b.ttlDays > a.ttlDays ? `${key}.ttlDays` : null,
      a.requiredReviews.some((review) => !kept.has(canonicalize(review))) ? `${key}.requiredReviews` : null
    ].filter((item): item is string => item !== null);
  });
}

/**
 * Why `next` sits below its floors: the D-16 defaults (TTL aside), the signed workspace `a4` TTL bounds and, against
 * `prev`, any field the workspace does not let a project change (`allowedGateChanges`).
 */
export function gatePolicyFloorViolations(next: A4GatePolicyV1, floor: ApprovalA4Floor, prev?: A4GatePolicyV1): string[] {
  const fields = ["minApprovals", "rolesAllowed", "requireDistinctUsers", "ttlDays", "requiredReviews"] as const;
  return [
    ...gatePolicyWeakenings(DEFAULT_A4_GATE_POLICY, next).filter((item) => !item.endsWith(".ttlDays")),
    ...A4_GATE_POLICY_KEYS.filter((key) => next.gates[key].ttlDays > (floor.maxTtlDays ?? 90) || next.gates[key].ttlDays < (floor.minTtlDays ?? 1))
      .map((key) => `${key}.ttlDays outside the workspace a4 floor`),
    ...(prev === undefined ? [] : A4_GATE_POLICY_KEYS.flatMap((key) => fields
      .filter((field) => !floor.allowedGateChanges.includes(field) && canonicalize(prev.gates[key][field] ?? null) !== canonicalize(next.gates[key][field] ?? null))
      .map((field) => `${key}.${field} may not be changed in this workspace`)))
  ];
}

/**
 * What a stage module's `register(registry)` (src/a4/stages/*.ts) receives, once, from src/a4/a4Stages.ts: its stage, the
 * stage's readiness item builders to append to (`STAGE_ITEMS[stage]`) and the effect table (`registerA4Effect`).
 */
export interface A4StageRegistry {
  readonly stage: A4Stage;
  readonly items: Array<(state: A4ReadinessState, query: A4ReadinessQuery) => A4ReadinessItem[]>;
  readonly registerEffect: (def: A4EffectDef) => void;
}

/** The brief's "med" is the approval engine's "medium" (C-25). */
export function mapRiskTier(tier: "low" | "med" | "medium" | "high" | "critical"): "low" | "medium" | "high" | "critical" {
  return tier === "med" ? "medium" : tier;
}

export const a4QuestionSchema = z.strictObject({
  id: nonEmpty, stage: z.enum(A4_STAGES), prompt: nonEmpty, dependsOn: z.array(z.string()),
  required: z.boolean(), kind: z.enum(["text", "list", "choice", "fact"])
});
export type A4Question = z.infer<typeof a4QuestionSchema>;
export const a4AnswerSchema = z.strictObject({
  questionId: nonEmpty, value: z.unknown(), source: z.enum(["user", "carried", "inferred"]),
  answeredAtRevision: z.number().int(), dependencyDigest: sha256HexSchema
});
export type A4Answer = z.infer<typeof a4AnswerSchema>;

/** A PMF hypothesis leaves `proposed` only through a runtime-written ref inside its window; the verdict is a human statement. */
export const a4HypothesisSchema = z.strictObject({
  id: nonEmpty,
  statement: nonEmpty,
  predictedOutcome: nonEmpty,
  window: z.strictObject({ from: z.iso.datetime(), to: z.iso.datetime() }),
  evidenceSource: z.strictObject({ eventType: nonEmpty, metric: nonEmpty }),
  verdict: z.strictObject({ outcome: z.enum(["supported", "refuted", "inconclusive"]), by: nonEmpty, ts: z.number().int(), claimKind: z.literal("self_reported") }).nullable(),
  status: z.enum(["proposed", "observed", "refuted", "expired"])
});
export type A4Hypothesis = z.infer<typeof a4HypothesisSchema>;

// Ledger rows (migration 13), snake_case as stored. JSON columns stay strings; readers parse them where they need them.
const int = z.number().int();
const text = z.string();
export const a4ProjectRowSchema = z.object({
  project_id: text, workspace_id: text, agent_id: text, name: text, stage: z.enum(A4_STAGE_STATES), step: z.enum(A4_STEPS),
  hold: z.union([z.literal(0), z.literal(1)]), hold_reason: text.nullable(), revision_no: int, head_seq: int, head_digest: sha256HexSchema,
  deployed_release_id: text.nullable(), base_release_id: text.nullable(), verified_seq: int.nullable(), verified_digest: text.nullable(),
  created_by_key: text, created_ts: int, updated_ts: int
});
export type A4ProjectRow = z.infer<typeof a4ProjectRowSchema>;
export const a4TransitionRowSchema = z.object({
  project_id: text, seq: int, kind: z.enum(A4_TRANSITION_KINDS), stage: text.nullable(), revision_no: int, actor_key: text,
  actor_username: text, body_json: text, body_digest: sha256HexSchema, prev_digest: text, readiness_sha256: text.nullable(),
  envelope_json: text.nullable(), evidence_event_id: text, ts: int
});
export type A4TransitionRow = z.infer<typeof a4TransitionRowSchema>;
export const a4RevisionRowSchema = z.object({
  project_id: text, revision_no: int, stage: z.enum(A4_STAGES), parent_revision_no: int.nullable(), spec_json: text, spec_digest: sha256HexSchema,
  resource_digests_json: text, resource_digests_sha256: sha256HexSchema, operating_scope_json: text.nullable(), created_by_key: text,
  evidence_event_id: text, ts: int
});
export const a4MemberRowSchema = z.object({
  project_id: text, seq: int, event: z.enum(["added", "roles_changed", "removed"]), principal_key: text, auth_source: text, user_id: text,
  username: text, roles_json: text, actor_key: text, evidence_event_id: text, ts: int
});
export type A4MemberRow = z.infer<typeof a4MemberRowSchema>;
export const a4CommentRowSchema = z.object({
  comment_id: text, project_id: text, revision_no: int, stage: text.nullable(), card_id: text, author_key: text, body_sha256: sha256HexSchema,
  blob_ref: sha256HexSchema, in_reply_to: text.nullable(), evidence_event_id: text, ts: int
});
/** The migration's lane CHECK, mirrored: the stored lane and claim kind are what `laneForClaimKind` derives from the row. */
export const a4EvidenceRefRowSchema = z.object({
  project_id: text, seq: int, revision_no: int, stage: text.nullable(), lane: z.enum(A4_LANES), ref_kind: z.enum(A4_REF_KINDS), ref_id: text,
  sha256: sha256HexSchema, claim_kind: claimKindSchema, trust_tier: text.nullable(), method: text.nullable(), label: text, actor_key: text,
  evidence_event_id: text, ts: int
}).superRefine((row, ctx) => {
  const derived = laneForClaimKind(row.claim_kind, row.trust_tier, row.method, row.lane === "recommendation" ? "recommendation" : "implementation");
  if (derived.lane !== row.lane || derived.claimKind !== row.claim_kind) {
    ctx.addIssue({ code: "custom", path: ["lane"], message: `lane ${row.lane} with claim kind ${row.claim_kind} is not what the row earns` });
  }
});
export type A4EvidenceRefRow = z.infer<typeof a4EvidenceRefRowSchema>;
export const a4GateRowSchema = z.object({
  gate_id: text, project_id: text, revision_no: int, stage: z.enum(A4_STAGES), gate: z.enum(A4_GATES), request_json: text,
  binding_digest: sha256HexSchema, intent_json: text, readiness_sha256: sha256HexSchema, bound_items_json: text, gate_policy_digest: sha256HexSchema,
  requested_by_key: text, excluded_keys_json: text, expires_ts: int, envelope_json: text.nullable(), evidence_event_id: text, ts: int
});
export const a4DecisionRowSchema = z.object({
  decision_id: text, gate_id: text, project_id: text, decision_json: text, request_digest: sha256HexSchema, approver_key: text,
  auth_source: text, admission: z.enum(A4_ADMISSIONS), identity_check: z.enum(["users_yaml", "session_record"]),
  identity_provenance_json: text, self_approved: z.union([z.literal(0), z.literal(1)]), self_approval_facts_json: text,
  evaluated_items_json: text, envelope_json: text.nullable(), evidence_event_id: text, ts: int
});
export const a4ReleaseRowSchema = z.object({
  release_id: text, project_id: text, revision_no: int, package_digest: sha256HexSchema, package_path: text, signature_path: text,
  transparency_entry_id: text.nullable(), previous_release_id: text.nullable(), base_release_id: text.nullable(),
  target: z.enum(["compose", "helm"]), surfaces_json: text, envelope_json: text.nullable(), actor_key: text, evidence_event_id: text, ts: int
});
export const a4DeploymentRowSchema = z.object({
  deployment_id: text, release_id: text, project_id: text, kind: z.enum(["deploy", "verify", "rollback", "monitor"]),
  environment: z.enum(["staging", "production"]), target: z.enum(["compose", "helm"]), receipt_json: text, receipt_sha256: sha256HexSchema,
  recorded_status: z.enum(["succeeded", "failed", "partial"]), amc_check_status: z.enum(["not_evaluated", "reachable", "passed", "failed"]),
  amc_check_json: text.nullable(), recorded_by_key: text, envelope_json: text.nullable(), evidence_event_id: text, ts: int
});
export const a4RequestRowSchema = z.object({
  principal_key: text, client_request_id: text, body_hash: text, project_id: text.nullable(), response_json: text,
  redacted: z.union([z.literal(0), z.literal(1)]), ts: int
});
export type A4RequestRow = z.infer<typeof a4RequestRowSchema>;
export const a4EffectRowSchema = z.object({
  effect_id: text, project_id: text, gate_id: text, execution_id: text, approval_request_id: text.nullable(), owner_pid: int,
  owner_host: text, started_ts: int, heartbeat_ts: int, state: z.enum(["running", "finished", "failed"])
});
