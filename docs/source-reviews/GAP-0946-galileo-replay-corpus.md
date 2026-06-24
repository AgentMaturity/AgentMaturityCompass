# GAP-0946 — Galileo replayable benchmark corpus

- Gap: `GAP-0946`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: Galileo homepage and public docs
- Retrieval: live Galileo homepage at `https://www.galileo.ai`, redirected canonical page `https://galileo.ai/`, documentation page `https://docs.galileo.ai/what-is-galileo`
- Status: Done

## Relevance decision

Relevant, but only through AMC's existing eval replay corpus receipt path. The live Galileo homepage says "Don't just monitor AI failures. Stop them." and frames Galileo as the place where offline evals become production guardrails. That is relevant to AMC because replayable benchmark evidence must connect datasets, fixtures, fixed seeds, score deltas, signed evidence, and CI receipts before Score, Shield, or Watch claims are accepted.

This gap does not justify a Galileo adapter, dataset importer, trace importer, guardrail runner, Luna model integration, metrics mirror, MCP client, or hosted workflow clone. AMC closure is the generic proof boundary: source-linked context is accepted only when the replay manifest, fixture hash, fixed seed, score delta, and CI receipt are AMC-owned and signed.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayable benchmark rows and score delta receipts. |
| Shield | Relevant because replay evidence must fail closed before it becomes assurance proof. |
| Enforce | Context only; no runtime guardrail or policy enforcement changed. |
| Vault | Not in scope; no dataset store, secret, privacy, or data-residency behavior changed. |
| Watch | Relevant through replay evidence that can be tied to observed production traces and drift workflows. |
| Fleet | Not in scope; no orchestration or fleet topology changed. |
| Passport | Not in scope; no portable trust token changed. |
| Comply | Not in scope; no compliance mapping changed. |

## Source signal

Live Galileo evidence reviewed on 2026-06-22:

- The homepage describes Capture your groundtruth and says teams can Build your datasets from synthetic, development, and live production data.
- It references subject matter expert annotations.
- It describes Build accurate evals and says Galileo auto-tunes metrics from live feedback.
- It frames the transition as Go from evals to guardrails.
- The evaluation categories include RAG Evals, Agent Evals, Safety Evals, Security Evals, and Custom Evals.
- The signals section references Millions of signals across models, prompts, functions, context, datasets, traces, and MCP server.
- The platform page describes Turn complexity into confidence and brings unit testing and CI/CD rigor into the eval-to-guardrail lifecycle.
- The guardrail section includes Create guardrail policies.
- Deployment options shown include SaaS, Virtual Private Cloud, and On-Premises.
- The docs page is titled What Is Galileo? and describes Galileo as a leading observability, evaluation, and production guardrail platform.
- The docs navigation includes Log Your First Trace, Evaluate Your Traces, Run an Experiment, Galileo MCP Server, Evaluation Metrics, Experiment Metrics, Datasets, and Run Experiments in Unit Tests.

## Product closure

No product implementation module changed for this source. The existing AMC primitive is sufficient:

- `runReplayBenchmarkCorpus` produces replay corpus rows with source refs, fixtures, fixed seeds, baseline/candidate scores, signed evidence refs, and score deltas.
- `buildEvalReplayCorpusEvidenceReceipt` produces the replay manifest, fixture hash status, source ref status, signed evidence ref count, score delta, failure issues, and CI-ready receipt summary.
- The focused regression constructs a Galileo-context replay packet with an AMC-owned fixture and verifies that it passes only with signed evidence and fails closed when Galileo product metadata replaces replay evidence.

## Fail-closed rule

Galileo homepage, docs, eval, guardrail, dataset, annotation, trace, MCP, unit-test, CI/CD, Luna, model, prompt, function, context, production-monitoring, deployment, or metric metadata is rejected unless AMC has:

- a replay manifest;
- fixture hash;
- fixed seed;
- source refs;
- baseline and candidate run IDs;
- score delta;
- signed evidence refs for baseline and candidate rows;
- Score, Shield, and Watch surface coverage;
- CI receipt or lifecycle receipt that can fail closed.

## No-bloat boundary

AMC did not add a Galileo adapter, Galileo API client, dataset importer, trace importer, prompt importer, annotation importer, guardrail runner, Luna model integration, MCP client, eval metric mirror, unit-test workflow generator, deployment integration, Watch monitor, Shield verifier, API route, CLI command, Studio panel, Passport field, methodology version bump, package dependency, copied docs prose, screenshots, examples, configs, traces, datasets, prompts, benchmark rows, annotations, model outputs, or generated outputs.

## Verification

- `npx vitest run tests/gap0946GalileoReplayCorpusBoundary.test.ts --reporter=dot`: passed, 1 file / 4 tests.
- `npx vitest run tests/gap0945ModularBenchmarkingLiveDriftUnavailableBoundary.test.ts tests/gap0946GalileoReplayCorpusBoundary.test.ts --reporter=dot`: passed, 2 files / 8 tests.
- `git diff --check -- . ':(exclude)AMC_OS'`: passed.
- `npm run typecheck`: passed.
