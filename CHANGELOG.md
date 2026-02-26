# Changelog

All notable changes to AMC are documented here.

## [Unreleased]

### Added
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
- Question bank expanded: 118 → 126 questions (added Evaluation & Growth dimension)
- Assurance packs expanded: 71 → 74 packs
- Test count: 2656 → 2693 (37 guide system tests added)
- Website stats updated across all surfaces
- CLI formatting module (`src/cliFormat.ts`) shared across init, quickscore, doctor
- Dashboard rebuilt from ground up (v11) with Linear/Vercel aesthetic

### Fixed
- All 44 TypeScript errors in API routers resolved
- Website hero-tag, capability strip, and install tab stats synchronized
- Dashboard light mode contrast and accessibility improvements
