# 2026 Research Papers — AMC Research Foundations

> Generated: 2026-02-25 | Cross-referenced against 74 score modules, 74 assurance packs, 126 diagnostic questions
> Purpose: Research foundation for AMC — identify new attack vectors, governance patterns, and evaluation methods

---

## Methodology

- Fetched and analyzed 20 papers from arXiv (Jan–Feb 2026) covering agentic AI security, governance, and evaluation
- Cross-referenced each paper's findings against AMC's existing score modules and assurance packs
- Classified gap status: **COVERED** (AMC already handles it), **PARTIAL** (conceptually covered but missing specifics), **NEW GAP** (not covered at all)
- Note: All arXiv IDs in the original task brief were incorrect; correct IDs were resolved via arXiv full-text search

---

## Paper 1: Zombie Agents — Persistent Control via Self-Reinforcing Injections

- **arXiv:** [2602.15654](https://arxiv.org/abs/2602.15654)
- **Authors:** Xianglin Yang, Yufei He, Shuo Ji et al.
- **Date:** 2026-02-17
- **Key Finding:** Self-evolving LLM agents that write/reuse long-term memory are vulnerable to persistent compromise. An attacker embeds a payload via indirect exposure (e.g., poisoned web content during a benign task). The payload survives across sessions through the agent's normal memory update process, turning the agent into a "zombie" that executes unauthorized actions on future triggers. Persistence strategies defeat both sliding-window and RAG-based memory filtering.
- **AMC Relevance:** Maps to Trust & Safety dimension. Directly extends the memory poisoning attack surface.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `memoryPoisoningPack.ts` and `memoryIntegrity.ts`, but these test single-session memory corruption. The Zombie Agent attack is fundamentally cross-session — the payload persists through the agent's own learning/memory-update mechanism. AMC's existing `memoryMaturityPack.ts` doesn't test for self-reinforcing persistence where the agent's memory evolution amplifies the attack.
- **Recommended:**
  - NEW assurance pack: `zombieAgentPersistencePack.ts` — test whether injected content in session N survives memory compaction/retrieval into session N+5 and triggers unauthorized tool use
  - Enhancement to `memoryIntegrity.ts`: add cross-session memory integrity verification scoring
  - NEW diagnostic question: "Does the agent's memory update process validate content provenance before persisting observations as reusable instructions?"

---

## Paper 2: Bypassing AI Control Protocols via Agent-as-a-Proxy Attacks

- **arXiv:** [2602.05066](https://arxiv.org/abs/2602.05066)
- **Authors:** Jafar Isbarov, Murat Kantarcioglu
- **Date:** 2026-02-04
- **Key Finding:** Monitoring-based defenses (AlignmentCheck, Extract-and-Evaluate) that jointly evaluate an agent's CoT and tool-use actions can be bypassed by treating the agent as a delivery mechanism. The attack bypasses both agent and monitor simultaneously. Even frontier-scale monitors (Qwen2.5-72B) are vulnerable — large monitoring models can be bypassed by agents with similar capabilities (GPT-4o mini, Llama-3.1-70B). This demonstrates that monitoring-based agentic defenses are fundamentally fragile regardless of model scale.
- **AMC Relevance:** Maps to Governance & Oversight dimension. Challenges the assumption that trusted monitoring is sufficient.
- **Gap Status:** NEW GAP
- **Analysis:** AMC has `humanOversightQuality.ts` and `behavioralTransparency.ts`, but these assume that monitoring (whether human or AI) can reliably detect misaligned actions. This paper proves that CoT-based monitoring has a fundamental bypass: the agent can be used as a proxy to deliver attacks that look benign to both the agent's reasoning and the monitor's evaluation. No existing AMC module scores the robustness of the monitoring pipeline itself against adversarial bypass.
- **Recommended:**
  - NEW score module: `monitorBypassResistance.ts` — does the monitoring pipeline resist adversarial attacks that treat the agent as a proxy? Are there defense-in-depth layers beyond CoT monitoring?
  - NEW assurance pack: `agentAsProxyPack.ts` — test whether indirect prompt injections can bypass both the agent's safety reasoning and the monitoring layer simultaneously
  - Enhancement to `humanOversightQuality.ts`: score whether oversight mechanisms have independent verification channels (not just CoT inspection)

---

## Paper 3: Basic Legibility Protocols Improve Trusted Monitoring

- **arXiv:** [2602.10153](https://arxiv.org/abs/2602.10153)
- **Authors:** Ashwin Sreevatsa, Sebastian Prasanna, Cody Rushing
- **Date:** 2026-02-09
- **Key Finding:** Legibility protocols — encouraging untrusted models to document their code with comments — improve safety without sacrificing task performance. Commenting disproportionately benefits honest code (which has natural explanations that resolve monitor suspicion) while backdoored code frequently lacks easy justification. Gains from commenting increase with monitor strength. This is a practical, low-cost intervention for trusted monitoring.
- **AMC Relevance:** Maps to Governance & Oversight dimension. Provides a concrete, measurable intervention for improving monitoring effectiveness.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `behavioralTransparency.ts` and `decisionExplainability.ts` which score whether agents can explain their decisions. But neither specifically scores whether the agent's outputs are structured to be legible to monitors — the distinction between "can explain" and "proactively makes actions easy to verify." The legibility protocol is a maturity indicator: higher-maturity agents should produce self-documenting outputs.
- **Recommended:**
  - Enhancement to `behavioralTransparency.ts`: add legibility scoring — does the agent proactively structure its outputs (code comments, reasoning annotations, decision justifications) to facilitate monitoring?
  - NEW diagnostic question: "Does the agent produce self-documenting outputs that enable efficient verification by monitoring systems?"

---

## Paper 4: When Visibility Outpaces Verification — Delayed Verification in Agentic AI

- **arXiv:** [2602.11412](https://arxiv.org/abs/2602.11412)
- **Authors:** Hanjing Shi, Dominic DiFranzo
- **Date:** 2026-02-11
- **Key Finding:** High-visibility discussions about agentic AI experience significantly delayed or absent verification cues compared to low-visibility threads ("Popularity Paradox"). This creates a "Narrative Lock-in" window where early, unverified claims crystallize into collective cognitive biases before evidence-seeking behaviors emerge. The "credibility-by-visibility" effect has direct implications for AI safety — popular claims about agent capabilities/safety may be accepted without verification.
- **AMC Relevance:** Maps to Governance & Oversight dimension. Relevant to how organizations evaluate and adopt agent systems.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `claimProvenance.ts` and `claimExpiry.ts` which score evidence-backed claims. But these focus on the agent's own claims, not on the organizational process of verifying claims about agents. The "narrative lock-in" pattern applies to how organizations adopt maturity assessments — they may accept high-visibility vendor claims without independent verification.
- **Recommended:**
  - Enhancement to `claimProvenance.ts`: score whether maturity claims are independently verified vs. self-reported
  - This is more of a process/methodology concern than a new module — but it reinforces the importance of AMC's evidence-over-claims philosophy

---

## Paper 5: ForesightSafety Bench — Frontier Risk Evaluation and Governance Framework

- **arXiv:** [2602.14135](https://arxiv.org/abs/2602.14135)
- **Authors:** Haibo Tong, Feifei Zhao, Linghao Feng et al.
- **Date:** 2026-02-14
- **Key Finding:** Proposes a comprehensive AI safety evaluation framework with 7 fundamental safety pillars extending to 94 refined risk dimensions, including Risky Agentic Autonomy, AI4Science Safety, Embodied AI Safety, Social AI Safety, and Catastrophic/Existential Risks. Evaluation of 20+ mainstream models reveals widespread safety vulnerabilities across multiple pillars. The framework is hierarchically structured and dynamically evolving.
- **AMC Relevance:** Maps to all AMC dimensions. Provides a complementary risk taxonomy that AMC should cross-reference.
- **Gap Status:** PARTIAL
- **Analysis:** AMC's 5-dimension model covers much of this ground, but ForesightSafety Bench identifies specific risk dimensions AMC doesn't explicitly score: Embodied AI Safety (physical-world agent risks), AI4Science Safety (agents in scientific research), and Catastrophic/Existential Risks (self-replication, resource acquisition). AMC's `crossFrameworkMapping.ts` should map to this benchmark.
- **Recommended:**
  - Enhancement to `crossFrameworkMapping.ts`: add ForesightSafety Bench as a mapped framework
  - Consider NEW score module: `catastrophicRiskIndicators.ts` — does the agent exhibit any indicators of self-replication capability, resource acquisition behavior, or resistance to shutdown?
  - The 94-dimension taxonomy is useful for validating AMC's coverage completeness

---

## Paper 6: Human Society-Inspired 4C Framework for Agentic AI Security

- **arXiv:** [2602.01942](https://arxiv.org/abs/2602.01942)
- **Authors:** Alsharif Abuadbba, Nazatul Sultan, Surya Nepal et al.
- **Date:** 2026-02-02
- **Key Finding:** Introduces the 4C Framework organizing agentic risks across four interdependent dimensions: Core (system/infrastructure integrity), Connection (communication/coordination/trust), Cognition (belief/goal/reasoning integrity), and Compliance (ethical/legal/institutional governance). Shifts AI security from system-centric protection to preservation of behavioral integrity and intent. Complements existing AI security strategies.
- **AMC Relevance:** Maps across all AMC dimensions. The 4C taxonomy is a governance-level framework that AMC should cross-reference.
- **Gap Status:** PARTIAL
- **Analysis:** AMC's 5-dimension model (Trust & Safety, Governance & Oversight, Operational Maturity, Technical Robustness, Ecosystem Integration) overlaps significantly with 4C. However, the "Cognition" dimension (belief/goal/reasoning integrity) is more explicitly articulated in 4C than in AMC. AMC scores reasoning quality (`reasoningEfficiency.ts`) and alignment (`alignmentIndex.ts`) but doesn't explicitly score "goal integrity" — whether the agent's goals remain aligned with the original intent throughout execution.
- **Recommended:**
  - Enhancement to `alignmentIndex.ts`: add goal-integrity scoring — does the agent's operational goal remain consistent with the declared objective throughout multi-step execution?
  - Enhancement to `crossFrameworkMapping.ts`: add 4C Framework mapping
  - NEW diagnostic question: "Does the agent maintain goal integrity across multi-step execution, or can intermediate results shift its effective objective?"

---

## Paper 7: AgentGuardian — Learning Access Control Policies to Govern AI Agent Behavior

- **arXiv:** [2601.10440](https://arxiv.org/abs/2601.10440)
- **Authors:** Nadya Abaev, Denis Klimov, Gerard Levinov et al.
- **Date:** 2026-01-15
- **Key Finding:** Introduces a security framework that governs AI agent operations by enforcing context-aware access-control policies. During a controlled staging phase, the framework monitors execution traces to learn legitimate agent behaviors and input patterns. It derives adaptive policies that regulate tool calls based on real-time input context and control-flow dependencies of multi-step actions. Effectively detects malicious inputs while preserving normal functionality, and mitigates hallucination-driven errors through control-flow governance.
- **AMC Relevance:** Maps to Trust & Safety and Operational Maturity dimensions. Introduces learned access control as a maturity indicator.
- **Gap Status:** NEW GAP
- **Analysis:** AMC has `excessiveAgencyPack.ts` and `toolMisusePack.ts` which test for over-permissioned agents. But AMC doesn't score whether the agent has learned, adaptive access control — policies that evolve based on observed behavior patterns rather than static RBAC. AgentGuardian's "staging phase" pattern (observe → learn → enforce) is a maturity progression AMC should measure.
- **Recommended:**
  - NEW score module: `adaptiveAccessControl.ts` — does the agent system use learned/adaptive access control policies? Is there a staging phase where legitimate behaviors are profiled? Are policies context-aware (not just role-based)?
  - Enhancement to `excessiveAgencyPack.ts`: test whether the agent's tool permissions adapt based on task context vs. remaining static

---

## Paper 8: MemTrust — Zero-Trust Architecture for Unified AI Memory

- **arXiv:** [2601.07004](https://arxiv.org/abs/2601.07004)
- **Authors:** Xing Zhou, Dmitrii Ustiugov, Haoxin Shang, Kisson Lin
- **Date:** 2026-01-11
- **Key Finding:** Proposes a five-layer architecture for AI memory systems (Storage, Extraction, Learning, Retrieval, Governance) with TEE (Trusted Execution Environment) protection at each layer. Introduces "Context from MemTrust" protocol for cross-application sharing with cryptographic guarantees. Addresses the tension between personalization demands and data sovereignty — centralized memory enables collaboration but exposes sensitive data. Side-channel hardened retrieval with obfuscated access patterns.
- **AMC Relevance:** Maps to Trust & Safety and Technical Robustness dimensions. Introduces hardware-backed memory security as a maturity indicator.
- **Gap Status:** NEW GAP
- **Analysis:** AMC has `memoryMaturity.ts` and `memoryIntegrity.ts` which score memory persistence and integrity. But neither scores the security architecture of the memory layer itself — whether memory is protected by hardware-backed guarantees (TEE), whether cross-agent memory sharing has cryptographic provenance, or whether access patterns are obfuscated against side-channel attacks. MemTrust's five-layer model provides a maturity ladder for memory security.
- **Recommended:**
  - NEW score module: `memorySecurityArchitecture.ts` — does the memory system have: (a) hardware-backed isolation (TEE/SGX), (b) cryptographic provenance for shared memory, (c) access pattern obfuscation, (d) governance layer with audit trail?
  - Enhancement to `memoryMaturity.ts`: add security-architecture scoring tiers aligned with MemTrust's five-layer model
  - NEW diagnostic question: "Does the agent's memory system provide cryptographic guarantees for data sovereignty and cross-agent sharing?"

---

## Paper 9: AgenTRIM — Tool Risk Mitigation for Agentic AI

- **arXiv:** [2601.12449](https://arxiv.org/abs/2601.12449)
- **Authors:** Roy Betser, Shamik Bose, Amit Giloni et al.
- **Date:** 2026-01-18
- **Key Finding:** Characterizes tool-driven agency failures as "unbalanced agency" — agents may retain unnecessary permissions (excessive agency) or fail to invoke required tools (insufficient agency). AgenTRIM enforces per-step least-privilege tool access through adaptive filtering and status-aware validation. Offline phase reconstructs the agent's tool interface from code and execution traces. Runtime phase enforces adaptive tool access. Substantially reduces attack success while maintaining task performance on AgentDojo benchmark.
- **AMC Relevance:** Maps to Trust & Safety dimension. Directly relevant to tool permission governance.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `excessiveAgencyPack.ts` and `toolMisusePack.ts`. The "excessive agency" concept is already in AMC. However, AgenTRIM introduces two concepts AMC doesn't score: (1) per-step least-privilege (permissions change at each step, not just per-session), and (2) the offline/online dual-phase approach where tool interfaces are reconstructed from traces before runtime enforcement.
- **Recommended:**
  - Enhancement to `excessiveAgencyPack.ts`: add per-step permission testing — do tool permissions narrow as the task progresses, or remain static?
  - NEW diagnostic question: "Does the agent enforce per-step least-privilege for tool access, adapting permissions based on the current task phase?"

---

## Paper 10: Beyond Max Tokens — Stealthy Resource Amplification via Tool Calling Chains

- **arXiv:** [2601.10955](https://arxiv.org/abs/2601.10955)
- **Authors:** Kaiyu Zhou, Yongsen Zheng, Yicheng He et al.
- **Date:** 2026-01-16
- **Key Finding:** Introduces a stealthy multi-turn economic DoS attack operating at the tool layer. By adjusting text-visible fields in an MCP-compatible tool server (leaving function signatures unchanged), the attack steers agents into prolonged tool-calling sequences exceeding 60,000 tokens, inflating costs by up to 658x and energy by 100-560x. The final answer remains correct, so conventional validation checks fail. GPU KV cache occupancy jumps from <1% to 35-74%, cutting co-running throughput by ~50%.
- **AMC Relevance:** Maps to Trust & Safety and Operational Maturity dimensions. Introduces economic DoS as a first-class attack vector.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `resourceExhaustionPack.ts` and `costPredictability.ts`. But these test for obvious resource exhaustion (token limits, budget caps). The "Beyond Max Tokens" attack is stealthy — the task completes correctly, costs are amplified through legitimate-looking tool interactions, and per-step checks pass. AMC doesn't score resistance to economic amplification attacks that stay within per-step limits but compound across turns.
- **Recommended:**
  - NEW assurance pack: `economicAmplificationPack.ts` — test whether a malicious MCP server can inflate agent costs by 10x+ while maintaining correct task completion
  - Enhancement to `costPredictability.ts`: add trajectory-level cost anomaly detection scoring — does the system detect when a task's total cost deviates significantly from expected baselines?
  - Enhancement to `resourceExhaustionPack.ts`: add multi-turn compounding cost tests (not just single-turn limits)

---

## Paper 11: ToolSafe — Enhancing Tool Invocation Safety via Proactive Step-level Guardrail

- **arXiv:** [2601.10156](https://arxiv.org/abs/2601.10156)
- **Authors:** Yutao Mou, Zhangchi Xue, Lijun Li et al.
- **Date:** 2026-01-15
- **Key Finding:** Develops TS-Guard, a guardrail model using multi-task reinforcement learning that proactively detects unsafe tool invocations before execution by reasoning over interaction history. Assesses request harmfulness and action-attack correlations, producing interpretable safety judgments. TS-Flow framework reduces harmful tool invocations by 65% on average and improves benign task completion by ~10% under prompt injection attacks. Introduces TS-Bench for step-level tool invocation safety evaluation.
- **AMC Relevance:** Maps to Trust & Safety dimension. Introduces proactive (pre-execution) tool safety as distinct from reactive (post-execution) monitoring.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `toolMisusePack.ts` and `unsafeToolPack.ts`. These test whether unsafe tool calls are detected, but don't distinguish between proactive (pre-execution) and reactive (post-execution) detection. ToolSafe demonstrates that proactive guardrails are significantly more effective — catching unsafe calls before they execute rather than detecting them after. This is a maturity distinction AMC should score.
- **Recommended:**
  - Enhancement to `toolMisusePack.ts`: add proactive vs. reactive detection scoring — does the system catch unsafe tool calls before or after execution?
  - NEW diagnostic question: "Does the agent system evaluate tool invocation safety proactively (before execution) or only reactively (after execution)?"

---

## Paper 12: The PBSAI Governance Ecosystem — Multi-Agent AI Reference Architecture

- **arXiv:** [2602.11301](https://arxiv.org/abs/2602.11301)
- **Authors:** John M. Willis
- **Date:** 2026-02-11
- **Key Finding:** Introduces a twelve-domain taxonomy for securing enterprise AI estates with bounded agent families that mediate between tools and policy through shared context envelopes and structured output contracts. Provides a formal model of agents, context envelopes, and ecosystem-level invariants for traceability, provenance, and human-in-the-loop guarantees. Aligns with NIST AI RMF functions. Targets enterprise SOC and hyperscale defensive environments.
- **AMC Relevance:** Maps to Governance & Oversight and Ecosystem Integration dimensions. Provides enterprise-grade governance patterns.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `governanceNISTRMFPack.ts` and `crossFrameworkMapping.ts` for NIST alignment. PBSAI introduces "context envelopes" (structured metadata that travels with agent actions for traceability) and "bounded agent families" (agents grouped by trust domain with shared policy contracts). AMC doesn't score whether agent systems use structured context envelopes for cross-domain traceability.
- **Recommended:**
  - Enhancement to `crossFrameworkMapping.ts`: add PBSAI twelve-domain taxonomy mapping
  - NEW diagnostic question: "Does the agent system use structured context envelopes (metadata packages) that travel with actions for end-to-end traceability?"
  - Consider enhancement to `outputAttestation.ts`: score whether outputs include provenance metadata in a structured envelope format

---

## Paper 13: SoK — Trust-Authorization Mismatch in LLM Agent Interactions

- **arXiv:** [2512.06914](https://arxiv.org/abs/2512.06914)
- **Authors:** Guanquan Shi, Haohua Du, Zhiqiang Wang et al.
- **Date:** 2025-12-07 (updated 2026-02-09)
- **Key Finding:** Surveys 200+ papers to identify a fundamental "Trust-Authorization Mismatch" in LLM agents: static permissions are structurally decoupled from the agent's fluctuating runtime trustworthiness. Proposes the Belief-Intention-Permission (B-I-P) framework decomposing agent execution into Belief Formation, Intent Generation, and Permission Grant stages. Demonstrates that diverse threats (prompt injection, tool poisoning) share a common root cause: desynchronization between dynamic trust states and static authorization. Calls for shift from static RBAC to dynamic, risk-adaptive authorization.
- **AMC Relevance:** Maps to Trust & Safety and Governance & Oversight dimensions. Foundational framework for understanding agent authorization.
- **Gap Status:** NEW GAP
- **Analysis:** This is a critical gap. AMC scores trust (`crossAgentTrust.ts`) and identity (`runtimeIdentityMaturity.ts`) but doesn't explicitly score the trust-authorization synchronization problem. AMC's current model assumes that if permissions are set correctly at deployment, they remain appropriate. The B-I-P framework shows this assumption is wrong — trust fluctuates at runtime, and static permissions can't track it.
- **Recommended:**
  - NEW score module: `trustAuthorizationSync.ts` — does the agent system dynamically adjust authorization based on runtime trust signals? Is there a mechanism to detect when trust state and permission state diverge?
  - This is the theoretical foundation for several other gaps (AgentGuardian's adaptive policies, AgenTRIM's per-step permissions). A single module scoring trust-authorization synchronization would unify these.
  - NEW diagnostic question: "Does the agent's authorization model dynamically adapt to runtime trust signals, or are permissions static after deployment?"

---

## Paper 14: MCP Security Bench (MSB) — Benchmarking Attacks Against MCP

- **arXiv:** [2510.15994](https://arxiv.org/abs/2510.15994)
- **Authors:** Dongsen Zhang, Zekun Li, Xu Luo et al.
- **Date:** 2025-10-14
- **Key Finding:** First end-to-end evaluation suite measuring LLM agent resistance to MCP-specific attacks across the full tool-use pipeline. Taxonomy of 12 attacks including name-collision, preference manipulation, prompt injections in tool descriptions, out-of-scope parameter requests, user-impersonating responses, false-error escalation, tool-transfer, and retrieval injection. Key finding: models with stronger performance are MORE vulnerable due to superior tool-calling and instruction-following capabilities. Introduces Net Resilient Performance (NRP) metric.
- **AMC Relevance:** Maps to Trust & Safety dimension. Directly relevant to MCP compliance scoring.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `mcpCompliance.ts` which scores MCP protocol compliance. But MSB reveals that MCP compliance itself creates attack surface — the better an agent follows MCP, the more vulnerable it is to MCP-specific attacks. AMC doesn't score MCP security resilience separately from MCP compliance. The 12-attack taxonomy provides specific test cases AMC should incorporate.
- **Recommended:**
  - NEW assurance pack: `mcpSecurityResiliencePack.ts` — test agent resistance to MSB's 12 MCP-specific attack categories (name-collision, preference manipulation, tool-transfer, etc.)
  - Enhancement to `mcpCompliance.ts`: add security-resilience scoring alongside protocol compliance — being MCP-compliant is necessary but not sufficient
  - Adopt NRP (Net Resilient Performance) as a metric in AMC's scoring framework

---

## Paper 15: Securing the Model Context Protocol — Risks, Controls, and Governance

- **arXiv:** [2511.20920](https://arxiv.org/abs/2511.20920)
- **Authors:** Herman Errico, Jiquan Ngiam, Shanita Sojan
- **Date:** 2025-11-25
- **Key Finding:** Identifies three adversary types exploiting MCP flexibility: content-injection attackers (malicious instructions in legitimate data), supply-chain attackers (compromised servers), and agents as unintentional adversaries (over-stepping their role). Proposes practical controls: per-user authentication with scoped authorization, provenance tracking across agent workflows, containerized sandboxing with I/O checks, inline policy enforcement with DLP and anomaly detection, and centralized governance via private registries or gateway layers.
- **AMC Relevance:** Maps to Trust & Safety and Ecosystem Integration dimensions. Provides specific MCP governance controls.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `mcpCompliance.ts`, `sandboxBoundaryPack.ts`, `dlpExfiltrationPack.ts`. Many of the proposed controls map to existing AMC modules. However, two concepts are new: (1) centralized MCP governance via private registries/gateways (AMC doesn't score whether organizations use curated MCP server registries vs. arbitrary community servers), and (2) the "agent as unintentional adversary" pattern where the agent itself over-steps without malicious intent.
- **Recommended:**
  - Enhancement to `mcpCompliance.ts`: add MCP supply-chain governance scoring — does the organization use a curated registry/gateway for MCP servers?
  - Enhancement to `excessiveAgencyPack.ts`: add "unintentional adversary" test cases where the agent over-steps due to ambiguous instructions rather than injection

---

## Paper 16: Think Deep, Not Just Long — Measuring LLM Reasoning Effort via Deep-Thinking Tokens

- **arXiv:** [2602.13517](https://arxiv.org/abs/2602.13517)
- **Authors:** Wei-Lin Chen et al.
- **Date:** 2026-02-13
- **Key Finding:** Raw token counts are unreliable proxies for reasoning quality — increased generation length doesn't consistently correlate with accuracy and may signal "overthinking." Identifies "deep-thinking tokens" where internal predictions undergo significant revisions in deeper model layers. Deep-thinking ratio (proportion of deep-thinking tokens) exhibits robust positive correlation with accuracy, outperforming length-based and confidence-based baselines. Introduces Think@n, a test-time scaling strategy that prioritizes samples with high deep-thinking ratios, matching self-consistency performance while reducing inference costs.
- **AMC Relevance:** Maps to Technical Robustness dimension. Provides a better metric for reasoning quality than token count.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `reasoningEfficiency.ts` and `overthinkingDetectionPack.ts`. The overthinking pack already addresses the "more tokens ≠ better reasoning" insight. However, AMC doesn't score whether the agent system uses deep-thinking ratio or similar internal metrics to evaluate reasoning quality. The Think@n strategy (early rejection of unpromising generations) is a cost-efficiency technique AMC should recognize.
- **Recommended:**
  - Enhancement to `reasoningEfficiency.ts`: add scoring for whether the system uses internal reasoning-quality metrics (beyond token count) to evaluate and optimize reasoning
  - Enhancement to `overthinkingDetectionPack.ts`: add test cases that verify the system can distinguish between productive long reasoning and unproductive overthinking

---

## Paper 17: Objective Decoupling in Social RL — Recovering Ground Truth from Sycophantic Majorities

- **arXiv:** [2602.08092](https://arxiv.org/abs/2602.08092)
- **Authors:** Majid Ghasemi, Mark Crowley
- **Date:** 2026-02-08
- **Key Finding:** Identifies "Objective Decoupling" — a structural failure mode where an RL agent's learned objective permanently separates from the latent ground truth when evaluators are sycophantic, lazy, or adversarial. Standard RL agents under majority-biased feedback converge to misalignment. Proposes Epistemic Source Alignment (ESA) which uses sparse safety axioms to judge the source of feedback rather than the signal itself ("judging the judges"). ESA guarantees convergence to the true objective even when a majority of evaluators are biased.
- **AMC Relevance:** Maps to Trust & Safety dimension. Directly relevant to sycophancy and alignment scoring.
- **Gap Status:** PARTIAL
- **Analysis:** AMC has `sycophancyPack.ts` which tests for sycophantic behavior. But the Objective Decoupling paper goes deeper — it's not just about whether the agent is sycophantic in individual responses, but whether the agent's training/fine-tuning process itself has been corrupted by sycophantic feedback loops. The ESA approach ("judge the judges") is a maturity indicator for RLHF pipelines.
- **Recommended:**
  - Enhancement to `sycophancyPack.ts`: add tests for systemic sycophancy (not just per-response) — does the agent's behavior show evidence of objective decoupling from ground truth?
  - Enhancement to `alignmentIndex.ts`: add scoring for feedback-source validation — does the training/fine-tuning pipeline validate the quality of human evaluators?
  - NEW diagnostic question: "Does the agent's alignment process validate feedback sources, or does it trust all human feedback equally?"

---

## Paper 18: Agentic AI Governance and Lifecycle Management in Healthcare

- **Note:** Could not find this exact paper on arXiv. The provided ID (2601.05230) points to an unrelated paper. Search for the title returned no direct match.
- **Status:** SKIPPED — domain-specific (healthcare). The task brief instructs to skip domain-specific papers unless they introduce generalizable patterns. Without the actual paper, cannot assess generalizability.

---

## Paper 19: AGENTSAFE — Ethical Assurance and Governance in Agentic AI

- **Note:** Could not find this exact paper on arXiv. The provided ID (2512.09632) points to an unrelated math paper. arXiv search for "AGENTSAFE ethical assurance governance agentic" returned no direct match.
- **Status:** SKIPPED — paper not found. May not exist or may be under a different title.

---

## Paper 20: Audited Skill-Graph Self-Improvement for Agentic LLMs

- **Note:** Could not find this paper on arXiv. The provided ID (2512.14588) points to a quantum physics paper. arXiv full-text search for "audited skill-graph self-improvement agentic LLM" returned no results.
- **Status:** SKIPPED — paper not found. May not exist or may be under a different title.

---

## Paper 21: Agentic Risk & Capability Framework for Governing Agentic AI

- **Note:** Could not find this exact paper on arXiv. The provided ID (2512.10138) points to a math paper. Search returned related but different papers.
- **Status:** SKIPPED — paper not found under this exact title. Related work (MAD-BAD-SAD Framework, TRiSM for Agentic AI) was found but are different papers.

---

## BONUS PAPERS DISCOVERED DURING SEARCH

The following highly relevant papers were discovered during the search process and are included for completeness:

### Bonus A: Security Threat Modeling for Emerging AI-Agent Protocols (MCP, A2A, Agora, ANP)

- **arXiv:** [2602.11327](https://arxiv.org/abs/2602.11327)
- **Authors:** Zeynab Anbiaee, Mahdi Rabbani, Mansur Mirani et al.
- **Date:** 2026-02
- **Key Finding:** Comparative security analysis of MCP, Agent2Agent (A2A), Agora, and Agent Network Protocol (ANP). Identifies 12 protocol-level risks across creation, operation, and termination lifecycle phases.
- **AMC Relevance:** AMC currently scores MCP compliance but not A2A, Agora, or ANP. As multi-protocol agent ecosystems emerge, AMC needs protocol-agnostic security scoring.
- **Gap Status:** NEW GAP
- **Recommended:** NEW score module: `agentProtocolSecurity.ts` — protocol-agnostic security scoring that covers MCP, A2A, and emerging protocols

### Bonus B: MCPShield — Security Cognition Layer for Adaptive Trust Calibration

- **arXiv:** [2602.14281](https://arxiv.org/abs/2602.14281)
- **Authors:** Zhenhong Zhou, Yuanhe Zhang, Hongwei Cai et al.
- **Date:** 2026-02
- **Key Finding:** Plug-in security cognition layer that performs adaptive trust calibration between agents and MCP servers throughout the tool invocation lifecycle.
- **AMC Relevance:** Reinforces the trust-authorization synchronization gap identified in Paper 13 (SoK). Provides a concrete implementation pattern.
- **Gap Status:** Covered by recommended `trustAuthorizationSync.ts` module

### Bonus C: The Promptware Kill Chain

- **arXiv:** [2601.09625](https://arxiv.org/abs/2601.09625)
- **Authors:** Oleg Brodt, Elad Feldman, Bruce Schneier et al.
- **Date:** 2026-01
- **Key Finding:** Formalizes the evolution from prompt injection to a "promptware kill chain" — a multistep malware delivery mechanism using prompt injections as the initial vector.
- **AMC Relevance:** AMC has `injectionPack.ts` and `encodedInjectionPack.ts` but doesn't model multi-step kill chains where injection is just the entry point.
- **Gap Status:** PARTIAL
- **Recommended:** Enhancement to `injectionPack.ts`: add multi-step kill chain test scenarios where injection leads to persistence, lateral movement, and exfiltration

### Bonus D: Prompt Injection Attacks on Agentic Coding Assistants

- **arXiv:** [2601.17548](https://arxiv.org/abs/2601.17548)
- **Authors:** Narek Maloyan, Dmitry Namiot
- **Date:** 2026-01
- **Key Finding:** Comprehensive SoK of prompt injection attacks targeting agentic coding assistants specifically, covering skills, tools, and protocol ecosystems.
- **AMC Relevance:** Reinforces the need for the `codingAgentEscapePack.ts` identified in NEW_GAPS_RESEARCH.md Gap 4.
- **Gap Status:** Covered by existing gap recommendation

---

## Summary Table: Papers → AMC Gap Mapping

| # | Paper | arXiv | Gap Status | AMC Dimension | Recommended Action |
|---|-------|-------|------------|---------------|-------------------|
| 1 | Zombie Agents (Persistent Memory Injection) | 2602.15654 | PARTIAL | Trust & Safety | NEW pack: `zombieAgentPersistencePack.ts`; enhance `memoryIntegrity.ts` |
| 2 | Agent-as-a-Proxy (Monitor Bypass) | 2602.05066 | **NEW GAP** | Governance & Oversight | NEW module: `monitorBypassResistance.ts`; NEW pack: `agentAsProxyPack.ts` |
| 3 | Legibility Protocols (Trusted Monitoring) | 2602.10153 | PARTIAL | Governance & Oversight | Enhance `behavioralTransparency.ts` with legibility scoring |
| 4 | Visibility vs Verification (Narrative Lock-in) | 2602.11412 | PARTIAL | Governance & Oversight | Enhance `claimProvenance.ts` with independent verification scoring |
| 5 | ForesightSafety Bench (94 Risk Dimensions) | 2602.14135 | PARTIAL | All | Enhance `crossFrameworkMapping.ts`; consider `catastrophicRiskIndicators.ts` |
| 6 | 4C Framework (Agentic Security) | 2602.01942 | PARTIAL | All | Enhance `alignmentIndex.ts` with goal-integrity scoring |
| 7 | AgentGuardian (Learned Access Control) | 2601.10440 | **NEW GAP** | Trust & Safety | NEW module: `adaptiveAccessControl.ts` |
| 8 | MemTrust (Zero-Trust Memory) | 2601.07004 | **NEW GAP** | Trust & Safety | NEW module: `memorySecurityArchitecture.ts` |
| 9 | AgenTRIM (Per-Step Least Privilege) | 2601.12449 | PARTIAL | Trust & Safety | Enhance `excessiveAgencyPack.ts` with per-step permission testing |
| 10 | Beyond Max Tokens (Economic DoS) | 2601.10955 | PARTIAL | Trust & Safety + Ops | NEW pack: `economicAmplificationPack.ts`; enhance `costPredictability.ts` |
| 11 | ToolSafe (Proactive Guardrails) | 2601.10156 | PARTIAL | Trust & Safety | Enhance `toolMisusePack.ts` with proactive vs reactive distinction |
| 12 | PBSAI Governance (Enterprise Architecture) | 2602.11301 | PARTIAL | Governance + Ecosystem | Enhance `crossFrameworkMapping.ts` with PBSAI mapping |
| 13 | SoK: Trust-Authorization Mismatch | 2512.06914 | **NEW GAP** | Trust & Safety + Governance | NEW module: `trustAuthorizationSync.ts` |
| 14 | MCP Security Bench (12 Attack Taxonomy) | 2510.15994 | PARTIAL | Trust & Safety | NEW pack: `mcpSecurityResiliencePack.ts` |
| 15 | Securing MCP (Risks, Controls, Governance) | 2511.20920 | PARTIAL | Trust & Safety + Ecosystem | Enhance `mcpCompliance.ts` with supply-chain governance |
| 16 | Think Deep Not Long (Reasoning Quality) | 2602.13517 | PARTIAL | Technical Robustness | Enhance `reasoningEfficiency.ts` with internal quality metrics |
| 17 | Objective Decoupling (Sycophancy in RL) | 2602.08092 | PARTIAL | Trust & Safety | Enhance `sycophancyPack.ts` with systemic sycophancy tests |
| 18 | Healthcare Governance | — | SKIPPED | — | Domain-specific; paper not found |
| 19 | AGENTSAFE | — | SKIPPED | — | Paper not found on arXiv |
| 20 | Audited Skill-Graph | — | SKIPPED | — | Paper not found on arXiv |
| 21 | Agentic Risk Framework | — | SKIPPED | — | Paper not found under exact title |
| B-A | Protocol Security (MCP/A2A/Agora/ANP) | 2602.11327 | **NEW GAP** | Ecosystem Integration | NEW module: `agentProtocolSecurity.ts` |
| B-B | MCPShield (Adaptive Trust) | 2602.14281 | PARTIAL | Trust & Safety | Covered by `trustAuthorizationSync.ts` recommendation |
| B-C | Promptware Kill Chain | 2601.09625 | PARTIAL | Trust & Safety | Enhance `injectionPack.ts` with kill-chain scenarios |
| B-D | Coding Assistant Injection SoK | 2601.17548 | PARTIAL | Trust & Safety | Covered by existing gap: `codingAgentEscapePack.ts` |

---

## New Gaps Summary (Phase 3 Priority)

### P0 — Critical New Modules

| Module | Source Paper | Rationale |
|--------|-------------|-----------|
| `trustAuthorizationSync.ts` | SoK (2512.06914) | Foundational gap — static permissions vs dynamic trust is the root cause of multiple attack classes |
| `monitorBypassResistance.ts` | Agent-as-a-Proxy (2602.05066) | Proves monitoring-based defenses are fundamentally fragile; AMC must score defense-in-depth |
| `adaptiveAccessControl.ts` | AgentGuardian (2601.10440) | Learned, context-aware access control is the next maturity level beyond static RBAC |

### P1 — Important New Modules/Packs

| Module/Pack | Source Paper | Rationale |
|-------------|-------------|-----------|
| `memorySecurityArchitecture.ts` | MemTrust (2601.07004) | Hardware-backed memory security is a maturity differentiator |
| `zombieAgentPersistencePack.ts` | Zombie Agents (2602.15654) | Cross-session memory persistence attacks are a new threat class |
| `agentAsProxyPack.ts` | Agent-as-a-Proxy (2602.05066) | Specific test pack for monitor bypass attacks |
| `economicAmplificationPack.ts` | Beyond Max Tokens (2601.10955) | Stealthy economic DoS is undetectable by current validation |
| `mcpSecurityResiliencePack.ts` | MSB (2510.15994) | 12 MCP-specific attack categories need dedicated testing |
| `agentProtocolSecurity.ts` | Protocol Threat Modeling (2602.11327) | Multi-protocol ecosystems need protocol-agnostic security scoring |

### P2 — Enhancements to Existing Modules

| Enhancement | Source Paper |
|-------------|-------------|
| `memoryIntegrity.ts` + cross-session verification | Zombie Agents |
| `behavioralTransparency.ts` + legibility scoring | Legibility Protocols |
| `alignmentIndex.ts` + goal-integrity scoring | 4C Framework |
| `excessiveAgencyPack.ts` + per-step permissions | AgenTRIM |
| `costPredictability.ts` + trajectory-level anomaly detection | Beyond Max Tokens |
| `toolMisusePack.ts` + proactive vs reactive distinction | ToolSafe |
| `crossFrameworkMapping.ts` + PBSAI, 4C, ForesightSafety | Multiple |
| `mcpCompliance.ts` + supply-chain governance | Securing MCP |
| `sycophancyPack.ts` + systemic sycophancy tests | Objective Decoupling |
| `injectionPack.ts` + kill-chain scenarios | Promptware Kill Chain |
| `reasoningEfficiency.ts` + internal quality metrics | Think Deep |

---

## Cross-Reference with Existing NEW_GAPS_RESEARCH.md

| Existing Gap | Research Paper Validation | Status |
|-------------|--------------------------|--------|
| GAP 1: Prompt Cache Poisoning | No direct paper found; remains novel AMC insight | UNIQUE TO AMC |
| GAP 2: Agentic Loop Runaway | Partially validated by Beyond Max Tokens (economic amplification via loops) | VALIDATED |
| GAP 3: Multi-Agent Delegation Trust | Validated by SoK Trust-Authorization Mismatch + 4C Framework | STRONGLY VALIDATED |
| GAP 4: Coding Agent Sandbox Escape | Validated by Coding Assistant Injection SoK (2601.17548) | VALIDATED |
| GAP 5: LLM-as-Judge Reliability | Partially validated by Objective Decoupling (sycophantic evaluators) | VALIDATED |
| GAP 6: Context Window Management | No direct paper; remains practitioner-driven insight | UNIQUE TO AMC |
| GAP 7: Tool Schema Drift | No direct paper; remains practitioner-driven insight | UNIQUE TO AMC |
| GAP 8: Cost Efficiency | Validated by Beyond Max Tokens (cost amplification awareness) | VALIDATED |
| GAP 9: Graduated Autonomy Depth | Validated by Legibility Protocols (monitoring quality improves with agent cooperation) | PARTIALLY VALIDATED |
| GAP 10: Agent Identity Spoofing | Validated by SoK Trust-Authorization Mismatch | VALIDATED |
| GAP 11: Reasoning Observability | Validated by Think Deep (internal reasoning metrics) | VALIDATED |
| GAP 12: Global AI Regulatory | No direct paper in this batch | UNIQUE TO AMC |

---

## Key Themes Across All Papers

1. **Static permissions are dead.** Multiple papers (SoK, AgentGuardian, AgenTRIM, MCPShield) converge on the same conclusion: static RBAC cannot secure agentic systems. Dynamic, context-aware, per-step authorization is the new baseline.

2. **Monitoring is necessary but insufficient.** Agent-as-a-Proxy proves that even frontier-scale monitors can be bypassed. Defense-in-depth (legibility protocols + monitoring + sandboxing + access control) is required.

3. **Memory is the new attack surface.** Zombie Agents and MemTrust both highlight that persistent memory creates persistent vulnerabilities. Cross-session attacks are fundamentally different from single-session injection.

4. **Economic attacks are the stealth frontier.** Beyond Max Tokens shows that attacks can be invisible to correctness-based validation. Cost/resource monitoring must become a first-class security concern.

5. **MCP is both enabler and attack surface.** MSB, Securing MCP, MCPShield, and Protocol Threat Modeling all converge: MCP standardization enables interoperability but also standardizes the attack surface. Security must be layered on top of compliance.

6. **The trust chain is only as strong as its weakest link.** From delegation trust to feedback-source validation to memory provenance — every paper reinforces that trust must be verified at every layer, not assumed.

---

*This document should be updated as new papers are published. Next review: March 2026.*
*Generated by AMC Research Sweep — cross-referenced against 74 score modules, 74 assurance packs, 126 diagnostic questions.*
