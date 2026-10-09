/**
 * A4 separation of duties (P1-57; design §5.3). Pure and self-contained: no clock, file or environment. A violating
 * APPROVE is refused at write (400 SOD_VIOLATION naming the rules), never discounted later. Distinct principal keys
 * under one workspace signing authority are SoD-distinct, not independent: every gate decision stays self_reported.
 */
import type { A4ChainLink } from "./a4Schema.js";

export type SodRule = "requester_not_approver" | "author_not_approver" | "builder_not_completion_approver"
  | "distinct_approvers" | "one_plane" | "no_admin_token" | "no_demo" | "two_person_for_effects" | "policy_gate_distinct";
export type SodDegradation = "SOD_DEGRADED_SINGLE_USER" | "SOD_DEGRADED_SELF_PROVISIONED";

/** The fixed sentence every SoD readiness item carries (spec/ACCEPTANCE_RULES.md). */
export const SOD_SENTENCE = "two local users are not evidence of two people";

export interface SodGate {
  readonly gateId: string;
  readonly gate: "direction" | "completion" | "policy";
  readonly revisionNo: number;
  /** The gate's requester, plus (for an effect) the principal who called `complete`. */
  readonly requesterKeys: readonly string[];
  /** Barred at open time (`excluded_keys_json`), plus any the caller adds (an effect's build principals). */
  readonly excludedKeys: readonly string[];
}
export interface SodDecision { readonly approverKey: string; readonly authSource: string; readonly decision: "APPROVE_EXECUTE" | "DENY" }
export interface SodApprover { readonly key: string; readonly authSource: string }

/** Principals who built this revision: STEP(built) and EFFECT_STARTED actors (the build manifest's author is amc-runtime). */
export function buildersOf(transitions: readonly A4ChainLink[], revisionNo: number): string[] {
  return [...new Set(transitions.filter((link) => link.revisionNo === revisionNo
    && ((link.kind === "STEP" && link.body.step === "built") || link.kind === "EFFECT_STARTED"))
    .map((link) => link.body.actorKey).filter((key): key is string => typeof key === "string" && key !== "amc-runtime"))];
}

/** The author of a revision: the actor of its REVISION transition. */
export function authorOf(transitions: readonly A4ChainLink[], revisionNo: number): string | null {
  const key = transitions.find((link) => link.kind === "REVISION" && link.revisionNo === revisionNo)?.body.actorKey;
  return typeof key === "string" ? key : null;
}

/**
 * Whether `approver` may APPROVE this gate given the decisions already on it. Single-user degradation applies only when
 * the derived `selfApprovalAllowed` is true and never to the `policy` gate; a regulated quorum made only of LOCAL_USER
 * keys is labelled SOD_DEGRADED_SELF_PROVISIONED (every LOCAL_USER key is minted under one signing authority).
 */
export function evaluateSod(input: {
  gate: SodGate;
  decisions: readonly SodDecision[];
  transitions: readonly A4ChainLink[];
  regulated: boolean;
  selfApprovalAllowed: boolean;
  approver: SodApprover;
  /** An effect gate: the completion builder rule applies to it too. */
  effect?: boolean;
}): { ok: boolean; violations: SodRule[]; degraded: SodDegradation[] } {
  const { gate, approver } = input;
  const violations = new Set<SodRule>();
  const degraded = new Set<SodDegradation>();
  // Only human session planes decide; the admin token and the demo session never do (there is no flag).
  if (!/^(LOCAL_USER|WORKSPACE_ROUTER):./.test(approver.key)) violations.add(/demo/i.test(approver.key) ? "no_demo" : "no_admin_token");
  const selfRules = new Set<SodRule>();
  if (gate.requesterKeys.includes(approver.key)) selfRules.add("requester_not_approver");
  if (authorOf(input.transitions, gate.revisionNo) === approver.key) selfRules.add("author_not_approver");
  if ((gate.gate === "completion" || input.effect === true) && buildersOf(input.transitions, gate.revisionNo).includes(approver.key)) {
    selfRules.add("builder_not_completion_approver");
  }
  // A key barred at open time for a reason no rule above names is still barred.
  if (gate.excludedKeys.includes(approver.key) && selfRules.size === 0) selfRules.add("requester_not_approver");
  if (gate.gate === "policy" && selfRules.size > 0) violations.add("policy_gate_distinct");
  for (const rule of selfRules) {
    if (input.selfApprovalAllowed && gate.gate !== "policy" && input.effect !== true) degraded.add("SOD_DEGRADED_SINGLE_USER");
    else violations.add(rule);
  }
  const approvals = input.decisions.filter((decision) => decision.decision === "APPROVE_EXECUTE");
  if (approvals.some((decision) => decision.approverKey === approver.key)) violations.add("distinct_approvers");
  const plane = input.decisions[0]?.authSource;
  if (plane !== undefined && plane !== approver.authSource) violations.add("one_plane");
  if (input.regulated && [...approvals, approver].every((decision) => decision.authSource === "LOCAL_USER")) degraded.add("SOD_DEGRADED_SELF_PROVISIONED");
  return { ok: violations.size === 0, violations: [...violations], degraded: [...degraded] };
}
