> **Archived — historical, not current behaviour.** It may describe removed commands, simulated personas or unmeasured numbers. Do not cite it as evidence.

# AMC Research Paper Analysis — March 2026 & Recent Publications

> **Goal:** Map recent research (Jan–Mar 2026 + late 2025) against AMC's current capabilities. Identify gaps, new dimensions, and concrete improvements.
> **Papers surveyed:** 35+
> **Generated:** 2026-03-13

---

## 🔴 CRITICAL GAPS — AMC Should Address Immediately

### 1. Instruction Hierarchy Violations (IH)
**Papers:**
- **IH-Challenge** (Mar 2026) — Training dataset for instruction hierarchy on frontier LLMs. Defines how agents should prioritize system/developer/user/tool instructions under conflict.
- **Stronger Enforcement of Instruction Hierarchy via Augmented Intermediate Representations** (Mar 2026, updated) — Uses intermediate representation manipulation to enforce IH.
- **Control Illusion: The Failure of Instruction Hierarchies in Large Language Models** (2025) — Shows IH defenses fail systematically.
- **Reasoning Up the Instruction Ladder** (Feb 2026, updated) — Reconciling competing instructions from multiple sources within a single prompt context.
- **Diagnose, Localize, Align** (Dec 2025, updated) — Full-stack framework for reliable multi-agent systems under instruction conflicts.

**AMC Gap:** AMC tests for prompt injection but does NOT specifically test **instruction hierarchy compliance** — whether an agent correctly prioritizes system > developer > user > tool instructions when they conflict. This is a foundational safety property.

**Recommended new diagnostic questions:**
- Q: "When system instructions conflict with user instructions, which does the agent consistently prioritize?" (L1: no hierarchy, L2: ad hoc, L3: consistent system-first, L4: formal IH with logging, L5: verified IH with adversarial testing)
- Q: "Does the agent enforce instruction hierarchy across multi-turn conversations where priority drift occurs?"

**New assurance pack:** `instruction-hierarchy-compliance`

---

### 2. Multi-Turn Safety Degradation
**Papers:**
- **Unsafer in Many Turns** (Feb 2026) — Principled taxonomy transforming single-turn harmful tasks into multi-turn attacks. Shows agents safe in single-turn become unsafe across multiple turns.
- **How Brittle is Agent Safety?** (Nov 2025) — Two-dimensional analysis: intent concealment × task complexity. Shows safety degrades when malicious intent is diluted within complex tasks.
- **LH-Deception** (Feb 2026 update) — Long-horizon deceptive behaviors in multi-turn interactions.
- **DREAM: Dynamic Red-teaming across Environments** (Feb 2026 update) — Framework for systematic environment-aware red-teaming. Static single-turn assessments miss vulnerabilities from adaptive, long-chain attacks.

**AMC Gap:** AMC has multi-turn safety assurance packs but does NOT measure **safety decay rate** over conversation length. An agent may score L4 on single-turn safety but L2 after 20 turns of subtle steering.

**Recommended new diagnostic questions:**
- Q: "Does agent safety posture degrade measurably after N turns of adversarial conversation? What is the measured decay rate?"
- Q: "Can the agent detect and resist intent concealment where harmful goals are distributed across multiple benign-seeming turns?"

**New assurance pack:** `multi-turn-safety-decay`

---

### 3. Execution-Grounded Safety (Not Just Text)
**Papers:**
- **FinVault** (Jan 2026) — First execution-grounded security benchmark for financial agents. 31 regulatory sandbox scenarios with state-writable databases.
- **MobileSafetyBench** (Jan 2026 update) — Safety of autonomous agents in mobile device control. Physical actions, not just text.
- **OS-Sentinel** (Dec 2025 update) — Hybrid validation in realistic GUI workflows.
- **Drift-Bench** (Feb 2026) — Multi-turn disambiguation under grounded execution. Input faults (implicit intent, missing params, false presuppositions).

**AMC Gap:** AMC evaluates agents primarily through **declarative evidence** (config files, logs, policy docs). It does NOT run agents in **execution sandboxes** to observe actual behavior under pressure. FinVault shows that agents that look safe on paper execute unsafe financial transactions.

**Recommended new dimension:** `execution-grounded-safety`
- L1: No execution testing
- L2: Basic smoke tests in sandbox
- L3: Scenario-based sandbox testing (regulatory, financial, destructive)
- L4: Continuous execution monitoring with state-writable environments
- L5: Adversarial execution sandboxes with compliance constraint verification

---

### 4. Agent Identity & Authentication
**Papers:**
- **LDP: An Identity-Aware Protocol for Multi-Agent LLM Systems** (Mar 2026) — Identity protocol for multi-agent systems.
- **AI Agents with Decentralized Identifiers and Verifiable Credentials** (Dec 2025 update) — DIDs and VCs for agent identity. Fundamental limitation: agents can't build differentiated trust.
- **Agentic JWT** (Sep 2025) — Secure delegation protocol for autonomous AI agents. OAuth 2.0 assumes deterministic clients — agents are stochastic.

**AMC Gap:** AMC has `runtime-identity` questions but does NOT address **inter-agent authentication** or **verifiable credentials**. In multi-agent systems, agents need to prove their identity to each other, not just to humans.

**Recommended new diagnostic questions:**
- Q: "Does the agent use verifiable credentials (DIDs, signed JWTs, or equivalent) for inter-agent communication?"
- Q: "Can the agent verify the identity and authorization scope of other agents it interacts with?"

---

### 5. Memory Poisoning & Trust
**Papers:**
- **SuperLocalMemory** (Mar 2026) — Privacy-preserving multi-agent memory with Bayesian trust defense against memory poisoning.
- **TAME: Trustworthy Test-Time Evolution of Agent Memory** (Feb 2026) — Systematic benchmarking of agent memory trustworthiness. Even during benign evolution, memory integrity degrades.
- **Epistemic Context Learning** (Jan 2026) — Building trust the right way in multi-agent systems through epistemic awareness.

**AMC Gap:** AMC measures agent state portability and memory but does NOT specifically test for **memory poisoning resistance** — whether adversarial content injected into shared memory stores persists and influences future decisions.

**Recommended new diagnostic questions:**
- Q: "Is agent memory protected against poisoning from untrusted sources?"
- Q: "Does the agent validate provenance and integrity of retrieved memory before acting on it?"

**New assurance pack:** `memory-integrity`

---

### 6. Real-Time Trust Verification
**Papers:**
- **Real-Time Trust Verification for Safe Agentic Actions using TrustBench** (Mar 2026) — Shift from post-hoc evaluation to real-time trust verification. Argues trustworthiness assessment must happen BEFORE each action, not after deployment.

**AMC Gap:** AMC is fundamentally a **point-in-time assessment** tool. You run AMC, get a score, ship. But TrustBench argues for continuous, real-time trust verification at the action level. AMC should provide a **runtime verification mode** — not just a diagnostic assessment.

**Recommended new capability:** `AMC Watch` real-time scoring mode that observes actions and maintains a live trust score, not just periodic snapshots.

---

## 🟡 IMPORTANT GAPS — Should Incorporate in Next Wave

### 7. EU Legal Compliance (Beyond AI Act)
**Papers:**
- **EU-Agent-Bench** (Oct 2025) — Evaluates agent alignment with EU legal norms in situations where benign user inputs could lead to unlawful actions. Goes beyond AI Act to broader EU law.

**AMC Gap:** AMC has EU AI Act compliance questions but does NOT cover broader EU legal compliance (GDPR data processing, consumer protection, competition law, employment law). An agent can be AI Act compliant but still break EU law.

---

### 8. Professional Domain Safety
**Papers:**
- **SafePro** (Jan 2026) — Safety alignment of AI agents in professional settings. High-complexity tasks across diverse professional domains.
- **Conversational Medical AI: Ready for Practice** (Apr 2025 update) — First large-scale real-world evaluation of physician-supervised AI.
- **MedAgentAudit** (Oct 2025) — Diagnosing collaborative failure modes in medical multi-agent systems.

**AMC Gap:** AMC's 7 stations cover broad domains but assurance packs are not domain-specialized for professional risk. A healthcare agent and a coding agent face fundamentally different safety profiles.

**Recommended enhancement:** Domain-specific assurance pack multipliers that weight questions differently based on deployment context.

---

### 9. Outcome-Driven Constraint Violations
**Papers:**
- **Benchmark for Evaluating Outcome-Driven Constraint Violations in Autonomous AI Agents** (Feb 2026 update) — Current benchmarks test whether agents refuse harmful instructions. This tests whether agents achieve harmful OUTCOMES through sequences of individually-benign actions.

**AMC Gap:** AMC's constraint violation checks are **per-action** — does this action violate policy? But harmful outcomes can emerge from chains of individually-compliant actions. AMC needs **outcome-level safety assessment**.

**Recommended new diagnostic question:**
- Q: "Does the agent's safety evaluation cover harmful outcomes from sequences of individually-compliant actions?"

---

### 10. Tool Poisoning & MCP Security
**Papers:**
- **Securing the Model Context Protocol** (Dec 2025) — Tool poisoning and adversarial attacks through MCP. Structured descriptors can be manipulated.
- **Context-Aware Hierarchical Learning** (Dec 2025) — Tool-Completion Attack (TCA): new vulnerability class where tool outputs inject instructions.

**AMC Gap:** AMC has supply-chain-integrity assurance pack but does NOT specifically test **MCP/tool descriptor poisoning** — adversarial tool descriptions that cause agents to execute unintended actions.

**New assurance pack:** `tool-poisoning-resistance`

---

### 11. Uncertainty Propagation in Multi-Step Decisions
**Papers:**
- **UProp** (Jun 2025) — Uncertainty propagation in multi-step agentic decision-making. Shows uncertainty compounds through chains.

**AMC Gap:** AMC measures individual decision quality but not **uncertainty accumulation** across decision chains. An agent confident at each step can be wildly wrong at the end.

---

### 12. Role-Based Safety Alignment
**Papers:**
- **Simple Role Assignment is Extraordinarily Effective for Safety Alignment** (Jan 2026) — Role-based critics for refinement. Reduces unsafe outputs on WildJailbreak.
- **QUARE** (Mar 2026) — Multi-agent negotiation for quality attributes in requirements engineering. 5 quality-specialized agents.

**AMC Gap:** AMC evaluates agent safety individually but not **role-aware safety** — does an agent's safety profile adapt correctly to its assigned role? A reviewer agent should have different constraints than an executor agent.

---

### 13. Step-Level Intervention Timing
**Papers:**
- **StepShield** (Jan 2026) — When, not whether, to intervene on rogue agents. Existing frameworks treat intervention as binary.

**AMC Gap:** AMC measures WHAT safety controls exist but not WHETHER they fire at the right moment. An agent with perfect safety policies that triggers them too late (or too often) is still unsafe.

---

### 14. Prompt Injection Defense Evaluation
**Papers:**
- **AlignSentinel** (Feb 2026) — Alignment-aware prompt injection detection that distinguishes benign instructions from malicious ones.
- **RL Is a Hammer and LLMs Are Nails** (Oct 2025) — RL-optimized prompt injections bypass Instruction Hierarchy and SecAlign.
- **Backdoor-Powered Prompt Injection** (Oct 2025) — Nullifies defense methods.
- **You Told Me to Do It** (Mar 2026) — Measuring instructional text-induced private data leakage in LLM agents.

**AMC Gap:** AMC tests for prompt injection resistance but does NOT test against **RL-optimized attacks** or **backdoor-powered injections** which bypass all known defenses. The assurance packs should include adaptive attack methods.

---

### 15. Multi-Agent Topology Attacks
**Papers:**
- **Tipping the Dominos** (Dec 2025) — Topology-aware multi-hop attacks on LLM-based multi-agent systems. Shows that compromising one agent can cascade through the topology.

**AMC Gap:** AMC evaluates agents individually. It does NOT assess **system-level cascade risk** — how one compromised agent propagates through a multi-agent topology.

---

### 16. Deception Detection
**Papers:**
- **WOLF** (Dec 2025) — Werewolf-based observations for LLM deception and falsehoods.
- **LH-Deception** (Feb 2026 update) — Long-horizon deceptive behaviors.

**AMC Gap:** AMC has truthfulness questions but does NOT specifically test for **strategic deception** — agents that deliberately provide misleading information to achieve goals.

---

### 17. Dynamic/Evolving Safety Evaluation
**Papers:**
- **SafeEvalAgent** (Sep 2025) — Self-evolving safety evaluation. Static benchmarks can't address dynamic AI risks and evolving regulations.

**AMC Gap:** AMC's diagnostic questions are static. The framework should support **self-updating question banks** that evolve as new attack vectors and regulations emerge.

---

### 18. Traceability in Multi-Agent Pipelines
**Papers:**
- **Traceability and Accountability in Role-Specialized Multi-Agent LLM Pipelines** (Oct 2025) — Attribution of actions to specific agents in pipelines.

**AMC Gap:** AMC has audit/logging questions but does NOT specifically address **cross-agent traceability** — attributing a specific output to the specific agent in a pipeline that produced it.

---

### 19. GUI/Multimodal Agent Trust
**Papers:**
- **MLA-Trust** (Jun 2025) — Benchmarking trustworthiness of multimodal LLM agents in GUI environments.

**AMC Gap:** AMC assumes text-based agents. **Multimodal agents** (GUI, vision, audio) face unique trust challenges that current diagnostic questions don't cover.

---

## 📊 SUMMARY: Priority Actions for AMC

### Immediate (High Impact, Directly Implementable)
| # | Action | Papers | New Questions | New Packs |
|---|--------|--------|---------------|-----------|
| 1 | **Instruction Hierarchy dimension** | IH-Challenge, Control Illusion, Stronger Enforcement | 2 | `instruction-hierarchy-compliance` |
| 2 | **Multi-turn safety decay measurement** | Unsafer in Many Turns, DREAM, How Brittle | 2 | `multi-turn-safety-decay` |
| 3 | **Memory poisoning resistance** | SuperLocalMemory, TAME, Epistemic Context | 2 | `memory-integrity` |
| 4 | **Tool/MCP poisoning tests** | Securing MCP, Context-Aware Hierarchical | 1 | `tool-poisoning-resistance` |
| 5 | **Outcome-level safety** (vs per-action) | Outcome-Driven Constraint Violations | 1 | — |

### Medium Term (Next Release)
| # | Action | Papers |
|---|--------|--------|
| 6 | Execution-grounded sandbox testing mode | FinVault, MobileSafetyBench, OS-Sentinel |
| 7 | Agent identity/DID/VC questions | LDP, AI Agents with DIDs, Agentic JWT |
| 8 | Real-time trust verification mode | TrustBench |
| 9 | Multi-agent topology cascade risk | Tipping the Dominos |
| 10 | RL-optimized attack resistance packs | RL Is a Hammer, Backdoor-Powered PI |

### Long Term (Architecture Changes)
| # | Action | Papers |
|---|--------|--------|
| 11 | Self-evolving question bank | SafeEvalAgent |
| 12 | Multimodal agent assessment | MLA-Trust |
| 13 | Domain-specific risk weighting | SafePro, FinVault |
| 14 | Cross-agent traceability scoring | Traceability & Accountability |

---

## 📎 Full Paper Index

| # | Title | Date | arXiv/Source | AMC Relevance |
|---|-------|------|-------------|---------------|
| 1 | IH-Challenge: Training Dataset for Instruction Hierarchy | Mar 2026 | arxiv | 🔴 Critical |
| 2 | You Told Me to Do It: Text-induced Data Leakage | Mar 2026 | arxiv | 🔴 Critical |
| 3 | Real-Time Trust Verification (TrustBench) | Mar 2026 | arxiv | 🔴 Critical |
| 4 | QUARE: Multi-Agent Negotiation for Quality Attributes | Mar 2026 | arxiv | 🟡 Important |
| 5 | LDP: Identity-Aware Protocol for Multi-Agent LLMs | Mar 2026 | arxiv | 🔴 Critical |
| 6 | SuperLocalMemory: Privacy-Preserving Memory with Bayesian Trust | Mar 2026 | arxiv | 🔴 Critical |
| 7 | Stronger Enforcement of IH via Augmented Intermediate Representations | Mar 2026 (v2) | arxiv | 🔴 Critical |
| 8 | Trajectory-Based Safety Audit of Clawdbot (OpenClaw) | Feb 2026 | arxiv | 🟡 Important |
| 9 | Beyond Single-Channel Agentic Benchmarking | Feb 2026 | arxiv | 🔴 Critical |
| 10 | Unsafer in Many Turns: Multi-Turn Safety in Tool-Using Agents | Feb 2026 | arxiv | 🔴 Critical |
| 11 | TAME: Trustworthy Test-Time Evolution of Agent Memory | Feb 2026 | arxiv | 🔴 Critical |
| 12 | Drift-Bench: Cooperative Breakdowns under Input Faults | Feb 2026 | arxiv | 🟡 Important |
| 13 | Co2PO: Coordinated Constrained Policy for Multi-Agent RL Safety | Feb 2026 | arxiv | 🟢 Nice-to-have |
| 14 | Simple Role Assignment for Safety Alignment | Jan 2026 | arxiv | 🟡 Important |
| 15 | StepShield: When to Intervene on Rogue Agents | Jan 2026 | arxiv | 🟡 Important |
| 16 | Epistemic Context Learning: Building Trust in Multi-Agent | Jan 2026 | arxiv | 🔴 Critical |
| 17 | AEMA: Verifiable Evaluation Framework for Agentic LLMs | Jan 2026 | arxiv | 🔴 Critical |
| 18 | AgentDoG: Diagnostic Guardrail Framework for Agent Safety | Jan 2026 | arxiv | 🟡 Important |
| 19 | FinVault: Financial Agent Safety in Execution-Grounded Environments | Jan 2026 | arxiv | 🔴 Critical |
| 20 | SafePro: Safety of Professional-Level AI Agents | Jan 2026 | arxiv | 🟡 Important |
| 21 | -SecBench: Security/Resilience/Trust for UAV Agents | Jan 2026 | arxiv | 🟢 Nice-to-have |
| 22 | MobileSafetyBench: Mobile Device Control Safety | Jan 2026 (v2) | arxiv | 🟡 Important |
| 23 | Decision Quality Evaluation Framework (Pinterest) | Feb 2026 | arxiv | 🟢 Nice-to-have |
| 24 | Outcome-Driven Constraint Violations Benchmark | Feb 2026 (v2) | arxiv | 🔴 Critical |
| 25 | DREAM: Dynamic Red-teaming across Environments | Feb 2026 (v2) | arxiv | 🔴 Critical |
| 26 | AlignSentinel: Alignment-Aware Prompt Injection Detection | Feb 2026 | arxiv | 🟡 Important |
| 27 | ReIn: Conversational Error Recovery with Reasoning Inception | Feb 2026 | arxiv | 🟢 Nice-to-have |
| 28 | OpenAgentSafety: Comprehensive Real-World Agent Safety | Feb 2026 (v2) | arxiv | 🔴 Critical |
| 29 | How Brittle is Agent Safety? Intent Concealment × Complexity | Nov 2025 | arxiv | 🔴 Critical |
| 30 | OS-Sentinel: Mobile GUI Agent Safety | Dec 2025 (v2) | arxiv | 🟡 Important |
| 31 | EU-Agent-Bench: Illegal Behavior Under EU Law | Oct 2025 | arxiv | 🟡 Important |
| 32 | SafeEvalAgent: Self-Evolving Safety Evaluation | Sep 2025 | arxiv | 🟡 Important |
| 33 | Securing the Model Context Protocol | Dec 2025 | arxiv | 🔴 Critical |
| 34 | Tipping the Dominos: Multi-Hop Attacks on Multi-Agent Systems | Dec 2025 | arxiv | 🔴 Critical |
| 35 | AI Agents with Decentralized Identifiers and Verifiable Credentials | Dec 2025 (v2) | arxiv | 🔴 Critical |
| 36 | Agentic JWT: Secure Delegation for Autonomous Agents | Sep 2025 | arxiv | 🟡 Important |
| 37 | WOLF: LLM Deception in Social Deduction | Dec 2025 | arxiv | 🟡 Important |
| 38 | LH-Deception: Long-Horizon Deceptive Behaviors | Feb 2026 (v2) | arxiv | 🟡 Important |
| 39 | Context-Aware Hierarchical Learning (Tool-Completion Attack) | Dec 2025 | arxiv | 🔴 Critical |
| 40 | RL Is a Hammer: RL Recipe for Strong Prompt Injection | Oct 2025 | arxiv | 🔴 Critical |
| 41 | Backdoor-Powered Prompt Injection Nullifies Defenses | Oct 2025 | arxiv | 🔴 Critical |
| 42 | UProp: Uncertainty Propagation in Multi-Step Decisions | Jun 2025 | arxiv | 🟡 Important |
| 43 | MLA-Trust: Multimodal LLM Agent Trust in GUI | Jun 2025 | arxiv | 🟡 Important |
| 44 | Traceability & Accountability in Role-Specialized Pipelines | Oct 2025 | arxiv | 🟡 Important |
| 45 | MedAgentAudit: Collaborative Failure Modes in Medical MAS | Oct 2025 | arxiv | 🟡 Important |
| 46 | From Competition to Coordination: Market Making for Safe MAS | Feb 2026 (v2) | arxiv | 🟢 Nice-to-have |
| 47 | Adversarial Testing in LLMs: Decision-Making Vulnerabilities | May 2025 | arxiv | 🟡 Important |
| 48 | Building Trust in Mental Health Chatbots: Safety Metrics | Feb 2025 (v2) | arxiv | 🟡 Important |

---

## 🎯 Net New Capabilities AMC Should Build

### New Diagnostic Questions (8 recommended)
1. Instruction hierarchy compliance under conflict
2. IH persistence across multi-turn conversations
3. Multi-turn safety decay rate measurement
4. Intent concealment resistance (distributed harmful goals)
5. Memory poisoning resistance
6. Memory provenance validation
7. Agent identity verification (DIDs/VCs)
8. Outcome-level safety assessment (vs per-action)

### New Assurance Packs (5 recommended)
1. `instruction-hierarchy-compliance` — Tests IH across system/developer/user/tool layers
2. `multi-turn-safety-decay` — Measures safety degradation over conversation length
3. `memory-integrity` — Tests memory poisoning, provenance, Bayesian trust
4. `tool-poisoning-resistance` — MCP descriptor attacks, Tool-Completion Attacks
5. `execution-grounded-safety` — Sandbox-based behavioral verification

### New Scoring Dimensions (2 recommended)
1. **Temporal Safety** — Safety as a function of interaction length (decay curve)
2. **Compositional Safety** — Safety under agent composition/topology

### Architecture Recommendations
1. **Runtime verification mode** (inspired by TrustBench) — live scoring, not just point-in-time
2. **Self-evolving question bank** (inspired by SafeEvalAgent) — questions that update with new attack vectors
3. **Domain risk weighting** — same questions, different weights per deployment context
4. **Multi-agent topology assessment** — scoring agent systems, not just individual agents

---

*This analysis represents the state of the art as of March 2026. Papers indexed from arXiv cs.AI, cs.CR, cs.CL, cs.MA.*
