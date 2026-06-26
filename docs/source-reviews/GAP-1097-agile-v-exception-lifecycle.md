# GAP-1097 - Agile-V exception lifecycle

- Gap: `GAP-1097`
- Dimension: Exception and waiver lifecycle
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: GitHub repository `https://github.com/Agile-V/agile_v_skills`, README `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/README.md`, LICENSE `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/LICENSE`, package metadata `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/package.json`, Claude guidance `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/CLAUDE.md`, and release notes `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/V1.6_RELEASE_NOTES.md`
- Retrieval: Live GitHub API and raw-file checks on `2026-06-25T17:52:00.000Z`
- Status: Done

## Relevance decision

`Agile-V/agile_v_skills` is relevant to AMC only as governance, traceability, verification, compliance, quality-assurance, and red-team source-review context for exception and waiver lifecycle proof. The live repository metadata points to formal traceability, ISO 9001/ISO 27001 alignment, GxP-ready workflows, red-team verification, multi-cycle lifecycle, and quality-assurance skills. That context supports AMC's need to track policy exceptions from request through approval, expiry, compensating control, and renewal decision.

The source does not justify an Agile-V adapter, skill importer, traceability framework clone, VS Code/Cursor/Copilot integration, requirements engine, red-team verifier clone, lifecycle workflow clone, source-specific exception workflow, source-specific route, source-specific CLI command, public methodology bump, or copied repository content. GAP-1097 maps to AMC's existing generic governance exception lifecycle receipt.

## Live source metadata

- Repository: `https://github.com/Agile-V/agile_v_skills`
- README: `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/README.md`
- LICENSE: `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/LICENSE`
- Package metadata: `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/package.json`
- Claude guidance: `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/CLAUDE.md`
- V1.6 release notes: `https://raw.githubusercontent.com/Agile-V/agile_v_skills/main/V1.6_RELEASE_NOTES.md`
- GitHub description begins with `Verifiable AI-Augmented Engineering Framework`
- README title: `Agile V Agent Skills Library`
- default branch `main`
- HEAD commit `63d3c40037bcf06b3da65eb854e7c531328128ed`
- commit verification reason `unsigned`
- license `CC-BY-SA-4.0`
- primary language `JavaScript`
- stars `47`
- forks `9`
- open issues `1`
- latest release API returned `404`
- latest tag `v3.3.4`
- latest tag commit `63d3c40037bcf06b3da65eb854e7c531328128ed`
- package name `agile-v-skills`
- package version `3.3.4`
- package license `CC-BY-SA-4.0`
- package description begins with `Verifiable AI-Augmented Engineering Framework`
- package keywords include `ai-agents`, `agent-skills`, `requirements-engineering`, `traceability`, `verification`, `testing`, `compliance`, `iso-9001`, `iso-27001`, `gxp`, `quality-assurance`, `software-engineering`, `agile`, `v-model`, `red-team`, `claude-code`, `cursor`, `github-copilot`, `vscode`, and `llm`
- repository topics include `agent-skills`, `agile`, `ai-agents`, `ai-safety`, `claude-code`, `compliance`, `cursor`, `github-copilot`, `iso-27001`, `iso-9001`, `llm`, `quality-assurance`, `red-team`, `requirements-engineering`, `software-engineering`, `testing`, `traceability`, `v-model`, `verification`, and `vscode`
- root contents include Claude/Cursor guidance, release notes, Agile-V lifecycle/compliance/core/pipeline/quality-gate folders, build-agent, compliance-auditor, red-team-verifier, release-manager, requirement-architect, test-designer, threat-modeler, docs, domains, integrations, templates, and skills directories.
- README.md first 200 KB SHA-256 `e6a5ca51f5dfd7664ca0d5770890a370893d3b4a9e6a75cd2cb165daf047ffbe`
- LICENSE first 200 KB SHA-256 `23ee78c8bae49cf08ea2f0c84945c66b987ebe4520881fb51b3dad4fb43d07c2`
- package.json first 200 KB SHA-256 `c5e2b4847781b5db8a9dc1cc62262bb94836ac2b59abc9be6fb867cd4fbf0a41`
- CLAUDE.md first 200 KB SHA-256 `06c0d80aeecbaacf0ea6900a25aa5282df157df7af6a8fb56b1da8d0e7429e3d`
- V1.6_RELEASE_NOTES.md first 200 KB SHA-256 `3186fb0c40224826cbc32edab660bdd5603505242b6dc40cbb967a6a4e1d8f48`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring-methodology or diagnostic-question change. Score impacts can be cited by generic exception receipts when an exception changes a scoring control. |
| Shield | Red-team and verification context is safety-adjacent, but no Shield detector changed. |
| Enforce | Relevant only through governance exception status that can inform existing enforcement decisions. No Agile-V runtime enforcement path was added. |
| Vault | Relevant because exception receipts reference signed evidence, hashes, and reviewer/owner fields without embedding prompts, secrets, private requirements, or copied repository content. |
| Watch | No live monitoring or alert changed. |
| Fleet | No fleet topology or orchestration changed. |
| Passport | Relevant because exception lifecycle receipts are portable proof of request, approval, expiry, compensating control, renewal outcome, evidence chain, and row hash. |
| Comply | Primary surface. Existing exception lifecycle receipts prove request, approver, expiry, compensating control, renewal outcome, source citations, owners, and evidence lineage. |

## Product closure

No product code changed. Existing `src/compliance/exceptionLifecycle.ts` and `src/compliance/controlCrosswalk.ts` primitives already satisfy this gap:

- `buildGovernanceExceptionLifecycleReceipt`
- `verifyGovernanceExceptionLifecycleReceipt`
- `renderGovernanceExceptionLifecycleAuditExport`
- `buildControlCrosswalkReceipt`
- `verifyControlCrosswalkReceipt`

The generic exception lifecycle receipt records exception request, requester, request reason, signed request proof, approver, approval decision, signed approval proof, expiry, expiry check, compensating controls, renewal decision, source citations, evidence refs, compensating-control hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1097AgileVExceptionLifecycleBoundary.test.ts` proves this existing primitive accepts source-cited traceability waiver context and fails closed when repository metadata replaces signed exception lifecycle evidence.

## Fail-closed rule

metadata-only Agile-V evidence must fail closed. Repository URL, README title, GitHub description, stars, forks, topics, language labels, package metadata, release tags, root directory names, file hashes, local backlog metadata, traceability labels, verification labels, ISO labels, quality-assurance labels, red-team labels, or source identity cannot satisfy an exception lifecycle claim.

A valid exception lifecycle claim requires an exception request, requester, request reason, signed request proof, approver, approval decision, signed approval proof, expiry timestamp, signed expiry check, compensating control, renewal outcome, signed renewal decision, owner, source citations, signed evidence refs, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No Agile-V adapter, skill importer, traceability framework clone, VS Code/Cursor/Copilot integration, requirements engine, artifact/test-case graph, red-team verifier clone, lifecycle workflow clone, source-specific exception workflow, GitHub importer, source-specific API route, source-specific CLI command, public methodology bump, compliance parity claim, ISO parity claim, copied README prose, copied release notes, copied guidance, copied skills, copied examples, copied configs, copied templates, copied docs, copied screenshots, copied data, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1097AgileVExceptionLifecycleBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1097-agile-v-exception-lifecycle.md` did not exist; 4 exception lifecycle/control-crosswalk/no-bloat tests passed.
- Live source checks:
  - `gh api repos/Agile-V/agile_v_skills` returned repository metadata recorded above.
  - `gh api repos/Agile-V/agile_v_skills/commits/HEAD` returned commit and verification metadata recorded above.
  - `gh api repos/Agile-V/agile_v_skills/contents` returned root content metadata recorded above.
  - `gh api repos/Agile-V/agile_v_skills/releases/latest` returned HTTP `404`.
  - `gh api repos/Agile-V/agile_v_skills/tags` returned tag metadata including `v3.3.4`.
  - Raw README, LICENSE, package metadata, Claude guidance, and V1.6 release notes URLs returned HTTP `200`; first-200KB hashes are recorded above.
- Focused test: `npx vitest run tests/gap1097AgileVExceptionLifecycleBoundary.test.ts --reporter=dot` passed, 1 file / 5 tests.
- Paired exception lifecycle regression: `npx vitest run tests/gap1097AgileVExceptionLifecycleBoundary.test.ts tests/gap1071BigIdExceptionLifecycleBoundary.test.ts tests/gap1065MonitaurExceptionLifecycleBoundary.test.ts tests/auditBinderComplianceMaps.test.ts tests/compliance/complianceMatrix.test.ts --reporter=dot` passed, 5 files / 28 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1007 files / 8043 tests.
