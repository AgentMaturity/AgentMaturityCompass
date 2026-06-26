# GAP-0747 - Heuristics-inducing prompt public-methodology unavailable-source boundary

- Gap: `GAP-0747`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7133359620`, DOI `10.1145/3742413.3789108`, and title `Vulnerability of LLM Outputs to Heuristics-Inducing Prompt Structures`
- Retrieval: `2026-06-21` via browser search and direct ACM DOI attempt; exact-title and DOI searches returned no primary result in this environment, and `https://dl.acm.org/doi/10.1145/3742413.3789108` returned `403`. Shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, debiasing evaluator, prompt-heuristics benchmark, or bias-risk workflow added.

## Live source metadata

The local backlog identifies a paper titled `Vulnerability of LLM Outputs to Heuristics-Inducing Prompt Structures`, DOI `10.1145/3742413.3789108`, OpenAlex work `W7133359620`, improvement dimension public methodology versioning, category `Agent evaluation and benchmarks`, and concepts including debiasing, representativeness heuristic, heuristics, anchoring, framing, computer science, vulnerability, and risk analysis. The backlog abstract snippet frames the source around LLM applications and the vulnerability of outputs to prompt structures that induce heuristics. Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches returned no primary result in this environment, and the ACM DOI page returned `403`.

These metadata facts are useful as source-review context only. They do not by themselves define an AMC methodology version, scoring rule, changelog, deprecation notice, migration guidance, validation artifact, signed evidence receipt, badge rule, or public comparability contract. No upstream paper prose, abstract text beyond local backlog metadata, figures, tables, prompt structures, scenarios, datasets, examples, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0747 is relevant to AMC only as public-methodology boundary evidence. Prompt-induced heuristics, anchoring, framing, representativeness, debiasing, and risk-analysis concerns can inform future evidence taxonomy work, but an unavailable metadata-only source cannot change public Score, Shield, or Watch methodology semantics.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the DOI/OpenAlex/title metadata and backlog abstract snippet do not provide AMC-owned methodology proof. A source citation to the paper can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background heuristic/bias evidence-taxonomy context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background prompt vulnerability and debiasing context only; no new safety threshold or assurance rule. |
| Watch | Background prompt-risk context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime prompt policy, debiasing guardrail, or enforcement behavior changed. |
| Vault | No prompt datasets, traces, model outputs, or secure-storage behavior changed. |
| Fleet | Agent-evaluation risk context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | Risk-analysis context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, debiasing evaluator, prompt-heuristics benchmark, anchoring/framing detector, risk-analysis workflow, or public methodology docs changed for GAP-0747.

The closure is an unavailable-source no-bloat source-review boundary: heuristics-inducing prompt structures, representativeness heuristic, anchoring, framing, debiasing, vulnerability, risk-analysis, DOI, OpenAlex, ACM, and title labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

OpenAlex work ID, DOI, title, heuristics-inducing-prompt labels, representativeness labels, anchoring labels, framing labels, debiasing labels, vulnerability labels, risk-analysis labels, ACM labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No debiasing evaluator, prompt-heuristics benchmark, anchoring detector, framing detector, representativeness detector, risk-analysis workflow, prompt-structure importer, dataset mirror, ACM importer, OpenAlex importer, paper importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream paper prose, abstract text beyond local backlog metadata, figures, tables, prompt structures, scenarios, datasets, examples, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0747HeuristicsPromptPublicMethodologyUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
