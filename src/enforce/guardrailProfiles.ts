export interface GuardrailDefinition {
  name: string;
  description: string;
  category: "security" | "compliance" | "quality" | "cost" | "safety";
  defaultEnabled: boolean;
}

export interface GuardrailProfile {
  name: string;
  description: string;
  guardrails: string[];
}

export const AVAILABLE_GUARDRAILS: GuardrailDefinition[] = [
  { name: "prompt-injection-detection", description: "Detect prompt-injection patterns in Runtime Firewall requests", category: "security", defaultEnabled: false },
  { name: "pii-redaction", description: "Catalog reference for agent-output PII redaction", category: "compliance", defaultEnabled: false },
  { name: "output-toxicity-filter", description: "Catalog reference for toxic-output filtering", category: "safety", defaultEnabled: false },
  { name: "hallucination-detector", description: "Catalog reference for groundedness-based output checks", category: "quality", defaultEnabled: false },
  { name: "cost-budget-limit", description: "Catalog reference for session and daily cost limits", category: "cost", defaultEnabled: false },
  { name: "tool-call-allowlist", description: "Catalog reference for tool-call allowlisting", category: "security", defaultEnabled: false },
  { name: "data-exfiltration-guard", description: "Detect secret-access and exposure patterns in Runtime Firewall traffic", category: "security", defaultEnabled: false },
  { name: "rate-limiter", description: "Catalog reference for request-rate enforcement", category: "security", defaultEnabled: false },
  { name: "audit-trail-enforcer", description: "Catalog reference for mandatory action-ledger coverage", category: "compliance", defaultEnabled: false },
  { name: "human-approval-gate", description: "Catalog reference for high-risk human approvals", category: "safety", defaultEnabled: false },
  { name: "model-version-pin", description: "Catalog reference for model-version pinning", category: "quality", defaultEnabled: false },
  { name: "context-window-guard", description: "Detect payloads above the Runtime Firewall size limit", category: "quality", defaultEnabled: false },
  { name: "compliance-boundary", description: "Catalog reference for framework-specific compliance boundaries", category: "compliance", defaultEnabled: false },
  { name: "credential-rotation", description: "Catalog reference for credential-rotation enforcement", category: "security", defaultEnabled: false },
];

export const GUARDRAIL_PROFILES: GuardrailProfile[] = [
  {
    name: "minimal",
    description: "Basic protections for development and testing",
    guardrails: ["prompt-injection-detection", "output-toxicity-filter", "rate-limiter"],
  },
  {
    name: "standard",
    description: "Recommended for production deployments",
    guardrails: ["prompt-injection-detection", "output-toxicity-filter", "data-exfiltration-guard", "rate-limiter", "audit-trail-enforcer", "cost-budget-limit"],
  },
  {
    name: "strict",
    description: "Maximum protection for high-risk environments",
    guardrails: AVAILABLE_GUARDRAILS.map(g => g.name),
  },
  {
    name: "healthcare",
    description: "HIPAA-aligned guardrails for healthcare AI agents",
    guardrails: ["prompt-injection-detection", "pii-redaction", "output-toxicity-filter", "data-exfiltration-guard", "rate-limiter", "audit-trail-enforcer", "human-approval-gate", "compliance-boundary", "credential-rotation"],
  },
  {
    name: "financial",
    description: "SOC2/PCI-aligned guardrails for financial AI agents",
    guardrails: ["prompt-injection-detection", "pii-redaction", "data-exfiltration-guard", "rate-limiter", "audit-trail-enforcer", "cost-budget-limit", "tool-call-allowlist", "compliance-boundary", "credential-rotation"],
  },
];

export interface GuardrailState {
  enabledGuardrails: Set<string>;
}

/** @deprecated Use the signed workspace control state APIs in guardrailControlState.ts. */
export function createGuardrailState(): GuardrailState {
  return { enabledGuardrails: new Set(AVAILABLE_GUARDRAILS.filter(g => g.defaultEnabled).map(g => g.name)) };
}

/** @deprecated Use setGuardrailRequested(). */
export function enableGuardrail(state: GuardrailState, name: string): boolean {
  const def = AVAILABLE_GUARDRAILS.find(g => g.name === name);
  if (!def) return false;
  state.enabledGuardrails.add(name);
  return true;
}

/** @deprecated Use setGuardrailRequested(). */
export function disableGuardrail(state: GuardrailState, name: string): boolean {
  return state.enabledGuardrails.delete(name);
}

/** @deprecated Use applyGuardrailControlProfile(). */
export function applyProfile(state: GuardrailState, profileName: string): boolean {
  const profile = GUARDRAIL_PROFILES.find(p => p.name === profileName);
  if (!profile) return false;
  state.enabledGuardrails.clear();
  for (const g of profile.guardrails) state.enabledGuardrails.add(g);
  return true;
}

/** @deprecated Use listGuardrailsWithRuntimeStatus(). */
export function listGuardrailsWithStatus(state: GuardrailState): Array<GuardrailDefinition & { enabled: boolean }> {
  return AVAILABLE_GUARDRAILS.map(g => ({ ...g, enabled: state.enabledGuardrails.has(g.name) }));
}
