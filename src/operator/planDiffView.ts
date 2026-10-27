/**
 * The operator's plan diff and signed activation (P2-22, backlog A14). Plans are the signed compiled plans the workspace
 * holds: every A4 Adapt build (P1-61) and the active plan in the signed control journal (P1-12). A diff is diffPlans'
 * output (P1-10): every reason comes from the compiler, never from UI text. Activation runs activateControlPlan with a
 * plan review approved for exactly that plan, and counts only decisions bound to the review request's digest (the bound
 * decision path, decideApprovalForIntent({ expectedRequestDigestSha256 })); the caller never counts as an approver.
 * A signature checked against the workspace's own keys is a local audit trail, not portable trust (P0-09).
 */
import { verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { approvalRequestBindingDigest, listApprovalDecisions, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { activateControlPlan, activeControlPlan } from "../catalog/compiler/activate.js";
import { diffPlans, renderPlanDiffMarkdown } from "../catalog/compiler/diff.js";
import { assertSignedPlan, CONTROL_PLAN_REVIEW_TOOL, planReviewIntent } from "../catalog/compiler/sign.js";
import type { CompiledPlan, PlanDiff, SignedPlan } from "../catalog/compiler/types.js";
import { buildOf, proposedPlan } from "../a4/spec/adapt.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { readA4Projects } from "./operatorSources.js";

/** A plan the operator can see: where it came from, and whether its CONTROL_PLAN signature verifies now. */
export interface PlanCandidate {
  readonly plan: CompiledPlan;
  readonly signed: Pick<SignedPlan, "plan" | "signature" | "compiledAt"> | null;
  readonly previousPlanDigest: string | null;
  readonly source: { kind: "a4"; projectId: string; revisionNo: number; agentId: string } | { kind: "active" };
}

export interface OperatorPlan {
  planDigest: string;
  status: CompiledPlan["status"];
  profileId: string;
  compiledAt: string | null;
  previousPlanDigest: string | null;
  source: PlanCandidate["source"];
  signature: "verified" | "unsigned" | "invalid";
  active: boolean;
}

export type PlanSource = (workspace: string, now: number) => PlanCandidate[];

/** Every Adapt revision that proposed a plan; signed when Build recorded a signature for it. */
const a4Plans: PlanSource = (workspace, now) => readA4Projects(workspace, now, (projects) => projects.flatMap((project) =>
  project.state.revisions.filter((row) => row.stage === "adapt").flatMap((row): PlanCandidate[] => {
    const spec = JSON.parse(row.spec_json) as Record<string, unknown>;
    const plan = proposedPlan(spec);
    if (plan === null) return [];
    const build = buildOf(spec);
    return [{ plan, previousPlanDigest: build?.previousPlanDigest ?? null,
      signed: build === null ? null : { plan, signature: build.signature as SignedPlan["signature"], compiledAt: build.compiledAt },
      source: { kind: "a4", projectId: project.projectId, revisionNo: row.revision_no, agentId: project.agentId } }];
  })));

/** The active plan: the journal verified it whole (digest and signature) in the same read. */
const activePlan: PlanSource = (workspace) => {
  const plan = activeControlPlan(workspace);
  return plan === null ? [] : [{ plan, signed: null, previousPlanDigest: null, source: { kind: "active" } }];
};

const DEFAULT_PLAN_SOURCES: Readonly<Record<string, PlanSource>> = { a4: a4Plans, controlJournal: activePlan };

function signatureOf(workspace: string, candidate: PlanCandidate): OperatorPlan["signature"] {
  if (candidate.source.kind === "active") return "verified";
  if (candidate.signed === null) return "unsigned";
  try {
    assertSignedPlan(workspace, candidate.signed, "plan");
    return "verified";
  } catch {
    return "invalid";
  }
}

/** Every plan from every source, newest source order kept; a source that fails is named in `sources`, never dropped silently. */
export function listOperatorPlans(workspace: string, now = Date.now(), sources = DEFAULT_PLAN_SOURCES): {
  plans: OperatorPlan[]; candidates: PlanCandidate[]; sources: Record<string, "ok" | "unavailable">;
} {
  const status: Record<string, "ok" | "unavailable"> = {};
  const candidates: PlanCandidate[] = [];
  for (const [name, source] of Object.entries(sources)) {
    try {
      candidates.push(...source(workspace, now));
      status[name] = "ok";
    } catch {
      status[name] = "unavailable";
    }
  }
  const active = candidates.find((candidate) => candidate.source.kind === "active")?.plan.digest ?? null;
  const plans = candidates.map((candidate): OperatorPlan => ({
    planDigest: candidate.plan.digest, status: candidate.plan.status, profileId: candidate.plan.profile.profileId,
    compiledAt: candidate.signed?.compiledAt ?? null, previousPlanDigest: candidate.previousPlanDigest, source: candidate.source,
    signature: signatureOf(workspace, candidate), active: candidate.plan.digest === active
  }));
  return { plans, candidates, sources: status };
}

export class OperatorPlanError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "OperatorPlanError";
  }
}

/** The candidate for `digest` whose signature verifies now; 404 when none is known, 409 PLAN_UNSIGNED when none verifies. */
function verifiedCandidate(workspace: string, candidates: readonly PlanCandidate[], digest: string): PlanCandidate {
  const matching = candidates.filter((candidate) => candidate.plan.digest === digest);
  if (matching.length === 0) throw new OperatorPlanError(404, "PLAN_NOT_FOUND", `no plan ${digest} in this workspace`);
  const verified = matching.find((candidate) => signatureOf(workspace, candidate) === "verified");
  if (verified === undefined) throw new OperatorPlanError(409, "PLAN_UNSIGNED", "the plan has no CONTROL_PLAN signature that verifies; only a signed plan is compared or activated");
  return verified;
}

/** diffPlans between two signed plans, with its Markdown; reasons are the compiler's. */
export function operatorPlanDiff(workspace: string, from: string, to: string, now = Date.now(), sources = DEFAULT_PLAN_SOURCES): {
  from: string; to: string; diff: PlanDiff; markdown: string;
} {
  const { candidates } = listOperatorPlans(workspace, now, sources);
  const before = verifiedCandidate(workspace, candidates, from).plan;
  const after = verifiedCandidate(workspace, candidates, to).plan;
  const diff = diffPlans(before, after);
  return { from, to, diff, markdown: renderPlanDiffMarkdown(diff) };
}

/**
 * The approvers whose decisions count: APPROVE_EXECUTE decisions bound to the request's digest, by distinct users, none of
 * them the caller. A decision recorded without the digest (the unbound path) counts for nothing.
 */
function boundApprovers(workspace: string, agentId: string | undefined, approvalId: string, binding: string, caller: string): string[] {
  const users = listApprovalDecisions({ workspace, agentId, approvalRequestId: approvalId })
    .filter((decision) => decision.decision === "APPROVE_EXECUTE" && decision.requestDigestSha256 === binding)
    .filter((decision) => decision.username !== caller && decision.userId !== caller)
    .map((decision) => decision.userId);
  return [...new Set(users)];
}

/**
 * POST /api/v1/operator/plans/activate: activates the signed plan `planDigest` with the plan review `approvalId`. Refuses
 * (403) without an approval, with one for another plan or not approved, or without enough bound approvals from people
 * other than the caller; refuses (409) an unsigned plan; activateControlPlan then re-checks the review, consumes it and
 * refuses any weakening against the active plan.
 */
export function activateOperatorPlan(input: { workspace: string; planDigest: string; approvalId: string | undefined; caller: string;
  now?: number; sources?: Readonly<Record<string, PlanSource>> }): { revision: number; weakenings: string[]; approvers: string[] } {
  const { candidates } = listOperatorPlans(input.workspace, input.now ?? Date.now(), input.sources ?? DEFAULT_PLAN_SOURCES);
  const candidate = verifiedCandidate(input.workspace, candidates, input.planDigest);
  if (input.approvalId === undefined) throw new OperatorPlanError(403, "APPROVAL_REQUIRED", "activation needs a plan review approved for exactly this plan");
  if (candidate.signed === null) throw new OperatorPlanError(409, "PLAN_ALREADY_ACTIVE", "this plan is the active plan");
  const agentId = candidate.source.kind === "a4" ? candidate.source.agentId : undefined;
  let request;
  try {
    request = loadApprovalRequestRecord({ workspace: input.workspace, agentId, approvalRequestId: input.approvalId, requireValidSignature: true });
  } catch {
    throw new OperatorPlanError(403, "PLAN_REVIEW_NOT_APPROVED", "the approval does not exist or its signature does not verify");
  }
  const intent = planReviewIntent(candidate.plan);
  const verified = verifyApprovalForExecution({ workspace: input.workspace, approvalId: input.approvalId, expectedAgentId: request.agentId,
    expectedIntentId: intent.intentId, expectedIntentHash: sha256Hex(canonicalize(intent.intentPayload)), expectedToolName: CONTROL_PLAN_REVIEW_TOOL,
    expectedActionClass: intent.actionClass });
  if (!verified.ok || verified.approval === null) {
    throw new OperatorPlanError(403, "PLAN_REVIEW_NOT_APPROVED", `the approval does not authorize this plan: ${verified.error ?? "not approved"}`);
  }
  const approvers = boundApprovers(input.workspace, request.agentId, input.approvalId, approvalRequestBindingDigest(verified.approval), input.caller);
  if (approvers.length < Math.max(1, verified.approval.requiredApprovals)) {
    throw new OperatorPlanError(403, "APPROVAL_NOT_BOUND", `${approvers.length} approval(s) bound to the review request's digest from people other than you; `
      + `${Math.max(1, verified.approval.requiredApprovals)} required`);
  }
  try {
    const result = activateControlPlan({ workspace: input.workspace, signed: candidate.signed, approvalRequestId: input.approvalId, reviewAgentId: request.agentId });
    return { ...result, approvers };
  } catch (error) {
    // Codes only: activateControlPlan's messages can name files.
    const text = error instanceof Error ? error.message : String(error);
    const code = /weakens/.test(text) ? "PLAN_WEAKENS_ACTIVE_PLAN" : /already used/.test(text) ? "GRANT_ALREADY_USED"
      : /lockfile|catalog differs/.test(text) ? "PLAN_LOCK_DRIFT" : /blocked/.test(text) ? "PLAN_BLOCKED"
        : /agent mode/.test(text) ? "AGENT_MODE" : "PLAN_ACTIVATION_REFUSED";
    throw new OperatorPlanError(409, code, "activateControlPlan refused this plan; see the code");
  }
}
