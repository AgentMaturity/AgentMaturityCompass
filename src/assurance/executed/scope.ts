import { budgetsSchema } from "../../budgets/budgets.js";
import { activeControlPlan, loadActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import { loadDestinationRegistrySnapshot, loadPinnedResidencyProfile } from "../../residency/destinationRegistry.js";
import { workspaceIdFromDirectory } from "../../workspaces/workspaceId.js";
import type { ExecutedRunScope } from "./reportTypes.js";

/** Fixed public error: native filesystem/trust/parser messages never leave this boundary. */
export class ExecutedScopeIntegrityError extends Error {
  readonly code = "EXECUTED_SCOPE_INTEGRITY_FAILURE";
  constructor() {
    super("EXECUTED_SCOPE_INTEGRITY_FAILURE");
    this.name = "ExecutedScopeIntegrityError";
  }
}

/** Reads native verified policy/profile facts. Missing context supplies no execution scope. */
export function loadExecutedRunScope(input: {
  workspace: string; agentId: string; runId: string;
}): ExecutedRunScope | null {
  try {
    if (!input.workspace.trim() || !input.agentId.trim() || !input.runId.trim()) return null;
    const active = loadActiveCompiledPolicy(input.workspace);
    if (active === null) return null;
    const plan = activeControlPlan(input.workspace);
    // Both native journal reads must identify the same verified plan and exact policy/profile pins.
    if (plan === null || plan.digest !== active.planDigest || plan.profile.sha256 !== active.profileSha256 ||
        plan.runtimePolicy.policyDigest !== active.runtimePolicy.policyDigest) throw new ExecutedScopeIntegrityError();
    const deployment = active.deployment;
    if (deployment === null || !plan.profile.deployment) return null;
    if (plan.profile.deployment.tenantId !== deployment.tenantId ||
        plan.profile.deployment.deploymentId !== deployment.deploymentId) throw new ExecutedScopeIntegrityError();

    const registry = loadDestinationRegistrySnapshot(input.workspace);
    if (registry.state === "missing") return null;
    if (registry.state !== "verified") throw new ExecutedScopeIntegrityError();
    const profile = loadPinnedResidencyProfile(input.workspace, registry.registry, active.profileSha256);
    // The native workspace ID is only a comparison. Returned IDs come from authenticated native facts.
    if (profile.tenantId !== deployment.tenantId || profile.workspaceId !== workspaceIdFromDirectory(input.workspace)) {
      throw new ExecutedScopeIntegrityError();
    }
    const members = budgetsSchema.parse(active.runtimePolicy.proposedSignedConfigs.budgets).budgets.perAgent;
    if (!Object.hasOwn(members, input.agentId)) return null;

    return {
      tenantId: profile.tenantId, workspaceId: profile.workspaceId,
      deploymentId: deployment.deploymentId, agentId: input.agentId,
      policyDigest: active.runtimePolicy.policyDigest, runId: input.runId,
      planDigest: active.planDigest, profileSha256: active.profileSha256,
      controlApplicability: Object.fromEntries(plan.requirements.map(row => [row.controlId, row.applicability]))
    };
  } catch {
    throw new ExecutedScopeIntegrityError();
  }
}
