# IMPL-8 — Docs reading order and retirement list

**Source commit:** 505a28ce965fca69d3ed52978f171e95789eb852 (amc/gap-register-execution), read from a `git archive` export in the session scratchpad. The assigned worktree was at 3d6b8d4a (437 commits behind; no `plans/`), so nothing was checked out or reset.
**Environment:** Darwin 25.6.0 arm64, Node v25.5.0, pnpm 10.33.0.
**Exercised:** static reading of `docs/`, `website/docs/docs.js`, `README.md`, `src/**` (tests excluded), `scripts/gen-counts.mjs`; an audit script that extracted every `amc <a> [<b>]` token from docs and checked it against every Commander registration in src.
**Not exercised:** no `pnpm install`, no build, no CLI run, no test, no runtime behaviour. Every "does not exist" claim below means "no `.command(\"x\")`, `new Command(\"x\")` or `.alias(\"x\")` registration and no string hit anywhere in non-test src at 505a28ce".

**Measured in this run (505a28ce):** `docs/*.md` top-level = 315 (brief §7a said 180+); subdirs: adapters 22, adr 7, compliance 21, content 8, deep-dive 6, integrations 1, internal 14, research 1, runbooks 5, source-reviews 614. `website/docs/docs.js:177-243` `PUBLIC_DOC_IDS` is the promoted set; `INTERNAL_DOCS` (docs.js:157-176) = 18 ids; 133 top-level guides (hand count of the script's list) are in neither set. Registered CLI names in src (non-test): 655 distinct.

---

## Document 1 — proposed `docs/READING_ORDER.md`

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
| SECURITY, SECURITY_ARCHITECTURE_OVERVIEW, THREAT_MODEL, HARDENING, SECURITY_DEPLOYMENT | The security model, threat model and hardening story in that order. |
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

## Document 2 — retirement / fix list at 505a28ce

Each entry names the doc line and the source line that contradicts it. "Registered" = a Commander `.command()`/`new Command()`/`.alias()` in non-test src.

### A. Retire or archive (the guide as a whole describes removed, legacy or non-runtime behaviour)

| # | Guide | Claim | Contradicting source |
|---|---|---|---|
| A-1 | `docs/EVIDENCE_CHAIN.md` (unlisted) | Documents the evidence chain through a Python API: `from amc.watch.w1_receipts import ReceiptsLedger` (:102-103), `await ledger.verify_chain()` with example output `"Chain OK — 1,247 receipts verified"` (:84-92), `await ledger.export_jsonl(...)` (:140), and the CLI `amc export receipts --format jsonl --out receipts.jsonl` (:420). | That module is `platform/python/amc/watch/w1_receipts.py`, which `IMPLEMENTATION_REALITY_MAP.md` classes as legacy lineage, not the runtime. In the TypeScript CLI the `export` group registers only `policy`, `grc`, `badge` (src/cli.ts:6424, :10789); receipts export is `evidenceLifecycleReceipts.command("export")` with a required `--out` (src/cli.ts:6908-6911). `1,247` is an unmeasured figure presented as output (§2 rule 1). Archive with the Python lineage or rewrite against `src/receipts/`. |
| A-2 | `docs/CLI_WRAPPERS.md` (unlisted) | Presents `amc wrap --agent-token … --provider …` as the current way to capture process evidence (:3, :8, :14, :20, :26); never mentions `adapters run`. | `wrap` is registered with description `"DEPRECATED — use 'amc adapters run', which also mints a lease and routes through the gateway…"` (src/cli.ts:4993-4994) and prints a stderr deprecation notice once per process (src/cli.ts:5003 → src/cli/deprecatedCommand.ts:66-71). ADAPTERS.md:11 and :169 already carry the correct guidance. Retire; redirect to ADAPTERS.md. |
| A-3 | `docs/VSCODE_EXTENSION.md` (unlisted) | "This scaffold lives in `src/vscode/`" (:3); lists `src/vscode/patternCatalog.ts`, `patternScanner.ts`, `inlineScore.ts`, `quickFixes.ts`, `extensionScaffold.ts` (:12-21) and `analyzeSourceForAmcVscode(...)` (:26). | `src/vscode/` does not exist at 505a28ce (`ls -d src/vscode` → absent). `find` locates only `src/scanner/patterns/patternCatalog.ts`; the other four files and `analyzeSourceForAmcVscode` have zero hits in `src/` and `vscode-extension/`. The real extension is `vscode-extension/` (README.md, package.json, out/), which the reality map lists as a wrapper. Retire or rewrite against `vscode-extension/`. |

### B. Promoted guides (in `PUBLIC_DOC_IDS`) containing false command or count claims — unpromote until fixed, or fix

| # | Guide:line | Documented | At 505a28ce |
|---|---|---|---|
| B-1 | `docs/adapters/LANDING_CLAUDE_CODE.md:8` `amc wrap claude-code -- claude "…"`; `LANDING_CREWAI.md:8` `amc wrap crewai -- python crew.py`; `LANDING_GENERIC_CLI.md:8` `amc wrap generic-cli -- …`; `LANDING_LANGCHAIN.md:12` `amc wrap langchain -- …`; `LANDING_OPENAI.md:8` `amc wrap openai-agents-sdk -- …`; `docs/QUICKSTART.md:312,322,332,342,349,356` `amc wrap langchain-python\|crewai\|openai-agents\|langgraph\|openclaw-cli\|generic -- …` | The first command on five promoted landing pages and six QUICKSTART recipes. | `wrap` takes `[runtime]` = `claude\|gemini\|openclaw\|any` (src/cli.ts:4995) and, without `--agent-token`, throws `"amc wrap requires runtime (claude\|gemini\|openclaw\|any) unless --agent-token is used."` (src/cli.ts:5026-5027). None of the eleven runtime names above is accepted, so each command fails as written; and the command is deprecated (:4993-4994). Replace with `amc adapters run --adapter <id> -- …` (ADAPTERS.md:54-96 shows the form). |
| B-2 | `docs/RUNTIMES.md:8, :59-62` `amc wrap claude\|gemini\|openclaw\|any` | Presented as the current runtime integration commands. | These four runtimes do run (src/cli.ts:5026-5046) but the command is DEPRECATED and warns on stderr (src/cli.ts:4993-4994, :5003). Legacy wording, not a facade: label it and point to `adapters run`, or fold into ADAPTERS.md. |
| B-3 | `docs/MEMORY_MATURITY.md:103` `amc memory integrity-check --path ./memory/`; `:106` `amc memory continuity-test`; `:109` `amc memory lessons list` | Three of the four commands in the guide's command block. | `memory` registers only `assess <agentId>`, `writeback <episode>`, `retrieve`, `show <selector>` (src/cli.ts:23175-23176 ff.). `integrity-check` and `continuity-test` have zero hits in non-test src; `lessons` appears only as a store path (src/corrections/lessonStore.ts:81), not a command. Only `:100` `amc memory assess` is real. |
| B-4 | `docs/NOTARY.md:98` `amc notary log verify` | Listed under "Monitor". | Registered name is `log-verify` (src/cli.ts:11775); `notary` subcommands are `init, status, pubkey, attest, verify-attest, sign, log-verify` (src/cli.ts:7034, :11664 ff.) plus `start` (src/cli-notary-commands.ts:7). Fix the spelling. |
| B-5 | `docs/SECTOR_PACKS.md:218, :221` `amc sector packs list [--station health]` | Listing sector packs. | `sector` is an alias of `domain` (src/cli.ts:22241) and the subgroup is `pack` (singular): `domainCmd.command("pack")` with `list` at src/cli-domain-product-commands.ts:13, :115. `packs` is not registered. |
| B-6 | `docs/COMPLIANCE_FRAMEWORKS.md:115` `amc compliance frameworks` | "List available frameworks". | `compliance` (alias `comply`) registers `init, verify, report, fleet, diff, matrix, risk-classify, roadmap, regulatory-feeds, regulatory-check, regulatory-gap` (src/cli.ts:7049, :12561 ff.); zero hits for `"frameworks"` in non-test src. |
| B-7 | `docs/GETTING_STARTED.md:627` `amc mcp install-config --ide claude-code` | "Connect to IDE via MCP". | `mcp` registers only `serve` (:58), `config` (:72), `list-tools` (:129) in src/mcp/mcpCli.ts; `install-config` has zero hits. MCP_SERVER.md:224 has the correct `amc mcp config --ide cursor`. |
| B-8 | "142 assurance packs": `docs/PRICING.md:14`, `docs/ENTERPRISE.md:19`, `docs/RELEASE_HIGHLIGHTS.md:20`, `docs/EXECUTIVE_OVERVIEW.md:49`, `docs/PRODUCT_EDITIONS.md:15` (also `README.md:79`, `:221`) | A fixed count on five promoted pages and the README first screen. | Measured at 505a28ce: 149 `.ts` files in `src/assurance/packs` excluding `index.ts` (`ls \| wc -l`). The registered count was **not measured** in this run (needs a build to call `listAssurancePacks`); the repo's own counts generator records the drift as a source comment: "143 registered packs against '142' in three places and 149 files on disk" (scripts/gen-counts.mjs:7-8). DOCS_DRIFT_CLEANUP_PLAN.md Policy 1/3: derive from the canonical source or drop the number. |
| B-9 | `docs/score-history.md` (promoted) | Self-corrects at :114: "There are none yet. `amc score-history …` was documented here but has…". | `score-history` is not a registered command (only a cache key at src/score/scoreHistory.ts:140). Honest, so not a false claim — but a promoted page whose command does not exist should be unpromoted until it does. |

### C. Unlisted guides with false command claims (fix before ever promoting; otherwise archive)

| # | Guide:line | Documented | At 505a28ce |
|---|---|---|---|
| C-1 | `docs/AMC_TRUST_PROTOCOL.md:728` `amc trust graph --show`; `:731` `amc trust transitive --from … --max-hops 3`; `:734` `amc trust decay --preset healthcare …` | Trust-graph, transitive-trust and decay commands. | `trust` registers only `init, enable-notary, status, freshness` (src/cli.ts:7035, :11794 ff.). `transitive` has zero hits; `decay` appears only as a memory-integrity event type (src/score/memoryIntegrity.ts:31, :83). A `trust-graph` command exists elsewhere (src/cli.ts:14873) and `fleet graph` at src/cli.ts:14267 — neither is `trust graph`. |
| C-2 | `docs/PLUGINS.md:211` `amc plugin check-compat --manifest ./manifest.json` | "Check compatibility before publishing". | `plugin` registers `keygen, pack, verify, print, init, workspace-verify, list, registry, search, registries, registries-apply, install, upgrade, remove, execute, registry-fingerprint, limits` (src/cli.ts:4680-4682 ff.); `check-compat` has zero hits. |
| C-3 | `docs/TRACES_TO_EVIDENCE.md:64` `amc wrap claude -- claude -p "…"` | Capture path for Claude. | Deprecated (src/cli.ts:4993-4994). (`:25` `amc ingest traces.json --type generic_json` is valid: src/cli.ts:15458-15462.) |
| C-4 | `docs/AMC_MASTER_REFERENCE.md` (567 lines) | A second full CLI reference beside the promoted CLI_COMMAND_INVENTORY.md. | Drift class 6 (duplicated routing) per DOCS_DRIFT_CLEANUP_PLAN.md. Rows **not individually verified** in this run (the automated token check found no missing top-level names; `amc simulate-bridge` at :531 is registered). Retire in favour of the single inventory once diffed. |

### D. On the reading path but outside `docs/` — flag to the README owner

`README.md:57-63`: "`amc start` … does everything: Sets up your workspace and keys … Checks your agent across all 8 areas … Opens a report card in your browser." At 505a28ce `start` is an alias of `up`, described as "Start AMC control plane in one command (studio + gateway + bridge)" (src/cli.ts:3570-3572); the action calls `startStudioDaemon` and opens the Compass Console (src/cli.ts:3576-3640, lines 23/38-40 of that range). A grep of the action body (src/cli.ts:3576-3700) for `bootstrap|runScore|diagnostic|quickscore` found nothing. **PARTIAL**: the daemon was not exercised, so whether it scores after startup is unverified; the wording should be checked against a real run before it stays on the first screen.

### E. Checked and clean (no retirement needed)

- The five §2 facades are gone at 505a28ce: `syntheticResponse` survives only as a history comment (src/assurance/agentResponder.ts:4); `Math.random() < 0.2` only as a comment (src/cli.ts:20215); "Mock judge" only as a history comment (src/eval/llmJudgeEngine.ts:353); `buildMockReportForUx` and `existsSync('src/` have zero hits in non-test src.
- CODE_GRAPH.md is honest: "generated, never committed" (CODE_GRAPH.md:5); only `.graphifyignore`, `scripts/graphify-navigation.py` and `graph:update` (package.json:81) are in the tree.
- SINGLE_BINARY.md labels itself experimental and "not yet the default install method" (:3-8). ADAPTERS.md:169 labels `wrap` legacy. NO_CODE_GOVERNANCE.md:26 and score-history.md:114 self-correct.
- HARDWARE_TRUST.md describes Notary attestation levels `SOFTWARE|HARDWARE`, matching `--require SOFTWARE|HARDWARE` (src/cli.ts:11825-11829).
- ONE_COMMAND_FIX.md `amc run --fix` exists (src/cli.ts:5317-5327); `amc fix` exists (src/guide/fixCli.ts:78, registered at src/cli.ts:2384).
- BRIDGE.md endpoints `/bridge/openai/v1/images/generations` and `/bridge/telemetry` are served (src/bridge/bridgeModelRouter.ts:51; src/bridge/bridgeServer.ts:617).

### F. Residual source observations (not doc facades; for the owning lane)

- `src/shield/continuousRedTeam.ts:243` sets `confidence: 0.3 + Math.random() * 0.5` on generated attack candidates. `amc shield red-team` reports `bypassConfidence: verdict.confidence` from the verdict (src/cli.ts ≈20258-20260), not this field, and RED_TEAMING_GUIDE.md:586-620 makes no per-candidate confidence claim — but a random "confidence" in a shield module is the pattern §2 warns about.
- `src/setup/integrationScaffold.ts:631-632` simulates latency and error rate (scaffold demo); `src/agents/contentModerationBot.ts:64` "Simulate varying confidence" (example agent). Neither is documented as measured.

### G. Suggested next steps (not done here)

1. Land `docs/READING_ORDER.md` from Document 1 and link it from INDEX.md and START_HERE.md.
2. Remove B-1…B-7 ids from `PUBLIC_DOC_IDS` (website/docs/docs.js:177-243) or fix the cited lines in the same commit; run `npm run check:docs-drift` (package.json:59) and `npm run check:counts` (package.json:66) against a clone, never the shared root.
3. Move A-1…A-3 and section 6 out of `docs/` (git history keeps them), update `content-manifest.json` accordingly.
4. Measure the registered assurance-pack count from a built clone before rewriting any "142" line.
