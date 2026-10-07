<!-- Written 2026-09-14 by the integrating root session from the impl:docs-reading-order fleet agent's
     report (run wf_3cdbc4a3-f55, REPORT_ONLY; record AMC_OS/RESEARCH/2026-09-14-fleet-sequential/impl-docs-reading-order/).
     Static reading at commit 505a28ce; every "registered" claim means a Commander registration found in non-test src. -->

# Reading order

### 0. Shortest path: README first screen → a running governed keyless turn

Six reads, four commands. Every command below is registered at 505a28ce (`init` src/cli.ts chained form; `firewall` top-level; `agent-loop run/verify` src/cli-agent-commands.ts:168 and the `verify` sibling; `doctor` top-level).

| # | Read | Why (one line) |
|---|---|---|
| 1 | `README.md` — "Run a native agent task" (README.md:40-49) | First screen already names `amc agent-loop guide` and links the native workflow; nothing else on the first screen is needed. |
| 2 | `docs/INSTALL.md` | The verified install paths; the README's `curl … install.sh \| sh` is one of them. |
| 3 | `docs/QUICKSTART.md#first-governed-turn-in-three-actions-keyless` (QUICKSTART.md:65-105) | The keyless path itself: `export AMC_VAULT_PASSPHRASE=…`, `amc init --minimal`, `amc firewall enable`, `amc --agent default agent-loop run "…" --provider stub --model amc-stub-1 --tools echo --max-steps 2 --max-tokens 512`, `amc agent-loop verify <session-id>`. Timing is quoted there from a dated receipt (2026-09-14, commit d635a5e2, `AMC_OS/RESEARCH/2026-09-14-fleet-sequential/README.md`: init 1.19 s, firewall enable 0.94 s, stub turn 0.85 s, verify 0.83 s) — **not re-measured in this run**. |
| 4 | `docs/DOCTOR.md` | Only if a step refuses: `amc doctor` names the missing precondition (`runtime-firewall-policy`, `vault`) and the fixing command. |
| 5 | `docs/NATIVE_AGENT_WORKFLOW.md` | What the stub turn does and does not demonstrate; what `--tools workspace`, credentials and approvals require before a real provider turn. |
| 6 | `docs/EVIDENCE_TRUST.md` | What `VERIFIED` with trust root `UNANCHORED` means (internal consistency, not authorship) before anyone quotes the verify output. |

`docs/START_HERE.md` duplicates step 3's command block (START_HERE.md:16-24); keep it as the role hub (section 1), not as a second copy of the path.

### 1. Everyone, after the first turn (hub and orientation)

| Guide | Why |
|---|---|
| START_HERE | Role hub: native task / assess evidence / connect an agent, in one table. |
| INDEX | The public map; states that audit papers and plans are not promoted. |
| GETTING_STARTED | Full first-score walk-through (one false command at :627 — see Document 2). |
| AFTER_FIRST_SCORE | What a first score does and does not license you to claim. |
| TROUBLESHOOTING | Refusals and their fixes, indexed by symptom. |
| CLI_COMMAND_INVENTORY | The command reference to search before guessing a flag. |
| RECEIPTS | The unit of evidence every later guide assumes. |
| ARCHITECTURE_BRIEF | The one durable "what AMC is" explanation; DOCS_DRIFT_CLEANUP_PLAN names it the canonical anchor. |
| WHY_AMC, USE_CASES, PERSONAS | Positioning and role routing; read once, then pick a path below. |

### 2. Solo developer path

Start: `SOLO_DEV_QUICKSTART` (fast path `curl … \| sh && amc`), then `SOLO_DEV_PATH`.

| Guide | Why |
|---|---|
| AGENT_GUIDE | The guide system behind `amc agent-loop guide`. |
| NATIVE_STUDIO_TASKS | Same runtime from the browser, with approvals and resume. |
| NATIVE_MCP | Governed stdio/HTTP MCP mounts and the catalog-digest pin. |
| NATIVE_EXTENSIONS | Signed context files and prompt commands. |
| NATIVE_DELEGATION_LIMITS | Child-agent bounds; awaiting combined qualification per NATIVE_AGENT_WORKFLOW. |
| NATIVE_SDK | Embedding the runtime from Node/Python (`AMCNativeClient`). |
| SESSION_RESUME, SESSION_EVENT_HISTORY | Resume/recovery rules and reading persisted evidence after restart. |
| TOOLHUB, APPROVALS, BUDGETS | The three signed policies a workspace turn runs under. |
| PROVIDERS | Provider routes and native tool-name identity. |
| COMPATIBILITY_MATRIX, agent-framework-compatibility, ADAPTER_COMPATIBILITY | What is supported and what "supported" is proven by. |
| ADAPTERS | Current integration path (`amc adapters run`); already labels `wrap` as legacy at :169. |
| adapters/autogen, claude-code, crewai, gemini, generic-cli, langchain-node, langchain-python, langgraph-python, llamaindex, openai-agents-sdk, openclaw, openhands, python-amc-sdk, semantic-kernel | Per-framework attach recipes (one each). |
| adapters/LANDING_CLAUDE_CODE, LANDING_CREWAI, LANDING_GENERIC_CLI, LANDING_LANGCHAIN, LANDING_OPENAI | Entry pages per framework — **fix first** (Document 2, B-1). |
| CUSTOM_ADAPTER | Authoring an adapter when none fits. |
| SDK, SDK_VERSIONING, MCP_SERVER | Wrapper surfaces (reality map: shells around the runtime) and the MCP server. |
| STARTER_BLUEPRINTS, EXAMPLES_INDEX | Copy-paste starting points. |
| BROWSER_SANDBOX, PLAYGROUND | Exploration only; reality map classes them "experimental or partial". |
| STUDIO, CONSOLE, DASHBOARD, ACCESSIBILITY | The UI surfaces and their boundaries. |
| SCORING_METHODOLOGY, QUESTION_BANK, AMC_QUESTIONS_IN_DEPTH, ARCHETYPES, EVALUATOR_REGISTRY | How a score is produced and which evaluators exist. |
| VALIDITY_FRAMEWORK, self-calibration, METRICS, OUTCOMES, BENCHMARKS | Limits of the score; VALIDITY_FRAMEWORK:174 is honest that some observations are simulated. |
| score-history | Honest placeholder (:114 says the command does not exist yet); read to avoid expecting it. |
| MEMORY_MATURITY | Memory assessment (`amc memory assess`) — **fix first** (Document 2, B-3). |
| MULTI_MODEL_VALIDATION, AGENT_VS_WORKFLOW, CANON | Classification and cross-model checks. |
| MIGRATION_FROM_PROMPTFOO_DEEPEVAL | Only if migrating from those tools. |
| OPEN_RUBRIC_STANDARD, OPEN_STANDARD | The rubric/standard the score claims to implement. |

### 3. Platform engineer path

Start: `PLATFORM_ENGINEER_QUICKSTART`, then `PLATFORM_PATH`.

| Guide | Why |
|---|---|
| DEPLOYMENT_OPTIONS, DEPLOYMENT, DEPLOYMENT_CHECKLIST, CLOUD_REFERENCE_ARCHITECTURES | Where and how to run it; checklist before production. |
| OPERATIONS, BACKUPS, MIGRATION_RUNBOOK | Day-2 operations and data/config safety. |
| CI_TEMPLATES, integrations/ci-cd | CI gates and pipelines. |
| SINGLE_BINARY | Experimental SEA path; the doc itself says "not yet the default install method". |
| CONTINUOUS_MONITORING, DRIFT_ALERTS, INCIDENT_RESPONSE_READINESS | Watch surface and incident posture. |
| runbooks/amc-service-down, runbooks/evidence-corruption, runbooks/score-dispute | The three operator runbooks. |
| REALTIME, API_REFERENCE, API_SURFACES, PACKAGE_API_REFERENCE | HTTP/SSE and package APIs. |
| RUNTIMES, RUNTIME_SDK | Runtime integrations — RUNTIMES **fix first** (Document 2, B-2). |
| SYSTEM_CAPABILITIES, ARCHITECTURE_MAP, CODE_GRAPH | Code-backed capability matrix and the (generated, never committed) code graph. |
| deep-dive/INDEX, runtime-control-plane, trust-evidence-plane, governance-execution-plane, evaluation-assurance-plane, operations-ecosystem-plane | Subsystem deep dives, one per plane. |
| STUDIO_AGENT_AUTH, IDENTITY, RBAC, LEASES | Who may do what, and the lease model behind gateway capture. |
| SESSION_SPILL_LIFECYCLE, SESSION_SPILL_COMMANDS | Retained-output lifecycle and operator commands. |
| NATIVE_SANDBOX_UBUNTU, PLATFORM_QUALIFICATION | What was qualified on which platform — read before claiming platform support. |
| HUMAN_FIRST_USE_STUDY, _CAPTURE, _OBSERVER, _MODEL_REVISION, _CREDENTIAL_TRANSITIONS, AMC_1512_HUMAN_FIRST_USE_PROTOCOL, AMC_1512_EVIDENCE_PROTOCOL | The measurement protocols behind any usability or provider claim (brief §7 measurement protocol). |
| REGISTRY, FLEET, MULTI_AGENT_TRUST, ENTERPRISE | Multi-agent and org surfaces. |
| DOMAIN_PACKS, DOMAIN_PROOF_LANE, SECTOR_PACKS | Industry packs — SECTOR_PACKS **fix first** (Document 2, B-5). |
| PRODUCT_EDITIONS, PRICING, BUYER_PACKAGES, EXECUTIVE_OVERVIEW, BOARD_RISK_L3_MEMO, RELEASE_HIGHLIGHTS | Buyer-facing; all but BOARD_RISK carry the unmeasured "142 packs" figure (Document 2, B-7). |
| SUPPORT_POLICY, COMMUNITY, RESEARCH_PAPERS_2026 | Support terms, community, research foundations. |

### 4. Security / compliance path

Start: `SECURITY_COMPLIANCE_QUICKSTART`, then `SECURITY_PATH`.

| Guide | Why |
|---|---|
| SECURITY, SECURITY_ARCHITECTURE_OVERVIEW, THREAT_MODEL (`docs/security/THREAT_MODEL.md`), HARDENING, SECURITY_DEPLOYMENT | The security model, threat model and hardening story in that order. |
| SHIELD_ENFORCE_REFERENCE, RED_TEAMING_GUIDE, ASSURANCE_LAB | Shield/Enforce/Watch CLI, red-teaming from zero, the assurance lab. |
| VAULT, KEY_HISTORY, ENCRYPTION_AT_REST, HARDWARE_TRUST, NOTARY, ZERO_KEYS | Signing boundary and key custody; NOTARY **fix first** (Document 2, B-4). |
| SUPPLY_CHAIN, PLUGIN_SUPPLY_CHAIN | Dependency and plugin provenance. |
| GOVERNANCE, MODEL_GOVERNANCE, CONTROL_PROJECTION, CONTROL_SIMULATION, ACTION_EVIDENCE_LOGIC | Governance framework and how controls project onto evidence. |
| SCOPE_TEMPLATES, POLICY_PACKS, PROMPT_POLICY, DUAL_CONTROL_APPROVALS, WAIVERS | Policy artefacts and exception handling. |
| EVIDENCE_REQUESTS, ATTESTATION_EVIDENCE_PATHS, CLAIM_PROVENANCE | Requesting, locating and tracing evidence. |
| TRANSPARENCY, TRANSPARENCY_MERKLE, TRANSPARENCY_REPORT, EXTERNAL_EVIDENCE_PROFILE, AGENT_PASSPORT | Tamper-evidence, portable proof and identity carried between environments. |
| AUDIT_BINDER, COMPLIANCE, COMPLIANCE_MAPS, COMPLIANCE_FRAMEWORKS | Binder and maps; COMPLIANCE_FRAMEWORKS **fix first** (Document 2, B-6). |
| EU_AI_ACT_COMPLIANCE, ISO_42001_ALIGNMENT, GDPR_ARTICLE_COMPLIANCE, MITRE_ATLAS_MAPPING, STANDARDS_MAPPING | Framework mappings, one each. |
| compliance/eu-ai-act-checklist, compliance/iso-42001-aims-manual, compliance/nist-rmf-profile, compliance/SOC2_TYPE_II_CONTROLS_MAPPING, enterprise-readiness-checklist | The promoted checklists and manuals. |

### 5. Contributors and maintainers (not promoted; keep in the repo, not in the public collection)

| Guide | Why |
|---|---|
| IMPLEMENTATION_REALITY_MAP, DOCS_DRIFT_CLEANUP_PLAN | The four-bucket implementation map and the drift policy every doc edit must follow. |
| ARCHITECTURE_NAVIGATION, CONTEXT_GRAPH | Graph-guided source navigation (`graphify-out/` is git-ignored: CODE_GRAPH.md:5). |
| DOCS_PROCESS, RELEASE_RUNBOOK, RELEASING, RELEASE_CADENCE, PUBLISHING, CI, INSTALL_PACKAGES, DESKTOP_PACKAGES, KUBERNETES_HELM_DEPLOYMENT, GITHUB_ACTION, OPS_HARDENING, sbom, db-schemas, PACKAGE_API_INTRO, SOLO_USER, RECIPES | Contributor and packaging references; not user paths. |
| BRIDGE, BRIDGE_PROMPT_ENFORCEMENT, CONNECT, PAIRING, PAIRING_LAN_PWA, INTEGRATIONS, ECOSYSTEM, ECOSYSTEM_VIEW, ECOSYSTEM_COMPARATIVE_VIEW, COMPATIBILITY_OVERVIEW, COMPARE_AMC | Bridge/pairing internals and ecosystem views; bridge endpoints verified present (src/bridge/bridgeModelRouter.ts:51, bridgeServer.ts:617). |
| GOVERNOR, LOOP, MODES, WHATIF, EQUALIZER_TARGETS, MECHANIC_MODE, MECHANIC_WORKBENCH, UPGRADE_AUTOPILOT, PREDICTIVE_MAINTENANCE, FORECASTING, TRUTHGUARD, TICKETS, WORK_ORDERS, FEDERATION, SCIM, SSO_OIDC, SSO_SAML, SANDBOX, ONE_COMMAND_FIX, ONE_CLICK_FIX, NO_CODE_GOVERNANCE, POLICY_EXPORT, CASEBOOKS, BUNDLES, BOM, CERTIFICATION, ASSURANCE_CERTS, ANTI_HALLUCINATION, AGENT_CONFIG_SECURITY, CONTINUOUS_RECURRENCE, EXPERIMENTS, IDENTITY_STABILITY, DIAGNOSTIC_BANK, BENCH_REGISTRY, BENCHMARKING, BENCHMARK_GALLERY, BENCHMARK_VULNERABLE_VS_HARDENED, HARNESS_COMPARISON, METHODOLOGY_CROSSWALK, ECONOMIC_SIGNIFICANCE, PREDICTION_LOG, VALUE_CONTRACTS, VALUE_GATES, VALUE_INGESTION, VALUE_REALIZATION, ORG_COMPASS, ORG_EOC, RECEIPT_INTERCHANGE, CHAIN_ARCHITECTURE, SAFETY_RESEARCH_LANE, AUDIT_SAFETY_RESEARCH_LANE, INDUSTRY_PACK_AUDIT, DOGFOOD_REPORT, SOURCE_REVIEW_GAP_0591, AMC_STANDARD_RFC, AMC_LIFECYCLE_COMPLETION_BACKLOG | Feature-level references whose lead commands are registered (checked by the audit script: `governor`, `loop`, `mode`, `whatif`, `target`, `transform`, `mechanic`, `forecast`, `advisory`, `truthguard`, `ticket`, `workorder`, `federate`, `scim`, `identity provider`, `sandbox`, `run --fix` at src/cli.ts:5327, `fix` at src/guide/fixCli.ts:78, `cgx`, `blobs`, `transparency merkle`). Promote individually only after a per-doc check; several are one-screen stubs. |
| NATIVE_ACP_IMAGE_INPUT, NATIVE_CHAT_IMAGE_INPUT, NATIVE_RESPONSES_IMAGE_INPUT, NATIVE_ORDERED_IMAGE_INPUT, NATIVE_SIGNED_IMAGE_INPUT, NATIVE_SIGNED_AUDIO_INPUT, NATIVE_GEMINI_PROTOCOL, NATIVE_DEEPSEEK_WIRE, NATIVE_PROVIDER_CACHE_REPORT, NATIVE_SCHEDULES, PI_CALLBACK_TELEMETRY | Native protocol notes; NATIVE_DEEPSEEK_WIRE's title says "source authored, unqualified" — keep that label. |
| PYTHON_MODULE_MAPPING, FULL_MODULE_ROADMAP (INTERNAL) | `platform/python/` lineage maps; reality map classes that tree as legacy. |
| adr/001-007 | Decisions; cite, do not route users through them. |
| COMMUNITY_DEMO_KIT, COMMUNITY_SHOWCASE, COMMUNITY_SUPPORT, SPONSORING, SERVICES_AND_SUPPORT, PRICING_FAQ, WHY_AMC_ONE_PAGER, HOMEPAGE_TRUST_SIGNALS, CONTENT_CALENDAR, GO_TO_MARKET_PACK, LAUNCH, INNOVATION_THESIS, OSS_ADOPTION_ROADMAP, NORTHSTAR_PROMPTS, REAL_PEOPLE_COUNCIL, NEW_GAPS_RESEARCH | Marketing/plan material (several already INTERNAL); no reading-order slot. |

### 6. Not guides — archive out of `docs/` (group disposition)

AUDIT_50_AGENTS_BATCH1-10, AGENT_COUNCIL_100_RATINGS/REPORT, UX_AUDIT_REPORT, UX_FINAL_AUDIT, wave4-* (8), RESEARCHER_EXODUS_GAP_ANALYSIS, RESEARCH_GAPS_MARCH_2026, RESEARCH_PAPERS_MARCH_2026, MARKET_INTELLIGENCE_MARCH_2026, PAPER_IMPLEMENTATION_AUDIT, ECC_GAP_ANALYSIS_AND_ACTION_PLAN, docs/content/* (8 launch drafts), docs/internal/* (14 competitive notes), docs/council/*, docs/research/*, docs/source-reviews/* (614). They are persona transcripts, launch copy and working papers; INDEX.md:15 already says such material "remain[s] in Git history without being promoted". The audit transcripts contain commands that never existed (`amc baddge`, `amc otel`, `amc sla`, `amc fairness-audit`, `amc model-risk`, `amc sector-pack`, `amc deploy`, `amc infra`, `amc directory`, `amc xxx` — zero registrations), which is expected of a transcript but misleading inside `docs/`.

---

---

Source commit for every claim above: `505a28ce` (static reading of `docs/`, `website/docs/docs.js`,
`README.md` and non-test `src/`; no command was run). The "fix first" markers refer to the retirement
and fix list recorded in `AMC_OS/RESEARCH/2026-09-14-fleet-sequential/impl-docs-reading-order/report.md`
(Document 2) and tracked in Linear; the promoted false-command lines named there were corrected by root
on 2026-09-14 (see the execution log), the archive dispositions and count claims remain open.
