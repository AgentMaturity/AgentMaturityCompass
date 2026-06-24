# GAP-0981 - CTI-Thinker adversarial-regression boundary

- Gap: `GAP-0981`
- Dimension: `eval-adversarial-regression`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: OpenAlex work record at `https://openalex.org/W7124423884`, OpenAlex API record at `https://api.openalex.org/works/W7124423884`, DOI resolver at `https://doi.org/10.1186/s42400-025-00505-y`, Springer article URL at `https://link.springer.com/article/10.1186/s42400-025-00505-y`, OpenAlex open-access PDF URL at `https://link.springer.com/content/pdf/10.1186/s42400-025-00505-y.pdf`, and Springer code-availability footnote URL at `https://github.com/eastmountyxz/CTI-Thinker`
- Retrieval: `2026-06-24` live source review through the web research channel, OpenAlex API inspection, and terminal HTTP checks. OpenAlex API returned `HTTP/2 200`; the DOI returned `HTTP/2 302` into Springer; direct Springer HEAD returned `HTTP/2 303` through the identity layer while the web research channel opened the article page content.
- Status: Done as an adversarial benchmark regression boundary over existing AMC replay-corpus receipts; no CTI-Thinker importer, CTI dataset, ATT&CK importer, GraphRAG subsystem, attack-reasoning engine, or source-specific adversarial regression path added.
- Linear: `AMC-1260`

## Live source metadata

OpenAlex identifies `CTI-Thinker: an LLM-driven system for CTI knowledge graph construction and attack reasoning` as an `article` in Cybersecurity, hosted by Springer Nature, with DOI `https://doi.org/10.1186/s42400-025-00505-y`, publication_year `2026`, publication_date `2026-01-16`, cited_by_count `4`, and open access status `diamond`. The OpenAlex open-access URL points to `https://link.springer.com/content/pdf/10.1186/s42400-025-00505-y.pdf`.

OpenAlex lists Xiuzhang Yang, Ruijie Zhong, Yuling Chen, Guojun Peng, Di Yao, Chaofan Chen, Chenyang Wang, Dongni Zhang, Yilin Zhou, and Zixuan Yang as authors. Relevant concept metadata includes Computer science, Knowledge graph, Robustness, and Artificial intelligence.

The live Springer article page describes CTI-Thinker as cyber threat intelligence research motivated by APT attacks. Source-review signals include CTI knowledge graph construction, semantic alignment to ATT&CK, in-context learning, LoRA-based fine-tuning, vector-based alignment, GraphRAG-style reasoning, entity recognition, relation extraction, threat reasoning, evaluation questions, benchmark datasets, precision/recall/F1 metrics, repeated runs, known limitations, and future work around provenance and attack-chain interpretability.

These are relevant adversarial-regression signals because AMC must preserve failures as replayable, release-blocking evidence. They do not justify copying CTI data, ingesting threat reports, importing ATT&CK resources, or adding an AMC CTI reasoning product.

No article text beyond short metadata facts, PDF content, figures, tables, benchmark rows, CTI reports, ATT&CK data, GitHub code, README prose, prompts, datasets, examples, configs, generated outputs, model responses, exploit content, or implementation details were copied into AMC.

## Relevance decision

`GAP-0981` is relevant to AMC through the existing adversarial regression primitive in replay benchmark corpus receipts. A valid AMC adversarial regression row requires an exploit fixture, expected decision, actual decision, rerun output, release gate receipt, signed evidence refs, row hash, source refs, and CI/lifecycle receipt. For this source, the accepted mapping is a synthetic CTI-style regression fixture that proves the generic AMC release-gate behavior without storing CTI reports or attack procedures.

The source is not a request to build CTI-Thinker inside AMC. CTI-Thinker metadata, DOI reachability, Springer article availability, OpenAlex concepts, ATT&CK labels, GraphRAG labels, entity-extraction metrics, relation-extraction metrics, or author claims cannot stand in for AMC-owned adversarial regression proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable adversarial regression rows tied to signed evidence and score deltas. |
| Shield | Relevant when the expected decision blocks unsafe release; no CTI-Thinker Shield verifier was added. |
| Watch | Relevant through CI/lifecycle receipts and high-severity alerts for regressed rows; no live CTI monitor changed. |
| Enforce | No runtime guardrail, policy engine, or circuit breaker changed. |
| Vault | No CTI reports, ATT&CK data, prompts, datasets, article content, or secure-storage behavior changed. |
| Fleet | No multi-agent topology, attack-reasoning orchestrator, or fleet evidence changed. |
| Passport | Existing replay receipts can feed proof bundles, but no Passport schema changed. |
| Comply | Cybersecurity context only; no compliance mapping changed. |

## Product closure

No `src/benchmarks/replayBenchmarkCorpus.ts`, `src/assurance/assuranceRunner.ts`, `src/redteam/runner.ts`, `src/shield/runtimeAnalyzer.ts`, API, CLI, Studio, methodology, badge, diagnostic question bank, or scoring code changed for GAP-0981.

The focused regression exercises existing `runReplayBenchmarkCorpus` and `renderReplayBenchmarkCorpusMarkdown` behavior with a positive CTI-style synthetic adversarial regression packet and a negative source-metadata-only packet. The positive path requires exploit fixture, expected decision, actual decision, rerun output hash, release gate receipt, taxonomy refs, engine evaluation evidence, signed evidence refs, source refs, row hash, and CI gate proof. The negative path fails closed when OpenAlex/DOI/Springer metadata replaces adversarial regression proof.

## Fail-closed rule

OpenAlex reachability, DOI redirects, Springer article reachability, Cybersecurity journal metadata, Springer Nature metadata, open access PDF URL, code-availability URL, author lists, publication dates, concept tags, APT attacks labels, cyber threat intelligence labels, ATT&CK labels, in-context learning labels, LoRA labels, vector-based alignment labels, GraphRAG labels, entity recognition labels, relation extraction labels, threat reasoning labels, benchmark dataset labels, precision/recall/F1 labels, repeated-run labels, known-limitation labels, local backlog metadata, or source identity alone must fail closed for adversarial benchmark regression.

Passing adversarial regression evidence requires an AMC-owned exploit fixture, expected decision, actual decision, rerun output hash, release gate receipt, signed evidence refs, source refs, row hash, CI/lifecycle receipt, and no-copy proof.

## No-bloat boundary

No CTI-Thinker importer, CTI dataset loader, ATT&CK importer, ATT&CK alignment engine, threat-report parser, GraphRAG subsystem, knowledge-graph builder, LoRA workflow, vector-alignment module, attack-reasoning engine, CTI benchmark runner, exploit harness, Springer scraper, OpenAlex importer, DOI resolver, PDF importer, GitHub source mirror, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, diagnostic question-bank migration, package dependency, source-specific implementation module, or source-specific adversarial regression path was added.

No article text beyond short metadata facts, PDF content, figures, tables, benchmark rows, CTI reports, ATT&CK data, GitHub code, README prose, prompts, datasets, examples, configs, generated outputs, model responses, exploit content, or implementation details were copied.

## Verification

- Expected-red regression: `npx vitest run tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts --reporter=dot` failed before this document existed, with 3 adversarial-regression primitive tests passing and 1 missing-document assertion failing.
- Focused regression: `npx vitest run tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0980LlmAgentOptimizationSurveyPublicMethodologyBoundary.test.ts tests/gap0981CtiThinkerAdversarialRegressionBoundary.test.ts --reporter=dot` passed, 2 files / 7 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` passed, 828 files / 7,310 tests.
