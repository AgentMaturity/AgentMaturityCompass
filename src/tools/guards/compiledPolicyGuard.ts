import { readFileSync } from "node:fs";
import YAML from "yaml";
import type { CompiledPolicyFacts } from "../../actions/authorize.js";
import { approvalPolicyPath, approvalRuleForAction } from "../../approvals/approvalPolicyEngine.js";
import { approvalPolicySchema } from "../../approvals/approvalPolicySchema.js";
import { activeControlPlanHead, type ActiveCompiledPolicy } from "../../catalog/compiler/activate.js";
import type { ApprovalRule, ParamValue } from "../../catalog/compiler/types.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../crypto/keys.js";
import type { ActionClass } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
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
  if (params.requireAgentLease === true && !record?.delegation.leaseId) return "IDENTITY_UNRESOLVED: the call carries no verified agent lease";
  if (params.requirePrincipal === true && (!record || record.principal.authenticatedVia === "cli-os-user")) {
    return "PRINCIPAL_UNRESOLVED: no authenticated principal is bound to the call (an OS user name is self-reported)";
  }
  return null;
}

/** The live signed approval policy must be at least as strict as the compiled rule; read and verified in one read. */
function approvalDenial(workspace: string, actionClass: ActionClass, rule: ApprovalRule): string | null {
  const path = approvalPolicyPath(workspace);
  try {
    const bytes = readFileSync(path);
    const sig = JSON.parse(readFileSync(`${path}.sig`, "utf8")) as { digestSha256?: unknown; signature?: unknown };
    const digest = sha256Hex(bytes);
    if (sig.digestSha256 !== digest || typeof sig.signature !== "string"
      || !verifyHexDigestAny(digest, sig.signature, getPublicKeyHistory(workspace, "auditor"))) return "the signed approval policy does not verify";
    const live = approvalRuleForAction(approvalPolicySchema.parse(YAML.parse(bytes.toString("utf8"))), actionClass);
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

/**
 * Whether the policy's `toolPipeline.visibleTools` lists this tool. The guard denies what this refuses; native sessions
 * also leave it out of the tools offered to the model. The Code Mode transport dispatches sub-calls, and each one is
 * checked on its own name.
 */
export function compiledPolicyShows(policy: ActiveCompiledPolicy, name: string): boolean {
  return name === RUN_CODE_TOOL || policy.runtimePolicy.toolPipeline.visibleTools.includes(name);
}

/** Why the pinned policy denies this call, or undefined. */
export function compiledPolicyDenial(policy: ActiveCompiledPolicy, workspace: string, execution: ToolExecution): string | undefined {
  const deny = (controlIds: readonly string[], why: string): string => `compiled policy denied this call (control ${named(policy, controlIds)}): ${why}`;
  const pipeline = policy.runtimePolicy.toolPipeline;
  if (!compiledPolicyShows(policy, execution.name)) {
    return `compiled policy denied this call (toolPipeline.visibleTools): "${execution.name}" is not a visible tool`;
  }
  for (const guard of pipeline.guards) {
    const why = guard.id === "identity-binding" ? identityDenial(guard.params, execution) : `guard ${guard.id} is not implemented by this pipeline`;
    if (why) return deny(guard.controlIds, why);
  }
  const rule = policy.runtimePolicy.approvals[execution.actionClass];
  const why = rule ? approvalDenial(workspace, execution.actionClass, rule) : null;
  return why && rule ? deny(rule.controlIds, why) : undefined;
}

/**
 * The guard. `pinned` is what the session loaded at start, or null. Any other head now (changed, removed, or a plan
 * activated since) denies: the receipt the session wrote names the policy every call ran under.
 */
export function compiledPolicyGuard(workspace: string, pinned: ActiveCompiledPolicy | null): ToolGuard {
  return (execution) => {
    let head: string | null;
    try {
      head = activeControlPlanHead(workspace);
    } catch (error) {
      return `compiled policy integrity failure: ${message(error)}`;
    }
    if (head !== (pinned?.entrySha256 ?? null)) return "the active compiled policy changed during this session; start a new session";
    return pinned ? compiledPolicyDenial(pinned, workspace, execution) : undefined;
  };
}

/** What an authorization record cites from the pinned policy (P1-02 fields). */
export function compiledPolicyFacts(policy: ActiveCompiledPolicy): CompiledPolicyFacts {
  const versionOf = (id: string): string | null => policy.controls.find((c) => c.controlId === id)?.controlVersion ?? null;
  return {
    digest: policy.runtimePolicy.policyDigest.replace(/^sha256:/, ""),
    revision: policy.revision,
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
