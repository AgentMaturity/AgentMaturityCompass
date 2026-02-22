# AMC Open Rubric Standard v1.0

**Agent Maturity Compass — Open Assessment Framework**

> A structured, vendor-neutral rubric for evaluating the maturity of AI agent deployments across strategy, autonomy, culture, resilience, and skills.

---

## License

This rubric document is licensed under **[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/)**. You are free to share, adapt, and build upon this rubric for any purpose, including commercial use, provided you give appropriate attribution.

> **Note:** The AMC software, scoring engine, and tooling are proprietary. This open rubric covers the assessment framework and question definitions only.

Attribution: `Agent Maturity Compass (AMC) by AgentMaturityCompass contributors`

---

## Table of Contents

1. [Scoring Methodology](#scoring-methodology)
2. [Full Rubric — Core Dimensions](#full-rubric--core-dimensions)
3. [Full Rubric — Extended Dimensions](#full-rubric--extended-dimensions)
4. [Self-Assessment Guide](#self-assessment-guide)
5. [Assessment Tiers](#assessment-tiers)
6. [Mapping to Standards & Regulations](#mapping-to-standards--regulations)
7. [Glossary](#glossary)

---

## Scoring Methodology

Every question is scored on a **L0–L5 maturity scale**. Scores are integers; half-levels are not used.

| Level | Label | Description |
|-------|-------|-------------|
| **L0** | **None / Ad-hoc** | No awareness or capability. Agent operations are absent or entirely manual and unplanned. |
| **L1** | **Initial / Reactive** | Some awareness exists. Efforts are sporadic, undocumented, and person-dependent. Problems are fixed only after they surface. |
| **L2** | **Developing / Managed** | Defined processes exist for some areas. Documentation is partial. Practices are followed inconsistently across teams. |
| **L3** | **Defined / Standardized** | Organization-wide standards are documented and followed. Roles and responsibilities are clear. Metrics are collected. |
| **L4** | **Quantitatively Managed** | Metrics drive decisions. Continuous monitoring is in place. Processes are optimized based on data. Exceptions are rare and handled systematically. |
| **L5** | **Optimizing / Leading** | Continuous improvement is embedded. The organization innovates on agent practices, contributes to industry standards, and adapts proactively to emerging risks. |

### Composite Scoring

- **Layer Score** = mean of all question scores within that layer (0.0–5.0).
- **Overall AMC Score** = weighted mean of layer scores (default weights are equal; organizations may customize).
- **Maturity Band**: 0–0.9 = Ad-hoc, 1.0–1.9 = Initial, 2.0–2.9 = Developing, 3.0–3.9 = Defined, 4.0–4.9 = Managed, 5.0 = Optimizing.

---

## Full Rubric — Core Dimensions

### Layer 1: Strategic Agent Operations (AMC-1.x) — 11 Questions

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-1.1 | Is there a documented AI/agent strategy aligned with business objectives? | No strategy exists | Written strategy reviewed quarterly, tied to OKRs | Strategy is a living document, continuously updated with market and tech shifts |
| AMC-1.2 | Are agent use-cases prioritized by business value and feasibility? | Use-cases are ad-hoc or pet projects | Scoring matrix ranks use-cases; top N are resourced | Portfolio management with real-time ROI tracking and automated re-prioritization |
| AMC-1.3 | Is there executive sponsorship for agent initiatives? | No executive awareness | Named C-level sponsor with regular reviews | Board-level AI committee with agent-specific KPIs |
| AMC-1.4 | Are agent budgets and resources explicitly allocated? | No dedicated budget | Annual budget line item with quarterly reviews | Dynamic resource allocation based on agent performance data |
| AMC-1.5 | Is there a roadmap for agent capability expansion? | No roadmap | 12-month roadmap with milestones | Rolling roadmap with scenario planning and contingency paths |
| AMC-1.6 | Are success metrics defined for agent deployments? | No metrics | KPIs defined per agent (accuracy, latency, adoption) | Real-time dashboards with automated alerting and trend analysis |
| AMC-1.7 | Is there a governance framework for agent decision-making? | No governance | Governance policy exists with defined approval gates | Adaptive governance that adjusts controls based on agent risk level |
| AMC-1.8 | Are agent initiatives reviewed against competitive landscape? | No competitive awareness | Quarterly competitive analysis | Continuous competitive intelligence with automated market scanning |
| AMC-1.9 | Is there a communication plan for agent initiatives across the org? | No communication | Regular updates to stakeholders | Transparent, real-time visibility into agent operations for all employees |
| AMC-1.10 | Are partnerships and vendor relationships managed for agent tech? | No vendor management | Vendor evaluation criteria and review cycles | Strategic partnership ecosystem with co-development agreements |
| AMC-1.11 | Is there a sunset/decommission process for underperforming agents? | Agents run indefinitely with no review | Defined criteria for decommission with review schedule | Automated detection of underperforming agents with graceful wind-down workflows |

### Layer 2: Leadership & Autonomy (AMC-2.x) — 5 Questions

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-2.1 | What level of autonomy are agents granted in decision-making? | All decisions require human approval | Agents handle routine decisions; humans handle exceptions | Agents operate autonomously within defined boundaries with self-adjusting guardrails |
| AMC-2.2 | Are escalation paths defined for agent decisions beyond their authority? | No escalation paths | Documented escalation matrix by decision type | Dynamic escalation with context-aware routing and SLA tracking |
| AMC-2.3 | Is there a human-in-the-loop (HITL) policy for high-stakes decisions? | No HITL considerations | HITL required for defined risk categories | Risk-adaptive HITL that loosens/tightens based on agent confidence and track record |
| AMC-2.4 | Are agent autonomy boundaries regularly reviewed and updated? | Never reviewed | Annual review of autonomy levels | Continuous calibration using performance data and incident history |
| AMC-2.5 | Is leadership trained to manage and oversee autonomous agents? | No training | Leadership training program exists | Leaders actively contribute to agent strategy and understand technical capabilities |

### Layer 3: Culture & Alignment (AMC-3.x.y) — 16 Questions in 3 Sublayers

#### 3A: Organizational Readiness (AMC-3.1.y)

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-3.1.1 | Is there organizational buy-in for AI agent adoption? | Resistance or unawareness | Majority of teams understand and support agent initiatives | Organization-wide enthusiasm with grassroots innovation |
| AMC-3.1.2 | Are roles and responsibilities defined for agent operations? | No defined roles | RACI matrix for agent lifecycle | Cross-functional agent teams with rotating responsibilities |
| AMC-3.1.3 | Is there a change management process for agent deployments? | No change management | Standard change management applied to agent rollouts | Continuous deployment with automated impact assessment |
| AMC-3.1.4 | Are employees trained on working alongside agents? | No training | Role-specific training programs | Continuous learning with hands-on agent collaboration labs |
| AMC-3.1.5 | Is there a feedback mechanism for employees interacting with agents? | No feedback channel | Structured feedback collection (surveys, reviews) | Real-time feedback loops that directly influence agent behavior |

#### 3B: Ethics & Values (AMC-3.2.y)

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-3.2.1 | Are ethical guidelines defined for agent behavior? | No ethical guidelines | Published ethical principles for agents | Ethics board with regular reviews, external audits, and public transparency reports |
| AMC-3.2.2 | Is bias detection and mitigation implemented for agents? | No bias considerations | Bias testing in development pipeline | Continuous bias monitoring in production with automated mitigation |
| AMC-3.2.3 | Are agents' decisions explainable to affected stakeholders? | Black-box decisions | Explanation capability for key decision types | On-demand explanations at multiple detail levels for all decisions |
| AMC-3.2.4 | Is there a process for handling ethical incidents involving agents? | No incident process | Ethical incident response plan exists | Proactive ethical risk scanning with pre-defined response playbooks |
| AMC-3.2.5 | Are agents aligned with organizational values and brand voice? | No alignment consideration | Style guides and value constraints applied | Dynamic alignment that adapts to context while maintaining core values |
| AMC-3.2.6 | Is there transparency about when users are interacting with an agent vs. a human? | No disclosure | Disclosure policy in place | Clear, context-appropriate disclosure with user choice to escalate to human |

#### 3C: Trust & Adoption (AMC-3.3.y)

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-3.3.1 | Is there a trust-building strategy for agent adoption? | No trust strategy | Phased rollout with trust metrics | Adaptive trust framework with personalized confidence-building |
| AMC-3.3.2 | Are agent outcomes tracked for user satisfaction? | No tracking | CSAT/NPS measured for agent interactions | Real-time satisfaction tracking with automated quality interventions |
| AMC-3.3.3 | Is adoption measured and managed across teams? | No adoption metrics | Adoption dashboards by team/function | Predictive adoption modeling with targeted enablement |
| AMC-3.3.4 | Are agent failures handled transparently with users? | Failures hidden or ignored | Error messaging and follow-up processes | Proactive failure notification with automated remediation and follow-up |
| AMC-3.3.5 | Is there a community of practice for agent users? | No community | Internal community with regular meetups | Active community influencing agent roadmap and sharing best practices |

### Layer 4: Resilience (AMC-4.x) — 9 Questions

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-4.1 | Are agents monitored for uptime and performance? | No monitoring | APM with alerting and SLAs | Self-healing agents with predictive failure detection |
| AMC-4.2 | Is there a disaster recovery plan for agent systems? | No DR plan | Documented DR with regular drills | Automated failover with zero-downtime recovery |
| AMC-4.3 | Are agent outputs validated for accuracy and safety? | No validation | Output validation rules in production | Multi-layer validation with adversarial testing and real-time guardrails |
| AMC-4.4 | Is there rollback capability for agent deployments? | No rollback | Versioned deployments with manual rollback | Automated rollback triggered by quality regression detection |
| AMC-4.5 | Are agents tested for adversarial inputs and prompt injection? | No security testing | Regular red-team exercises | Continuous adversarial testing with automated attack simulation |
| AMC-4.6 | Is there an incident response process specific to agent failures? | No process | Documented IR process with defined roles | Automated incident detection, triage, and response with post-mortem automation |
| AMC-4.7 | Are agent dependencies (APIs, models, data) managed for reliability? | No dependency management | Dependency inventory with health checks | Automated dependency risk scoring with fallback chains |
| AMC-4.8 | Is there capacity planning for agent workloads? | No capacity planning | Quarterly capacity reviews | Auto-scaling with predictive capacity management |
| AMC-4.9 | Are data pipelines feeding agents monitored for quality and freshness? | No data monitoring | Data quality checks on ingestion | Real-time data quality scoring with automatic agent behavior adjustment |

### Layer 5: Skills (AMC-5.x) — 7 Questions

| ID | Question | What L0 looks like | What L3 looks like | What L5 looks like |
|----|----------|--------------------|--------------------|---------------------|
| AMC-5.1 | Does the team have skills to build and maintain AI agents? | No AI/agent skills | Dedicated agent engineering team with defined competencies | Center of excellence with cutting-edge skills and external thought leadership |
| AMC-5.2 | Is there a training and upskilling plan for agent-related roles? | No training plan | Annual training plan with budget | Continuous learning platform with personalized skill paths |
| AMC-5.3 | Are prompt engineering and agent design skills developed? | No prompt engineering awareness | Prompt engineering standards and training | Advanced prompt optimization with systematic evaluation frameworks |
| AMC-5.4 | Is there expertise in evaluating and benchmarking agent performance? | No evaluation capability | Standard evaluation frameworks in use | Custom benchmarks, automated eval pipelines, and public benchmark contributions |
| AMC-5.5 | Are integration skills available (APIs, tools, multi-agent orchestration)? | No integration capability | Team can integrate agents with core systems | Advanced multi-agent orchestration with custom tooling |
| AMC-5.6 | Is there domain expertise to validate agent outputs in business context? | No domain validation | Domain experts review agent outputs regularly | Embedded domain expertise in agent feedback loops with continuous calibration |
| AMC-5.7 | Are MLOps/AgentOps practices in place for lifecycle management? | No ops practices | CI/CD for agent deployments with monitoring | Full AgentOps platform with automated testing, deployment, monitoring, and optimization |

---

## Full Rubric — Extended Dimensions

These dimensions extend the core assessment for organizations seeking deeper coverage.

| ID | Dimension | Focus | Example Questions |
|----|-----------|-------|-------------------|
| **AMC-MEM** | Memory & Context | How agents retain, manage, and leverage context across interactions | Long-term memory architecture, context window management, memory pruning policies, cross-session continuity |
| **AMC-HOQ** | Human-Agent Orchestration Quality | Quality of collaboration between humans and agents | Handoff smoothness, context preservation in escalation, collaborative task completion rates |
| **AMC-OPS** | Operational Excellence | Day-to-day operational maturity of agent systems | Deployment frequency, mean time to recovery, change failure rate, operational documentation |
| **AMC-COST** | Cost Management | Financial efficiency of agent operations | Cost per interaction, cost optimization strategies, budget forecasting accuracy, ROI measurement |
| **AMC-RES** | Resource Efficiency | Compute, token, and infrastructure efficiency | Token usage optimization, caching strategies, model selection efficiency, infrastructure utilization |
| **AMC-GOV-PROACTIVE** | Proactive Governance | Forward-looking governance and risk anticipation | Regulatory horizon scanning, proactive policy development, emerging risk identification |
| **AMC-SOCIAL** | Social Impact | Broader impact of agent deployment on society and stakeholders | Job displacement planning, accessibility, digital divide considerations, environmental impact |

### Extended Dimension Detail

Each extended dimension follows the same L0–L5 scoring methodology. Below are representative anchors:

**AMC-MEM — Memory & Context**
- L0: Agents are stateless; every interaction starts from scratch.
- L3: Structured memory with retention policies; context persists within defined scopes.
- L5: Adaptive memory that self-organizes, prunes, and retrieves optimally based on task demands.

**AMC-HOQ — Human-Agent Orchestration Quality**
- L0: No defined handoff; humans and agents work in silos.
- L3: Structured handoff protocols with context transfer; satisfaction tracked.
- L5: Seamless human-agent collaboration with dynamic role-switching and shared mental models.

**AMC-OPS — Operational Excellence**
- L0: No operational practices; agents deployed manually.
- L3: Standard CI/CD, monitoring, and runbooks for agent systems.
- L5: Fully automated AgentOps with self-healing, canary deployments, and zero-touch operations.

**AMC-COST — Cost Management**
- L0: No cost tracking for agent operations.
- L3: Cost dashboards with per-agent and per-interaction tracking; budget reviews.
- L5: Automated cost optimization with dynamic model routing and predictive spend management.

**AMC-RES — Resource Efficiency**
- L0: No awareness of resource consumption.
- L3: Token and compute budgets defined; caching in place.
- L5: Intelligent resource allocation with automatic model tiering and waste elimination.

**AMC-GOV-PROACTIVE — Proactive Governance**
- L0: Governance is reactive only.
- L3: Regulatory watch process; policies updated ahead of enforcement deadlines.
- L5: Organization contributes to regulatory development; internal policies anticipate industry direction.

**AMC-SOCIAL — Social Impact**
- L0: No consideration of social impact.
- L3: Impact assessments conducted; mitigation plans for affected stakeholders.
- L5: Positive social impact is a design goal; transparent reporting and community engagement.

---

## Self-Assessment Guide

You can assess your organization's agent maturity using this rubric without any AMC tooling. Here's how:

### Step 1: Assemble Your Team
Gather 3–7 people spanning engineering, product, operations, compliance, and leadership. Diverse perspectives reduce blind spots.

### Step 2: Score Each Question
For each question in the rubric:
1. Read the question and the L0/L3/L5 anchors.
2. Discuss where your organization currently sits.
3. Assign a score (0–5) based on honest assessment.
4. Document brief evidence or rationale for the score.

### Step 3: Calculate Layer Scores
Average the scores within each layer:
```
Layer Score = sum(question scores in layer) / number of questions in layer
```

### Step 4: Calculate Overall Score
Average the layer scores (or apply custom weights if certain layers are more relevant to your context):
```
Overall AMC Score = sum(layer scores) / number of layers
```

### Step 5: Identify Gaps and Prioritize
1. Flag any question scored L0 or L1 — these are critical gaps.
2. Look for layers where the average is significantly below others — these are systemic weaknesses.
3. Prioritize improvements that unlock the most business value or reduce the most risk.

### Step 6: Reassess Periodically
- **Quick assessment**: Monthly or after significant changes.
- **Full assessment**: Quarterly or semi-annually.
- **Deep assessment**: Annually or before major strategic decisions.

### Tips for Honest Self-Assessment
- Score based on **current state**, not aspirations or plans.
- If in doubt between two levels, choose the lower one.
- Use evidence: "We have a document" beats "We plan to write one."
- Different assessors will have different views — discussion is the point.

---

## Assessment Tiers

AMC supports three assessment depths to match your time and rigor needs:

### 🟢 Quick Assessment (15–30 minutes)

- **Questions**: ~15 (one representative question per sublayer/dimension)
- **Who**: Single assessor or small group
- **When**: Monthly check-ins, initial baseline, or after major deployments
- **Output**: Overall maturity band, top 3 strengths, top 3 gaps
- **Best for**: Teams new to AMC, rapid pulse checks, executive briefings

### 🟡 Standard Assessment (1–2 hours)

- **Questions**: All 67 core questions (Layers 1–5)
- **Who**: Cross-functional team of 3–5 people
- **When**: Quarterly reviews, planning cycles
- **Output**: Layer-by-layer scores, gap analysis, prioritized improvement plan
- **Best for**: Most organizations, regular maturity tracking, team alignment

### 🔴 Deep Assessment (Half-day to full day)

- **Questions**: All 67 core + optional domain extensions (~67–90 questions)
- **Who**: 5–7 people including external advisors or auditors
- **When**: Annual strategic reviews, pre-audit preparation, board presentations
- **Output**: Comprehensive maturity report, benchmark comparisons, detailed remediation roadmap, standards mapping
- **Best for**: Regulated industries, enterprise deployments, organizations seeking certification or external validation

---

## Mapping to Standards & Regulations

The AMC rubric aligns with major AI governance frameworks. Use this mapping to demonstrate compliance coverage or identify gaps relative to regulatory requirements.

### NIST AI Risk Management Framework (AI RMF 1.0)

| NIST AI RMF Function | AMC Layers & Dimensions |
|----------------------|------------------------|
| **GOVERN** — Governance structures and accountability | AMC-1.7, AMC-1.3, AMC-2.x, AMC-GOV-PROACTIVE |
| **MAP** — Context and risk identification | AMC-1.1, AMC-1.2, AMC-1.8, AMC-3.2.1, AMC-SOCIAL |
| **MEASURE** — Assessment and metrics | AMC-1.6, AMC-3.3.2, AMC-5.4, AMC-COST |
| **MANAGE** — Risk treatment and monitoring | AMC-4.x, AMC-4.5, AMC-4.6, AMC-OPS |

### ISO/IEC 42001 — AI Management System

| ISO 42001 Clause | AMC Coverage |
|-----------------|-------------|
| **4. Context of the organization** | AMC-1.1, AMC-1.8, AMC-SOCIAL |
| **5. Leadership** | AMC-1.3, AMC-2.x, AMC-2.5 |
| **6. Planning** | AMC-1.2, AMC-1.4, AMC-1.5 |
| **7. Support (resources, competence, awareness)** | AMC-5.x, AMC-3.1.4, AMC-RES |
| **8. Operation** | AMC-4.x, AMC-OPS, AMC-MEM |
| **9. Performance evaluation** | AMC-1.6, AMC-3.3.2, AMC-5.4, AMC-HOQ |
| **10. Improvement** | AMC-1.11, AMC-3.3.5, AMC-GOV-PROACTIVE |

### EU AI Act

| EU AI Act Requirement | AMC Coverage |
|----------------------|-------------|
| **Risk classification** | AMC-1.2 (prioritization by risk), AMC-1.7 (governance framework) |
| **High-risk AI system requirements** | AMC-4.3 (output validation), AMC-4.5 (adversarial testing), AMC-3.2.3 (explainability) |
| **Human oversight** | AMC-2.1, AMC-2.3 (HITL), AMC-HOQ |
| **Transparency obligations** | AMC-3.2.6 (disclosure), AMC-3.2.3 (explainability) |
| **Data governance** | AMC-4.9 (data quality), AMC-MEM (memory management) |
| **Technical documentation** | AMC-5.7 (AgentOps), AMC-OPS (operational documentation) |
| **Post-market monitoring** | AMC-4.1 (monitoring), AMC-4.6 (incident response), AMC-1.6 (metrics) |
| **Bias and fairness** | AMC-3.2.2 (bias detection), AMC-3.2.1 (ethical guidelines) |
| **Record-keeping** | AMC-OPS, AMC-5.7 |

> **Note:** This mapping is illustrative. Organizations should conduct their own legal analysis for regulatory compliance. AMC maturity does not constitute regulatory certification.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Agent** | An AI system that can perceive its environment, make decisions, and take actions with some degree of autonomy |
| **AgentOps** | Operational practices for deploying, monitoring, and managing AI agents in production (analogous to MLOps) |
| **HITL** | Human-in-the-loop — requiring human review or approval for certain agent decisions |
| **Maturity Band** | The qualitative label (Ad-hoc through Optimizing) corresponding to a numeric score range |
| **Layer** | A top-level grouping of related assessment questions in the AMC framework |
| **Extended Dimension** | Additional assessment areas beyond the 5 core layers for deeper evaluation |

---

## Contributing

This rubric is a living document. To propose changes:
1. Open an issue or pull request in the AMC repository.
2. Explain the rationale for your proposed change.
3. Reference any standards, research, or practitioner feedback that supports it.

---

*AMC Open Rubric Standard v1.0 — Published 2026*
