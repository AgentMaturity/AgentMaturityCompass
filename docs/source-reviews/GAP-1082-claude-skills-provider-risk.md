# GAP-1082 - Claude-Skills provider risk

- Gap: `GAP-1082`
- Dimension: Third-party agent and provider risk
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: GitHub repository `https://github.com/borghei/Claude-Skills`, README `https://raw.githubusercontent.com/borghei/Claude-Skills/main/README.md`, LICENSE `https://raw.githubusercontent.com/borghei/Claude-Skills/main/LICENSE`, and release `https://github.com/borghei/Claude-Skills/releases/tag/v4.8.0`
- Retrieval: Live GitHub API and raw file metadata review on `2026-06-25T08:24:00.000+05:30`
- Status: Done

## Relevance decision

`borghei/Claude-Skills` is relevant to AMC only as third-party tool/skill library provider-risk context. The GitHub repository description is: `338 AI skills across 16 domains. PM is the deepest (66 skills - discovery, execution, strategy frameworks, GTM, Jira/Linear/Notion). Plus engineering, marketing, C-level (CAIO/CDO/CCO/GC/VPE), compliance + audit-prep, new research/ domain, vertical advisors. 74 expert agents, 784+ stdlib Python tools. 11 AI assistants.`

The source maps to AMC's existing generic third-party provider-risk receipt because the backlog acceptance requires provider record, attestation, data boundary, contractual control, and review date. It does not justify a Claude-Skills importer, skill runner, registry mirror, agent-pack clone, source-specific provider-risk route, source-specific CLI command, or copied skill/tool content.

## Live source metadata

- Repository: `https://github.com/borghei/Claude-Skills`
- Default branch: default branch `main`
- Repository state: not archived, not a fork.
- Primary language: HTML.
- Language bytes from GitHub API include HTML, Python, JavaScript, CSS, Shell, Batchfile, and HCL.
- License: GitHub license key `other`, display license `Other`.
- LICENSE metadata: `Commons Clause License Condition v1.0 + MIT`; the license condition does not grant the right to sell the software.
- stargazerCount `300`
- forkCount `57`
- open issues `0`
- latest release `v4.8.0`, published `2026-05-27T21:11:52Z`, not draft, not prerelease.
- Default branch commit `85aca133912e115e8565dc909dba794788256053`, authored by `github-actions[bot]`, commit message `chore(cli): regenerate skills manifest [skip ci]`, verification reason `unsigned`.
- Default branch tree `50f4c3d5f9e57496c9d018673a61d30226863149`.
- README blob `aae0a8618da8363beba2e6113fb554aca4ac6cb9`, size `8458`.
- LICENSE blob `9d84f9e269c910c4ba7e636f6c3febce1c468ac4`, size `2718`.
- Root source review found `.claude`, `.codex`, `.gemini`, `.github`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `LICENSE`, `README.md`, `SECURITY.md`, `agents`, `bundles`, `registry.json`, `skills.json`, `tools`, and multiple domain folders.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Provider-risk evidence can contextualize claims about imported or reviewed third-party skills. |
| Shield | No Shield pack or third-party skill runner was added. Skill security evidence must be AMC-owned and signed when cited. |
| Enforce | No runtime enforcement path changed. Contractual controls can prohibit unattended third-party skill execution. |
| Vault | Relevant because provider-risk receipts can record data-boundary limits without embedding third-party skill content or customer data. |
| Watch | No Watch monitor changed. Review cadence and repository changes can be cited through signed evidence refs. |
| Fleet | Relevant as dependency context when fleet agents rely on third-party skill libraries. |
| Passport | Relevant because the audit export preserves provider record, attestations, controls, exceptions, hashes, and receipt hash. |
| Comply | Relevant because third-party tool dependencies require license, security, data, and contract evidence before compliance claims pass. |

## Product closure

No product code changed. Existing `src/compliance/providerRisk.ts` provider-risk receipt primitives already satisfy this gap:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

The receipt records provider record, owner, review date, next review date, data-processing posture, allowed-use count, model-restriction count, attestations, data boundary, contractual controls, exception states, source citations, signed evidence refs, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts` proves this existing primitive accepts a source-cited third-party skills-library dependency and fails closed when repository metadata replaces signed provider-risk proof.

## Fail-closed rule

metadata-only Claude-Skills evidence must fail closed. Repository stars, forks, topics, README labels, release names, issue counts, license labels, root file names, language metadata, an unsigned GitHub commit, registry names, skills counts, or local backlog text cannot satisfy third-party provider risk.

A valid provider-risk claim requires a provider record, owner, review date, signed attestation, signed data boundary, contractual controls, signed exceptions when present, signed evidence refs, source citations, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No Claude-Skills importer, skill runner, registry mirror, agent-pack clone, third-party skill parser, GitHub importer, source-specific provider-risk route, source-specific CLI command, upstream skill content, upstream tool content, upstream registry rows, upstream prompts, upstream configs, upstream examples, upstream screenshots, or copied implementation details were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1082-claude-skills-provider-risk.md` did not exist; 3 product/no-bloat tests passed.
- Live source checks:
  - `gh repo view borghei/Claude-Skills --json ...` returned repository metadata with the fields recorded above.
  - `gh api repos/borghei/Claude-Skills/contents` returned root files and directories including README, LICENSE, `registry.json`, `skills.json`, `agents`, and `tools`.
  - `gh api repos/borghei/Claude-Skills/readme` returned README path, blob, size, and default-branch raw URL.
  - `gh api repos/borghei/Claude-Skills/commits/HEAD` returned default branch commit `85aca133912e115e8565dc909dba794788256053` with verification reason `unsigned`.
  - `curl -sSL https://raw.githubusercontent.com/borghei/Claude-Skills/main/README.md` was used for narrow heading/metadata review.
  - `curl -sSL https://raw.githubusercontent.com/borghei/Claude-Skills/main/LICENSE` was used for narrow license metadata review.
  - `gh release view v4.8.0 --repo borghei/Claude-Skills --json ...` returned release metadata recorded above.
  - `gh api repos/borghei/Claude-Skills/languages` returned language byte metadata recorded above.
- Focused test: `npx vitest run tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts --reporter=dot`
- Paired provider-risk regression: `npx vitest run tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts tests/gap1081TruthTheoryProviderRiskBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot`
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot`
