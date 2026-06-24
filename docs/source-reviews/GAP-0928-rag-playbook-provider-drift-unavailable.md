# GAP-0928 - rag-playbook provider-drift unavailable-source boundary

- Gap: `GAP-0928`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `anusky95/rag-playbook`, `https://github.com/anusky95/rag-playbook`
- Retrieval: `2026-06-22` via live web/search attempts plus shell GitHub/API checks; shell network remains DNS-restricted in this environment.
- Status: source unavailable; skipped as provider-drift implementation evidence.

## Live retrieval result

The local backlog identifies the source as `rag-playbook`, repository `anusky95/rag-playbook`, URL `https://github.com/anusky95/rag-playbook`, and describes it as `The ultimate open-source RAG (Retrieval-Augmented Generation) system`, a TRUST framework for enterprise AI, production-grade demos, and end-to-end retrieval, evaluation, and governance. The row classifies the gap as provider/model drift for Score, Shield, and Watch.

During this pass, live retrieval did not produce a reachable primary GitHub source page or independent source page:

- GitHub repository page retrieval for `https://github.com/anusky95/rag-playbook` returned no usable page content through the web channel.
- GitHub Search/API path checks for `anusky95/rag-playbook`, `rag-playbook TRUST framework`, and the backlog description returned no usable primary/source result through the web channel.
- Shell `git ls-remote https://github.com/anusky95/rag-playbook.git HEAD` failed with `Could not resolve host: github.com`.
- Shell `curl https://api.github.com/repos/anusky95/rag-playbook` failed with `Could not resolve host: api.github.com`.
- Shell `curl https://raw.githubusercontent.com/anusky95/rag-playbook/main/README.md` failed with `Could not resolve host: raw.githubusercontent.com`.

The repository may be removed, private, renamed, temporarily unreachable, or unavailable from this sandbox. AMC cannot treat the local metadata as provider-drift evidence without a reachable source and reviewable method/evidence details. No upstream README prose beyond minimal local metadata facts, examples, prompts, datasets, notebooks, screenshots, configs, model outputs, benchmark rows, governance assets, or implementation details were copied into AMC.

## Relevance decision

Provider/model drift is relevant to AMC through existing Score, Shield, and Watch primitives when AMC has a reproducible eval pack, signed evidence refs, provider/model version, canary results, drift statistics, alert or waiver, CI/lifecycle gate receipts, and no-copy proof. GAP-0928 does not supply those facts because the cited GitHub repository was unavailable during live verification.

Therefore GAP-0928 is closed as a documented skip. The source is not rejected because RAG provider drift is irrelevant; it is rejected because unavailable repository metadata alone cannot substantiate an AMC provider-drift implementation or claim.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Provider-drift scoring remains relevant only through AMC-owned eval-pack evidence; unavailable repository metadata does not change scoring. |
| Shield | No assurance, red-team, safety, or threat-detection proof can be derived from an unreachable source. |
| Watch | Watch canary/drift receipts remain the accepted path; no source-specific monitor was added. |
| Enforce | No runtime guardrail, policy, circuit breaker, or provider blocklist behavior changed. |
| Vault | No secrets, DLP, privacy, data-residency, or secure-storage behavior changed. |
| Fleet | No RAG framework or evaluation orchestration adapter changed. |
| Passport | No portable proof-bundle field, token, or external credential changed. |
| Comply | No compliance mapping, audit control, or governance claim changed. |

## Product closure

No `src/benchmarks/providerDriftBenchmark.ts`, `src/watch/providerDriftAlerts.ts`, `src/api/benchmarkRouter.ts`, API, CLI, Studio, Watch monitor, Shield verifier, or scoring code changed for GAP-0928. Existing AMC provider-drift primitives remain the only accepted path for a provider/model drift claim.

The source-review closure is the product boundary: source unavailable, skipped as provider-drift implementation evidence, with tests ensuring source-specific identifiers stay out of provider-drift implementation modules.

## Fail-closed rule

Unavailable repository metadata alone must fail closed for provider/model drift claims. Local backlog metadata, repository slug, source URL, description text, stars/language/topic metadata, source identity, category labels, generated gap wording, or partial source snippets are not enough to pass. Passing evidence requires a reachable source plus AMC-owned provider version, canary results, drift statistic, alert or waiver, signed evidence refs, eval-pack row hashes, CI/lifecycle gate receipts, and no-copy proof.

## No-bloat boundary

No rag-playbook adapter, RAG playbook importer, TRUST framework module, enterprise AI governance module, notebook runner, provider wrapper, evaluation runner, retrieval pipeline, governance asset importer, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream examples, prompts, datasets, notebooks, screenshots, configs, model outputs, benchmark rows, governance assets, docs prose, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0928RagPlaybookProviderDriftUnavailableBoundary.test.ts --reporter=dot` failed because this source-review doc did not exist; the provider-drift implementation leakage check already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0928RagPlaybookProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0927RagFrameworkEvaluationPublicMethodologyBoundary.test.ts tests/gap0928RagPlaybookProviderDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
