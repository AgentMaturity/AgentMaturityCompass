# GAP-0773 - LLAMATOR metric-validity boundary

- Gap: `GAP-0773`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub `https://github.com/LLAMATOR-Core/llamator`, README `https://github.com/LLAMATOR-Core/llamator/blob/release/README.md`, `pyproject.toml`, `LICENSE.md`
- Retrieval: `2026-06-21` via GitHub connector fetch on default branch `release`; `LICENSE` path returned 404 and `LICENSE.md` was present.
- Status: closed through existing metric-validity receipts; no LLAMATOR runner, attack library, chatbot connector, or red-team framework integration added.

## Live source metadata

The live README identifies LLAMATOR as a red-teaming Python framework for testing chatbots and GenAI systems. It documents installation via `pip install llamator==3.5.0`, documentation, guides, examples for RAG bot testing, Gandalf web bot testing, Telegram bot testing, WhatsApp bot testing, LangChain custom attacks, vision model attacks, and Docker. Supported clients include LangChain clients, OpenAI-like APIs, and custom classes. Feature signals include custom attacks and datasets, attacks on LLMs/RAGs/agents/VLMs in English and Russian, custom chat-client configuration, attack request/response history in Excel/CSV, and DOCX test reports.

Security taxonomy signals include OWASP prompt injection/jailbreaks, system-prompt leakage, misinformation, and unbounded consumption. The `pyproject.toml` shows Python tooling configuration for tests, mypy, pylint, and Bandit. The license metadata is Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International in `LICENSE.md`.

These facts are relevant to AMC as metric-validity and reliability context only. A red-team framework can produce impressive security results while lacking construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. The repository does not justify importing LLAMATOR, copying attack definitions, adding chatbot connectors, or changing public methodology. No upstream README prose beyond minimal metadata facts, attack content, examples, notebooks, configs, code, reports, prompts, model outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0773 is relevant to AMC through existing metric validity and reliability checks because red-team, jailbreak, hallucination, RAG-evaluation, and GenAI-security claims need validated measurement proof before they affect Score, Shield, or Watch. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this repository can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. GitHub/README/pyproject/license/topic metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported red-team, jailbreak, attack-library, or security-toolkit claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime prompt-injection, jailbreak, attack, or red-team enforcement behavior changed. |
| Vault | No payloads, prompts, attack logs, chatbot transcripts, or secure-storage behavior changed. |
| Fleet | Security testing context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | OWASP references are source context only; no compliance mapping changed. |

## Product closure

GAP-0773 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that LLAMATOR-style red-team context can be cited only with AMC-owned validation evidence. The negative path proves GitHub/README/pyproject/license metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, LLAMATOR runner, attack library, chatbot connector, LangChain connector, Selenium/Telegram/WhatsApp connector, report importer, OWASP adapter, methodology version, or scoring behavior changed for GAP-0773.

## Fail-closed rule

GitHub URL, README text, pyproject metadata, license metadata, repository name, topic labels, star counts, LLAMATOR labels, red-team labels, attack labels, jailbreak labels, RAG-evaluation labels, OWASP labels, example notebook labels, custom-client labels, Excel/CSV/DOCX report labels, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No LLAMATOR runner, attack library, chatbot connector, LangChain connector, Selenium connector, Telegram connector, WhatsApp connector, VLM attack runner, Docker wrapper, report importer, OWASP adapter, repository mirror, GitHub importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, attack content, examples, notebooks, configs, code, reports, prompts, model outputs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0773LlamatorMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
