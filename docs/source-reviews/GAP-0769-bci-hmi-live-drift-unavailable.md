# GAP-0769 - BCI/HMI live-drift unavailable-source boundary

- Gap: `GAP-0769`
- Dimension: `obs-live-drift-alerts`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: backlog OpenAlex `W7127134078`, DOI `10.3389/fncom.2026.1780276`, and title `Editorial: The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research`
- Retrieval: `2026-06-21` via browser search and direct DOI attempt; exact-title and DOI searches did not surface a reachable primary source in this environment, and direct DOI opening was blocked by browser safety constraints. Shell network remains DNS-restricted in this environment.
- Status: closed through existing live score and behavior drift receipts; no BCI/HMI, neuroscience, or Industry 4.0 subsystem added.

## Live source metadata

The local backlog identifies an editorial titled `The convergence of AI, LLMs, and industry 4.0: enhancing BCI, HMI, and neuroscience research`, DOI `10.3389/fncom.2026.1780276`, OpenAlex work `W7127134078`, improvement dimension live score and behavior drift alerts, category `Agent evaluation and benchmarks`, and concepts including software deployment, cognition, cognitive science, human-computer interaction, counterfactual thinking, and scalability. The backlog abstract snippet frames the source around models that infer and adapt to human state.

Browser verification on `2026-06-21` could not reach a primary publisher page or OpenAlex page: exact-title and DOI searches did not surface a reachable primary source in this environment, and the direct DOI URL was blocked. These metadata facts are relevant to AMC only as live-drift context for adaptive human-state, BCI, HMI, neuroscience, and Industry 4.0 agents. They do not justify copying the editorial, importing BCI/HMI data, adding neuroscience workflows, or claiming human-state adaptation capability. No upstream editorial prose, abstract text beyond local backlog metadata, BCI/HMI data, neuroscience data, sensor streams, human-state traces, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0769 is relevant to AMC through existing Watch live score and behavior drift receipts because adaptive human-interface agents can degrade after traffic, prompt, provider, sensor, context, or deployment changes. The accepted AMC primitive is already `runLiveScoreBehaviorDrift` with baseline/live windows, behavior signatures, drift statistics, source refs, signed evidence refs, Watch alerts, and receipt verification.

The source can be retained only as context when the live-drift packet carries AMC-owned baseline rows, live rows, score distributions, behavior signatures, evidence refs, signed evidence refs, row hashes, receipt hash, alert receipt, and no-copy proof. DOI/OpenAlex/title metadata, BCI labels, HMI labels, neuroscience labels, human-state labels, or Industry 4.0 labels alone must fail closed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing baseline/live score distribution comparisons for adaptive human-interface agents. |
| Shield | Relevant through fail-closed checks for missing signed evidence and unsupported BCI/HMI, human-state, or neuroscience claims. |
| Watch | Relevant through existing live score and behavior drift alert receipts. |
| Enforce | No runtime BCI, HMI, neuroscience, sensor, or human-state policy changed. |
| Vault | No sensor streams, human-state data, prompts, or secure-storage behavior changed. |
| Fleet | Human-interface context only; no orchestration or trust topology changed. |
| Passport | No portable proof-bundle field or external benchmark credential changed. |
| Comply | Human-subject/neuroscience context only; no compliance mapping changed. |

## Product closure

GAP-0769 is closed by documenting the unavailable-source boundary and adding regression coverage over the existing live-drift primitive. The positive path proves that BCI/HMI drift context can be cited only with AMC-owned baseline/live rows, behavior signatures, source refs, signed evidence, Watch alert projection, and receipt verification. The negative path proves DOI/OpenAlex/title/BCI/HMI metadata fails closed.

No `src/watch/liveDriftAlerts.ts`, `src/drift/continuousMonitor.ts`, `src/score/index.ts`, API route, CLI command, Studio panel, Watch monitor, Shield verifier, BCI/HMI subsystem, neuroscience workflow, human-state adaptation engine, sensor importer, Industry 4.0 adapter, methodology version, diagnostic question bank, or scoring behavior changed for GAP-0769.

## Fail-closed rule

OpenAlex work ID, DOI, title, BCI labels, HMI labels, neuroscience labels, Industry 4.0 labels, human-computer-interaction labels, human-state adaptation labels, software-deployment labels, cognitive-science labels, counterfactual-thinking labels, scalability labels, local backlog metadata, or source identity alone must fail closed for live-drift claims. Passing evidence requires AMC-owned baseline and live sample rows, score distributions, behavior signatures, evidence refs, signed evidence refs, receipt hash, Watch alert or waiver, and CI/lifecycle gate proof.

## No-bloat boundary

No BCI/HMI subsystem, neuroscience workflow, human-state adaptation engine, sensor importer, editorial importer, Frontiers importer, OpenAlex importer, Industry 4.0 adapter, benchmark mirror, source-specific drift lens, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Passport field, methodology version bump, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream editorial prose, abstract text beyond local backlog metadata, BCI/HMI data, neuroscience data, sensor streams, human-state traces, prompts, model outputs, benchmark rows, figures, tables, code, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0769BciHmiLiveDriftUnavailableBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
