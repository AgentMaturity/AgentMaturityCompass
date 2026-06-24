# GAP-0767 - AI penetration-testing metric-validity boundary

- Gap: `GAP-0767`
- Dimension: `eval-metric-validity`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: GitHub `https://github.com/Mr-Infect/AI-penetration-testing`, README `https://github.com/Mr-Infect/AI-penetration-testing/blob/main/README.md`
- Retrieval: `2026-06-21` via GitHub connector fetch; `LICENSE` and `requirements.txt` path checks returned 404.
- Status: closed through existing metric-validity receipts; no AI penetration-testing toolkit, prompt-injection payload library, or red-team framework integration added.

## Live source metadata

The live README identifies the repository as an AI, ML, and LLM penetration-testing toolkit by `Mr-Infect`, with focus areas including AI penetration testing, prompt injection, LLM security, red-team AI, and ethical hacking. The README describes offensive and defensive security context for systems such as ChatGPT, Claude, and LLaMA; target users include cybersecurity engineers, red teamers, AI/ML researchers, and ethical hackers.

Relevant source-review signals include AI/ML lifecycle literacy, prompt injection, jailbreaking and output overwriting, sensitive information leakage, vector-store attacks, retrieval manipulation, model-weight poisoning, data supply-chain attacks, plugin abuse, multimodal attack vectors, OWASP LLM Top 10, model hallucination, excessive agency, system-prompt leakage, misinformation, token-abuse DoS, MITRE ATLAS, Lakera Gandalf, AI Goat, PromptTrace, payload libraries, case studies, and an authorized-use disclaimer. The checked `LICENSE` and `requirements.txt` paths were not present.

These facts are relevant to AMC as metric-validity and reliability context only. A security-toolkit catalog can make agent maturity scores look persuasive while lacking construct validity, reliability checks, sample size, confidence intervals, metric ownership, signed evidence, row hashes, regression thresholds, and no-copy proof. The repository does not justify importing payloads, mirroring tool lists, adding attack runners, or changing public methodology. No upstream README prose beyond minimal metadata facts, payloads, linked resources, examples, configs, code, security content, or implementation details were copied into AMC.

## Relevance decision

GAP-0767 is relevant to AMC through existing metric validity and reliability checks because red-team and AI-pentest claims need validated measurement proof before they affect Score, Shield, or Watch. The accepted AMC primitive is already `buildMetricValidationReport`.

A source citation to this repository can be retained only as context when the validation packet carries AMC-owned signed evidence, validation facets, process evidence, outcome alignment, confidence interval, sample size, metric owner, row hashes, and CI/lifecycle gate receipts. GitHub/README/title/topic metadata alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing metric-validity reports with validation table, confidence interval, sample size, metric owner, and signed evidence. |
| Shield | Relevant through fail-closed handling for unsupported red-team, prompt-injection, payload, or security-toolkit claims. |
| Watch | Relevant when metric validation is tied to regression thresholds or lifecycle receipts; no live monitor changed. |
| Enforce | No runtime prompt-injection, jailbreak, payload, or red-team enforcement behavior changed. |
| Vault | No payloads, prompts, secrets, attack data, or secure-storage behavior changed. |
| Fleet | Security tooling context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field or credential changed. |
| Comply | OWASP/MITRE references are source context only; no compliance mapping changed. |

## Product closure

GAP-0767 is closed by documenting the live-source boundary and adding regression coverage over the existing metric-validity primitive. The positive path proves that AI-pentest context can be cited only with AMC-owned validation evidence. The negative path proves GitHub/README/title/topic metadata fails closed.

No `src/score/metricValidity.ts`, `src/diagnostic`, docs methodology page, API, CLI, Studio, diagnostic question bank, Watch monitor, Shield verifier, AI penetration-testing toolkit, prompt-injection payload library, red-team runner, MITRE/OWASP adapter, payload importer, repository mirror, source-specific metric lens, or scoring behavior changed for GAP-0767.

## Fail-closed rule

GitHub URL, README text, repository name, owner, topic labels, star counts, AI-pentest labels, prompt-injection labels, jailbreak labels, OWASP LLM Top 10 labels, MITRE ATLAS labels, payload-library labels, red-team labels, authorized-use disclaimers, local backlog metadata, or source identity alone must fail closed for metric-validity claims. Passing evidence requires AMC-owned validation table artifacts, confidence interval, sample size, metric owner, construct-validity mapping, process evidence, outcome alignment, signed evidence refs, row hashes, regression thresholds, CI or lifecycle receipts, and no-copy proof.

## No-bloat boundary

No AI penetration-testing toolkit, prompt-injection payload library, red-team runner, jailbreak library, payload importer, OWASP LLM Top 10 adapter, MITRE ATLAS adapter, Lakera Gandalf adapter, AI Goat adapter, PromptTrace adapter, repository mirror, GitHub importer, source-specific metric lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, payloads, linked resources, examples, configs, code, security content, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0767AiPenetrationTestingMetricValidityBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
