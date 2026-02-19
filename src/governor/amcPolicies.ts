/**
 * AMC-specific action policies extending the governor action catalog.
 * These policies map Python AMC module capabilities to TypeScript governance.
 */

export interface AmcPolicy {
  id: string;
  title: string;
  description: string;
  enforcement: "always" | "when_configured" | "opt_in";
  riskTiers: Array<"low" | "medium" | "high" | "critical">;
}

export const AMC_POLICIES: AmcPolicy[] = [
  {
    id: "amc.dlp.scan",
    title: "DLP Output Scanning",
    description: "Always scan agent outputs for PII and credentials before external delivery. Maps to Python amc.vault.v2_dlp.",
    enforcement: "always",
    riskTiers: ["low", "medium", "high", "critical"],
  },
  {
    id: "amc.circuit.check",
    title: "Circuit Breaker Pre-Check",
    description: "Check circuit breaker state before tool execution. Maps to Python amc.enforce.e5_circuit_breaker.",
    enforcement: "always",
    riskTiers: ["medium", "high", "critical"],
  },
  {
    id: "amc.honeytoken.detect",
    title: "Honeytoken Detection",
    description: "Detect honeytoken usage in credentials and alert. Maps to Python amc.vault.v3_honeytokens.",
    enforcement: "always",
    riskTiers: ["low", "medium", "high", "critical"],
  },
  {
    id: "amc.stepup.required",
    title: "Step-Up Human Approval",
    description: "Require human approval for high-risk and critical actions. Maps to Python amc.enforce.e6_stepup.",
    enforcement: "when_configured",
    riskTiers: ["high", "critical"],
  },
];

export function getAmcPolicy(policyId: string): AmcPolicy | undefined {
  return AMC_POLICIES.find((p) => p.id === policyId);
}

export function listAmcPolicies(): AmcPolicy[] {
  return [...AMC_POLICIES];
}
