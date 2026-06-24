# GAP-0830 - LLaMP provider-drift boundary

- Gap: `GAP-0830`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `chiang-yuan/llamp`, `https://github.com/chiang-yuan/llamp`, `https://aclanthology.org/2025.emnlp-main.1280/`, DOI `10.18653/v1/2025.emnlp-main.1280`, `https://arxiv.org/abs/2401.17244`
- Retrieval: `2026-06-21` via live GitHub header, GitHub repository API, ACL Anthology, and arXiv checks. Repository URL returned HTTP/2 200. GitHub API returned README.md and LICENSE metadata. LICENSE is reported by GitHub as `NOASSERTION`. Direct `raw.githubusercontent.com` DNS lookup failed in this shell. ACL Anthology returned HTTP/1.1 200 earlier in the shell and the live page was reviewed. arXiv returned HTTP/2 200.
- Status: closed through existing provider-drift benchmark receipts; no LLaMP integration, Materials Project adapter, materials-informatics RAG runtime, atomistic simulation runner, Python API wrapper, web-app mirror, or source-specific provider-drift adapter added.

## Live source metadata

The live repository and paper sources identify `LLaMP: Large Language Model Made Powerful for High-fidelity Materials Knowledge Retrieval`. The ACL Anthology page lists EMNLP 2025, DOI `10.18653/v1/2025.emnlp-main.1280`, and authors Yuan Chiang, Elvis Hsieh, Chia-Hong Chou, and Janosh Riebesell.

Relevant source-review signals include a hierarchical multi-agent framework, Materials Project grounding, multimodal retrieval-augmented generation for materials informatics, optional atomistic simulations, uncertainty and confidence handling, self-consistency, a Python API, a web app, and notebook-style examples. The README.md also points to `https://arxiv.org/abs/2401.17244` and describes a modular, extensible codebase.

These facts are provider/model drift context only. They do not authorize copying upstream code, notebooks, API shapes, web UI behavior, Materials Project interactions, atomistic simulation recipes, prompts, generated answers, examples, datasets, figures, tables, screenshots, README prose, or license prose into AMC.

## Relevance decision

GAP-0830 is relevant to AMC because materials RAG and tool-using multi-agent workflows can change when a provider, model, route, retrieval index, tool backend, simulation path, evaluator config, or prompt changes. The gap maps to AMC's existing provider/model drift benchmark primitive: provider version, canary results, drift statistic, alert or waiver, signed evidence refs, replayable eval-pack rows, observability proof, and CI gate proof.

It does not require a LLaMP runner, Materials Project adapter, scientific RAG subsystem, notebook runner, atomistic simulation runner, paper importer, ACL importer, arXiv importer, API route, CLI command, Studio panel, or methodology version bump. Repository metadata and paper metadata explain why provider drift matters for this source family, but they cannot replace AMC-owned provider-drift evidence.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score distributions, canary rows, eval packs, and CI gate proof. |
| Shield | Relevant because provider/model drift claims fail closed without signed evidence and evaluation-framework proof. |
| Watch | Relevant through provider-drift alerts, drift statistics, observability proof, and alert or waiver evidence. |
| Enforce | No runtime provider route, Materials Project access policy, retrieval policy, or circuit breaker changed. |
| Vault | No materials data, API keys, prompts, notebooks, simulation outputs, or secure-storage behavior changed. |
| Fleet | Multi-agent workflow context only; no orchestration topology, routing layer, or agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | Scientific benchmark context only; no EU AI Act, NIST, ISO, SOC2, or research-compliance mapping changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, LLaMP integration, Materials Project adapter, materials-informatics RAG runtime, atomistic simulation runner, Python API wrapper, web-app mirror, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0830.

The focused regression exercises the existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, Watch alert projection, and CI gate path. The positive path requires provider version, canary results, drift statistic, signed evidence, replayable eval-pack rows, observability proof, and CI gate proof. The negative path fails closed when repository and paper metadata replace AMC-owned provider-drift evidence.

## Fail-closed rule

Repository URL, GitHub HTTP/2 200 reachability, README.md presence, LICENSE presence, `NOASSERTION` license classification, raw.githubusercontent.com DNS lookup failed, ACL Anthology page, EMNLP 2025 label, DOI, arXiv URL, LLaMP title, author list, hierarchical multi-agent framework label, Materials Project label, atomistic simulations label, uncertainty and confidence label, self-consistency label, Python API label, web-app label, notebook label, local backlog metadata, or source identity alone must fail closed for provider/model drift claims.

Passing evidence requires AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, evaluation-framework proof, observability pipeline proof, replayable eval-pack rows, CI gate proof, source refs, row hashes, and no-copy proof.

## No-bloat boundary

No LLaMP integration, Materials Project adapter, materials-informatics RAG runtime, atomistic simulation runner, Python API wrapper, web-app mirror, notebook runner, paper importer, ACL importer, arXiv importer, dataset mirror, benchmark mirror, provider wrapper, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream code, notebooks, API shapes, web UI behavior, Materials Project interactions, atomistic simulation recipes, prompts, generated answers, examples, datasets, figures, tables, screenshots, README prose, or license prose were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0830LlampProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
