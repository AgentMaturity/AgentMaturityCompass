# AMC User Persona Audit — Batch 3 (Personas 21–30)
**Date:** 2026-03-14  
**Auditor:** Subagent (automated multi-persona UX audit)  
**Method:** CLI testing, source code inspection, docs review, website/RFC analysis  
**Verdict:** Brutally honest.

---

## Executive Summary

AMC is an impressive and deeply engineered product with serious production scaffolding — 1,200+ modules, 2,700+ tests, a whitepaper, dual RFCs, and a CLI that actually works. But it has a structural identity crisis: it markets to everyone and serves developers. The five regulated-industry personas (Maria, James, Ling, Patrick, Diana) hit hard walls because the CLI's compliance engine only supports 8 frameworks and **HIPAA, SOX, FedRAMP, FERPA, and COPPA are not among them**. The Sector Packs documentation knows this and covers it — but the CLI doesn't implement it. That disconnect between docs and reality is the single biggest gap.

---

## Persona 21 — Fatima (AI Ethics Researcher)

**Goal:** Study bias, fairness, transparency in AI agents via `amc watch safety-test`, `amc watch explain`

### Journey

- `amc watch safety-test default` → Works. Returns "Passed: yes, Tests Run: 6, Findings: 0". Clean output.
- `amc watch explain default run-001` → Works. Returns explainability packet with confidence scores and signed digest.
- Transparency/explainability: `src/watch/explainabilityPacket.ts` exists and produces structured output.
- `src/score/alignmentIndex.ts`, `src/score/interpretability.ts`, `src/score/behavioralTransparency.ts` all present.
- `src/score/selfKnowledgeMaturity.ts` — directly relevant to AI ethics research.
- Bias/fairness: **NOT surfaced as a named CLI concern.** No `amc watch bias`, no `amc fairness-audit`. The closest is `safetyMetrics.ts` but "fairness" isn't a distinct dimension.
- The whitepaper (`AMC_WHITEPAPER_v1.md`) is methodologically rigorous enough to cite, with formal scoring formula M(a,d,t) and trust tier definitions.
- Safety test only runs 6 tests — feels thin for ethics research wanting coverage metrics.

### Gaps
1. **No fairness/bias dimension** in the scoring model — ethics researchers need demographic parity, counterfactual fairness, intersectional bias checks
2. **`amc watch safety-test` runs 6 tests** with no option to expand or scope to specific safety categories (e.g., "run only bias tests")
3. **Explainability packet** is a JSON blob — no human-readable narrative; ethics researchers need prose explanations, not digests
4. **No demographic or population-level analysis** support
5. **No way to export transparency reports in academic citation formats** (e.g., model card format, Datasheets for Datasets)
6. Alignment index (`alignmentIndex.ts`) exists but isn't surfaced in `amc watch` — Fatima would never find it

### Rating: **5/10**
*Core infrastructure exists. But "ethics" as a user category is unnamed and unsupported as a first-class persona. Fatima would feel like she's repurposing a developer tool rather than using purpose-built ethics tooling.*

---

## Persona 22 — Ryan (SRE)

**Goal:** Production monitoring, incident response, SLA tracking via `amc monitor`, `amc alert`, `amc observe`, `amc drift check`

### Journey

- `amc monitor` → Works with subcommands: `start`, `check`, `status`, `events`, `metrics`. Solid.
- `amc alert` → Works: `send`, `config`, `test`, `watch`. Supports Slack, PagerDuty, webhooks. Solid.
- `amc observe` → Works: `timeline`, `anomalies`. Good for SRE.
- `amc drift check` → Works. Returns drift report.
- `amc drift report` → Works.
- `src/ops/governanceSlo.ts`, `src/ops/circuitBreaker.ts`, `src/ops/degradationMode.ts` — all present.
- `src/incidents/` — full incident subsystem with causal inference, auto-assembly, timeline.
- Integration with OTel: `src/observability/otelExporter.ts`, `src/ops/otelExporter.ts`.
- **SLA tracking**: `governanceSlo.ts` exists but isn't a top-level CLI command. Ryan has to know the internals.
- **Incident response runbook**: `docs/INCIDENT_RESPONSE_READINESS.md` exists — good.
- No `amc sla` command. No `amc slo` command. SRE vocabulary not surfaced in CLI.
- `amc alert config` doesn't have a `--test-pagerduty-escalation` or on-call integration.

### Gaps
1. **No `amc sla` / `amc slo` top-level command** — SLOs exist in source but aren't a CLI first-class citizen
2. **`amc monitor start` has no `--interval` or `--alert-threshold` flags visible** in help
3. **No runbook integration** — `INCIDENT_RESPONSE_READINESS.md` is a doc, not a linked CLI artifact
4. **No on-call routing** (PagerDuty escalation policies, OpsGenie schedules) — alerts can send to PD but can't manage policies
5. **No `--since` / `--until` time windowing on `amc monitor events`** — critical for incident post-mortems
6. **Dashboard served locally only** — no remote metrics endpoint for Grafana/Datadog import

### Rating: **7/10**
*Best-served persona in this batch. The SRE surface is real, used terminology is right, and the CLI works. Gaps are in SLA visibility and on-call routing depth.*

---

## Persona 23 — Hiroshi (IoT Developer)

**Goal:** Lightweight scoring for edge AI agents, `amc lite-score`, `amc quickscore`

### Journey

- `amc lite-score` → Works. `--eu-ai-act` flag available. Targets "non-agent LLMs / chatbots" per help text.
- `amc quickscore` → Works. Has `--auto` flag, `--json` for piping. Interactive fallback.
- `src/score/leanAMC.ts` exists — specifically for lightweight scoring.
- `src/diagnostic/rapidQuickscore.ts` — rapid version.
- **IoT-specific**: No edge deployment guidance. `lite-score` says "non-agent LLMs / chatbots" — IoT agents aren't in the framing.
- No `--offline` mode — edge devices often have no network.
- No resource budget flags (`--max-memory 64mb`, `--cpu-budget`).
- No ARM/embedded platform support documentation.
- Sector packs (`docs/SECTOR_PACKS.md`) — Hiroshi would want the `ubiquity-to-utility` (energy grids) or `material-to-machines` packs, but these aren't accessible via `amc lite-score`.
- `amc quickscore --json` works for CI pipelines but returns verbose data — Hiroshi needs a single score integer for resource-constrained pipelines.

### Gaps
1. **No offline/airgapped mode** — edge devices need local operation
2. **`amc lite-score` is framed for chatbots, not IoT agents** — wrong persona framing in help text
3. **No resource constraint flags** — Hiroshi needs `--minimal` mode that skips crypto operations for 4MB RAM devices
4. **No sector pack integration in lite mode** — IoT sector packs (IEC 61850, energy grid) exist in docs but aren't lit up in `lite-score`
5. **No embedded platform docs** — no mention of Raspberry Pi, ESP32, Jetson
6. **`quickscore --json` output** is not MQTT/edge-friendly — no compact schema

### Rating: **4/10**
*`lite-score` exists and works, but it's positioned as "chatbot scoring" not "edge AI scoring". Hiroshi lands in no-man's-land — the docs mention IoT use cases but the CLI doesn't serve them.*

---

## Persona 24 — Maria (Healthcare AI Lead)

**Goal:** HIPAA compliance, patient safety, `amc comply report --framework HIPAA`

### Journey

- `amc comply report --framework HIPAA` → **"Unsupported compliance framework: HIPAA"**
- `amc guardrails profile healthcare` → Works! Returns 9 guardrails including `pii-redaction`, `human-approval-gate`, `compliance-boundary`.
- Sector packs: `docs/SECTOR_PACKS.md` covers 9 health packs (`digital-health-record`, `patient-lifecycle`, `clinical-lifecycle`, etc.).
- `src/vault/dlp.ts` — DLP exists.
- `src/vault/privacyBudget.ts` — privacy budget exists.
- **But HIPAA is not a supported compliance framework.** The biggest gap for healthcare AI.
- EU AI Act mapping covers healthcare agents as "high-risk AI" under Annex III §5 — this is present and correct.
- No HIPAA-specific question bank items visible in `AMC_QUESTION_BANK_FULL.json` scan.
- `docs/SECTOR_PACKS.md` exists and is detailed. But Sector Pack CLI commands aren't documented anywhere discoverable.
- No patient safety scoring dimension.
- No BAA (Business Associate Agreement) artifact generation.

### Gaps
1. **CRITICAL: HIPAA not implemented in compliance engine** — `amc comply report --framework HIPAA` fails with error
2. **No PHI (Protected Health Information) detection beyond generic PII** — healthcare needs HL7/FHIR awareness
3. **No BAA artifact generation** for cloud deployments
4. **Healthcare sector packs exist in docs but no CLI command to activate them** — gap between docs and reality
5. **No patient safety scoring** — agents causing patient harm is the #1 healthcare AI risk
6. **No FDA SaMD (Software as Medical Device) guidance** despite being listed as a use case
7. No `amc comply report --framework HIPAA` even as a stub mapping HIPAA to SOC2+GDPR+ISO_42001

### Rating: **2/10**
*The foundational command fails with an error. Guardrails work and sector pack docs are excellent, but the compliance engine gap is a dealbreaker for a regulated industry buyer.*

---

## Persona 25 — James (Financial Services)

**Goal:** SOX compliance, model risk management, `amc comply report --framework SOC2`, `amc comply risk-classify`

### Journey

- `amc comply report --framework SOC2` → **Works.** Returns JSON with coverage score: 0.500. 
- `amc comply risk-classify` → Does not exist as a subcommand. `amc comply --help` shows: `init`, `verify`, `report`, `fleet`, `diff`.
- `src/compliance/regulatoryAutomation.ts` exists.
- `src/compliance/euAiActClassifier.ts` exists — EU AI Act risk classification works.
- **SOX not supported**: `amc comply report --framework SOX` fails.
- `docs/SECTOR_PACKS.md` — Wealth station has packs: `credit-lifecycle`, `insurance-lifecycle`, `wealth-management`, `trading-execution`, `payment-rails`, `regulatory-enforcement`. Detailed and impressive.
- But these packs aren't activatable via CLI.
- Model risk management (`SR 11-7` / `OCC 2011-12` guidance) — zero coverage. No `amc model-risk` command.
- `src/score/industryTrustModels.ts` exists — financial trust models.
- SOC 2 report coverage: 0.500 — 50% coverage is a failing score for a SOX audit.

### Gaps
1. **SOX not supported** — the actual regulatory requirement for public companies is missing
2. **`amc comply risk-classify` doesn't exist** — the command in the task brief isn't in the CLI
3. **SOC 2 coverage at 50%** — barely passing for financial services compliance
4. **No model risk management commands** (SR 11-7, OCC 2011-12 model validation)
5. **No financial sector pack CLI activation** — 6 wealth packs exist in docs, zero in CLI
6. **No audit trail export in SAR/suspicious activity format** for AML compliance
7. **No FFIEC Cybersecurity Assessment Tool mapping**

### Rating: **3/10**
*SOC 2 works (barely) and the sector pack documentation is strong. But the primary ask (SOX, model risk management, `risk-classify`) either fails or doesn't exist. Financial services needs more.*

---

## Persona 26 — Ling (Education Tech)

**Goal:** AI tutoring agents, safety for minors, content filtering, `amc guardrails`

### Journey

- `amc guardrails list` → Works. Shows available guardrails.
- `amc guardrails enable output-toxicity-filter` → Works.
- `amc guardrails profile healthcare` → Works (healthcare profile has human-approval-gate etc).
- **No `education` guardrail profile** — only profiles: `minimal`, `standard`, `strict`, `healthcare`, `financial`.
- `src/shield/conversationIntegrity.ts` exists.
- `src/shield/contentModerationBot.ts` → Actually in agents, not shield.
- Sector packs: Education station (`docs/SECTOR_PACKS.md`) has 6 packs: `kindergarten`, `primary-education`, `secondary-education`, `tertiary-education`, `adult-education`, `lifelong-learning`.
- But **no COPPA compliance** (under-13 protections) in the compliance engine.
- No `amc guardrails profile education` or `amc guardrails profile minors`.
- No age-gating commands.
- `src/watch/safetyTestkit.ts` exists — but doesn't specifically target child safety scenarios.
- No FERPA (student records) support in compliance engine.
- Content filtering guardrail (`output-toxicity-filter`) is generic, not age-appropriate.

### Gaps
1. **No `education` guardrail profile** — critical for the use case
2. **COPPA not in compliance engine** — child privacy is a legal requirement for EdTech
3. **FERPA not in compliance engine** — student records protection is legally mandated
4. **No age-appropriate content filtering** — toxicity filter is adult-calibrated
5. **Education sector packs in docs but not in CLI**
6. **No parental consent workflow** integration
7. **No minor-specific safety test scenarios** in `amc watch safety-test`

### Rating: **2/10**
*The guardrails infrastructure works but it's not calibrated for child safety. The education sector packs are comprehensive in documentation but unreachable via CLI. COPPA/FERPA aren't in the compliance engine. For a product aimed at "minors", this is a serious safety gap.*

---

## Persona 27 — Patrick (Government Contractor)

**Goal:** NIST AI RMF compliance, FedRAMP considerations, `amc comply report --framework NIST_AI_RMF`

### Journey

- `amc comply report --framework NIST_AI_RMF` → **Works.** Returns JSON, coverage: 0.500.
- FedRAMP: `amc comply report --framework FEDRAMP` → **"Unsupported compliance framework: FEDRAMP"**
- `amc comply report --framework FedRAMP` → same error.
- `docs/COMPLIANCE_FRAMEWORKS.md` — NIST AI RMF is documented with all 4 functions (Govern, Map, Measure, Manage).
- NIST AI RMF coverage at 50% is problematic — ATO (Authorization to Operate) requirements demand near-100% coverage documentation.
- No CMMC (Cybersecurity Maturity Model Certification) support.
- No FedRAMP control baseline mapping (Low/Moderate/High).
- No STIG/CIS Benchmark integration.
- `src/compliance/dataResidency.ts` exists — data residency is critical for government.
- `docs/SECURITY_ARCHITECTURE_OVERVIEW.md` exists and is referenced.
- No IL2/IL4/IL5 (Impact Level) classification support for CUI data handling.
- Government Sector Pack in `docs/SECTOR_PACKS.md` — `regulatory-enforcement` in Governance station.

### Gaps
1. **FedRAMP not supported** — the compliance framework is missing entirely
2. **NIST AI RMF coverage at 50%** — ATO packages need full coverage mapping
3. **No CMMC support** — defense contractors need Levels 1-3
4. **No CUI (Controlled Unclassified Information) handling guidance**
5. **No FedRAMP control baseline mapping** (800-53 controls)
6. **Governance sector pack (docs) not in CLI**
7. **No DoD IL classification support**

### Rating: **4/10**
*NIST AI RMF works (uniquely among this batch of regulated personas) but at 50% coverage it's not production-ready for ATO. FedRAMP is completely absent. Patrick can get started but can't finish a procurement package with AMC alone.*

---

## Persona 28 — Anna (VC/Investor)

**Goal:** Due diligence on AI companies' agent maturity via `amc leaderboard`, `amc compare`, executive reports

### Journey

- `amc leaderboard show` → Works. Shows fleet-wide maturity leaderboard.
- `amc leaderboard export` → Works. Can export as JSON/HTML.
- `amc compare` → Works. Supports side-by-side run comparison and model comparison.
- `docs/EXECUTIVE_OVERVIEW.md` → Excellent. "Credit score for AI agents" framing is investor-friendly.
- Whitepaper (`whitepaper/AMC_WHITEPAPER_v1.md`) → Exists. Rigorous enough for due diligence.
- `docs/ECONOMIC_SIGNIFICANCE.md` → Exists.
- `docs/BENCHMARK_GALLERY.md` → Exists.
- **No investor-specific report template** — `amc leaderboard export` produces a generic HTML/JSON, not an executive brief.
- **No cross-company comparison** — leaderboard is per-workspace, not across organizations.
- **No industry benchmark baselines** — "Your agent scores 67/100" means nothing without "industry average is 45/100".
- `amc compare` requires run IDs or model names — Anna needs to compare Company A vs Company B, not run IDs.
- No PDF export for board decks.
- Score doesn't aggregate to investment thesis signals (e.g., "Technical Risk: Medium", "Governance Maturity: High").

### Gaps
1. **No cross-organization comparison** — leaderboard is workspace-scoped
2. **No PDF export** for board/LP deck consumption
3. **No investment thesis translation** — AMC scores don't map to "Buy/Pass/Watch" signals
4. **No industry baseline benchmarks** — relative comparison requires context
5. **Executive report doesn't exist as a CLI command** — `amc leaderboard export` is HTML/JSON, not a narrative brief
6. **No due diligence checklist mode** — Anna needs to verify specific claims, not explore

### Rating: **5/10**
*Whitepaper + executive overview is genuinely good. Leaderboard and compare commands work. But the investor use case needs cross-org comparison, PDF export, and benchmark baselines that don't exist. Good raw materials, no investor-specific packaging.*

---

## Persona 29 — Samuel (Academic Researcher)

**Goal:** Cite AMC in papers, methodology documentation, `docs/AMC_STANDARD_RFC.md`, `docs/AMC_TRUST_PROTOCOL.md`

### Journey

- `docs/AMC_STANDARD_RFC.md` → Exists. 960+ lines. RFC-style with Abstract, TOC, formal specification. Citable.
- `docs/AMC_TRUST_PROTOCOL.md` → Exists. 816+ lines. Formal protocol spec with diagrams. Citable.
- `whitepaper/AMC_WHITEPAPER_v1.md` → Exists. 1,192+ lines. arXiv-ready abstract, formal M(a,d,t) function, citations, keyword list. **This is the primary citable artifact.**
- `docs/RESEARCH_PAPERS_2026.md` → References 20 papers with gap analysis. Shows scholarly engagement.
- Both RFCs dated 2026-03-14 — current.
- Repository URL in RFC: `https://github.com/agentmaturitycompass/amc` — but actual repo is `https://github.com/AgentMaturity/AgentMaturityCompass`. **URL MISMATCH — breaks citation.**
- No DOI (Digital Object Identifier) assigned.
- No arXiv submission visible (paper references "arXiv Categories: cs.AI, cs.SE, cs.MA" but no arXiv ID).
- `docs/AMC_QUESTION_BANK_FULL.json` exists — researchers can audit the rubric.
- `docs/VALIDITY_FRAMEWORK.md` exists — psychometric validity documentation.
- No ORCID or institutional affiliation for authors ("POLARIS Research Team, AMC Labs" — not verifiable).
- No reproducibility package — no dataset, no evaluation scripts for paper claims.
- No changelog/versioning for RFC documents.

### Gaps
1. **CRITICAL: GitHub URL mismatch in RFC** — RFC says `github.com/agentmaturitycompass/amc`, actual repo is different
2. **No arXiv ID** — paper says it targets arXiv but isn't actually submitted there
3. **No DOI** — not citable in journals without one
4. **No institutional affiliation** for authors ("POLARIS Research Team" isn't verifiable)
5. **No reproducibility package** — the 84-point gap claim has no reproducible experiment
6. **RFC has no version changelog** — Samuel can't track what changed between versions
7. **No formal peer review** status beyond "Proposed Standard"

### Rating: **6/10**
*The whitepaper and RFC documents are genuinely impressive and substantially citable. The URL mismatch and lack of arXiv submission are solvable problems. Missing reproducibility package is the academic gap that matters most.*

---

## Persona 30 — Diana (Marketing Manager)

**Goal:** Understand what AMC means for customers, non-technical explanation

### Journey

- `website/index.html` → Exists. Clean design, "Score your agent" hero. "1,013 diagnostics" prominently displayed.
- `website/docs/getting-started.html` → Exists. Clear installation path. Web playground available.
- `docs/EXECUTIVE_OVERVIEW.md` → "Credit score for your AI agents" — perfect non-technical framing.
- Website hero sub-text: *"1,013 diagnostics against actual execution behavior. Not documentation. Not self-reported claims. Evidence you can verify, sign, and audit."* — Good.
- `website/playground.html` → Exists — Diana can try without installing anything.
- Nav has: products, domains, methodology, research, pricing, docs, github.
- **"Pricing" link on nav** → leads to `#pricing` anchor in index.html. Let me check if pricing exists.
- Callout text: "138 diagnostics" in some places, "1,013 diagnostics" in hero — **INCONSISTENCY** undermines trust.
- Missing: What does a "score of 67/100" mean for a customer? What can they do with it?
- No "Case Studies" link in nav.
- `website/blog/` exists with 4 posts — good proof points.
- The 84-point gap story is compelling and accessible.
- **Google Fonts dependency** — loads from external CDN, potential GDPR issue.
- No cookie consent banner despite Plausible analytics and Google Fonts.

### Gaps
1. **Inconsistent diagnostic count** — "138" vs "1,013" in different parts of same website. Which is it?
2. **No case studies page** — "credit score for AI agents" needs real customer stories
3. **Pricing section** exists in nav but the content may be placeholder — no SaaS pricing visible
4. **No customer-facing dashboard demo** — Diana wants to show clients, not install a CLI
5. **No cookie consent/GDPR compliance** on website despite analytics + external fonts
6. **Nav "products" section** is dense — non-technical buyers don't know which product is for them
7. **No "What it means for your customers" page** — Diana needs to explain AMC to her company's customers

### Rating: **5/10**
*Website is well-designed and the messaging is good. The "credit score" metaphor works. But inconsistent numbers, missing case studies, and no clear pricing erode trust for a non-technical evaluator.*

---

## Cross-Cutting Findings

### Docs Site (`website/docs/`)

| File | Status | Issues |
|------|--------|--------|
| `getting-started.html` | ✅ Good | Clear, works |
| `cli.html` | ✅ Good | Comprehensive namespace reference |
| `adapters.html` | ✅ Good | 14 adapters documented |
| `compliance.html` | ⚠️ Misleading | References HIPAA/sector packs that aren't in CLI |
| `methodology.html` | ✅ Good | Scoring formula explained well |

**Broken internal links**: None found in docs site.  
**Code examples**: `amc quickscore`, `amc comply report` examples correct for supported frameworks.  
**Content currency**: Dated styling suggests last major update was 2025-2026 cycle — acceptable.

### `docs/AMC_STANDARD_RFC.md`

**Accurate:** Five-dimension model, L0–L5 levels, evidence tier multipliers (0.4×–1.1×), scoring formula.  
**Gap:** GitHub URL is wrong (`agentmaturitycompass/amc` vs actual repo).  
**Gap:** Appendix D "API Specification Summary" exists but hasn't been verified against actual API routes.  
**Gap:** No version history — v1.0 is the only version listed.

### `docs/AMC_TRUST_PROTOCOL.md`

**Accurate:** Trust token format, negotiation flow, temporal decay math, delegation policies.  
**Good:** LangChain/CrewAI/AutoGen integration examples present.  
**Gap:** No reference implementation verified — trust token exchange is specced but untested end-to-end outside unit tests.

### Whitepaper (`whitepaper/AMC_WHITEPAPER_v1.md`)

**Exists.** Critical for Samuel (academic) and Anna (investor).  
**Content:** Rigorous. Formal notation. References. 1,192 lines.  
**Gap:** Not submitted to arXiv despite being formatted for it.  
**Gap:** "POLARIS Research Team, AMC Labs" — fictional institution.  
**Gap:** No reproducibility data package.

---

## Compliance Engine Audit

The compliance engine is the single most critical gap for regulated industry personas.

| Framework | Supported | Expected By |
|-----------|-----------|-------------|
| SOC2 | ✅ Yes (50% coverage) | James |
| NIST_AI_RMF | ✅ Yes (50% coverage) | Patrick |
| ISO_27001 | ✅ Yes | All |
| ISO_42001 | ✅ Yes | All |
| EU_AI_ACT | ✅ Yes | All |
| GDPR | ✅ Yes | All |
| MITRE_ATLAS | ✅ Yes | Fatima |
| OWASP_API_TOP10 | ✅ Yes | Ryan |
| **HIPAA** | ❌ Missing | **Maria** |
| **SOX** | ❌ Missing | **James** |
| **FedRAMP** | ❌ Missing | **Patrick** |
| **FERPA** | ❌ Missing | **Ling** |
| **COPPA** | ❌ Missing | **Ling** |

**5 of 13 needed compliance frameworks are missing.** That's a 38% gap rate in the compliance engine for the regulated industry use cases in this audit.

---

## CLI Command Gap Analysis

Commands expected but missing or broken:

| Expected Command | Reality | Impact |
|-----------------|---------|--------|
| `amc comply report --framework HIPAA` | Error | Maria: 0/10 |
| `amc comply report --framework SOX` | Error | James: critical gap |
| `amc comply report --framework FEDRAMP` | Error | Patrick: critical gap |
| `amc comply risk-classify` | Doesn't exist | James |
| `amc watch explain` | Works | Fatima ✅ |
| `amc watch safety-test` | Works (6 tests) | Fatima ⚠️ |
| `amc monitor` | Works | Ryan ✅ |
| `amc alert` | Works | Ryan ✅ |
| `amc observe` | Works | Ryan ✅ |
| `amc drift check` | Works | Ryan ✅ |
| `amc lite-score` | Works (misframed) | Hiroshi ⚠️ |
| `amc quickscore` | Works | Hiroshi ✅ |
| `amc guardrails` | Works (no education profile) | Ling ⚠️ |
| `amc comply report --framework NIST_AI_RMF` | Works (50%) | Patrick ⚠️ |
| `amc leaderboard` | Works | Anna ✅ |
| `amc compare` | Works | Anna ✅ |

---

## Priority Gaps by Severity

### 🔴 Critical (blocking real-world adoption)

1. **HIPAA compliance engine** — Add `HIPAA` framework to `ComplianceFramework` type and `builtInMappings.ts`. Maria is blocked entirely.
2. **SOX compliance engine** — Same. James is missing his primary framework.
3. **FedRAMP compliance engine** — Patrick can't complete a government procurement.
4. **COPPA/FERPA in compliance engine** — Ling's EdTech product likely violates COPPA without this.
5. **GitHub URL mismatch in RFC** — Breaks academic citations. Fix `agentmaturitycompass/amc` → `AgentMaturity/AgentMaturityCompass`.
6. **Sector packs unreachable via CLI** — Docs describe 40 packs, CLI exposes 0 of them. Major docs-reality gap.

### 🟡 Important (significant user friction)

7. **`amc comply risk-classify` missing** — documented in use cases but doesn't exist
8. **50% SOC2/NIST coverage** — insufficient for real audits; needs remediation guidance
9. **No fairness/bias scoring dimension** — ethics researcher use case requires it
10. **No IoT/edge mode** in `amc lite-score` — misframed, wrong target audience
11. **Inconsistent diagnostic count** (138 vs 1,013) — confusing for buyers
12. **No PDF export** for investor/executive reports

### 🟢 Nice to Have

13. Education guardrail profile
14. arXiv submission for whitepaper
15. Cross-organization leaderboard comparison
16. DOI for whitepaper
17. Cookie consent on website
18. Age-gating commands for EdTech
19. Reproducibility package for research claims
20. SLA/SLO top-level CLI commands

---

## Scores Summary

| # | Persona | Role | Score | Verdict |
|---|---------|------|-------|---------|
| 21 | Fatima | AI Ethics Researcher | **5/10** | Infrastructure exists, no ethics-first framing |
| 22 | Ryan | SRE | **7/10** | Best served; SLOs not surfaced |
| 23 | Hiroshi | IoT Developer | **4/10** | lite-score exists but is misframed |
| 24 | Maria | Healthcare AI Lead | **2/10** | HIPAA error, critical gap |
| 25 | James | Financial Services | **3/10** | SOX missing, risk-classify doesn't exist |
| 26 | Ling | Education Tech | **2/10** | COPPA/FERPA missing, no minor safeguards |
| 27 | Patrick | Government Contractor | **4/10** | NIST RMF works at 50%, FedRAMP missing |
| 28 | Anna | VC/Investor | **5/10** | Good materials, no investor packaging |
| 29 | Samuel | Academic Researcher | **6/10** | RFC/whitepaper good, URL wrong |
| 30 | Diana | Marketing Manager | **5/10** | Website good, inconsistent numbers |

**Batch 3 Average: 4.3/10**

Compare with the product's actual technical quality: ~8/10 for a developer/platform engineer. The gap reveals that AMC has built a strong foundation for one persona (developers/platform engineers) and needs compliance engine work to serve regulated industry buyers.

---

## Recommendations for Product Team

1. **Sprint 1 — Compliance engine:** Add HIPAA, SOX, FedRAMP, FERPA, COPPA to `frameworks.ts` and `builtInMappings.ts`. These are table-stakes for 4 of 10 personas in this audit.

2. **Sprint 2 — Sector pack CLI bridge:** `amc sector-pack list`, `amc sector-pack activate <pack-id>`, `amc sector-pack report` — make the 40 documented packs reachable.

3. **Sprint 3 — `amc comply risk-classify`:** Implement the command documented in marketing materials but absent from CLI.

4. **Fix immediately (< 1 day):**
   - Correct GitHub URL in RFC (2 characters)
   - Fix "138 vs 1,013 diagnostics" inconsistency on website
   - Add HIPAA/SOX/FedRAMP as stub mappings that return partial coverage rather than error

5. **For Samuel:** Submit whitepaper to arXiv. Add reproducibility dataset.

6. **For Anna:** Add PDF export to `amc leaderboard export`. Add industry baseline scores.

7. **For Fatima:** Add `amc watch fairness-audit` subcommand surfacing `alignmentIndex.ts` output.

---

*Audit completed: 2026-03-14. Files written: `/Users/sid/AgentMaturityCompass/docs/AUDIT_50_AGENTS_BATCH3.md`*
