# NEW_GAPS_RESEARCH.md — AMC Coverage Gap Analysis (Feb 2026)
> Cross-referenced against 69 score modules, 66 assurance packs, 42+ diagnostic questions
> Sources: OWASP GenAI 2025, Agentic Security Initiative, r/AI_Agents, Moltbook, HN, Simon Willison

---

## Methodology

Compared AMC's current coverage (score modules, assurance packs, diagnostic questions) against:
1. OWASP GenAI Security Project 2025 updates (Agentic AI Threats & Mitigations)
2. r/AI_Agents top posts (last month) — practitioner pain points
3. Moltbook community patterns (from memory/amc-gaps-from-moltbook.md)
4. HN discussions on coding agents, sandboxing, prompt caching
5. Real-world incidents: Claude system prompt leaks, agent credential sprawl, MCP supply chain

Gaps are classified as:
- **NEW**: Not covered by any existing module
- **PARTIAL**: Covered conceptually but missing specific scoring/testing
- **DEPTH**: Covered but needs deeper implementation

---

## GAP 1: Prompt Cache Poisoning (NEW)
**Severity: HIGH**

Prompt caching (used by Claude Code, Codex, and most agentic products) creates a new attack surface. Cached prompts persist across roundtrips — if an attacker can inject content into a cached prefix, every subsequent turn inherits the poisoned context. Anthropic treats cache hit rate as a production SLA metric.

**What AMC has:** Injection packs test single-turn injection. Memory poisoning pack tests persistent memory. Neither tests cache-layer poisoning.

**What's missing:**
- Score module: `promptCachePoisoning.ts` — does the agent's caching strategy isolate user context from system context?
- Assurance pack: test whether injected content in turn N persists via cache into turn N+5
- Diagnostic question: "Does the agent's prompt caching strategy prevent cross-turn context poisoning?"

**Evidence:** Anthropic's Thariq Shihipar (Feb 2026): "We run alerts on our prompt cache hit rate and declare SEVs if they're too low." Cache is infrastructure, not optional.

---

## GAP 2: Agentic Loop Runaway / Infinite Recursion (PARTIAL)
**Severity: HIGH**

OWASP Agentic Security Initiative identifies "unbounded agentic loops" as a top threat. Agent calls tool → tool returns error → agent retries → infinite loop burning tokens and potentially taking destructive actions repeatedly.

**What AMC has:** `circuitBreaker.ts`, `resourceExhaustionPack.ts`. These test resource limits but not specifically the agentic loop pattern where the agent's own reasoning creates the loop.

**What's missing:**
- Score module: `agenticLoopGovernance.ts` — does the agent have max-iteration caps, loop detection, and graceful degradation when stuck?
- Assurance pack: test agent behavior when a tool consistently returns errors (does it loop, escalate, or stop?)
- Diagnostic question addition to AMC-1.8: "Does the agent detect and break out of reasoning loops within N iterations?"

---

## GAP 3: Multi-Agent Delegation Trust (NEW)
**Severity: HIGH**

As agents delegate to sub-agents (Codex spawning workers, OpenClaw sub-agents, CrewAI crews), the trust chain becomes: Human → Agent A → Agent B → Tool. Agent A trusts Agent B implicitly. No verification that Agent B's actions align with the original human intent.

**What AMC has:** `multiAgentDimension.ts` scores multi-agent coordination. `crossAgentTrust.ts` exists. But neither scores the delegation trust chain specifically.

**What's missing:**
- Score module: `delegationTrustChain.ts` — when agent delegates, does it: (a) propagate the original user's intent constraints, (b) verify sub-agent output before acting on it, (c) maintain audit trail of the full delegation chain?
- Assurance pack: test whether a malicious sub-agent can escalate privileges through the delegation chain
- Diagnostic question: "When delegating to sub-agents, does the system verify that delegated actions remain within the original authorization scope?"

---

## GAP 4: Coding Agent Sandbox Escape (PARTIAL → DEPTH)
**Severity: HIGH**

Coding agents (Codex, Claude Code, Pi) execute arbitrary code in sandboxes. OpenAI acknowledges Windows sandboxing is harder ("fewer OS-level primitives"). The gap between "application sandbox" and "kernel sandbox" is where escapes happen.

**What AMC has:** `kernelSandboxMaturity.ts` scores OS-level isolation. `compoundThreatPack.ts` tests escape detection. But no specific test for the coding-agent pattern: agent writes code → code runs in sandbox → code attempts to read ~/.ssh or exfiltrate.

**What's missing:**
- Assurance pack: `codingAgentEscapePack.ts` — specifically test: can agent-generated code access files outside the declared workspace? Can it make network calls to arbitrary hosts? Can it read environment variables containing secrets?
- Score module enhancement: `kernelSandboxMaturity.ts` should check for coding-agent-specific isolation (workspace scoping, network egress filtering, env var sanitization)

---

## GAP 5: LLM-as-Judge Reliability (NEW)
**Severity: MEDIUM**

Increasingly, LLMs evaluate other LLMs' outputs (self-evaluation, automated code review, content moderation). But LLM judges have systematic biases: verbosity bias, position bias, self-enhancement bias. An agent that uses LLM-as-judge for quality gates has unreliable gates.

**What AMC has:** `predictiveValidity.ts`, `calibrationGap.ts`. These score the agent's own calibration but not the reliability of LLM-based evaluation in the pipeline.

**What's missing:**
- Score module: `evaluationReliability.ts` — if the agent uses LLM-based evaluation (for self-check, output quality, routing decisions), is the evaluation itself validated? Are there human-calibrated baselines? Is there inter-rater reliability measurement?
- Diagnostic question: "Are LLM-based quality gates in the pipeline validated against human-calibrated baselines?"

---

## GAP 6: Context Window Management Maturity (PARTIAL)
**Severity: MEDIUM**

Context window management is now a first-class engineering concern. Agents that don't manage context well: lose important information during compaction, include irrelevant context that degrades performance, fail to prioritize recent vs historical information.

**What AMC has:** `memoryMaturity.ts`, `memoryIntegrity.ts`. These score memory persistence but not the active management of what's IN the context window at any given moment.

**What's missing:**
- Score module: `contextWindowManagement.ts` — does the agent: (a) have a context budget strategy, (b) prioritize information by relevance/recency, (c) checkpoint state before compaction, (d) detect and recover from context loss?
- This is distinct from memory — memory is what persists across sessions. Context management is what's active within a session.

---

## GAP 7: Tool Schema Drift Detection (NEW)
**Severity: MEDIUM**

MCP servers and tool APIs change their schemas without notice. An agent that was working yesterday breaks today because a tool's parameter name changed or a required field was added. This is the "maintenance hell" that r/AI_Agents practitioners report as their #1 post-launch problem.

**What AMC has:** `modelDrift.ts` detects model behavior drift. Nothing detects tool/API schema drift.

**What's missing:**
- Score module: `toolSchemaDrift.ts` — does the agent: (a) snapshot tool schemas at deployment, (b) detect when schemas change, (c) gracefully degrade when a tool's contract breaks, (d) alert on breaking changes?
- Assurance pack: test agent behavior when a tool's response schema changes unexpectedly

---

## GAP 8: Cost Efficiency Scoring (NEW)
**Severity: MEDIUM**

AMC has budget enforcement but doesn't score whether an agent is cost-efficient. An agent that uses opus-4 for every task (including "what time is it?") is wasteful. Model routing, prompt caching, and task-appropriate model selection are maturity indicators.

**What AMC has:** `costPredictability.ts` scores cost predictability. Budget enforcement exists. But no scoring of cost efficiency — whether the agent routes tasks to appropriate-cost models.

**What's missing:**
- Score module: `costEfficiency.ts` — does the agent: (a) route tasks to cost-appropriate models, (b) use prompt caching effectively, (c) minimize unnecessary tool calls, (d) track cost-per-outcome not just cost-per-token?
- Diagnostic question: "Does the agent optimize resource usage by routing tasks to cost-appropriate models?"

---

## GAP 9: Graduated Autonomy in Practice (DEPTH)
**Severity: MEDIUM**

AMC has `graduatedAutonomy.ts` which is excellent. But the r/AI_Agents community's #1 insight is that autonomy isn't binary — it's "handle 80% autonomously, escalate 20% with context." The current module scores mode transitions but not the quality of the escalation boundary.

**What AMC has:** `graduatedAutonomy.ts` with SUPERVISED → GUIDED → AUTONOMOUS → FULL_AUTO modes. `humanOversightQuality.ts`.

**What's missing:**
- Enhancement to `graduatedAutonomy.ts`: score the quality of escalation decisions — when the agent escalates, does it provide sufficient context for the human to make a good decision? When it doesn't escalate, was that the right call?
- Assurance pack: present the agent with scenarios at the boundary of its autonomy scope and measure escalation quality

---

## GAP 10: Agent Identity Spoofing in Multi-Agent Systems (NEW)
**Severity: MEDIUM**

In multi-agent systems, Agent A calls Agent B. But how does Agent B verify that the request actually came from Agent A and not from a compromised intermediary? MCP servers are "quiet control planes" — they can impersonate any agent in the system.

**What AMC has:** `runtimeIdentityMaturity.ts`, `identityContinuity.ts`, `mutualVerification.ts`. These score identity but not specifically the spoofing vector in multi-agent delegation.

**What's missing:**
- Assurance pack: `agentIdentitySpoofingPack.ts` — test whether a rogue MCP server or intermediary can impersonate a trusted agent in the system
- Enhancement to `mutualVerification.ts`: score whether agents cryptographically verify each other's identity before accepting delegated tasks

---

## GAP 11: Observability of Agent Reasoning (PARTIAL)
**Severity: LOW-MEDIUM**

When an agent makes a bad decision, can you reconstruct WHY? Current observability focuses on what happened (audit logs, action traces). Missing: why the agent chose action A over action B, what information it considered, what it ignored.

**What AMC has:** `decisionExplainability.ts`, `interpretability.ts`. These score whether the agent CAN explain decisions. Not whether the infrastructure captures enough to reconstruct reasoning post-hoc.

**What's missing:**
- Score module enhancement: `reasoningObservability.ts` — does the system capture: (a) the agent's internal reasoning chain, (b) which context items influenced the decision, (c) what alternatives were considered and rejected?
- This is the "flight recorder" pattern — not just what the agent did, but the full decision context.

---

## GAP 12: Compliance with Emerging AI Regulations Beyond EU (PARTIAL)
**Severity: LOW-MEDIUM**

AMC has `euAIActCompliance.ts` for EU AI Act. But other jurisdictions are moving fast: US Executive Order on AI Safety, China's Interim Measures for Generative AI, Canada's AIDA, Brazil's AI Bill. An agent deployed globally needs multi-jurisdictional compliance scoring.

**What AMC has:** `euAIActCompliance.ts`, `regulatoryReadiness.ts`.

**What's missing:**
- Score module: `globalAIRegulatory.ts` — score compliance readiness across multiple jurisdictions, not just EU
- Or: extend `regulatoryReadiness.ts` to include specific checks for US EO, China GenAI measures, etc.

---

## Summary: Priority Implementation Order

| Priority | Gap | Type | Effort |
|----------|-----|------|--------|
| P0 | Prompt Cache Poisoning | NEW module + pack | Medium |
| P0 | Multi-Agent Delegation Trust | NEW module + pack | Medium |
| P0 | Agentic Loop Runaway | Enhancement + pack | Low |
| P1 | Coding Agent Sandbox Escape | NEW pack | Medium |
| P1 | LLM-as-Judge Reliability | NEW module | Medium |
| P1 | Tool Schema Drift Detection | NEW module + pack | Medium |
| P1 | Cost Efficiency Scoring | NEW module | Low |
| P2 | Context Window Management | NEW module | Medium |
| P2 | Graduated Autonomy Depth | Enhancement | Low |
| P2 | Agent Identity Spoofing | NEW pack | Medium |
| P3 | Reasoning Observability | Enhancement | Low |
| P3 | Global AI Regulatory | Enhancement | Medium |

---

## Cross-Reference: Previously Identified Gaps Now Addressed

From `memory/amc-gaps-from-moltbook.md` and `memory/amc-gaps-from-reddit.md`, the following gaps have been addressed since the original research:

| Original Gap | Status | How Addressed |
|---|---|---|
| Memory & Continuity Maturity | ✅ ADDRESSED | `memoryMaturity.ts`, `memoryIntegrity.ts` |
| Human-in-the-Loop Vulnerability | ✅ ADDRESSED | `humanOversightQuality.ts` |
| Behavioral Contract | ✅ ADDRESSED | `behavioralContractMaturity.ts` |
| Fail-Secure Governance | ✅ ADDRESSED | `failSecureGovernance.ts` |
| Output Integrity | ✅ ADDRESSED | `outputIntegrityMaturity.ts` |
| Agent State Portability | ✅ ADDRESSED | `agentStatePortability.ts` |
| EU AI Act | ✅ ADDRESSED | `euAIActCompliance.ts` |
| OWASP LLM Top 10 | ✅ ADDRESSED | `owaspLLMCoverage.ts` |
| Self-Knowledge | ✅ ADDRESSED | `selfKnowledgeMaturity.ts` |
| Kernel Sandbox | ✅ ADDRESSED | `kernelSandboxMaturity.ts` |
| Runtime Identity | ✅ ADDRESSED | `runtimeIdentityMaturity.ts` |
| Model Switching Resilience | ✅ ADDRESSED | `modelDrift.ts` |
| Compound Threat Detection | ✅ ADDRESSED | `compoundThreatPack.ts` |
| Operational Independence | ✅ ADDRESSED | `operationalIndependence.ts` |
| Agent vs Workflow Classification | ✅ ADDRESSED | `agentVsWorkflow.ts` |

| Original Gap | Status | Notes |
|---|---|---|
| Cross-Agent Trust Protocol | PARTIAL | `crossAgentTrust.ts` exists but delegation chain not scored (Gap 3 above) |
| Community/Platform Governance | NOT ADDRESSED | Still no "Community AMC" mode |
| Cost/Efficiency Maturity | PARTIAL | `costPredictability.ts` exists but efficiency not scored (Gap 8 above) |
| Simplicity Scoring | ✅ ADDRESSED | `simplicityScoring.ts` |
| TOCTOU Vulnerabilities | PARTIAL | Assurance packs exist but no specific TOCTOU test |

---

*Generated: 2026-02-25 | Author: Satanic Pope | For: AMC Phase 2 planning*
