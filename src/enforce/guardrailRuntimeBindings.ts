import { AVAILABLE_GUARDRAILS, type GuardrailDefinition } from "./guardrailProfiles.js";
import {
  GUARDRAIL_RUNTIME_BINDINGS,
  isBoundGuardrailName,
  readGuardrailControlState
} from "./guardrailControlState.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";

/** P0-08's enforcement vocabulary. `boundary` is null exactly when enforcement is "none". */
export type Enforcement = "enforced" | "observed" | "advisory" | "none";

export interface GuardrailRuntimeStatus extends GuardrailDefinition {
  requestedEnabled: boolean;
  effective: boolean;
  enabled: boolean;
  mutable: boolean;
  trusted: boolean;
  binding: string | null;
  source: "none" | "catalog-only" | "tool-pipeline" | "guardrail-control-state" | "runtime-firewall-policy" | "combined";
  reason: string;
  stateRevision: number | null;
  /** Whether AMC enforces this guardrail here, and where (P1-12). */
  enforcement: Enforcement;
  boundary: string | null;
}

/**
 * Guardrails the native tool pipeline enforces itself (P1-12). Not toggled by guardrail control state.
 * `human-approval-gate` is enforced only in a session whose effective-policy receipt lists a compiled approval rule,
 * so the workspace listing reports it "none"; `audit-trail-enforcer` joins at `tool-pipeline:journal` once P1-03 lands.
 */
export const GUARDRAIL_PIPELINE_BINDINGS = {
  "tool-call-allowlist": { guard: "tool-allowlist", boundary: "tool-pipeline:guard:tool-allowlist" },
  "cost-budget-limit": { guard: "budgets", boundary: "tool-pipeline:guard:budgets" },
  "human-approval-gate": { guard: null, boundary: "approvals" }
} as const;

const CATALOG_ONLY = "Catalog reference; not enforced by AMC.";
type PipelineBinding = typeof GUARDRAIL_PIPELINE_BINDINGS[keyof typeof GUARDRAIL_PIPELINE_BINDINGS];
const pipelineBinding = (name: string): PipelineBinding | null =>
  Object.hasOwn(GUARDRAIL_PIPELINE_BINDINGS, name) ? GUARDRAIL_PIPELINE_BINDINGS[name as keyof typeof GUARDRAIL_PIPELINE_BINDINGS] : null;

export function listGuardrailsWithRuntimeStatus(workspace: string): GuardrailRuntimeStatus[] {
  const control = readGuardrailControlState(workspace);
  const firewall = inspectRuntimeFirewallPolicy(workspace);
  if (firewall.integrity === "invalid") {
    throw new Error(`Runtime Firewall policy integrity check failed: ${firewall.reason}`);
  }
  const requested = new Set(control.state?.requestedGuardrails ?? []);

  return AVAILABLE_GUARDRAILS.map((guardrail): GuardrailRuntimeStatus => {
    if (!isBoundGuardrailName(guardrail.name)) {
      const pipeline = pipelineBinding(guardrail.name);
      const enforced = pipeline !== null && pipeline.guard !== null;
      return {
        ...guardrail,
        requestedEnabled: false,
        effective: enforced,
        enabled: enforced,
        mutable: false,
        trusted: enforced,
        binding: enforced ? pipeline.boundary : null,
        source: pipeline ? "tool-pipeline" : "catalog-only",
        reason: !pipeline
          ? CATALOG_ONLY
          : enforced
            ? `Enforced at ${pipeline.boundary} in every native session, over its signed config; guardrail control state cannot change it.`
            : "Enforced at approvals only in a session whose effective-policy receipt lists a compiled approval rule.",
        stateRevision: control.state?.revision ?? null,
        enforcement: enforced ? "enforced" : "none",
        boundary: enforced ? pipeline.boundary : null
      };
    }

    const rule = GUARDRAIL_RUNTIME_BINDINGS[guardrail.name];
    const requestedEnabled = requested.has(guardrail.name);
    const policyEnabled = firewall.policy?.enabled === true && firewall.policy.rules[rule] === true;
    const effective = requestedEnabled || policyEnabled;
    const source = requestedEnabled && policyEnabled
      ? "combined"
      : requestedEnabled
        ? "guardrail-control-state"
        : policyEnabled
          ? "runtime-firewall-policy"
          : "none";
    const trusted = source === "guardrail-control-state"
      ? control.integrity === "trusted"
      : source === "runtime-firewall-policy"
        ? firewall.integrity === "trusted"
        : source === "combined"
          ? control.integrity === "trusted" && firewall.integrity === "trusted"
          : false;
    const reason = source === "combined"
      ? "Requested in signed guardrail state and required by the signed Runtime Firewall policy."
      : source === "guardrail-control-state"
        ? "Enabled by signed additive guardrail control state."
        : source === "runtime-firewall-policy"
          ? "The signed Runtime Firewall policy keeps this rule enabled; guardrail control state cannot weaken it."
          : "No signed control state or Runtime Firewall policy currently enables this rule.";
    // Only a trusted, enabled rule in block mode refuses; any other mode records what it saw.
    const enforcement: Enforcement = !effective || !trusted ? "none" : firewall.policy?.mode === "block" ? "enforced" : "observed";

    return {
      ...guardrail,
      requestedEnabled,
      effective,
      enabled: effective,
      mutable: true,
      trusted,
      binding: `runtime-firewall.rules.${rule}`,
      source,
      reason,
      stateRevision: control.state?.revision ?? null,
      enforcement,
      boundary: enforcement === "none" ? null : `runtime-firewall.rules.${rule}`
    };
  });
}

/**
 * The 14 guardrails as one session ran them: the pipeline-bound ones are enforced only when that session composed
 * their guard, and the approval gate only when its compiled policy requires approvals.
 */
export function sessionGuardrailEnforcement(workspace: string, session: { guardLabels: readonly string[]; approvalRequired: boolean }):
  Array<{ name: string; enforcement: Enforcement; boundary: string | null }> {
  return listGuardrailsWithRuntimeStatus(workspace).map((row) => {
    const pipeline = pipelineBinding(row.name);
    if (!pipeline) return { name: row.name, enforcement: row.enforcement, boundary: row.boundary };
    const enforced = pipeline.guard === null ? session.approvalRequired : session.guardLabels.includes(pipeline.guard);
    return { name: row.name, enforcement: enforced ? "enforced" : "none", boundary: enforced ? pipeline.boundary : null };
  });
}
