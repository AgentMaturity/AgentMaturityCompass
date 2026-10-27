/**
 * Owned P2-23 fixture: the P2-24 governance workspace (signed policies, two FINANCIAL fixture tools, an in-memory body)
 * plus a real users.yaml OWNER login as the lifecycle actor, manifests, a plan view and helpers that raise and decide a
 * lifecycle approval bound to its request digest. Reviewer ids are fixture data, not authenticated people.
 */
import type { ActiveCompiledPolicy } from "../../src/catalog/compiler/activate.js";
import type { CompiledPlan } from "../../src/catalog/compiler/types.js";
import { sessionPrincipal } from "../../src/governor/boundRecords.js";
import {
  requestTransitionApproval, transitionAgent, type GovernanceState, type LifecycleActor
} from "../../src/lifecycle/governanceLifecycle.js";
import { applyOwnerTransition, type PlanView } from "../../src/lifecycle/reassessment.js";
import type { AgentVersionManifest } from "../../src/lifecycle/versionManifest.js";
import { AGENT, AUDITOR, decideBound, loginAs, OWNER, planWithControl } from "../governor/governanceFixture.js";

export { AGENT };

export function ownerActor(workspace: string, username = "lifecycle-owner"): LifecycleActor {
  return { ...sessionPrincipal(workspace, loginAs(workspace, username, ["OWNER"]).tokenFile), via: "approvals-session" };
}

export function manifest(overrides: Partial<AgentVersionManifest> = {}): AgentVersionManifest {
  return { v: 1, agentId: AGENT, deploymentId: "not_bound", model: { providerId: "fixture-provider", model: "fixture-model-a", providerReportedVersion: "2026-10-01" },
    systemPromptSha256: "a".repeat(64), toolsDigest: "b".repeat(64), policyDigest: "policy-a", compiledPlanDigest: "none",
    harnessVersion: "1.2.0", compositionDigest: "composition-a", corpusDigests: [], ...overrides };
}

/** Raise the approval a move needs, have OWNER and AUDITOR fixture reviewers decide it bound, and apply it. */
export async function approvedMove(workspace: string, actor: LifecycleActor, to: GovernanceState, m: AgentVersionManifest) {
  const { approval } = await requestTransitionApproval({ workspace, agentId: AGENT, to, actor, manifest: m });
  decideBound(workspace, approval, [OWNER, AUDITOR]);
  return applyOwnerTransition({ workspace, agentId: AGENT, to, actor, approvalId: approval.approvalRequestId, manifest: m });
}

/** proposed → approved (bound to `m`) → active. */
export async function activate(workspace: string, actor: LifecycleActor, m: AgentVersionManifest = manifest()): Promise<void> {
  transitionAgent({ workspace, agentId: AGENT, to: "proposed", actor });
  await approvedMove(workspace, actor, "approved", m);
  transitionAgent({ workspace, agentId: AGENT, to: "active", actor });
}

/** A plan whose L0-CHG-01 is mandatory and invalidated by model, prompt and tool changes; L1-OPT-01 is optional. */
export function planView(options: { lifecycleControl?: boolean } = {}): PlanView {
  const requirement = (controlId: string, mandatory: boolean) => ({ controlId, controlVersion: "0.1.0", controlDigest: "d", layer: 0 as const,
    applicability: "applicable" as const, reasons: [], missingFacts: [], exclusion: null, citationsInScope: [], mandatory, support: "experimental" as const, pulledInBy: ["layer0"] });
  const plan = {
    digest: `sha256:${"9".repeat(64)}`,
    requirements: [...(options.lifecycleControl === false ? [] : [requirement("L0-CHG-01", true)]), requirement("L1-OPT-01", false)],
    evidencePlan: {
      tests: [{ controlId: "L0-CHG-01", testId: "L0-CHG-01-T2", type: "runtime_enforced" as const, attempts: 1, fixtures: [], runOn: ["activation", "model_version", "prompt_version", "tool_version"] },
        { controlId: "L1-OPT-01", testId: "L1-OPT-01-T1", type: "configuration_check" as const, attempts: 1, fixtures: [], runOn: ["activation", "corpus_version"] }],
      evidenceRequests: [], manualDuties: [], releaseGates: []
    }
  } as unknown as Pick<CompiledPlan, "digest" | "requirements" | "evidencePlan">;
  const invalidated: Record<string, PlanView["invalidatedBy"] extends (id: string) => infer R ? R : never> = {
    "L0-CHG-01": ["model_version", "prompt_version", "tool_version"], "L1-OPT-01": ["corpus_version"]
  };
  return { plan, invalidatedBy: (id) => invalidated[id] ?? [] };
}

/** A typed plan with no guards: L0-CHG-01 present (lifecycle enforced) or absent (advisory). */
export function compiledPlan(options: { lifecycleControl: boolean }): ActiveCompiledPolicy {
  const plan = planWithControl("approved");
  return { ...plan, controls: options.lifecycleControl ? [{ controlId: "L0-CHG-01", controlVersion: "0.1.0", points: ["tool_pipeline"], compiledPoints: [], review: "pending" }] : [],
    runtimePolicy: { ...plan.runtimePolicy, toolPipeline: { ...plan.runtimePolicy.toolPipeline, guards: [] } } };
}
