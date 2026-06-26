# GAP-1089 - AlphaSift provider risk

- Gap: `GAP-1089`
- Dimension: Third-party agent and provider risk
- AMC surfaces requested: Comply, Passport, Vault
- Source reviewed: GitHub repository `https://github.com/ZhuLinsen/alphasift`, README `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/README.md`, LICENSE `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/LICENSE`, pyproject `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/pyproject.toml`, and SKILL.md `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/SKILL.md`
- Retrieval: Live GitHub API, raw file metadata, default-branch commit, language, and release checks on `2026-06-25T17:00:00.000Z`
- Status: Done

## Relevance decision

`ZhuLinsen/alphasift` is relevant to AMC only as third-party provider-risk context for a finance-agent dependency or evaluation fixture. The GitHub repository description is: `AI-native stock screening engine with full-market discovery, LLM ranking, risk-aware scoring, and auditable evaluation. AI选股`. Its topics include `agent`, `finance`, `fintech`, `llm`, `python`, `quant`, and `stock`, and its package metadata identifies a Python project with dependencies on market-data and LLM-adjacent libraries.

That context is enough to require provider record, attestation, data boundary, contractual control, and review date before AMC can accept the provider-risk claim. It is not enough to add an AlphaSift adapter, GitHub importer, finance subsystem, trading workflow, stock-screening engine, market-data connector, investment advice claim, strategy importer, source-specific provider-risk route, source-specific CLI command, or copied upstream implementation. GAP-1089 maps to AMC's existing generic third-party provider-risk receipt.

## Live source metadata

- Repository: `https://github.com/ZhuLinsen/alphasift`
- README: `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/README.md`
- LICENSE: `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/LICENSE`
- pyproject: `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/pyproject.toml`
- SKILL.md: `https://raw.githubusercontent.com/ZhuLinsen/alphasift/main/SKILL.md`
- Repository description: `AI-native stock screening engine with full-market discovery, LLM ranking, risk-aware scoring, and auditable evaluation. AI选股`
- Repository state: not archived, not a fork.
- Default branch: default branch `main`
- Primary language: primary language `Python`
- Language bytes from GitHub API: `Python:681794`
- License: license `Apache License 2.0`
- stargazerCount `216`
- forkCount `119`
- open issues `3`
- latest release `none`
- Default branch commit: default branch commit `fd45fb864b55daf53afd7253d468f72edda95860`
- Default branch commit verification: verification reason `valid`
- README blob `0159234a95d255e632e0e55f19d1db9ab8434664`
- LICENSE blob `f125b03fc2f6126cb7d6bc31cddb29eccf06fcb9`
- pyproject blob `b7f2d4e88ae6ac3eda23e8cc52f7963bbac24362`
- README first 200 KB SHA-256 `f60bd0eb7b54ade04658a111e6c8d312f99800befdcbb1b937b58228aeb84750`
- LICENSE first 200 KB SHA-256 `4aa75c59fb0d50653262470726b84c66636899ca96232a6e94e83c77456f8175`
- SKILL.md first 200 KB SHA-256 `0ccaa238d79f2b3417ad57d716ddbd3b419623a498fe4d3d5c756198f61ffea3`
- package version `0.2.0`
- requires-python `>=3.10`
- pyproject dependencies reviewed as package metadata only: `pandas`, `pyyaml`, `litellm`, `efinance`, `akshare`, `baostock`, `tushare`, `yfinance`, and `requests`.
- Root source review found `.codex`, `.env.example`, `.github`, `.gitignore`, `LICENSE`, `MANIFEST.in`, `README.md`, `README.zh-CN.md`, `SKILL.md`, `agents`, `alphasift`, `docs`, `pyproject.toml`, `strategies`, and `tests`.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | No scoring semantics changed. Provider-risk proof can contextualize whether an external finance-agent dependency may be used in a score claim. |
| Shield | No Shield pack changed. Any security or misuse claim must cite signed AMC evidence, not repository popularity or README claims. |
| Enforce | Adjacent only. Contractual controls can prohibit live trading, customer portfolio actions, or investment-advice use, but no runtime enforcement path changed. |
| Vault | Relevant because valid provider-risk proof records data boundary and retention limits without embedding financial data, market fixtures, secrets, or upstream files. |
| Watch | Adjacent only. Repo updates may trigger future review cadence, but no Watch monitor or source poller was added. |
| Fleet | Relevant only when fleet agents depend on the reviewed provider or tool. Fleet claims still need signed provider evidence. |
| Passport | Relevant because the audit export preserves portable provider record, attestations, controls, exceptions, hashes, and receipt hash. |
| Comply | Relevant because third-party finance-agent dependencies require provider record, attestation, data boundary, contractual control, review date, and signed evidence before compliance claims pass. |

## Product closure

No product code changed. Existing `src/compliance/providerRisk.ts` provider-risk primitives already satisfy this gap:

- `buildThirdPartyProviderRiskReceipt`
- `verifyThirdPartyProviderRiskReceipt`
- `renderThirdPartyProviderRiskAuditExport`

The receipt records provider record, owner, review date, next review date, data-processing posture, allowed-use count, model-restriction count, attestations, data boundary, contractual controls, exception states, source citations, signed evidence refs, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

`tests/gap1089AlphasiftProviderRiskBoundary.test.ts` proves this existing primitive accepts a source-cited finance stock-screening library dependency review and fails closed when repository metadata replaces signed provider-risk proof.

## Fail-closed rule

metadata-only AlphaSift evidence must fail closed. Repository stars, forks, topics, README labels, package version, dependencies, language metadata, issue counts, license labels, verified GitHub commit status, local backlog text, source file names, raw-file hashes, or source-review notes cannot satisfy third-party provider risk.

A valid provider-risk claim requires a provider record, owner, review date, allowed use cases, signed attestation, signed data boundary, contractual controls, signed exceptions when present, signed evidence refs, source citations, data-boundary hash, contractual-controls hash, attestations hash, evidence-chain hash, row hash, and receipt hash.

## No-bloat boundary

No AlphaSift adapter, finance subsystem, stock-screening engine, trading workflow, investment-advice feature, market-data connector, pyproject importer, SKILL.md importer, strategy importer, GitHub importer, source-specific provider-risk route, source-specific CLI command, copied README content, copied source code, copied prompts, copied configs, copied strategy files, copied tests, copied examples, copied screenshots, or copied generated output were added. The source is source-review context only.

## Verification

- Expected-red focused test: `npx vitest run tests/gap1089AlphasiftProviderRiskBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-1089-alphasift-provider-risk.md` did not exist; 3 provider-risk/no-bloat tests passed.
- Live source checks:
  - `gh repo view ZhuLinsen/alphasift --json ...` returned repository metadata with the fields recorded above.
  - `gh api repos/ZhuLinsen/alphasift/contents` returned root files and directories recorded above.
  - `gh api repos/ZhuLinsen/alphasift/readme` returned README path, blob, size, and default-branch raw URL.
  - `gh api repos/ZhuLinsen/alphasift/contents/LICENSE` returned LICENSE blob and size.
  - `gh api repos/ZhuLinsen/alphasift/contents/pyproject.toml` returned pyproject blob and size.
  - `gh api repos/ZhuLinsen/alphasift/commits/HEAD` returned default branch commit `fd45fb864b55daf53afd7253d468f72edda95860` with verification reason `valid`.
  - `gh api repos/ZhuLinsen/alphasift/languages` returned language byte metadata recorded above.
  - `gh release view --repo ZhuLinsen/alphasift` returned no published release.
  - Raw README, LICENSE, pyproject, and SKILL.md requests were used for narrow metadata/hash review only.
- Focused test: `npx vitest run tests/gap1089AlphasiftProviderRiskBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired provider-risk regression: `npx vitest run tests/gap1089AlphasiftProviderRiskBoundary.test.ts tests/gap1082ClaudeSkillsProviderRiskBoundary.test.ts tests/gap1081TruthTheoryProviderRiskBoundary.test.ts tests/gap1059EnterpriseFinancialRiskProviderRiskBoundary.test.ts tests/gap1061ExecutionGapProviderRiskBoundary.test.ts --reporter=dot` passed, 5 files / 20 tests.
- Whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 1,001 files / 8,018 tests.
- Linear: `AMC-1426`.
