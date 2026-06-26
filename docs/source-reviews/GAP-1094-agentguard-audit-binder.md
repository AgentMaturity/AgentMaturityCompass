# GAP-1094 - AgentGuard audit binder

- Gap: `GAP-1094`
- Dimension: Auditor-ready evidence binder
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: GitHub repository `https://github.com/WhitzardAgent/AgentGuard`, README `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/README.md`, LICENSE `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/LICENSE`, pyproject `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/pyproject.toml`, package metadata `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/package.json`, environment example `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/.env.example`, and release `https://github.com/WhitzardAgent/AgentGuard/releases/tag/v2.0`
- Retrieval: Live GitHub API and raw-file checks on `2026-06-25T17:43:00.000Z`
- Status: Done

## Relevance decision

`WhitzardAgent/AgentGuard` is relevant to AMC only as governance, access-control, policy-engine, security, zero-trust, and auditability source-review context for auditor-ready evidence binders. The repository metadata and package metadata describe a tool-use security/control plane, but GAP-1094 asks AMC to package score, policy, exception, incident, and cryptographic receipts into a reviewable binder by control family.

That maps to AMC's existing signed `.amcaudit` binder. The source does not justify an AgentGuard adapter, policy engine, access-control subsystem, rule importer, plugin importer, Docker compose runner, Python package dependency, source-specific binder, source-specific route, source-specific CLI command, methodology bump, or copied repository content.

## Live source metadata

- Repository: `https://github.com/WhitzardAgent/AgentGuard`
- README: `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/README.md`
- LICENSE: `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/LICENSE`
- pyproject: `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/pyproject.toml`
- package metadata: `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/package.json`
- Environment example: `https://raw.githubusercontent.com/WhitzardAgent/AgentGuard/main/.env.example`
- Release: `https://github.com/WhitzardAgent/AgentGuard/releases/tag/v2.0`
- GitHub description: `AgentGuard: Zero-Trust Security Foundation for AI Agents`
- README title: `AgentGuard`
- default branch `main`
- HEAD commit `a75abb85e8525fcc7341b615934b39c6679b7012`
- commit verification reason `unsigned`
- license `GPL-3.0`
- primary language `Python`
- stars `77`
- forks `9`
- open issues `0`
- latest release `v2.0`
- release name `V2.0`
- release published `2026-06-21T13:20:09Z`
- package name `agentguard`
- package version `0.3.0`
- package description: `Runtime access control plane for agent tool-use (allow / deny / human_check / degrade).`
- requires-python `>=3.11`
- package license file `LICENSE`
- package keywords include `ai`, `agent`, `security`, `access-control`, and `llm`
- repository topics include `access-control`, `agents`, `ai`, `ai-safety`, `compliance`, `defense`, `governance`, `llm`, `policy-engine`, `python`, `security`, and `zero-trust`
- language breakdown from GitHub includes Python, JavaScript, HTML, CSS, Shell, and Dockerfile.
- root contents include README, LICENSE, pyproject, package metadata, config, docs, examples, plugins, rules, scripts, skills, source, tests, and third-party directories.
- README.md first 200 KB SHA-256 `7cef855103b9b1e181c063617a20dd7ee9c31146dd40d128b3f72970e890eaf6`
- LICENSE first 200 KB SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`
- pyproject.toml first 200 KB SHA-256 `e1cc9c457f65b281ba78b5cc2c692a10c7cb2795ff19c058fa964dea0f124bde`
- package.json first 200 KB SHA-256 `55b5b2d95a650e417f7ed63daf9bd59893aced62eb39b97f7a0ecb7eb5bb46a3`
- .env.example first 200 KB SHA-256 `370d4b99784af426986a5964f9c5f9584646a7da4795393fdcfc27d1a1c54db4`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. Score receipts can be included in generic audit binders. |
| Shield | Security and access-control context is safety-adjacent, but no Shield detector changed. |
| Enforce | AgentGuard is enforcement-adjacent, but GAP-1094 closes auditor binder proof rather than runtime policy enforcement. |
| Vault | Relevant because `.amcaudit` binders enforce allowlisted fields, signatures, hashes, and PII/secret scanning without embedding raw secrets or repository content. |
| Watch | No live monitoring or alert changed. |
| Fleet | No fleet topology or orchestration changed. |
| Passport | Relevant because audit binders are portable proof bundles for external review and evidence exchange. |
| Comply | Primary surface. Existing audit binders package control-family evidence, maturity notes, governance notes, assurance notes, proof bindings, signatures, and verification status. |

## Product closure

No product code changed. GAP-1094 is covered by the existing signed audit-binder path:

- `createAuditBinderArtifact`
- `verifyAuditBinderFile`
- `inspectAuditBinder`
- `scanBinderForPii`

The existing binder path produces a signed `.amcaudit` package with Binder manifest, control index, receipt hashes, reviewer notes, audit policy hash, audit map hash, calculation manifest hash, transparency root hash, Merkle root hash, signature envelope, PII scan, and verification result.

`tests/gap1094AgentGuardAuditBinderBoundary.test.ts` proves this existing primitive packages auditor-ready evidence and fails closed when repository metadata replaces signed binder evidence.

## Fail-closed rule

The audit binder fails closed when binder contents are tampered after signing, when digest or signature verification fails, or when reviewer notes contain PII/secret-like data. Exported binders must preserve deterministic Binder manifest, control index, proof bindings, receipt hashes, reviewer notes, signature envelope, and verification status.

Metadata-only evidence fails closed. Repository URL, README title, stars, forks, topics, language labels, package metadata, release tags, root directory names, GitHub hashes, local backlog metadata, or AgentGuard identity cannot satisfy auditor-binder proof without an AMC-owned signed `.amcaudit` artifact and verification result.

## No-bloat boundary

No AgentGuard adapter, policy engine, access-control subsystem, rule importer, plugin importer, Docker compose runner, Python package dependency, repository mirror, GitHub importer, source-specific binder, source-specific route, source-specific CLI command, methodology bump, compliance parity claim, zero-trust parity claim, copied README prose, copied rules, copied plugins, copied examples, copied configs, copied docs, copied screenshots, copied data, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1094AgentGuardAuditBinderBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1094-agentguard-audit-binder.md` did not exist; 3 audit-binder/no-bloat tests passed.
- Live source checks:
  - `gh api repos/WhitzardAgent/AgentGuard` returned repository metadata recorded above.
  - `gh api repos/WhitzardAgent/AgentGuard/commits/HEAD` returned commit and verification metadata recorded above.
  - `gh api repos/WhitzardAgent/AgentGuard/contents` returned root content metadata recorded above.
  - `gh api repos/WhitzardAgent/AgentGuard/releases/latest` returned release metadata recorded above.
  - Raw README, LICENSE, pyproject, package metadata, and environment example URLs returned HTTP `200`; first-200KB hashes are recorded above.
- Focused test: `npx vitest run tests/gap1094AgentGuardAuditBinderBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired audit-binder regression: `npx vitest run tests/gap1094AgentGuardAuditBinderBoundary.test.ts tests/gap1070ModelOpAuditBinderBoundary.test.ts tests/gap1063ScaleDonovanAuditBinderBoundary.test.ts tests/auditBinderComplianceMaps.test.ts tests/passportPublicApiAndCli.test.ts tests/vault-extensions.test.ts --reporter=dot` passed, 6 files / 51 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,006 files / 8,038 tests.
