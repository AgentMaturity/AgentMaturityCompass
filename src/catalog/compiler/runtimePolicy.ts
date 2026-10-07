/**
 * Maps merged catalog parameters onto the four enforcement points (P1-10): tool pipeline, approvals, egress and the
 * deletion executor. Only the parameters in PARAMETERS exist; any other name, a wrong type, a different strictness or a
 * point the binding does not list fails closed. `proposedSignedConfigs` start from the same defaults and zod schemas as
 * F1's operating-profile builders, so their shapes match what the signing commands accept. Nothing here writes a file;
 * activation is in activate.ts (P1-12).
 */
import { defaultApprovalPolicy, approvalRuleForAction } from "../../approvals/approvalPolicyEngine.js";
import { approvalPolicySchema } from "../../approvals/approvalPolicySchema.js";
import { USER_ROLES, type UserRole } from "../../auth/roles.js";
import { budgetsSchema, defaultBudgets } from "../../budgets/budgets.js";
import { ACTION_CLASSES } from "../../governor/actionCatalog.js";
import { defaultActionPolicy } from "../../governor/actionPolicyEngine.js";
import { defaultOpsPolicy, opsPolicySchema } from "../../ops/policy.js";
import { defaultToolsConfig, toolsConfigSchema } from "../../toolhub/toolsSchema.js";
import type { ActionClass } from "../../types.js";
import { digestOf } from "../digest.js";
import type { LoadedCatalog } from "../loader.js";
import type { ControlRecord, EnforcementPoint, Strictness } from "../types.js";
import type { MergedParameter } from "./merge.js";
import { CompileError, type ApprovalRule, type EffectiveRuntimePolicy, type ParamValue, type UnsupportedControl } from "./types.js";

interface ParamSpec { pattern: RegExp; point: EnforcementPoint; strictness: Strictness; check: (v: ParamValue) => boolean; expects: string }

const int = (min: number) => (v: ParamValue) => typeof v === "number" && Number.isInteger(v) && v >= min;
const bool = (v: ParamValue) => typeof v === "boolean";
const listOf = (ok: (item: string) => boolean) => (v: ParamValue) => Array.isArray(v) && v.every(ok);
const isActionClass = (s: string) => (ACTION_CLASSES as string[]).includes(s);
const isRole = (s: string) => (USER_ROLES as readonly string[]).includes(s);
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const AC = ACTION_CLASSES.join("|");
const approval = (field: string) => new RegExp(`^approvals\\.(${AC})\\.${field}$`);

/** Every parameter the compiler can enforce; docs/catalog/COMPILER.md mirrors this table. */
export const PARAMETERS: readonly ParamSpec[] = [
  { pattern: /^toolPipeline\.visibleTools$/, point: "tool_pipeline", strictness: "intersection", check: listOf((s) => s.length > 0), expects: "a list of tool names" },
  { pattern: /^toolPipeline\.approvalRequiredFor$/, point: "tool_pipeline", strictness: "union", check: listOf(isActionClass), expects: "a list of action classes" },
  { pattern: /^toolPipeline\.(requireAgentLease|requirePrincipal)$/, point: "tool_pipeline", strictness: "true_wins", check: bool, expects: "a boolean" },
  { pattern: approval("requiredApprovals"), point: "approvals", strictness: "max", check: int(0), expects: "an integer >= 0" },
  { pattern: approval("requireDistinctUsers"), point: "approvals", strictness: "true_wins", check: bool, expects: "a boolean" },
  { pattern: approval("rolesAllowed"), point: "approvals", strictness: "intersection", check: listOf(isRole), expects: `a list of ${USER_ROLES.join(", ")}` },
  { pattern: approval("ttlMinutes"), point: "approvals", strictness: "min", check: int(1), expects: "an integer >= 1" },
  { pattern: /^egress\.allowHosts$/, point: "egress", strictness: "union", check: listOf((h) => HOST.test(h)), expects: "a list of lowercase host names" },
  // Retention has two legitimate strict directions (record-keeping vs minimization), so it is `none`.
  { pattern: /^deletion\.retentionDays\.(auditLog|payloads)$/, point: "deletion_executor", strictness: "none", check: int(1), expects: "an integer >= 1" }
];

/** Tool-pipeline parameters and the guard that enforces them. */
const GUARD_OF: Readonly<Record<string, string>> = {
  "toolPipeline.requireAgentLease": "identity-binding",
  "toolPipeline.requirePrincipal": "identity-binding"
};
/**
 * Guards the native tool pipeline registers (src/agent/agentToolset.ts). identity-binding is enforced inside the
 * `compiled-policy` guard (src/tools/guards/compiledPolicyGuard.ts, P1-12).
 */
const REGISTERED_GUARDS: ReadonlySet<string> = new Set(["prompt-injection", "runtime-firewall", "budgets", "network-egress", "tool-allowlist", "native-tool-identity", "identity-binding"]);

/** Checks every parameter of every control in the catalog, applicable or not: a catalog defect is a defect. */
export function checkParameters(cat: LoadedCatalog): void {
  for (const control of cat.controls.values()) {
    for (const p of control.binding.parameters) {
      const at = `${control.id} parameter ${p.name}`;
      const spec = PARAMETERS.find((s) => s.pattern.test(p.name));
      if (!spec) throw new CompileError("UNKNOWN_PARAMETER", `${at} maps to no enforcement point (docs/catalog/COMPILER.md lists the parameters)`);
      if (p.strictness !== spec.strictness) throw new CompileError("STRICTNESS_MISMATCH", `${at} is declared ${p.strictness}; the compiler requires ${spec.strictness}`);
      if (!spec.check(p.value)) throw new CompileError("PARAMETER_TYPE", `${at} must be ${spec.expects}`);
      if (!control.binding.points.includes(spec.point)) throw new CompileError("PARAMETER_POINT", `${at} is enforced at ${spec.point}, which its binding does not list`);
    }
  }
}

/** Controls whose parameters need a guard the tool pipeline does not register yet. */
export function absentEnforcement(controls: ControlRecord[]): UnsupportedControl[] {
  return controls.flatMap((control) => {
    const missing = [...new Set(control.binding.parameters.map((p) => GUARD_OF[p.name]).filter((g): g is string => g !== undefined && !REGISTERED_GUARDS.has(g)))];
    return missing.map((guard) => ({
      controlId: control.id,
      reason: "enforcement_point_absent" as const,
      detail: `guard ${guard} is not registered in the tool pipeline yet (P1-12 adds it)`
    }));
  });
}

const ids = (rows: MergedParameter[]): string[] => [...new Set(rows.flatMap((r) => r.controlIds))].sort();
const last = (name: string): string => name.slice(name.lastIndexOf(".") + 1);

function approvalRules(params: MergedParameter[]): EffectiveRuntimePolicy["approvals"] {
  const defaults = defaultApprovalPolicy();
  const out: EffectiveRuntimePolicy["approvals"] = {};
  for (const ac of ACTION_CLASSES) {
    const rows = params.filter((p) => p.name.startsWith(`approvals.${ac}.`));
    if (rows.length === 0) continue;
    const value = (field: string) => rows.find((r) => r.name === `approvals.${ac}.${field}`)?.value ?? undefined;
    const base = approvalRuleForAction(defaults, ac);
    // Never looser than the shipped default rule; an unresolved value leaves the default in place. No common role
    // leaves nobody able to approve, which denies.
    const roles = value("rolesAllowed") as string[] | undefined;
    const rule: ApprovalRule = {
      requiredApprovals: Math.max(base.requiredApprovals, (value("requiredApprovals") as number | undefined) ?? 0),
      requireDistinctUsers: base.requireDistinctUsers || value("requireDistinctUsers") === true,
      rolesAllowed: (roles ? base.rolesAllowed.filter((r) => roles.includes(r)) : [...base.rolesAllowed]).sort(),
      ttlMinutes: Math.min(base.ttlMinutes, (value("ttlMinutes") as number | undefined) ?? Infinity),
      controlIds: ids(rows)
    };
    out[ac] = rule;
  }
  return out;
}

function proposedConfigs(approvals: EffectiveRuntimePolicy["approvals"], visibleTools: string[] | undefined,
  retention: Record<string, number>, agentIds: string[]): EffectiveRuntimePolicy["proposedSignedConfigs"] {
  const approvalPolicy = defaultApprovalPolicy();
  for (const [ac, rule] of Object.entries(approvals) as Array<[ActionClass, ApprovalRule]>) {
    approvalPolicy.approvalPolicy.actionClasses[ac] = {
      ...approvalRuleForAction(approvalPolicy, ac),
      requiredApprovals: rule.requiredApprovals,
      requireDistinctUsers: rule.requireDistinctUsers,
      rolesAllowed: rule.rolesAllowed as UserRole[],
      ttlMinutes: rule.ttlMinutes
    };
  }
  const tools = defaultToolsConfig();
  if (visibleTools) tools.tools.allowedTools = tools.tools.allowedTools.filter((t) => visibleTools.includes(t.name));
  const ops = defaultOpsPolicy();
  const keep = ops.opsPolicy.retention;
  if (retention.auditLog !== undefined) keep.keepArchiveSegmentsDays = retention.auditLog;
  if (retention.payloads !== undefined) {
    keep.prunePayloadsAfterDays = retention.payloads;
    keep.archivePayloadsAfterDays = Math.min(keep.archivePayloadsAfterDays, retention.payloads);
  }
  return {
    approvalPolicy: approvalPolicySchema.parse(approvalPolicy),
    budgets: budgetsSchema.parse({ budgets: { version: 1, perAgent: Object.fromEntries(agentIds.map((id) => [id, defaultBudgets(id).budgets.perAgent[id]])) } }),
    tools: toolsConfigSchema.parse(tools),
    actionPolicy: defaultActionPolicy(),
    // What activation reads from a firewall fragment; block is the strictest mode.
    firewall: { mode: "block", failClosedOnMissingPolicy: true },
    opsPolicy: opsPolicySchema.parse(ops)
  };
}

/** The effective runtime policy. An unresolved parameter (value null) is left out; such a plan is blocked anyway. */
export function buildRuntimePolicy(parameters: Map<string, MergedParameter>, agentIds: string[]): EffectiveRuntimePolicy {
  const all = [...parameters.values()];
  const under = (prefix: string) => all.filter((p) => p.name.startsWith(prefix));
  const value = (name: string): ParamValue | undefined => parameters.get(name)?.value ?? undefined;
  const approvals = approvalRules(under("approvals."));
  const guards = new Map<string, MergedParameter[]>();
  for (const p of all) {
    const guard = GUARD_OF[p.name];
    if (guard && p.value !== null) guards.set(guard, [...(guards.get(guard) ?? []), p]);
  }
  const retentionDays = Object.fromEntries(under("deletion.retentionDays.").filter((p) => p.value !== null).map((p) => [last(p.name), p.value as number]));
  const proposedSignedConfigs = proposedConfigs(approvals, value("toolPipeline.visibleTools") as string[] | undefined, retentionDays, agentIds);
  const approvalPolicy = approvalPolicySchema.parse(proposedSignedConfigs.approvalPolicy);
  const approvalRequiredFor = new Set([
    ...((value("toolPipeline.approvalRequiredFor") as ActionClass[] | undefined) ?? []),
    ...ACTION_CLASSES.filter((ac) => approvalRuleForAction(approvalPolicy, ac).requiredApprovals > 0)
  ]);
  const body = {
    toolPipeline: {
      visibleTools: toolsConfigSchema.parse(proposedSignedConfigs.tools).tools.allowedTools.map((t) => t.name).sort(),
      approvalRequiredFor: [...approvalRequiredFor].sort(),
      guards: [...guards.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([id, rows]) => ({ id, params: Object.fromEntries(rows.map((r) => [last(r.name), r.value as ParamValue])), controlIds: ids(rows) }))
    },
    approvals,
    egress: { mode: "deny_by_default" as const, allowHosts: (value("egress.allowHosts") as string[] | undefined) ?? [], processorAllowlist: [], controlIds: ids(under("egress.")) },
    deletion: { unknownHold: "deny" as const, retentionDays, controlIds: ids(under("deletion.")) },
    proposedSignedConfigs
  };
  return { ...body, policyDigest: digestOf(body) };
}
