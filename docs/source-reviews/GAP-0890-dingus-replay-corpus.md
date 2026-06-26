# GAP-0890 - DINGUS replay-corpus boundary

- Gap: `GAP-0890`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `dingus-technology/DINGUS`, `https://github.com/dingus-technology/DINGUS`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 23, Fork 1, Issues 2, Pull requests 0, 150 Commits, README.md, LICENSE, GPL-3.0 license, a Releases section with 1 tags, Python 97.1%, Shell 1.7%, Dockerfile 1.2%, repository folders `.github`, `.kube`, `assets`, `docs`, `scripts`, and `src`, and files including `.gitattributes`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `requirements.txt`, and `sample.env`.
- Status: completed as `Done`.

## Live source metadata

The live README identifies Dingus as Cleaner and quicker production debugging and describes a tool that turns production logs into readable actions by surfacing issues, tracing them back to the root, and suggesting practical fixes. It references logs, metrics, code, commits, Helm, Docker, K8s cluster setup, `docker compose`, a simulation repo for fake logs, Docker Hub, Helm packaging, and deployment tooling. The repository topics include Grafana, Loki, Prometheus, infrastructure, DevOps, monitoring, metrics, SRE, bugs, Docker, Kubernetes, OpenAI, and LLM context.

Those facts are relevant only as operational-debugging replay context. They do not allow AMC to claim parity with Dingus, ingest production logs, or add a Kubernetes observability integration. For Score, Shield, and Watch, the relevant AMC requirement remains replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, row hashes, regression thresholds, and no-copy proof.

No upstream Python source, Dockerfile content, Docker Compose content, Kubernetes config, Helm chart, sample environment file, production logs, simulated logs, dashboard assets, generated actions, recommended fixes, README prose beyond minimal metadata facts, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0890` is relevant to AMC through the existing replayable benchmark corpus primitive. Production-debugging and logs-to-actions context is a useful source-review signal because replayable eval evidence should be able to prove what evidence was replayed, which seed and fixture were used, what score delta changed, and what CI/lifecycle receipt supports the result.

The closure uses existing AMC replay-corpus receipts only. It does not add a DINGUS integration, log collector, Grafana/Loki/Prometheus adapter, Kubernetes watcher, Helm deployment, Docker Compose runner, production-debugging assistant, or source-specific replay runner.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay-corpus score-delta receipts. |
| Shield | Relevant only when signed replay evidence and fail-closed proof are present. |
| Watch | Relevant through existing CI/lifecycle replay receipt visibility. |
| Enforce | No runtime production-debugging guardrail changed. |
| Vault | No logs, kube configs, environment files, credentials, or operational data stored. |
| Fleet | Operational-debugging context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with a synthetic AMC-owned operational-debugging replay fixture. The positive path requires Score/Shield/Watch coverage, source refs, signed evidence refs, fixture hash, fixed seed, and score delta. The negative path proves that DINGUS, production logs, readable actions, Helm, Docker, K8s, Grafana, Loki, Prometheus, SRE, simulation repo, and README metadata fails closed without AMC-owned replay evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, GPL-3.0 license metadata, Star 23, Fork 1, Issues 2, Pull requests 0, 150 Commits, 1 tags metadata, Python 97.1%, Shell 1.7%, Dockerfile 1.2%, folder names, file names, Cleaner and quicker production debugging labels, production logs labels, readable actions labels, logs/metrics/code/commits labels, root-cause labels, practical fixes labels, Helm labels, Docker labels, K8s cluster labels, `docker compose` labels, simulation repo labels, Docker Hub labels, Grafana/Loki/Prometheus topics, local backlog metadata, or source identity alone must fail closed for replay-corpus proof. Passing proof requires an AMC-owned replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No DINGUS adapter, production-log collector, log parser, Kubernetes watcher, kube config importer, Helm chart, Docker Compose runner, Docker Hub publisher, Grafana integration, Loki integration, Prometheus integration, infrastructure monitor, SRE assistant, generated-action recommender, root-cause assistant, simulation repo importer, sample environment importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, Dockerfile content, Docker Compose content, Kubernetes config, Helm chart, sample environment file, production logs, simulated logs, dashboard assets, generated actions, recommended fixes, README prose beyond minimal metadata facts, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0890DingusReplayCorpusBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the replay-corpus behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0890DingusReplayCorpusBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0889VoicetestReplayCorpusBoundary.test.ts tests/gap0890DingusReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
