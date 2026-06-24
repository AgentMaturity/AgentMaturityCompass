# GAP-0835 - Machine Economic Agency Studio drilldown boundary

- Gap: `GAP-0835`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: DOI `10.5281/zenodo.20102985`, Zenodo record `https://zenodo.org/records/20102985`, `https://openalex.org/W7160770892`
- Retrieval: `2026-06-21` via live DOI, Zenodo, and OpenAlex header checks. DOI returned HTTP/2 302 to Zenodo. Zenodo returned HTTP/1.1 200 OK with described-by links for `https://zenodo.org/api/records/20102985`, an item link for `P8_Machine_Economic_Agency_Risk_First_Financial_Agents_v1.pdf`, and license link `creativecommons.org/licenses/by/4.0`. OpenAlex page returned HTTP/2 403. Zenodo API body lookup failed after the header/page checks because `zenodo.org` DNS resolution failed on the body request.
- Status: closed through existing Studio evidence drilldown receipts; no financial-agent evaluator, Zenodo importer, OpenAlex importer, PDF parser, risk-first finance benchmark, market simulator, or source-specific Studio adapter added.

## Live source metadata

The local backlog and Zenodo record identify `Machine Economic Agency: Risk-First Longitudinal Evaluation of Financial LLM Agents`. The source signal is a risk-first evaluation framework for financial LLM agents treated as machine economic actors. This is relevant to operator drilldown because financial-agent evaluations need trace, receipt, source artifact, evidence preview, and empty/error-state visibility before a finding can be acted on.

No upstream PDF body, article prose, evaluation protocol, financial tasks, market examples, risk categories, prompts, agent outputs, tables, figures, screenshots, data, code, or implementation details were copied into AMC.

## Relevance decision

GAP-0835 is relevant to AMC only through existing Studio evidence drilldown primitives. Operators should be able to open a score finding and inspect UI route, source artifact links, evidence preview, and empty/error states, including trace preview, receipt preview, empty-state receipts, error-state receipts, accepted evidence, rejected evidence, and source refs.

The acceptable closure is generic and receipt-led. DOI/Zenodo/OpenAlex/title/PDF metadata can identify the source, but it cannot replace AMC-owned signed evidence previews, route receipts, source artifact links, row hashes, empty-state receipts, error-state receipts, and no-copy proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing Score evidence drilldown rows that bind findings to signed evidence previews and route receipts. |
| Shield | Relevant through fail-closed behavior when previews, route receipts, source links, or signed evidence are missing. |
| Watch | Relevant through Watch-side source artifact links used by Score evidence drilldown rows. |
| Enforce | No runtime financial policy, market policy, routing policy, or circuit breaker changed. |
| Vault | No financial data, prompts, traces, reports, PDFs, or secure-storage behavior changed. |
| Fleet | Financial-agent context only; no orchestration topology or agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Financial-risk context only; no compliance mapping or audit framework changed. |

## Product closure

No `src/diagnostic/evidenceDrilldown.ts`, `src/watch/evidenceDrilldown.ts`, `src/console/assets/evidenceDrilldown.js`, `src/studio/openapi.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, financial-agent evaluator, Zenodo importer, OpenAlex importer, PDF parser, risk-first finance benchmark, market simulator, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0835.

The focused regression exercises the existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` path. The positive path requires UI route, source artifact links, evidence preview, trace preview, receipt preview, empty-state receipts, error-state receipts, signed evidence rows, and row hashes. The negative path fails closed when paper metadata replaces drilldown evidence previews.

## Fail-closed rule

DOI returned HTTP/2 302, Zenodo returned HTTP/1.1 200 OK, Zenodo API described-by link, PDF item link, `P8_Machine_Economic_Agency_Risk_First_Financial_Agents_v1.pdf`, `creativecommons.org/licenses/by/4.0`, OpenAlex page returned HTTP/2 403, Zenodo API body lookup failed, title text, OpenAlex id, risk-first evaluation framework label, machine economic actors label, financial LLM agents label, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown claims.

Passing evidence requires AMC-owned UI route, source artifact links, evidence preview, trace preview, receipt preview, accepted evidence, rejected evidence, empty-state receipts, error-state receipts, signed evidence rows, row hashes, source refs, and no-copy proof.

## No-bloat boundary

No financial-agent evaluator, Zenodo importer, OpenAlex importer, PDF parser, risk-first finance benchmark, market simulator, longitudinal evaluator, paper mirror, data importer, prompt importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific Studio lens, or source-specific scoring path was added. No upstream PDF body, article prose, evaluation protocol, financial tasks, market examples, risk categories, prompts, agent outputs, tables, figures, screenshots, data, code, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0835MachineEconomicAgencyStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
