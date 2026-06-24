# GAP-0986 - affective computing public-methodology boundary

- Gap: `GAP-0986`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work page at `https://openalex.org/W7125637838`, OpenAlex API record at `https://api.openalex.org/works/W7125637838`, DOI at `https://doi.org/10.1016/j.knosys.2026.115411`, DOI redirect target at `https://linkinghub.elsevier.com/retrieve/pii/S0950705126001541`, arXiv abstract at `https://arxiv.org/abs/2408.04638`, arXiv API record at `https://export.arxiv.org/api/query?id_list=2408.04638`, and arXiv PDF endpoint at `https://arxiv.org/pdf/2408.04638`
- Retrieval: `2026-06-24` live source review through OpenAlex API inspection, DOI redirect check, arXiv API inspection, arXiv page/PDF HTTP checks, and local backlog metadata.
- Status: Done - skipped as public-methodology implementation evidence; no public methodology version bump, badge method change, diagnostic methodology versioning change, affective-computing scoring lane, paper importer, OpenAlex importer, DOI resolver, arXiv/PDF importer, emotion/sentiment benchmark adapter, clinical/affect taxonomy, or source-specific public methodology path added.
- Linear: `AMC-1265`

## Live source metadata

The OpenAlex record identifies `Affective computing in the era of large language models: A survey from the NLP perspective` as a `2026` journal article in `Knowledge-Based Systems`, with publication_date `2026-01-25`, DOI `https://doi.org/10.1016/j.knosys.2026.115411`, open_access status `closed`, referenced_works_count `77`, and cited_by_count `3`. The DOI redirected to `https://linkinghub.elsevier.com/retrieve/pii/S0950705126001541`.

OpenAlex authorship metadata includes Yiqun Zhang, Xiaocui Yang, Xingle Xu, Zeran Gao, Yijie Huang, Shiyi Mu, Shi Feng, Daling Wang, Yifei Zhang, Kaisong Song, and Ge Yu. Top concept signals included Computer science, Benchmarking, Perspective, Task, Adaptation, Cognition, Reinforcement learning, and Affective computing.

The arXiv API identifies the related record as `http://arxiv.org/abs/2408.04638v2`, published `2024-07-30T08:12:04Z` and updated `2025-09-07T14:25:23Z`, with categories `cs.CL` and `cs.CY`. The arXiv API links the abstract page and PDF endpoint. The arXiv page returned `HTTP/2 200`; the PDF endpoint returned `HTTP/2 200` with a PDF content type.

Source-review signals include Affective Understanding, Affective Generation, Instruction Tuning, LoRA, P-/Prompt-Tuning, Prompt Engineering, zero/few-shot evaluation context, chain-of-thought prompting context, agent-based prompting, Reinforcement Learning, RLHF, RLVR, RLAIF, benchmarks and evaluation practices for affective understanding and generation, ethics, safety, robust evaluation, data quality, resource efficiency, and future research directions.

No upstream article text, abstract prose beyond short metadata facts, arXiv prose, Elsevier prose, paper PDF content, tables, benchmark rows, taxonomy definitions, prompts, datasets, examples, figures, screenshots, model responses, or implementation details were copied into AMC.

## Relevance decision

GAP-0986 is relevant to AMC only as public-methodology context. Affective-computing surveys can remind AMC that user-visible claims about agent behavior, safety, robustness, empathy, affect, or evaluation quality need methodology version, changelog, deprecation notice, migration guidance, evidence taxonomy, known limitations, signed evidence, replayable eval rows, and fail-closed thresholds.

It does not justify changing AMC public scoring semantics in this slice. The live review found a source-review signal, not an AMC-owned scoring formula, diagnostic question-bank change, badge semantics change, evidence taxonomy change, public API behavior change, CLI behavior change, Studio behavior change, or user-visible methodology behavior change. Affective-computing paper metadata alone cannot justify a public methodology version bump.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant as public-methodology context only; no Score formula, maturity level semantics, evidence taxonomy, or question-bank behavior changed. |
| Shield | Relevant as safety and robust-evaluation context only; no Shield verifier, red-team path, affective-safety check, or evidence gate changed. |
| Enforce | No runtime guardrail, affect detector, sentiment policy, agent-policy circuit breaker, or enforcement path changed. |
| Vault | No emotion dataset, prompt, transcript, private artifact, API key, or secure-storage behavior changed. |
| Watch | Relevant as observability context only when Watch claims need methodology transparency; no live drift monitor or alert behavior changed. |
| Fleet | Agent-based prompting is context only; no fleet routing, topology, coordination, or multi-agent evidence changed. |
| Passport | No portable proof-bundle field, external token, or passport claim changed. |
| Comply | No compliance control, clinical claim, EU AI Act mapping, NIST mapping, ISO mapping, SOC 2 mapping, or policy statement changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `docs/SCORING_METHODOLOGY.md`, `src/badge/badgeCli.ts`, API, CLI, Studio, badge, diagnostic question bank, or scoring code changed.

The closure is a no-bloat public-methodology relevance decision. The affective-computing paper stays source-review context only; AMC public methodology should change only when AMC-owned score semantics, evidence taxonomy, limitations, migration guidance, badge assurance, API/CLI behavior, or user-visible methodology semantics actually change.

No public methodology version bump was made.

## Fail-closed rule

OpenAlex reachability, DOI reachability, DOI redirect identity, arXiv reachability, PDF reachability, Knowledge-Based Systems publication metadata, open_access status, publication date, author metadata, cited-by counts, referenced-work counts, concept labels, Affective Understanding labels, Affective Generation labels, Instruction Tuning labels, LoRA labels, P-/Prompt-Tuning labels, Prompt Engineering labels, zero/few-shot labels, chain-of-thought labels, agent-based prompting labels, Reinforcement Learning labels, RLHF labels, RLVR labels, RLAIF labels, benchmark labels, ethics labels, safety labels, robust-evaluation labels, local backlog metadata, or source identity alone cannot prove AMC public methodology versioning.

Passing public-methodology evidence requires an AMC-owned methodology version, changelog, deprecation notice, migration guidance, known limitations, evidence taxonomy, source-review/no-copy boundary, and an actual public scoring, diagnostic, badge, API, CLI, or user-visible methodology semantic change.

## No-bloat boundary

No affective-computing scoring lane, emotion detector, sentiment analyzer, empathy evaluator, affect benchmark adapter, paper importer, OpenAlex importer, DOI resolver, arXiv importer, PDF parser, benchmark-row importer, survey taxonomy, clinical/healthcare subsystem, prompt catalog, dataset importer, evaluation-method catalog, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific public methodology path was added.

No upstream article text, abstract prose beyond short metadata facts, arXiv prose, Elsevier prose, paper PDF content, tables, benchmark rows, taxonomy definitions, prompts, datasets, examples, figures, screenshots, model responses, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0986AffectiveComputingPublicMethodologyBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0986-affective-computing-public-methodology.md'`; 1 implementation guard passed.
- Focused regression: `npx vitest run tests/gap0986AffectiveComputingPublicMethodologyBoundary.test.ts --reporter=dot` passed, 1 file / 3 tests.
- Paired regression: `npx vitest run tests/gap0985DspyQuestionExplainabilityBoundary.test.ts tests/gap0986AffectiveComputingPublicMethodologyBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 833 files / 7,327 tests.
