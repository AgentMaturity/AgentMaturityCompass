# Changelog

All notable changes to AMC are documented here.

## [Unreleased]

### Added — Simulation & Forecast Lane Deep Implementation (2026-03-17)
- **5 new scoring modules** for the Simulation & Forecast lane:
  - `forecastLegitimacy.ts` — epistemic honesty, calibration, uncertainty scoring (AMC-6.1–6.10)
  - `factSimulationBoundary.ts` — provenance separation, writeback governance (AMC-6.11–6.17, 6.37–6.42)
  - `syntheticIdentityGovernance.ts` — persona labeling, real-person controls (AMC-6.18–6.25, 6.48–6.52)
  - `simulationValidity.ts` — mode collapse, population diversity, calibration (AMC-6.30–6.36)
  - `scenarioProvenance.ts` — end-to-end traceability, replay, interaction safety (AMC-6.26–6.29, 6.53–6.57)
- **Lane aggregator** (`src/lanes/simulationForecastLane.ts`) — weighted 5-dimension scoring, auto-activates for simulation/forecast system types
- **CLI command** `amc score simulation-lane --system-type <type>` with interactive, JSON, and file-based modes
- **96 new tests** across 8 test files (score modules, lane aggregator, pack integration)
- Total scoring modules: 74 → **79**
- Total tests: 3,549 → **3,645**
- Total test files: 244 → **252**

### Added — Simulation & Forecast Evaluation Lane (2026-03-16)
- **57 new diagnostic questions** (AMC-6.1 → AMC-6.57) covering simulation/forecast systems
  - Forecast Legitimacy (10): uncertainty, calibration, false precision, scenario framing
  - Fact/Simulation Boundary Integrity (7): provenance tagging, evidence class separation
  - Synthetic Persona Governance (8): labeling, evidence basis, private person protection
  - Scenario Traceability & Replayability (4): end-to-end claim lineage, replay
  - Simulation Validity (7): population diversity, synthetic consensus detection
  - Writeback Governance (6): contamination loops, rollback, human approval
  - Predictive UX Honesty (5): claim benchmarking, scenario language
  - Real-Person Representation (5): defamation controls, motive attribution limits
  - Synthetic Agent Interaction Safety (5): dialogue labeling, provenance retention
- **9 new assurance packs** with 54 scenarios for simulation-class systems
- **SystemType taxonomy** added to types.ts for product-class classification
- Total diagnostic questions: 138 → **195**
- Total assurance packs: 110 → **119**

### Added
- Documentation + website refresh for the expanded AMC workflow surface:
  - new docs: `COMPATIBILITY_MATRIX`, `STARTER_BLUEPRINTS`, `OSS_ADOPTION_ROADMAP`
  - website/docs hub now visibly surfaces compatibility, starter blueprints, and adoption planning
  - starter blueprint example folders added for OpenClaw, LangChain RAG, CrewAI + GitHub Actions, and OpenAI-compatible lite-score flows
  - public-facing stale counts/copy normalized across README, website, and selected docs/blog pages
  - `lite-score` naming normalized in updated public docs

### Added
- Agent Transparency Report (`amc transparency report`) — behavioral SBOM for AI agents
- AMC MCP Server (`amc mcp serve`) — Model Context Protocol integration for AI coding assistants
  - 6 tools: amc_list_agents, amc_quickscore, amc_get_guide, amc_check_compliance, amc_transparency_report, amc_score_sector_pack
  - 1 resource: amc://agent/{agentId}
  - IDE configs: Claude Code, Cursor, Windsurf, VS Code Copilot, Kiro
- `amc mcp config` — print ready-to-paste MCP configuration for supported IDEs
- `amc mcp list-tools` — list all MCP tools with descriptions
- **AMC Sector Packs** — 40 industry-specific assessment packs across 7 stations with 380 diagnostic questions
  - **7 Stations**: Environment (6), Health (9), Wealth (5), Education (5), Mobility (5), Technology (5), Governance (5)
  - **382 questions** with specific regulatory article references (e.g., `HIPAA §164.312(a)(1)`, `EU AI Act Art. 5(1)(a)`, `FERPA 20 U.S.C. §1232g`, `UNECE WP.29 R155 §7`, `UNCAC Art. 7`)
  - **Per-pack enterprise metadata**: `riskTier`, `euAIActClassification`, `sdgAlignment`, `certificationPath`, `keyRisks`, `certificationThreshold`
  - **Per-question L1/L3/L5 maturity descriptors** — industry-specific, not generic
  - **Scoring API**: `scoreIndustryPack()`, `getIndustryPack()`, `getIndustryPacksByStation()`, `listIndustryPacks()`, `getStationSummary()`
  - Full export from `src/domains/index.ts`
  - Risk-calibrated certification thresholds (68–85% by tier)
  - Documentation: [`docs/SECTOR_PACKS.md`](docs/SECTOR_PACKS.md)

- **Agent Guide System** — `amc guide` generates personalized guardrails, agent instructions, and improvement plans from actual scores
  - `--go` mode: zero-friction one-command workflow (auto-detect + generate + apply)
  - `--status` mode: one-line health check with severity counts
  - `--quick` mode: skip interactive questions for CI/scripts
  - `--interactive` mode: cherry-pick which gaps to fix
  - `--watch --apply` mode: continuous monitoring with auto-update
  - `--ci --target N` mode: CI gate that exits non-zero below threshold
  - `--diff` mode: compare with previous run, track improvements/regressions
  - `--dry-run` mode: preview apply without writing files
  - `--auto-detect` mode: detect framework from project files
  - `--frameworks` mode: list supported frameworks
  - `--compliance` mode: generate compliance-specific guardrails mapped to regulatory obligations
  - 5 compliance frameworks: EU AI Act, ISO 42001, NIST AI RMF, SOC 2, ISO 27001
  - Per-question compliance gap mapping from 37 built-in compliance mappings
  - Severity tagging: 🔴 Critical (gap ≥ 3), 🟡 High (gap ≥ 2), 🔵 Medium (gap = 1)
  - 10 framework-specific instruction sets (LangChain, CrewAI, AutoGen, OpenAI, LlamaIndex, Semantic Kernel, Claude Code, Gemini, Cursor, Kiro)
  - 15 agent config targets with idempotent AMC-GUARDRAILS markers
  - Per-question verification commands in agent instructions
  - Getting-started tutorial for L0-L1 agents
  - Framework auto-detection from pyproject.toml, requirements.txt, package.json, *.csproj, config files
- **Over-Compliance Detection** — 3 new assurance packs + 8 diagnostic questions (AMC-OC-1 through AMC-OC-8) based on H-Neurons paper (arXiv:2512.01797)
- **Website Improvement Journey** — new section showing L1→L5 path with simple and technical modes
- **Dashboard v13** — zero-state first-run, rich trend tooltips, crosshair, sidebar collapse, skip-link, prefers-reduced-motion (council score: 9.39/10)

### Changed
- Question bank expanded: 118 → 138 questions (added Evaluation & Growth dimension)
- Assurance packs expanded: 71 → 86 packs
- Test count: 2656 → 3311
- Website stats updated across all surfaces
- CLI formatting module (`src/cliFormat.ts`) shared across init, quickscore, doctor
- Dashboard rebuilt from ground up (v11) with Linear/Vercel aesthetic

### Fixed
- All 44 TypeScript errors in API routers resolved
- Website hero-tag, capability strip, and install tab stats synchronized
- Dashboard light mode contrast and accessibility improvements
