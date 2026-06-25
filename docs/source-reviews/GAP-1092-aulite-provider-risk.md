# GAP-1092 - Aulite provider risk

- Gap: `GAP-1092`
- Dimension: Third-party agent and provider risk
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: GitHub repository `https://github.com/el1ght/aulite`, README `https://raw.githubusercontent.com/el1ght/aulite/main/README.md`, LICENSE.md `https://raw.githubusercontent.com/el1ght/aulite/main/LICENSE.md`, package metadata `https://raw.githubusercontent.com/el1ght/aulite/main/package.json`, and release `https://github.com/el1ght/aulite/releases/tag/v0.4.0`
- Retrieval: Live GitHub API, raw file metadata, release, default-branch commit, language, and package metadata checks on `2026-06-25T17:15:00.000Z`
- Status: Done

## Relevance decision

`el1ght/aulite` is relevant to AMC only as third-party provider-risk context for an AI compliance proxy, audit logging proxy, or self-hosted governance dependency. The GitHub repository description is: `EU AI Act compliance proxy for AI systems. Drop-in HTTP proxy that monitors every AI interaction for regulatory risks, logs to a tamper-proof audit trail, and generates legal-grade PDF reports. 143 rules across 8 Annex III domains. Self-hosted, open-core`. Its repository topics include `ai-governance`, `audit`, `compliance`, `eu-ai-act`, `gdpr`, `llm`, `openai`, `proxy`, `self-hosted`, `sqlite`, and `typescript`, and its package metadata identifies a TypeScript module with a CLI entry.

That context is enough to require provider record, attestation, data boundary, contractual control, and review date before AMC can accept any provider-risk claim. It is not enough to add an Aulite adapter, compliance proxy, EU AI Act proxy, audit-log importer, PDF report importer, GitHub importer, source-specific provider-risk route, source-specific CLI command, regulation parity claim, or copied upstream implementation. GAP-1092 maps to AMC's existing generic third-party provider-risk receipt.

## Live source metadata

- Repository: `https://github.com/el1ght/aulite`
- README: `https://raw.githubusercontent.com/el1ght/aulite/main/README.md`
- LICENSE.md: `https://raw.githubusercontent.com/el1ght/aulite/main/LICENSE.md`
- package.json: `https://raw.githubusercontent.com/el1ght/aulite/main/package.json`
- Release: `https://github.com/el1ght/aulite/releases/tag/v0.4.0`
- Repository description: `EU AI Act compliance proxy for AI systems. Drop-in HTTP proxy that monitors every AI interaction for regulatory risks, logs to a tamper-proof audit trail, and generates legal-grade PDF reports. 143 rules across 8 Annex III domains. Self-hosted, open-core`
- Repository state: not archived, not a fork.
- Default branch: default branch `main`
- Primary language: primary language `TypeScript`
- Language bytes from GitHub API include TypeScript `220732`, JavaScript `13952`, Dockerfile `564`, HTML `483`, and CSS `176`.
- Repository license label: license `Other`
- Package license: package license `BUSL-1.1`
- stargazerCount `108`
- forkCount `0`
- open issues `0`
- latest release `v0.4.0`
- release name `v0.4.0 - External Rekor anchoring`
- release published `2026-06-14T21:57:04Z`
- Release state: not draft, not prerelease, target commitish `main`.
- Default branch commit: default branch commit `a8cfdf9271db7504115c77d88fccaaa785705e84`
- Default branch commit verification: verification reason `unsigned`
- README blob `2cd92e4798e7c928800f876984ae1b940077ee8a`
- LICENSE.md blob `59d7d94dc2848274cb7e178db9363523cefe5bb9`
- package.json blob `d500b6d15082f3b90908e05b4f294af9720492db`
- README first 200 KB SHA-256 `140e7dde549f5ad41631ea9605a707e417ff9272248cff21bc2ef5da976b3809`
- LICENSE.md first 200 KB SHA-256 `77f3f82ba1596e02f4b11fc9ea86caacc20befc581cb85cbcc3a1f2d2facbca2`
- package.json first 200 KB SHA-256 `950061d3487c8b6626fb27c7645c58de7dc9512b641dfc6e8951ba37855f24d4`
- package version `0.4.0`
- package type `module`
- package bin `aulite`
- Root source review found `.env.example`, `.gitignore`, `Dockerfile`, `LICENSE.md`, `README.md`, `aulite.config.example.yml`, `dashboard`, `docker-compose.yml`, `docs`, `package-lock.json`, `package.json`, `scripts`, `src`, `tests`, `tsconfig.json`, and `vitest.config.ts`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Provider-risk proof can contextualize whether an external compliance proxy may be cited in score claims. |
| Shield | Adjacent only. Security, abuse, or regulatory-risk claims must cite signed AMC evidence, not repository claims or release labels. |
| Enforce | Adjacent only. A contractual control can prohibit customer traffic or regulator-facing reports until terms and data boundary are signed, but no runtime enforcement path changed. |
| Vault | Relevant because valid provider-risk proof records data boundary, subprocessors, retention, and transfer mechanism without embedding prompts, responses, reports, or upstream files. |
| Watch | Adjacent only. Release or repository changes can trigger review cadence, but no Watch monitor or source poller was added. |
| Fleet | Relevant only when fleet agents rely on a reviewed compliance proxy provider. Fleet claims still need signed provider evidence. |
| Passport | Relevant because the audit export preserves portable provider record, attestations, controls, exceptions, hashes, and receipt hash. |
| Comply | Relevant because a third-party compliance proxy needs provider record, attestation, data boundary, contractual control, review date, and signed evidence before compliance claims pass. |

## Product closure

No product code changed. Existing `src/compliance/providerRisk.ts` provider-risk primitives already satisfy this gap:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

The receipt records provider record, owner, review date, next review date, data-processing posture, allowed-use count, model-restriction count, attestations, data boundary, contractual controls, exception states, source citations, signed evidence refs, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1092AuliteProviderRiskBoundary.test.ts` proves this existing primitive accepts a source-cited AI compliance proxy dependency review and fails closed when repository metadata replaces signed provider-risk proof.

## Fail-closed rule

metadata-only Aulite evidence must fail closed. Repository stars, forks, topics, package metadata, release metadata, README labels, audit/compliance labels, issue counts, license labels, unsigned GitHub commit status, file hashes, or local backlog text cannot satisfy third-party provider risk.

A valid provider-risk claim requires a provider record, owner, review date, allowed use cases, signed attestation, signed data boundary, contractual controls, signed exceptions when present, signed evidence refs, source citations, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No Aulite adapter, compliance proxy, EU AI Act proxy, audit-log importer, report importer, hash-chain verifier, Rekor anchoring integration, PDF parser, TypeScript package importer, GitHub importer, source-specific provider-risk route, source-specific CLI command, regulation parity claim, copied README content, copied source code, copied docs, copied configs, copied report templates, copied tests, copied examples, copied screenshots, or copied generated output were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1092AuliteProviderRiskBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1092-aulite-provider-risk.md` did not exist; 3 provider-risk/no-bloat tests passed.
- Live source checks:
  - `gh repo view el1ght/aulite --json ...` returned repository metadata with the fields recorded above.
  - `gh api repos/el1ght/aulite/contents` returned root files and directories recorded above.
  - `gh api repos/el1ght/aulite/commits/HEAD` returned default branch commit `a8cfdf9271db7504115c77d88fccaaa785705e84` with verification reason `unsigned`.
  - `gh api repos/el1ght/aulite/languages` returned language byte metadata recorded above.
  - `gh release view v0.4.0 --repo el1ght/aulite --json ...` returned release metadata recorded above.
  - Raw README, LICENSE.md, and package.json requests were used for narrow metadata/hash review only.
- Focused test: `npx vitest run tests/gap1092AuliteProviderRiskBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired provider-risk regression: `npx vitest run tests/gap1092AuliteProviderRiskBoundary.test.ts tests/gap1089AlphasiftProviderRiskBoundary.test.ts tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts tests/gap1081TruthTheoryProviderRiskBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot` passed, 6 files / 24 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,002 files / 8,022 tests.
- Linear: `AMC-1427`.
