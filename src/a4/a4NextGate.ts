/**
 * What the console's guide needs from readiness that the pure evaluator cannot read, added to the readiness a person reads:
 * Review's own refusals while an Assemble build session is open (assembleBuild.reviewRefusals), and `nextGate`, the
 * quorum the stage's next gate will ask for before anyone requests it, with how many people could decide it now. Words and
 * guidance only: the gate request records its own quorum (a4GateRequest.gateQuorum) and every rule is checked again there.
 */
import type { NativeTaskApiContext } from "../api/nativeTasksRouter.js";
import { authorsOf, buildersOf } from "./a4SoD.js";
import { gateQuorum } from "./a4GateRequest.js";
import { isRegulated, localDeciders, type A4ReadinessQuery, type A4ReadinessState } from "./a4Readiness.js";
import type { A4Principal, A4ReadinessV1 } from "./a4Schema.js";
import { reviewRefusals } from "./assembleBuild.js";

/**
 * The next gate of the viewed stage while none is open: proposed → direction, reviewed → completion. `eligible` counts
 * as readiness's `sod` item does once the gate is open: the deciders (approver or owner members, local workspace OWNERs; on a
 * regulated project the members alone) less the caller as requester, the revision's authors and, at completion, its builders;
 * one self-approving user counts once.
 */
function nextGateOf(state: A4ReadinessState, query: A4ReadinessQuery, readiness: A4ReadinessV1): A4ReadinessV1["nextGate"] {
  const { project } = state;
  const gate = project.step === "proposed" ? "direction" : project.step === "reviewed" ? "completion" : null;
  const open = gate === null ? null : readiness.gates[gate] as { status?: unknown; revisionNo?: unknown } | null;
  if (gate === null || query.stage !== project.stage || (open !== null && open.revisionNo === project.revision_no
    && ["PENDING", "QUORUM_MET", "CONSUMED", "DENIED"].includes(String(open.status)))) return null;
  const { rule, rolesAllowed, required } = gateQuorum(query, query.stage, gate);
  const roleVote = rule.requiredReviews.find((entry) => entry.kind === "role_vote" && entry.role !== undefined)?.role ?? null;
  const principal: A4Principal | null = query.principal;
  const excluded = new Set([...(principal ? [principal.key] : []), ...authorsOf(state.chain, { gate, revisionNo: project.revision_no }),
    ...(gate === "completion" ? buildersOf(state.chain, project.revision_no) : [])]);
  const regulated = isRegulated(state, query.floor);
  const deciders = regulated ? new Set(state.members.filter((member) => member.roles.includes("approver") || member.roles.includes("owner")).map((member) => member.principalKey))
    : localDeciders(state, query.live);
  const eligible = principal === null || deciders === null ? null : readiness.selfApprovalAllowed ? deciders.size : [...deciders].filter((key) => !excluded.has(key)).length;
  return { gate, required, rolesAllowed: [...rolesAllowed], roleVote, eligible };
}

/** Readiness as the console reads it: `nextGate`, and Review held while a build session of this caller's is still open. */
export function viewerReadiness(evaluated: { readiness: A4ReadinessV1; query: A4ReadinessQuery }, state: A4ReadinessState,
  native: NativeTaskApiContext | undefined): A4ReadinessV1 {
  const { readiness, query } = evaluated;
  const held = query.stage === "assemble" ? reviewRefusals(native, state, query.principal) : [];
  const review = readiness.allowed.review;
  return { ...readiness, nextGate: nextGateOf(state, query, readiness),
    ...(held.length > 0 && review ? { allowed: { ...readiness.allowed, review: { allowed: false, reasonCodes: [...new Set([...review.reasonCodes, ...held])] } } } : {}) };
}
