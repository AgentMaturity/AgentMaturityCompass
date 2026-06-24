# GAP-0961 - AutoML-Pipeline provider-drift boundary

- Gap: `GAP-0961`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://doi.org/10.1109/access.2026.3673923`, `https://ieeexplore.ieee.org/document/11433654/`, `https://openalex.org/W7135172733`, `https://api.openalex.org/works/W7135172733`
- Retrieval: `2026-06-22` via DOI HEAD, IEEE Xplore web page, OpenAlex API HEAD, and local backlog metadata cross-check. DOI returned HTTP/2 302 to IEEE Xplore document 11433654. IEEE Xplore document 11433654 opened through the web channel but returned a JavaScript is disabled / not a robot gate. OpenAlex API HEAD returned HTTP/2 200. OpenAlex API body retry failed with DNS ENOTFOUND in the local shell after the successful HEAD probe.
- Status: closed through existing provider/model drift benchmark receipts; no AutoML-Pipeline importer, IEEE parser, DOI importer, OpenAlex importer, paper-runner, RAG code-generation harness, pre-validation subsystem, cloud-native ML workflow adapter, or source-specific provider-drift path added.

## Live source metadata

The backlog row and DOI identify the source as `AutoML-Pipeline: A RAG-Enhanced Code Generation Framework With Pre-Validation for Cloud-Native Machine Learning Workflows`, linked to DOI `https://doi.org/10.1109/access.2026.3673923`, IEEE Xplore document `https://ieeexplore.ieee.org/document/11433654/`, OpenAlex work `https://openalex.org/W7135172733`, and OpenAlex API `https://api.openalex.org/works/W7135172733`.

The DOI live probe confirmed the DOI redirects to IEEE Xplore document 11433654. The IEEE page itself did not expose article content in this environment because it returned a JavaScript is disabled / not a robot gate. The OpenAlex HEAD probe confirmed the API work endpoint exists, but the OpenAlex API body retry failed with DNS ENOTFOUND, so the local backlog abstract remains metadata-only and cannot be used as product evidence.

The local OpenAlex 2026 metadata row names the paper around a RAG-Enhanced Code Generation Framework, Pre-Validation, and Cloud-Native Machine Learning Workflows. Its local concept metadata includes Computer science, Workflow, Code generation, Code (set theory), Artificial intelligence, Programming language, Machine learning, and Software engineering. Those terms are source-review context only.

No paper prose, IEEE article content, OpenAlex abstract body, code snippets, generated code, benchmark rows, workflow definitions, prompts, pre-validation examples, datasets, figures, tables, cloud configs, API details, or implementation details were copied into AMC.

## Relevance decision

This source is relevant to AMC only as provider/model drift context for code-generation agents and cloud-native ML workflow agents. A model or provider update can change generated workflow quality, pre-validation pass rate, unsafe-action refusal behavior, invalid action rate, latency, and cost. That maps to AMC's existing provider/model drift primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

The available live evidence does not justify a paper importer, IEEE parser, OpenAlex metadata adapter, AutoML-Pipeline runner, RAG code-generation harness, pre-validation subsystem, cloud-native ML workflow adapter, provider wrapper, API route, CLI command, Studio panel, or public methodology change. Source metadata can label why provider drift matters, but it cannot replace AMC-owned canary rows and signed evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through provider-drift score distribution canaries and replayable eval-pack rows for code-generation workflow stability. |
| Shield | Relevant because cloud-native code generation can affect unsafe-action/refusal/guardrail behavior, but only signed AMC evidence can pass. |
| Watch | Relevant through drift statistics, Watch alert projection, alert or waiver proof, and CI/lifecycle gate evidence. |
| Enforce | No runtime code-generation policy, deployment gate, or circuit breaker changed. |
| Vault | No secrets, cloud credentials, data residency, or secure-storage behavior changed. |
| Fleet | Workflow-agent context only; no Fleet orchestration, topology, or router changed. |
| Passport | Existing provider-drift receipts may feed proof bundles, but no Passport schema changed. |
| Comply | Cloud-native ML context only; no compliance mapping changed. |

## Product closure

No product code changed for GAP-0961. The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior.

The positive path proves AutoML-Pipeline-style code-generation workflow context can be cited only when AMC-owned canary rows include provider version, canary results, drift statistic inputs, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, replayable eval-pack rows, row hashes, Watch alert projection, and CI gate proof. The negative path fails closed when DOI, IEEE, OpenAlex, paper title, local concept metadata, or local backlog abstract metadata replaces signed provider-drift evidence.

## Fail-closed rule

DOI, IEEE Xplore document 11433654, OpenAlex work ID, OpenAlex API URL, title, OpenAlex 2026 metadata, RAG-Enhanced Code Generation Framework label, Pre-Validation label, Cloud-Native Machine Learning Workflows label, Computer science label, Workflow label, Code generation label, Code (set theory) label, Artificial intelligence label, Programming language label, Machine learning label, Software engineering label, JavaScript/not-a-robot gated IEEE page, local backlog abstract, or source identity alone must fail closed.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, regression thresholds, row hashes, and CI or lifecycle gate proof.

## No-bloat boundary

No AutoML-Pipeline importer, IEEE parser, DOI importer, OpenAlex importer, paper-runner, RAG code-generation harness, pre-validation subsystem, cloud-native ML workflow adapter, generated-code evaluator, workflow executor, provider wrapper, source-specific benchmark path, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, public methodology version bump, badge migration, package dependency, or diagnostic question-bank migration was added.

No paper prose, IEEE article content, OpenAlex abstract body, code snippets, generated code, benchmark rows, workflow definitions, prompts, pre-validation examples, datasets, figures, tables, cloud configs, API details, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0961AutoMlPipelineProviderDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0960LiteralAiProviderDriftBoundary.test.ts tests/gap0961AutoMlPipelineProviderDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
