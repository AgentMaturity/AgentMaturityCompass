# GAP-0831 - FERPA compliance-training live-drift boundary

- Gap: `GAP-0831`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://openalex.org/W7161011426`, `https://doi.org/10.1145/3768310.3807798`, `https://dl.acm.org/doi/10.1145/3768310.3807798`
- Retrieval: `2026-06-21` via live DOI, ACM, OpenAlex, Crossref, and Semantic Scholar checks. DOI returned HTTP/2 302 to `https://dl.acm.org/doi/10.1145/3768310.3807798`. ACM returned HTTP/2 403 behind Cloudflare. OpenAlex page returned HTTP/2 403. api.openalex.org DNS lookup failed. api.crossref.org DNS lookup failed. api.semanticscholar.org DNS lookup failed.
- Status: closed through existing Watch live score and behavior drift receipts; no FERPA tutor, compliance-training agent, education workflow, ACM importer, OpenAlex importer, DOI resolver, or source-specific live-drift monitor added.

## Live source metadata

The source row and DOI identify `Enhancing Compliance Training with LLM-Powered Conversational Agents: A Design Science Evaluation of FERPA Education`. The live DOI resolved to ACM, but the publisher page and metadata endpoints were blocked or unavailable from this shell. The local metadata signal therefore remains limited to Compliance training, FERPA, LLM-Powered Conversational Agents, Design Science Evaluation, and training traces context.

These facts are useful for relevance only: compliance-training conversational agents can degrade after traffic, provider, prompt, content, policy, or data changes. They do not prove any AMC score, alert, FERPA education outcome, training effectiveness, legal/compliance readiness, or behavioral stability claim.

No upstream article prose, ACM content, abstracts beyond local metadata snippets, evaluation instruments, training materials, FERPA examples, prompts, participant data, generated conversations, tables, figures, screenshots, or methods were copied into AMC.

## Relevance decision

GAP-0831 is relevant to AMC only through existing Watch live score and behavior drift primitives. A compliance-training agent may need monitoring for score drops, behavior changes, refusal shifts, latency shifts, cost shifts, or missing evidence after a production/provider/content change.

The acceptable closure is generic and evidence-led: baseline distribution, live sample, drift statistic, alert receipt, source refs, signed evidence refs, row hashes, behavior signatures, receipt hash, Watch alert or waiver proof, and no-copy proof. DOI reachability, OpenAlex identity, ACM page identity, title text, FERPA label, compliance-training label, or local metadata alone fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distributions tied to signed row evidence. |
| Shield | Relevant through fail-closed signed evidence requirements before compliance-training behavior claims can pass. |
| Watch | Relevant through existing drift statistics, alert receipts, receipt hashes, and Watch alert projection. |
| Enforce | No runtime FERPA policy, training policy, prompt policy, or circuit breaker changed. |
| Vault | No student records, FERPA data, training records, prompts, or secure-storage behavior changed. |
| Fleet | Conversational-agent context only; no orchestration topology or multi-agent runtime changed. |
| Passport | No portable trust token or proof-bundle schema changed. |
| Comply | FERPA context only; no compliance framework mapping, legal interpretation, or training certification changed. |

## Product closure

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, FERPA tutor, compliance-training agent, education workflow, ACM importer, OpenAlex importer, DOI resolver, methodology version, diagnostic question bank, or scoring semantics changed for GAP-0831.

The focused regression exercises the existing Watch live-drift engine with compliance-training-style fixture data. The positive path emits score, behavior, latency, and cost Watch alerts with a valid signed live-drift receipt. The negative path fails closed when paper/source metadata replaces signed live-drift evidence.

## Fail-closed rule

DOI returned HTTP/2 302, ACM returned HTTP/2 403, OpenAlex page returned HTTP/2 403, api.openalex.org DNS lookup failed, api.crossref.org DNS lookup failed, api.semanticscholar.org DNS lookup failed, title text, OpenAlex id, DOI, ACM URL, Compliance training label, FERPA label, LLM-Powered Conversational Agents label, Design Science Evaluation label, training traces label, local backlog metadata, or source identity alone must fail closed for live-drift claims.

Passing evidence requires AMC-owned baseline distribution, live sample rows, drift statistic, alert receipt, source refs, signed evidence refs, row hashes, behavior signatures, receipt hash, Watch alert or waiver proof, and no-copy proof.

## No-bloat boundary

No FERPA tutor, compliance-training agent, education workflow, ACM importer, OpenAlex importer, DOI resolver, Crossref importer, Semantic Scholar importer, paper mirror, prompt importer, training-content importer, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, source-specific metric lens, or source-specific scoring path was added. No upstream article prose, ACM content, evaluation instruments, training materials, FERPA examples, prompts, participant data, generated conversations, tables, figures, screenshots, or methods were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0831FerpaComplianceTrainingLiveDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
