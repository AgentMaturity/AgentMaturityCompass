# GAP-0919 - CrashLens replay-corpus boundary

- Gap: `GAP-0919`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Crashlens/crashlens`, `https://github.com/Crashlens/crashlens`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed the `main` branch, Star 14, Fork 1, Issues 8, Pull requests 0, 328 Commits, README.md, Contributing, MIT license, Security, repository folders `.crashlens`, `.github`, `bench`, `crashlens`, `dashboards`, `demo video`, `demo`, `dist`, `docs`, `examples`, `policies`, `policy-violations`, `sample-logs`, `scripts`, `src`, and `tests`, and files including `.coverage`, `.gitignore`, `.pre-commit-config.yaml`, `CHANGELOG.md`, `CONTRIBUTING.md`, `DOCUMENTATION_GUIDE.md`, `LICENSE`, `MIGRATION.md`, `PROMETHEUS_INTEGRATION.md`, `QUICK_START.md`, `README.md`, `SECURITY.md`, `crashlens-demo.yml`, `crashlens-report.json`, `poetry.lock`, `pyproject.toml`, `pytest.ini`, `requirements-dev.txt`, and `requirements.txt`.
- Status: Done

## Live source metadata

The live README identifies `CrashLens: AI Token Waste Detective` as a Production LLM observability CLI and AI cost optimization tool. Relevant source-review signals include token waste, retry loops, model overkill, OpenAI, Anthropic, Gemini, Langfuse usage, Prometheus metrics, Grafana Dashboard, PyPI shipped, 40-60% potential savings, Privacy First local analysis, runtime enforcement, CI/CD Integration, policy engine, policy violations, JSON reports, Slack notifications, PII Removal, Schema Contract Validation, sample logs, demo mode, Prometheus integration, dashboards, reports, and policy files.

Those facts are relevant to AMC only through existing replay-corpus receipts. CrashLens shows why auditors need a replay manifest, fixture hash, fixed seed, score delta, and CI receipt before Score, Shield, or Watch can accept replayable benchmark claims about token waste, retry loops, model overkill, privacy, policy enforcement, or observability outputs.

No upstream Python code, sample logs, policies, JSON reports, dashboards, Prometheus configs, Grafana panels, demo data, PII data, Slack payloads, CLI output, README prose beyond minimal metadata facts, package metadata, benchmark rows, screenshots, or implementation details were copied into AMC.

## Relevance decision

`GAP-0919` is relevant to AMC as a replayable benchmark corpus boundary. The source maps to Score, Shield, and Watch through generic AMC replay evidence receipts, not through a CrashLens CLI integration.

The closure uses existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior. It does not add a CrashLens adapter, CLI runner, Prometheus importer, Grafana dashboard, policy engine, sample-log importer, PII remover, schema validator, or source-specific replay subsystem.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score delta replay over AMC-owned fixtures. |
| Shield | Relevant because missing signed evidence, fixtures, and source refs fail closed. |
| Watch | Relevant through replay evidence that can feed CI and operator proof, not through CrashLens monitoring code. |
| Enforce | No runtime enforcement policy changed. |
| Vault | No sample logs, PII, API keys, reports, dashboards, or policy files stored. |
| Fleet | No multi-agent topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance mapping changed. |

## Product closure

The focused regression exercises existing replay-corpus primitives with a synthetic AMC-owned CrashLens-style replay row. The positive path requires replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, and Score/Shield/Watch surface coverage. The negative path proves that CrashLens, OpenAI, Anthropic, Gemini, Prometheus, Grafana, token waste, retry loops, model overkill, policies, PII Removal, Schema Contract Validation, GitHub metadata, and README labels alone fail closed without AMC-owned replay evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, MIT license metadata, Star 14, Fork 1, Issues 8, Pull requests 0, 328 Commits, folder names, file names, Production LLM observability CLI labels, token waste labels, retry loops labels, model overkill labels, OpenAI labels, Anthropic labels, Gemini labels, Prometheus metrics labels, Grafana Dashboard labels, PyPI shipped labels, 40-60% potential savings labels, Privacy First labels, CI/CD Integration labels, PII Removal labels, Schema Contract Validation labels, local backlog metadata, or source identity alone must fail closed for replay corpus. Passing replay evidence requires replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, row hashes, and Score/Shield/Watch coverage.

## No-bloat boundary

No CrashLens adapter, CLI runner, token-waste detector, retry-loop detector, model-overkill detector, OpenAI importer, Anthropic importer, Gemini importer, Langfuse importer, Prometheus importer, Grafana dashboard, policy engine, sample-log importer, PII remover, schema validator, Slack notifier, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, sample logs, policies, JSON reports, dashboards, Prometheus configs, Grafana panels, demo data, PII data, Slack payloads, CLI output, README prose beyond minimal metadata facts, package metadata, benchmark rows, screenshots, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0919CrashLensReplayCorpusBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the replay-corpus behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0919CrashLensReplayCorpusBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0918TraceMindStudioDrilldownBoundary.test.ts tests/gap0919CrashLensReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
