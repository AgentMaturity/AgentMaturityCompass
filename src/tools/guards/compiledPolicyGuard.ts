import type { CompiledPolicyFacts } from "../../actions/authorize.js";
import { loadVerifiedApprovalPolicy, approvalRuleForAction } from "../../approvals/approvalPolicyEngine.js";
import { activeControlPlanHead, loadActiveCompiledPolicy, type ActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import type { ApprovalRule, ParamValue } from "../../catalog/compiler/types.js";
import { loadVerifiedToolsConfigSnapshot, type VerifiedToolsConfigSnapshot } from "../../toolhub/toolhubValidators.js";
import { matchingBreakGlass } from "../../governor/breakGlass.js";
import { matchingScopedExceptions } from "../../governor/scopedExceptions.js";
import { LIFECYCLE_CONTROL_ID } from "../../lifecycle/governanceLifecycle.js";
import type { ActionClass } from "../../types.js";
import { RUN_CODE_TOOL } from "../toolPipeline.js";
import type { ToolExecution, ToolGuard } from "../toolTypes.js";

/**
 * The compiled policy as a monotonic guard (P1-12). It evaluates the tool-pipeline rules of the plan the session
 * pinned at start (visible tools, compiled guards, and the live approval policy against compiled approval rules) and
 * names the control that denies. It fails closed: a compiled guard this pipeline does not implement denies, and so
 * does any change to the active plan during the session, including one activated after the session started.
 * Egress and deletion rules stay on the policy object for P2-01; nothing here claims them.
 */

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `<id>@<version>` for each control, as the denial names them. */
function named(policy: ActiveCompiledPolicy, controlIds: readonly string[]): string {
  return controlIds.map((id) => `${id}@${policy.controls.find((c) => c.controlId === id)?.controlVersion ?? "unknown"}`).join(", ");
}

/** `identity-binding`: the lease and the principal come from the authorization record bound for this call. */
function identityDenial(params: Readonly<Record<string, ParamValue>>, execution: ToolExecution): string | null {
  const record = execution.authorization?.record;
  if (params.requireAgentLease === true && !record?.delegation.leaseId) {
    return "IDENTITY_UNRESOLVED: the call carries no verified agent lease, or its lease names a principal that does not resolve";
  }
  if (params.requirePrincipal === true && (!record || record.principal.authenticatedVia === "cli-os-user")) {
    return "PRINCIPAL_UNRESOLVED: no authenticated principal is bound to the call (an OS user name is self-reported)";
  }
  return null;
}

/** Whether the plan's `identity-binding` requires a verified agent lease (L0-IDN-01); only then is one minted or bound (P1-67). */
export function planRequiresAgentLease(policy: ActiveCompiledPolicy | null): boolean {
  return policy?.runtimePolicy.toolPipeline.guards.some((g) => g.id === "identity-binding" && g.params.requireAgentLease === true) ?? false;
}

/**
 * Whether the workspace's verified active plan sets `toolPipeline.requirePrincipal` (identity-binding, L0-IDN-01), read
 * through the same verifying path the guard's session pins (P1-78). Fails closed: a plan that cannot be verified reads as
 * requiring a principal.
 */
export function planRequiresPrincipal(workspace: string): boolean {
  let policy: ActiveCompiledPolicy | null;
  try {
    policy = loadActiveCompiledPolicy(workspace);
  } catch {
    return true;
  }
  return policy?.runtimePolicy.toolPipeline.guards.some((g) => g.id === "identity-binding" && g.params.requirePrincipal === true) ?? false;
}

/** The live signed approval policy must be at least as strict as the compiled rule; read and verified in one read. */
function approvalDenial(workspace: string, actionClass: ActionClass, rule: ApprovalRule): string | null {
  try {
    const verified = loadVerifiedApprovalPolicy(workspace);
    if (verified.verdict !== "valid" || verified.policy === null) return "the signed approval policy does not verify";
    const live = approvalRuleForAction(verified.policy, actionClass);
    const weaker = [
      live.requiredApprovals < rule.requiredApprovals ? `requiredApprovals ${live.requiredApprovals} < ${rule.requiredApprovals}` : "",
      rule.requireDistinctUsers && !live.requireDistinctUsers ? "requireDistinctUsers is off" : "",
      live.rolesAllowed.some((role) => !rule.rolesAllowed.includes(role)) ? "rolesAllowed is wider" : "",
      live.ttlMinutes > rule.ttlMinutes ? `ttlMinutes ${live.ttlMinutes} > ${rule.ttlMinutes}` : ""
    ].filter(Boolean);
    return weaker.length > 0 ? `the signed approval policy for ${actionClass} is weaker than compiled (${weaker.join(", ")})` : null;
  } catch (error) {
    return `the signed approval policy cannot be read: ${message(error)}`;
  }
}

/** The verified tools.yaml one guard pass decides from: the native toolset shares one read with its allowlist guards. */
export type ToolsSnapshotRead = () => VerifiedToolsConfigSnapshot;

/**
 * P1-10F: a plan compiled from the workspace's signed tools.yaml records the SHA-256 of its bytes. Any other tools.yaml
 * now (edited, re-signed or removed) denies, as the catalog lock does for the catalog, until the plan is recompiled and
 * reactivated, so tools.yaml cannot change what an activated plan shows. The denial is model-visible: no host path.
 */
function toolsConfigDenial(pinned: string, snapshot: VerifiedToolsConfigSnapshot): string | null {
  const live = snapshot.digestSha256;
  if (live === pinned) return null;
  return live === null
    ? `the signed tools.yaml this plan was compiled from cannot be read or verified (${snapshot.reason ?? "unknown reason"}); recompile and reactivate the plan`
    : `the signed tools.yaml changed since this plan was compiled (sha256 ${live.slice(0, 12)}, the plan records ${pinned.slice(0, 12)}); recompile and reactivate the plan`;
}

/**
 * Whether the policy's `toolPipeline.visibleTools` lists this tool. The guard denies what this refuses; native sessions
 * also leave it out of the tools offered to the model. The Code Mode transport dispatches sub-calls, and each one is
 * checked on its own name.
 */
export function compiledPolicyShows(policy: ActiveCompiledPolicy, name: string): boolean {
  return name === RUN_CODE_TOOL || policy.runtimePolicy.toolPipeline.visibleTools.includes(name);
}

/**
 * P2-24: the controls this call deviates from. Only a scoped exception or break-glass record the bound authorization
 * record names counts, re-read and re-verified now (signature, workspace, approval, revocation, window, scope, amount),
 * and an exception only for the control version it was granted for. Any read failure deviates from nothing.
 */
function deviatedControls(policy: ActiveCompiledPolicy, execution: ToolExecution): ReadonlySet<string> {
  const record = execution.authorization?.record;
  if (!record || (record.authority.exceptions.length === 0 && record.authority.breakGlassId === undefined)) return new Set();
  const call = { workspace: execution.workspace, agentId: execution.agentId, toolName: record.action.toolName, actionClass: record.action.actionClass,
    amount: record.bindings.amount, resourceId: record.bindings.resourceId };
  const named = new Set(record.authority.exceptions.map((exception) => exception.exceptionId));
  const version = (id: string): string | undefined => policy.controls.find((c) => c.controlId === id)?.controlVersion;
  try {
    return new Set([
      ...matchingScopedExceptions(call).filter((e) => named.has(e.exceptionId) && version(e.control.controlId) === e.control.controlVersion)
        .map((e) => e.control.controlId),
      ...matchingBreakGlass(call).filter((b) => b.breakGlassId === record.authority.breakGlassId).flatMap((b) => b.scope.controlIds)
    ]);
  } catch {
    return new Set();
  }
}

/** Why the pinned policy denies this call, or undefined. */
export function compiledPolicyDenial(policy: ActiveCompiledPolicy, workspace: string, execution: ToolExecution,
  readTools: ToolsSnapshotRead = () => loadVerifiedToolsConfigSnapshot(workspace)): string | undefined {
  const deny = (controlIds: readonly string[], why: string): string => `compiled policy denied this call (control ${named(policy, controlIds)}): ${why}`;
  const pipeline = policy.runtimePolicy.toolPipeline;
  const toolsWhy = pipeline.toolsConfigSha256 === undefined ? null : toolsConfigDenial(pipeline.toolsConfigSha256, readTools());
  if (toolsWhy) return `compiled policy denied this call (toolPipeline.toolsConfigSha256): ${toolsWhy}`;
  if (!compiledPolicyShows(policy, execution.name)) {
    return `compiled policy denied this call (toolPipeline.visibleTools): "${execution.name}" is not a visible tool`;
  }
  // A control is waived only when every control a denial names is covered; the checks above name no control and never are.
  let deviated: ReadonlySet<string> | null = null;
  const waived = (controlIds: readonly string[]): boolean =>
    controlIds.length > 0 && controlIds.every((id) => (deviated ??= deviatedControls(policy, execution)).has(id));
  for (const guard of pipeline.guards) {
    const why = guard.id === "identity-binding" ? identityDenial(guard.params, execution) : `guard ${guard.id} is not implemented by this pipeline`;
    if (why && !waived(guard.controlIds)) return deny(guard.controlIds, why);
  }
  const rule = policy.runtimePolicy.approvals[execution.actionClass];
  const why = rule ? approvalDenial(workspace, execution.actionClass, rule) : null;
  return why && rule && !waived(rule.controlIds) ? deny(rule.controlIds, why) : undefined;
}

/**
 * The guard. `pinned` is what the session loaded at start, or null. Any other head now (changed, removed, or a plan
 * activated since) denies: the receipt the session wrote names the policy every call ran under.
 */
export function compiledPolicyGuard(workspace: string, pinned: ActiveCompiledPolicy | null, readTools?: ToolsSnapshotRead): ToolGuard {
  return (execution) => {
    let head: string | null;
    try {
      head = activeControlPlanHead(workspace);
    } catch (error) {
      return `compiled policy integrity failure: ${message(error)}`;
    }
    if (head !== (pinned?.entrySha256 ?? null)) return "the active compiled policy changed during this session; start a new session";
    return pinned ? compiledPolicyDenial(pinned, workspace, execution, readTools) : undefined;
  };
}

/** What an authorization record cites from the pinned policy (P1-02 fields). */
export function compiledPolicyFacts(policy: ActiveCompiledPolicy): CompiledPolicyFacts {
  const versionOf = (id: string): string | null => policy.controls.find((c) => c.controlId === id)?.controlVersion ?? null;
  return {
    digest: policy.runtimePolicy.policyDigest.replace(/^sha256:/, ""),
    revision: policy.revision,
    deployment: policy.deployment,
    lifecycleEnforced: policy.controls.some((c) => c.controlId === LIFECYCLE_CONTROL_ID),
    // The rule that admitted the call: its class's approval rule first, then the compiled guards every call passes.
    controlFor: (actionClass) => {
      const id = [...(policy.runtimePolicy.approvals[actionClass]?.controlIds ?? []), ...policy.runtimePolicy.toolPipeline.guards.flatMap((g) => g.controlIds)][0];
      return id === undefined ? null : { controlId: id, controlVersion: versionOf(id) };
    }
  };
}

/** Classes the policy requires a signed approval for (P1-02 `boundApprovalRequiredFor`). */
export function compiledApprovalClasses(policy: ActiveCompiledPolicy | null): ReadonlySet<string> {
  return new Set(policy?.runtimePolicy.toolPipeline.approvalRequiredFor ?? []);
}
