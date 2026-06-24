# GAP-0734 - Pretraining code attribution public-methodology boundary

- Gap: `GAP-0734`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: arXiv `https://arxiv.org/abs/2511.07033`, backlog OpenAlex `W7138175068`, backlog DOI `10.1609/aaai.v40i1.37038`, and title `Uncovering Pretraining Code in LLMs: A Syntax-Aware Attribution Approach`
- Retrieval: `2026-06-21` via live arXiv page review and DOI/title search; shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, attribution engine, or membership-inference subsystem added.

## Live source metadata

The live arXiv source identifies the paper as syntax-aware attribution research for uncovering pretraining code in LLMs. Relevant source-review signals include pretraining-code attribution, membership inference, copyrighted and licensed open-source code concerns, GPL-style license context, SynPrune, syntax-pruned scoring, syntax categories, consequent-token removal, robustness across function lengths, and Python syntax conventions. The live arXiv page lists authors Yuanheng Li, Zhuoyang Chen, Xiaoyun Liu, Yuhao Wang, Mingwei Liu, Yang Shi, Kaifeng Huang, and Shengjie Zhao; submitted `2025-11-10`.

These facts are useful context for AMC public-methodology discipline because training-data attribution and code-license concerns can affect evidence taxonomy, model-risk interpretation, and external trust claims. They do not by themselves define an AMC methodology version, scoring rule, changelog, deprecation notice, migration guidance, validation artifact, signed evidence receipt, badge rule, or public comparability contract. No upstream abstract prose beyond minimal metadata facts, syntax tables, benchmark rows, code snippets, datasets, prompts, examples, figures, algorithms, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0734 is relevant to AMC only as public-methodology boundary evidence. The source reinforces that public claims about agent evaluation and model trust may need clear evidence taxonomy and limitation language when training-data attribution or code-license risk is involved.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because the arXiv/DOI/OpenAlex/title metadata and attribution research framing do not provide AMC-owned methodology proof. A source citation to the paper can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background attribution/evidence-taxonomy context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background misuse/license-risk context only; no new safety threshold or assurance rule. |
| Watch | Background trace/evidence context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime attribution policy, code-use policy, or circuit-breaker behavior changed. |
| Vault | No source-code corpus, prompt, trace, model output, or secure-storage behavior changed. |
| Fleet | Model-risk context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | Legal/license context only; no compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, attribution engine, membership-inference runner, syntax analyzer, or public methodology docs changed for GAP-0734.

The closure is a no-bloat source-review boundary: pretraining-code attribution, syntax-aware attribution, membership inference, SynPrune, syntax-pruned scoring, open-source license concerns, arXiv, DOI, OpenAlex, and paper labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

ArXiv id, DOI, OpenAlex work ID, title, author list, pretraining-code labels, syntax-aware attribution labels, membership-inference labels, SynPrune labels, open-source-license labels, GPL labels, copyright labels, syntax-category labels, robustness labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No attribution engine, membership-inference runner, syntax-pruned scorer, SynPrune implementation, syntax table mirror, source-code corpus, license classifier, paper importer, arXiv importer, OpenAlex importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream abstract prose beyond minimal metadata facts, syntax tables, benchmark rows, code snippets, datasets, prompts, examples, figures, algorithms, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0734PretrainingCodePublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
