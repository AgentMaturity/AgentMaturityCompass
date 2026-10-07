/**
 * Plan signing (P1-10). `signPlan` is blocked in agent mode, verifies the previous plan whole before using it as the
 * baseline, lists every weakening against it and refuses them unless `allowWeakening`, then signs the plan digest as
 * CONTROL_PLAN with the workspace's signing policy. Signatures checked against the workspace's own auditor keys are a
 * local audit trail, not portable trust (P0-09). A signature shows who signed the plan, not that it is right.
 */
import { resolve } from "node:path";
import { createApprovalForIntent } from "../../approvals/approvalEngine.js";
import { signDigestWithPolicy, verifySignedDigest } from "../../crypto/signing/signer.js";
import { fragmentWeakenings, keyed, weakenings, type Rules } from "../../domains/operatingProfiles/operatingProfileActivation.js";
import type { OperatingProfile } from "../../domains/operatingProfiles/operatingProfileTypes.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { digestOf } from "../digest.js";
import { diffPlans } from "./diff.js";
import type { CompiledPlan, EffectiveRuntimePolicy, EvidencePlan, SignedPlan } from "./types.js";

export const CONTROL_PLAN_REVIEW_TOOL = "catalog.plan.activate";
const hexOf = (digest: string): string => digest.replace(/^sha256:/, "");

/** The approval intent a plan review is bound to; P1-12 checks the decision with verifyApprovalForExecution. */
export function planReviewIntent(plan: CompiledPlan) {
  return {
    intentId: `control-plan-${hexOf(plan.digest).slice(0, 32)}`,
    toolName: CONTROL_PLAN_REVIEW_TOOL,
    actionClass: "SECURITY" as const,
    intentPayload: { planDigest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, profileId: plan.profile.profileId }
  };
}

/** Throws unless the plan's content still hashes to its digest. */
function assertDigest(plan: CompiledPlan | undefined, what: string): void {
  if (!plan || plan.planVersion !== 1 || typeof plan.digest !== "string") throw new Error(`${what} is not a version 1 control plan`);
  const { digest, ...body } = plan;
  if (digestOf(body) !== digest) throw new Error(`${what} does not match its digest (edited after compiling)`);
}

/** Verifies a signed plan whole: digest recomputed from the plan as given, CONTROL_PLAN signature over that digest. */
export function assertSignedPlan(workspace: string, signed: SignedPlan): void {
  assertDigest(signed.plan, "previous plan");
  const digestHex = hexOf(signed.plan.digest);
  if (signed.signature?.digestSha256 !== digestHex || !verifySignedDigest({ workspace, digestHex, signed: signed.signature })) {
    throw new Error("previous plan signature does not verify against this workspace's auditor keys");
  }
}

const RUNTIME_RULES: Rules = [
  [/(^|\.|\])controlIds$/, { kind: "ignore" }],
  [/^(toolPipeline\.visibleTools|egress\.allowHosts|egress\.processorAllowlist)$|\.rolesAllowed$/, { kind: "addedIsWeaker" }],
  [/^toolPipeline\.approvalRequiredFor$|^toolPipeline\.guards\[[^\]]+\]$|^approvals\.[A-Z_]+$/, { kind: "removedIsWeaker" }],
  [/\.requiredApprovals$/, { kind: "floor", absent: -Infinity }],
  [/\.ttlMinutes$/, { kind: "ceiling", absent: Infinity }],
  [/\.(requireDistinctUsers|requireAgentLease|requirePrincipal)$/, { kind: "falseIsWeaker" }]
];
const EVIDENCE_RULES: Rules = [
  [/^\w+\[[^\]]+\]$/, { kind: "removedIsWeaker" }],
  [/\.attempts$/, { kind: "floor", absent: -Infinity }],
  [/\.maxAgeDays$/, { kind: "ceiling", absent: Infinity }],
  [/\.blocking$/, { kind: "falseIsWeaker" }],
  [/\.(fixtures|runOn|bindingFields)$/, { kind: "removedIsWeaker" }]
];
const policyView = (p: EffectiveRuntimePolicy) => ({
  toolPipeline: { ...p.toolPipeline, guards: keyed(p.toolPipeline.guards, (g) => g.id) },
  approvals: p.approvals, egress: p.egress, deletion: p.deletion
});
const evidenceView = (e: EvidencePlan) => ({
  tests: keyed(e.tests, (t) => t.testId), evidenceRequests: keyed(e.evidenceRequests, (r) => r.contractId),
  manualDuties: keyed(e.manualDuties, (d) => d.controlId), releaseGates: keyed(e.releaseGates, (g) => g.testId)
});

/**
 * Every way `next` is weaker than `prev`; any change no rule classifies counts (fail closed). Reviewer exceptions are
 * listed on every signing, with or without a previous plan: each lowers what the catalog demands.
 */
export function planWeakenings(prev: CompiledPlan | null, next: CompiledPlan): string[] {
  const waived = [
    ...next.requirements.filter((r) => r.exclusion?.source === "reviewer_exception")
      .map((r) => `requirement ${r.controlId}: excluded by reviewer exception ${r.exclusion?.exceptionId}`),
    ...next.conflicts.filter((c) => c.resolution === "reviewer_exception")
      .map((c) => `parameter ${c.parameter}: ${JSON.stringify(c.appliedValue)} set by reviewer exception ${c.exceptionId}`)
  ];
  if (!prev) return waived;
  const after = new Map(next.requirements.map((r) => [r.controlId, r]));
  const dropped = prev.requirements.filter((b) => b.applicability !== "not_applicable").flatMap((b) => {
    const a = after.get(b.controlId);
    if (!a) return [`requirement ${b.controlId}: ${b.applicability} -> absent`];
    if (a.applicability === "not_applicable" && a.exclusion?.source !== "reviewer_exception") return [`requirement ${b.controlId}: ${b.applicability} -> not_applicable (${a.exclusion?.reason})`];
    if (a.controlVersion !== b.controlVersion) return [`requirement ${b.controlId}: version ${b.controlVersion} -> ${a.controlVersion} (unclassified change)`];
    return [];
  });
  const fragments = (p: CompiledPlan) => p.runtimePolicy.proposedSignedConfigs as OperatingProfile["proposedSignedConfigs"];
  return [
    ...waived,
    ...dropped,
    ...weakenings("runtimePolicy", RUNTIME_RULES, policyView(prev.runtimePolicy), policyView(next.runtimePolicy)),
    ...fragmentWeakenings(fragments(prev), fragments(next)),
    ...weakenings("evidencePlan", EVIDENCE_RULES, evidenceView(prev.evidencePlan), evidenceView(next.evidencePlan))
  ];
}

export interface SignPlanInput {
  workspace: string;
  plan: CompiledPlan;
  previous: SignedPlan | null;
  allowWeakening?: boolean;
  /** When set, also create an approval request bound to the plan digest under this agent id. */
  reviewAgentId?: string | null;
}

export function signPlan(input: SignPlanInput): { signed: SignedPlan; weakenings: string[] } {
  const workspace = resolve(input.workspace);
  assertOwnerMode(workspace, "catalog compile");
  const compiledAt = new Date().toISOString();
  assertDigest(input.plan, "plan");
  if (input.previous) {
    assertSignedPlan(workspace, input.previous);
    // Another profile's plan is no baseline: a laxer one would hide this plan's weakenings.
    if (input.previous.plan.profile.profileId !== input.plan.profile.profileId) {
      throw new Error(`previous plan is for profile ${input.previous.plan.profile.profileId}, not ${input.plan.profile.profileId}`);
    }
  }
  const found = planWeakenings(input.previous?.plan ?? null, input.plan);
  if (found.length > 0 && input.allowWeakening !== true) {
    throw new Error(`the plan weakens ${found.join("; ")}; pass --allow-weakening after review`);
  }
  const signature = signDigestWithPolicy({ workspace, kind: "CONTROL_PLAN", digestHex: hexOf(input.plan.digest) });
  const approvalRequestId = input.reviewAgentId
    ? createApprovalForIntent({
      workspace, agentId: input.reviewAgentId, ...planReviewIntent(input.plan),
      requestedMode: "EXECUTE", effectiveMode: "EXECUTE", riskTier: "high",
      leaseConstraints: { scopes: [], routeAllowlist: [], modelAllowlist: [] }
    }).approval.approvalRequestId
    : null;
  return {
    signed: {
      plan: input.plan, compiledAt, diff: input.previous ? diffPlans(input.previous.plan, input.plan) : null,
      signature, review: { status: "pending", approvalRequestId }
    },
    weakenings: found
  };
}
