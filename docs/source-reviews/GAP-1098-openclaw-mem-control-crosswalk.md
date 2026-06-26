# GAP-1098 - openclaw-mem control crosswalk

- Gap: `GAP-1098`
- Dimension: `gov-control-crosswalk`
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: `phenomenoner/openclaw-mem`
- Retrieval: GitHub API repository/commit/content/release/tag metadata and raw-file hash checks, 2026-06-25
- Status: Done

## Relevance decision

GAP-1098 is relevant to AMC because the backlog asks for control crosswalk coverage across governance, risk, compliance, and audit. `openclaw-mem` is a memory-governance repository with auditability, citations, trust policy, provenance, SQLite/local-first, and rollback context. Those are useful source-review signals for Comply, Passport, and Vault, but they do not justify a new memory product area or an OpenClaw integration inside AMC.

The closure maps to AMC's existing generic control-crosswalk receipt. A passing claim must map existing AMC controls to framework clauses and preserve source citations, AMC question IDs, evidence types, accountable owners, exception state, signed evidence references, evidence-chain hashes, row hashes, and the receipt hash. Repository metadata alone cannot prove control coverage.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Indirect only. Crosswalk rows preserve AMC question IDs and evidence types, but scoring semantics are unchanged. |
| Shield | Indirect only. Memory poisoning and provenance context can inform security reviews, but no Shield detector changed. |
| Enforce | Out of scope. No runtime guardrail, policy firewall, or circuit breaker changed. |
| Vault | Relevant because crosswalk receipts preserve signed evidence refs, owners, source citations, exception state, and hashes for audit evidence handling. |
| Watch | Out of scope. No observability monitor or live drift rule changed. |
| Fleet | Out of scope. No fleet orchestration or multi-agent topology changed. |
| Passport | Relevant because crosswalk receipts are portable proof bundles for external auditors and stakeholders. |
| Comply | Primary surface. The existing control-crosswalk receipt maps AMC controls to NIST AI RMF, ISO 42001, EU AI Act, SOC 2, GDPR, and sector obligations such as FedRAMP. |

## Product closure

No product module changed. GAP-1098 is closed by the existing generic control-crosswalk primitive in `src/compliance/controlCrosswalk.ts`, plus focused regression coverage and this source-review note.

The focused fixture proves the existing crosswalk can produce auditor-ready rows across NIST AI RMF, ISO 42001, EU AI Act, SOC 2, GDPR, and FedRAMP. It also proves metadata-only openclaw-mem evidence fails closed and that no openclaw-mem source identifiers were added to generic compliance or scoring implementation files.

Live source facts verified:

- Repository: `https://github.com/phenomenoner/openclaw-mem`
- README: `https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/README.md`
- LICENSE: `https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/LICENSE`
- pyproject: `https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/pyproject.toml`
- QUICKSTART: `https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/QUICKSTART.md`
- Product positioning: `https://raw.githubusercontent.com/phenomenoner/openclaw-mem/main/PRODUCT_POSITIONING.md`
- Repository title: `openclaw-mem`
- Description context: `Local-first AI agent memory governance`
- default branch `main`
- commit `e1b305bbdb968d24823cc98a8a087b29b381f589`
- verification reason `unsigned`
- repository API license `MIT`
- pyproject license `MIT OR Apache-2.0`
- primary language `Python`
- Language breakdown includes Python, JavaScript, TypeScript, Shell, Dockerfile, and Mermaid.
- stars `28`
- forks `4`
- open issues `0`
- latest release `v1.9.27`, published `2026-06-12T04:05:41Z`
- latest tag `v1.9.30`
- package name `openclaw-context-pack`
- package version `1.9.30`
- Topics include `agent-memory`, `memory-governance`, `provenance`, `sqlite`, `observability`, `prompt-injection`, and `openclaw-plugin`.
- README.md first 200 KB SHA-256 `32b953abb0acec04ecf73675c0309ba01ca0df5347da1c542f003c12d917f091`
- LICENSE first 200 KB SHA-256 `95bb79f848383eaa9ad35129907766c491dc9230da998f4e4f75cb659ffa13a7`
- pyproject.toml first 200 KB SHA-256 `00a6a603d63605f714584128117fc60a7144eca61a83455998666aadaefe43b9`
- QUICKSTART.md first 200 KB SHA-256 `cc6c4bf2ad16f0d46cced63446ddb0cf6624e9226ad40df069043ab7ebc8416b`
- PRODUCT_POSITIONING.md first 200 KB SHA-256 `edeedc51dadc5218ff8b7e91406bb34fe63ff6ad1b812f1e138463ff8c2e3248`

## Fail-closed rule

Control crosswalk coverage fails closed when source citations are missing, a row lacks a framework clause, a row lacks AMC question IDs, a row lacks evidence types, a row lacks an owner, a row lacks evidence lineage, an evidence hash or signed evidence ref is invalid, a non-`none` exception lacks signed evidence reference and signature hash, or row/receipt hashes do not verify.

Metadata-only openclaw-mem evidence fails closed. Repository URL, README title, GitHub description, stars, forks, topics, language labels, package metadata, release tags, raw file hashes, source identity, local backlog metadata, memory-governance labels, citation labels, trust-policy labels, provenance labels, SQLite labels, rollback labels, or OpenClaw plugin labels cannot satisfy control-crosswalk proof without AMC-owned source citations, mapped framework clauses, AMC question IDs, evidence types, owners, signed exception workflow when exceptions exist, signed evidence refs, row hashes, and receipt hash.

## No-bloat boundary

No openclaw-mem adapter, OpenClaw plugin integration, memory sidecar, SQLite memory store, MCP server, CLI wrapper, gateway, hook runner, citation importer, trust-policy engine, rollback subsystem, memory governance clone, source-specific compliance route, source-specific API, source-specific CLI command, public methodology bump, framework parity claim, copied README prose, copied quickstart commands, copied docs, copied examples, copied configs, copied code, copied benchmark rows, copied screenshots, or copied implementation details were added.

The source remains source-review context only. AMC continues to require signed AMC evidence through the existing generic control-crosswalk primitive.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1098OpenclawMemControlCrosswalkBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1098-openclaw-mem-control-crosswalk.md` did not exist; 3 control-crosswalk/no-bloat tests passed.
- Live source checks:
  - `gh api repos/phenomenoner/openclaw-mem` returned repository metadata recorded above.
  - `gh api repos/phenomenoner/openclaw-mem/commits/HEAD` returned commit and verification metadata recorded above.
  - `gh api repos/phenomenoner/openclaw-mem/contents` returned root content metadata recorded above.
  - `gh api repos/phenomenoner/openclaw-mem/releases/latest` returned release metadata recorded above.
  - `gh api repos/phenomenoner/openclaw-mem/tags` returned tag metadata including `v1.9.30`.
  - Raw README, LICENSE, pyproject, QUICKSTART, and PRODUCT_POSITIONING URLs returned HTTP `200`; first-200KB hashes are recorded above.
- Focused test: `npx vitest run tests/gap1098OpenclawMemControlCrosswalkBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired control-crosswalk regression: `npx vitest run tests/gap1098OpenclawMemControlCrosswalkBoundary.test.ts tests/gap1057TrismControlCrosswalkBoundary.test.ts tests/gap1068SaidotControlCrosswalkBoundary.test.ts tests/gap1074MicrosoftAzureAiFoundryControlCrosswalkBoundary.test.ts tests/compliance/complianceMatrix.test.ts tests/complianceReportReadability.test.ts tests/auditBinderComplianceMaps.test.ts --reporter=dot` passed, 7 files / 31 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1008 files / 8047 tests.
