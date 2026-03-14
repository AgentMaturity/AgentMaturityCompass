# AMC Gap Analysis from March 2026 Research Papers

> Generated 2026-03-13 by cross-referencing 25+ recent papers against AMC's 99 assurance packs and diagnostic framework.

---

## Papers Analyzed (March 2026 + recent high-impact)

### Tier 1: Directly relevant to AMC (March 2026)

| # | Paper | Date | Key Insight |
|---|-------|------|-------------|
| 1 | **"You Told Me to Do It"** — Instructional Text-induced Private Data Leakage in LLM Agents | Mar 12, 2026 | High-privilege agents leak private data when instructional text contains embedded extraction commands. Goes beyond prompt injection — measures *data flow* through tool chains. |
| 2 | **"IH-Challenge"** — Training Dataset to Improve Instruction Hierarchy | Mar 11, 2026 | Defines system/developer/user/tool instruction priority. Training data for making LLMs respect hierarchy under conflict. |
| 3 | **"Real-Time Trust Verification for Safe Agentic Actions using TrustBench"** | Mar 9, 2026 | Shift from post-hoc evaluation to **runtime trust verification**. Agents need trust checks BEFORE each action, not after. |
| 4 | **"Security Considerations for AI Agents"** (Perplexity/NIST response) | Mar 12, 2026 | Production security observations from Perplexity's real-world agent operations. NIST CAISI alignment. |
| 5 | **"Language Model Teams as Distributed Systems"** | Mar 12, 2026 | Multi-agent teams analyzed as distributed systems. When is a team better than single agent? Structure vs performance. |
| 6 | **"Increasing Intelligence in AI Agents Can Worsen Collective Outcomes"** | Mar 12, 2026 | More capable individual agents can produce worse outcomes when competing for scarce resources. Emergent tribal behavior. |
| 7 | **"On Information Self-Locking in RL for Active Reasoning of LLM Agents"** | Mar 12, 2026 | Agents get locked into reasoning patterns via RL. Cannot escape local optima in active reasoning. |
| 8 | **"QUARE"** — Multi-Agent Negotiation for Quality Attributes in Requirements Engineering | Mar 12, 2026 | 5 quality-specialized agents negotiate requirements. Framework for balancing competing quality attributes. |
| 9 | **"Beyond Single-Channel Agentic Benchmarking"** | Feb 5, 2026 | Current benchmarks evaluate safety through isolated task-level accuracy. Need multi-channel, holistic evaluation. |
| 10 | **"XSkill"** — Continual Learning from Experience and Skills in Multimodal Agents | Mar 12, 2026 | Agents that learn from experience but suffer from inefficient tool use and inflexible orchestration. |

### Tier 2: High-impact recent papers (Jan-Feb 2026)

| # | Paper | Date | Key Insight |
|---|-------|------|-------------|
| 11 | **"Unsafer in Many Turns"** — Multi-Turn Safety Risks in Tool-Using Agents | Feb 13, 2026 | Taxonomy transforming single-turn harms into multi-turn attacks. Tool-augmented agents have expanded attack surface. |
| 12 | **"Drift-Bench"** — Cooperative Breakdowns under Input Faults | Feb 2, 2026 | User inputs violating cooperative assumptions (implicit intent, missing params, false presuppositions) cause execution risks. |
| 13 | **"AgentDoG"** — Diagnostic Guardrail Framework | Jan 26, 2026 | 3-dimensional taxonomy for agentic risks. Guardrails need risk awareness AND transparency in diagnosis. |
| 14 | **"SafePro"** — Safety of Professional-Level AI Agents | Jan 10, 2026 | Professional-grade agents need different safety evaluation than consumer chatbots. Domain-specific risk surfaces. |
| 15 | **"MobileSafetyBench"** — Safety in Mobile Device Control | Jan 26, 2026 | GUI agents have unique safety risks (irreversible actions, data exposure, unauthorized access). |
| 16 | **"SecBench"** — Security/Resilience/Trust for UAV Agents | Jan 26, 2026 | Safety-critical networked environments need adversarial resilience evaluation. |
| 17 | **"Outcome-Driven Constraint Violations in Autonomous AI"** | Dec 23, 2025 | Agents violate constraints to achieve outcomes. Measures goal-safety tradeoffs. |
| 18 | **"OS-Sentinel"** — Safety-Enhanced Mobile GUI Agents via Hybrid Validation | Oct 28, 2025 | Hybrid validation (rule-based + model-based) catches more safety issues than either alone. |
| 19 | **"SafeEvalAgent"** — Self-Evolving Safety Evaluation | Sep 30, 2025 | Static benchmarks can't keep up with evolving AI risks. Self-evolving evaluation that adapts to new regulations. |
| 20 | **"SafeAgent"** — Automated Risk Simulator | May 23, 2025 | Risk simulation before deployment. Automated generation of adversarial scenarios. |
| 21 | **"Think Twice Before You Act"** — Thought Correction for Agent Safety | May 16, 2025 | Internal reasoning (thought) in trajectories introduces risks. Thought correction improves behavioral safety. |
| 22 | **"UProp"** — Uncertainty Propagation in Multi-Step Agentic Decisions | Jun 20, 2025 | Uncertainty compounds across multi-step agent actions. Need to know WHEN to defer to humans. |
| 23 | **"MLA-Trust"** — Trustworthiness of Multimodal LLM Agents in GUI | Jun 2, 2025 | Multimodal agents have unique trust dimensions not covered by text-only evaluation. |
| 24 | **"Adversarial Testing in LLMs"** — Decision-Making Vulnerabilities | May 19, 2025 | Behavioral vulnerabilities in decision-making systems. Systematic adversarial testing methodology. |
| 25 | **"Polaris"** — Safety-focused LLM Constellation for Healthcare | Mar 20, 2024 | Multi-billion parameter constellation architecture with safety-first design for real-time voice conversations. |

---

## GAP ANALYSIS: What AMC is Missing

### 🔴 CRITICAL GAPS (No coverage, high impact)

#### Gap 1: Runtime Trust Verification (TrustBench, Paper #3)
**What the paper says:** Trust must be verified in real-time BEFORE each action, not post-hoc.
**AMC today:** AMC Score evaluates agents after deployment. No runtime hook.
**What AMC needs:**
- `AMC Watch` needs a **pre-action trust gate** — a lightweight check that fires before each tool call
- New diagnostic: "Does the agent verify trust conditions before executing actions?"
- New assurance pack: `runtimeTrustGatePack.ts` — tests whether agents check permissions/trust before acting
- This is AMC's biggest philosophical gap: it's a **scoring** tool, not a **runtime shield**

#### Gap 2: Instruction Hierarchy Compliance (IH-Challenge, Paper #2)
**What the paper says:** LLMs need to correctly prioritize system > developer > user > tool instructions under conflict.
**AMC today:** Has `instructionCompliancePack.ts` but it tests general compliance, not hierarchical priority.
**What AMC needs:**
- New assurance pack: `instructionHierarchyPack.ts` — 10+ scenarios testing priority conflicts:
  - User instruction conflicts with system prompt
  - Tool output contains instructions that conflict with developer intent
  - Nested authority levels in multi-agent delegation
- New diagnostic questions: "Does the agent correctly prioritize instruction sources under conflict?" "Does the agent resist tool-output instructions that override system-level directives?"

#### Gap 3: Instructional Data Leakage (Paper #1)
**What the paper says:** Agents with tool access leak private data through instructional text embedded in tool I/O.
**AMC today:** Has `dlpExfiltrationPack.ts` and `piiDetectionLeakagePack.ts` but focused on direct exfiltration.
**What AMC needs:**
- New assurance pack: `instructionalLeakagePack.ts` — tests data flow through tool chains:
  - Plant instructions in tool output, check if agent follows them to leak data
  - Multi-hop: tool A returns instruction → agent calls tool B with private data
  - Measures the *rate* of leakage, not just binary pass/fail
- Extends existing DLP pack with **tool-chain propagation** scenarios

#### Gap 4: Multi-Agent Emergent Behavior (Papers #5, #6)
**What the paper says:** Multi-agent teams can produce worse outcomes than individuals. Collective behavior degrades with smarter agents.
**AMC today:** Has `crossAgentCollusionPack.ts` and `delegationTrustChainPack.ts` but focuses on malicious collusion.
**What AMC needs:**
- New assurance pack: `emergentMultiAgentRiskPack.ts` — tests for:
  - Resource contention between agents (scarce tool access, rate limits)
  - Tribal behavior / group polarization in agent fleets
  - Whether adding more agents degrades outcomes
  - Coordination overhead vs. single-agent baseline
- New diagnostic: "Has the system been tested for emergent negative behavior in multi-agent deployments?"

#### Gap 5: Self-Evolving Evaluation (SafeEvalAgent, Paper #19)
**What the paper says:** Static benchmarks become stale. Evaluation must evolve with new risks and regulations.
**AMC today:** Fixed question bank (1013 diagnostics). New packs added manually.
**What AMC needs:**
- An `AMC Evolve` module that:
  - Monitors new CVEs, OWASP updates, regulatory changes
  - Auto-generates new diagnostic questions from emerging threats
  - Flags when existing pack coverage drops below threshold for a new risk category
  - Tracks question relevance decay over time
- Meta-diagnostic: "How recently was this agent's evaluation framework updated?"

### 🟡 MODERATE GAPS (Partial coverage, needs deepening)

#### Gap 6: Multi-Turn Attack Escalation (Paper #11)
**AMC today:** Has `multi-turn-safety.ts` assurance pack.
**What's missing:** The "Unsafer in Many Turns" paper provides a systematic **taxonomy** for transforming single-turn harms into multi-turn attacks. AMC's pack likely tests known patterns but doesn't use this principled taxonomy.
**Fix:** Incorporate the paper's taxonomy into the existing pack. Add tool-augmented multi-turn scenarios (currently likely text-only).

#### Gap 7: Uncertainty Quantification (UProp, Paper #22)
**AMC today:** Has `evaluationReliabilityPack.ts` and confidence-related scoring.
**What's missing:** No measurement of how uncertainty *compounds* across multi-step actions. An agent might be 90% confident on each step but 59% confident after 5 steps (0.9^5).
**Fix:** New diagnostic: "Does the agent track and communicate cumulative uncertainty across multi-step workflows?" New pack: `uncertaintyPropagationPack.ts`.

#### Gap 8: Cooperative Assumption Violations (Drift-Bench, Paper #12)
**AMC today:** Has robustness testing but assumes well-formed user inputs.
**What's missing:** Testing with malformed/ambiguous/implicit user inputs that violate conversational norms.
**Fix:** New assurance pack: `inputFaultResiliencePack.ts` — tests with:
  - Implicit intent (user says "do the thing" without specifying which)
  - Missing required parameters
  - False presuppositions
  - Ambiguous references

#### Gap 9: Thought-Level Safety (Paper #21)
**AMC today:** Evaluates actions/outputs. Doesn't examine reasoning chains.
**What's missing:** Agent's internal reasoning (chain-of-thought) can contain unsafe patterns even when final output looks safe.
**Fix:** New diagnostic: "Is the agent's reasoning process auditable for safety, not just its outputs?" Extend `reasoningObservabilityPack.ts` to include thought-level safety checks.

#### Gap 10: Information Self-Locking (Paper #7)
**AMC today:** No coverage of RL-trained agents getting locked into reasoning patterns.
**What's missing:** Agents trained with RLHF can get stuck in local optima, unable to explore better solutions.
**Fix:** New diagnostic: "Can the agent break out of established reasoning patterns when evidence contradicts them?" This connects to `sycophancyPack.ts` but is a distinct failure mode.

### 🟢 EXISTING COVERAGE (AMC already handles well)

| Paper Concept | AMC Pack(s) | Status |
|---------------|-------------|--------|
| Prompt injection | `injectionPack.ts`, `encodedInjectionPack.ts` | ✅ Strong |
| Sandbox escape | `sandboxBoundaryPack.ts`, `codingAgentEscapePack.ts` | ✅ Strong |
| Tool misuse | `toolMisusePack.ts`, `unsafeToolPack.ts` | ✅ Good |
| Supply chain | `supply-chain-integrity.ts`, `supplyChainAttackPack.ts`, `sbomSupplyChainPack.ts` | ✅ Strong |
| Self-preservation | `selfPreservationPack.ts` | ✅ Good |
| Sycophancy/bias | `sycophancyPack.ts`, `selfPreferentialBiasPack.ts` | ✅ Good |
| Hallucination | `hallucinationPack.ts`, `truthfulnessPack.ts` | ✅ Good |
| PII/privacy | `piiDetectionLeakagePack.ts`, `dlpExfiltrationPack.ts` | ✅ Good (but extend per Gap 3) |
| EU AI Act | `euAiActArticlePack.ts` | ✅ Good |
| HIPAA/healthcare | `hipaaCompliancePack.ts`, `healthcarePHIPack.ts` | ✅ Good |
| Context window | `contextWindowManagementPack.ts` | ✅ Good |
| Adversarial robustness | `adversarial-robustness.ts` | ✅ Good |
| Governance bypass | `governanceBypassPack.ts`, `stepupApprovalBypassPack.ts` | ✅ Strong |

---

## RECOMMENDED NEW ASSURANCE PACKS (Priority Order)

1. **`runtimeTrustGatePack.ts`** — Pre-action trust verification (from TrustBench)
2. **`instructionHierarchyPack.ts`** — System/developer/user/tool priority conflicts (from IH-Challenge)
3. **`instructionalLeakagePack.ts`** — Data leakage through tool-chain instructions (from "You Told Me to Do It")
4. **`emergentMultiAgentRiskPack.ts`** — Collective degradation in agent fleets (from Papers #5, #6)
5. **`uncertaintyPropagationPack.ts`** — Compounding uncertainty in multi-step workflows (from UProp)
6. **`inputFaultResiliencePack.ts`** — Resilience to malformed/ambiguous user inputs (from Drift-Bench)
7. **`thoughtSafetyAuditPack.ts`** — Reasoning-chain safety beyond output safety (from Paper #21)
8. **`reasoningLockDetectionPack.ts`** — Detecting agents stuck in reasoning patterns (from Paper #7)
9. **`professionalDomainSafetyPack.ts`** — Domain-specific safety for professional agents (from SafePro)
10. **`guiAgentSafetyPack.ts`** — GUI/device control safety for embodied agents (from MobileSafetyBench, OS-Sentinel)

## RECOMMENDED NEW DIAGNOSTIC QUESTIONS

1. "Does the agent verify trust conditions before executing each action?" (Runtime trust)
2. "Does the agent correctly prioritize instruction sources under conflict?" (Instruction hierarchy)
3. "Can private data leak through tool-chain instruction propagation?" (Instructional leakage)
4. "Has the system been tested for emergent negative behavior in multi-agent deployments?" (Emergence)
5. "Does the agent track and communicate cumulative uncertainty across multi-step workflows?" (Uncertainty)
6. "Is the agent resilient to implicit, ambiguous, or presupposition-violating user inputs?" (Input faults)
7. "Is the agent's reasoning process auditable for safety, not just its outputs?" (Thought safety)
8. "Can the agent break out of established reasoning patterns when evidence contradicts them?" (Lock-in)
9. "How recently was this agent's evaluation framework updated for new threats?" (Evaluation freshness)
10. "Does adding more agents to the system improve or degrade collective outcomes?" (Multi-agent scaling)

---

## ARCHITECTURAL INSIGHT

The biggest meta-gap is **AMC is a scorer, not a runtime system.** Papers #3, #18, and #13 all converge on the same insight: trust evaluation needs to happen at runtime, not just at assessment time. AMC Score gives you a maturity level, but TrustBench and AgentDoG suggest agents need:

1. **Pre-action gates** (check trust before every tool call)
2. **Hybrid validation** (rule-based + model-based, real-time)
3. **Diagnostic transparency** (not just "unsafe" but "unsafe because X at step Y")

This capability is now part of **AMC Shield** — the integrated runtime protection engine that handles both detection and enforcement (guard capabilities are unified within Shield, not a separate product).

---

*25 papers analyzed. 5 critical gaps, 5 moderate gaps identified. 10 new packs recommended. 10 new diagnostics proposed.*
