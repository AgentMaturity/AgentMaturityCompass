import { AVAILABLE_GUARDRAILS, type GuardrailDefinition } from "./guardrailProfiles.js";
import {
  GUARDRAIL_RUNTIME_BINDINGS,
  isBoundGuardrailName,
  readGuardrailControlState
} from "./guardrailControlState.js";
import { inspectRuntimeFirewallPolicy } from "../runtime/firewall.js";

export interface GuardrailRuntimeStatus extends GuardrailDefinition {
  requestedEnabled: boolean;
  effective: boolean;
  enabled: boolean;
  mutable: boolean;
  trusted: boolean;
  binding: string | null;
  source: "none" | "catalog-only" | "guardrail-control-state" | "runtime-firewall-policy" | "combined";
  reason: string;
  stateRevision: number | null;
}

export function listGuardrailsWithRuntimeStatus(workspace: string): GuardrailRuntimeStatus[] {
  const control = readGuardrailControlState(workspace);
  const firewall = inspectRuntimeFirewallPolicy(workspace);
  if (firewall.integrity === "invalid") {
    throw new Error(`Runtime Firewall policy integrity check failed: ${firewall.reason}`);
  }
  const requested = new Set(control.state?.requestedGuardrails ?? []);

  return AVAILABLE_GUARDRAILS.map((guardrail): GuardrailRuntimeStatus => {
    if (!isBoundGuardrailName(guardrail.name)) {
      return {
        ...guardrail,
        requestedEnabled: false,
        effective: false,
        enabled: false,
        mutable: false,
        trusted: false,
        binding: null,
        source: "catalog-only",
        reason: "Catalog reference only; no AMC runtime binding exists, so this control cannot be activated here.",
        stateRevision: control.state?.revision ?? null
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
      stateRevision: control.state?.revision ?? null
    };
  });
}
