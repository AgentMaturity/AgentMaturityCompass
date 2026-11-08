import type { ComplianceMapping } from "../mappingSchema.js";

/**
 * OWASP Top 10 for Agentic Applications 2026, ASI01-ASI10 (SH-TRUST-04), framework `OWASP_AGENTIC`.
 *
 * The project page https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ (published
 * 2025-12-09, read 2026-11-07) lists no entries itself; the ids and titles below are those of the release document it
 * links to, and `familyReview` flags them for re-verification against that document before publication. OWASP is
 * community guidance and is not on AMC's official-source host list, so these mappings carry no `sources` entry.
 *
 * Bindings name whole assurance packs and registered native audit types only; every mapping is NOT_EVALUATED until
 * bound evidence exists in the window. The rationale for each binding is in its description.
 */
const FRAMEWORK = "OWASP_AGENTIC" as const;
const pack = (packId: string, minScore = 80) => ({ type: "requires_assurance_pack" as const, packId, minScore, maxSucceeded: 0 });
const noAudit = (...auditTypesDenylist: string[]) => ({ type: "requires_no_audit" as const, auditTypesDenylist });
const auditRows = (...auditTypes: string[]) => ({ type: "requires_evidence_event" as const, eventTypes: ["audit" as const], minObservedRatio: 0, auditTypes });
const entry = (params: { id: string; category: string; description: string; packs: string[]; requirements?: ComplianceMapping["evidenceRequirements"] }): ComplianceMapping => ({
  id: params.id, framework: FRAMEWORK, category: params.category, description: params.description,
  evidenceRequirements: [...params.packs.map((packId) => pack(packId)), ...(params.requirements ?? [])],
  related: { questions: [], packs: params.packs, configs: [] }, catalogControls: []
});

export const OWASP_AGENTIC_CATEGORIES = [
  "ASI01 Agent Goal Hijack", "ASI02 Tool Misuse and Exploitation", "ASI03 Identity and Privilege Abuse",
  "ASI04 Agentic Supply Chain Vulnerabilities", "ASI05 Unexpected Code Execution", "ASI06 Memory and Context Poisoning",
  "ASI07 Insecure Inter-Agent Communication", "ASI08 Cascading Failures", "ASI09 Human-Agent Trust Exploitation",
  "ASI10 Rogue Agents"
] as const;

export const owaspAgenticTop10Mappings: ComplianceMapping[] = [
  entry({ id: "owasp_asi01_agent_goal_hijack", category: OWASP_AGENTIC_CATEGORIES[0], packs: ["injection", "instructionHierarchy", "encodedInjection"],
    description: "Signals that injected instructions in prompts, tool output and encoded payloads do not redirect the agent's goal. Rationale: goal hijack is measured by the injection packs; a filter's presence is not evidence." }),
  entry({ id: "owasp_asi02_tool_misuse", category: OWASP_AGENTIC_CATEGORIES[1], packs: ["toolMisuse", "excessive-agency", "unsafe_tooling"],
    requirements: [auditRows("AUTHORIZATION_RECORD")],
    description: "Signals that the agent does not misuse the tools it is given and that consequential native tool calls carry an authorization record (AUTHORIZATION_RECORD rows written by the tool pipeline)." }),
  entry({ id: "owasp_asi03_identity_and_privilege_abuse", category: OWASP_AGENTIC_CATEGORIES[2], packs: ["stepup-approval-bypass", "agentIdentitySpoofing", "governance_bypass"],
    requirements: [auditRows("AUTHORIZATION_RECORD"), noAudit("GOVERNANCE_BYPASS_SUCCEEDED", "LEASE_INVALID_OR_MISSING")],
    description: "Signals that step-up approvals cannot be bypassed, identities cannot be spoofed, and that no governance bypass or lease failure was recorded in the window." }),
  entry({ id: "owasp_asi04_agentic_supply_chain", category: OWASP_AGENTIC_CATEGORIES[3], packs: ["supplyChainAttack", "sbom-supply-chain", "supply-chain-integrity"],
    requirements: [noAudit("SUPPLY_CHAIN_ATTACK_SUCCEEDED")],
    description: "Signals that tools, plugins, MCP servers and models are pinned and attested, and that no supply-chain attack scenario succeeded." }),
  entry({ id: "owasp_asi05_unexpected_code_execution", category: OWASP_AGENTIC_CATEGORIES[4], packs: ["sandboxBoundary", "codingAgentEscape"],
    requirements: [noAudit("SANDBOX_BOUNDARY_SUCCEEDED")],
    description: "Signals that the sandbox-boundary and coding-agent-escape packs measured no escape and that no sandbox escape scenario succeeded. The native shell's NATIVE_SHELL_CONFINEMENT receipts are not bound here: they are written for unconfined and failed runs too and carry no agent id, so they can neither satisfy nor fail an agent-scoped control." }),
  entry({ id: "owasp_asi06_memory_and_context_poisoning", category: OWASP_AGENTIC_CATEGORIES[5], packs: ["memoryPoisoning", "promptCachePoisoning", "rag-poisoning"],
    requirements: [noAudit("MEMORY_POISONING_SUCCEEDED")],
    description: "Signals that persisted memory, prompt caches and retrieved context cannot be poisoned to steer later turns." }),
  entry({ id: "owasp_asi07_insecure_inter_agent_communication", category: OWASP_AGENTIC_CATEGORIES[6], packs: ["delegationTrustChain", "crossAgentCollusion", "emergentMultiAgentRisk"],
    requirements: [auditRows("DELEGATION_SETTLED")],
    description: "Signals that delegation between agents is settled through signed chains (DELEGATION_SETTLED rows) and that collusion and emergent multi-agent risks were measured." }),
  entry({ id: "owasp_asi08_cascading_failures", category: OWASP_AGENTIC_CATEGORIES[7], packs: ["circuit-breaker-reliability", "agenticLoopGovernance", "silentFailure"],
    description: "Signals that loops are bounded, breakers trip, and failures surface instead of propagating silently." }),
  entry({ id: "owasp_asi09_human_agent_trust_exploitation", category: OWASP_AGENTIC_CATEGORIES[8], packs: ["persuasionManipulation", "aiTrustExploitation", "approval-theater"],
    description: "Signals that the agent does not manipulate operators and that approvals are real decisions rather than theatre." }),
  entry({ id: "owasp_asi10_rogue_agents", category: OWASP_AGENTIC_CATEGORIES[9], packs: ["oversightUndermining", "self-preservation", "autonomous-loop-governance"],
    description: "Signals that the agent accepts oversight, does not resist shutdown, and that autonomous loops are governed. Persistence after decommissioning is not observed by any pack and is not claimed." })
];
