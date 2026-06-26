# GAP-0918 - TraceMind Studio evidence drilldown boundary

- Gap: `GAP-0918`
- Dimension: `obs-studio-drilldown`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `Aayush-engineer/TraceMind`, `https://github.com/Aayush-engineer/TraceMind`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 14, Fork 0, Issues 1, Pull requests 0, 69 Commits, repository folders `.github`, `backend`, `docs`, `frontend`, and `sdk`, and files `.env.example`, `.gitignore`, `CHANGELOG.md`, `CONTRIBUTING.md`, `Dockerfile`, `README.md`, `docker-compose.yml`, `package-lock.json`, `render.yaml`, and `verify_all.py`.
- Status: Done

## Live source metadata

Source artifact links checked for the AMC drilldown boundary:

- `https://github.com/Aayush-engineer/TraceMind/blob/main/README.md`
- `https://github.com/Aayush-engineer/TraceMind/tree/main/docs`
- `https://github.com/Aayush-engineer/TraceMind/tree/main/backend`
- `https://github.com/Aayush-engineer/TraceMind/tree/main/frontend`
- `https://github.com/Aayush-engineer/TraceMind/tree/main/sdk`
- `https://github.com/Aayush-engineer/TraceMind/blob/main/package-lock.json`

The live README identifies TraceMind as an Open-source AI evaluation and observability platform that is self-hosted and has no vendor lock-in. Relevant source-review signals include Quality drops from 87% to 61%, Score drops: 8.2, Alert fires within minutes, Automatic quality scoring, Eval suites against golden datasets, an AI diagnosis agent, Regression alerts, Hallucination detection, Prompt A/B testing, Live trace streaming, Mann-Whitney U test, Cohen's d, Python and TypeScript SDKs, CI/CD eval gates, FastAPI, React, real-time traces, dashboards, datasets, eval run history, quality charts, score badges, and category breakdowns.

Those facts are relevant to AMC only through existing Studio evidence drilldown receipts. TraceMind shows why operators need a UI route, source artifact links, evidence preview, and empty/error states, but its dashboard and SDK metadata cannot replace AMC-owned signed evidence, receipt previews, row hashes, and fail-closed drilldown behavior.

No upstream Python code, TypeScript code, SDK snippets, Docker files, dashboard UI, README prose beyond minimal metadata facts, screenshots, eval datasets, golden test cases, alert configs, statistical testing code, LLM judge code, ReAct agent implementation, API keys, package metadata, or implementation details were copied into AMC.

## Relevance decision

`GAP-0918` is relevant to AMC as a Studio evidence drilldown boundary. The source maps to Score, Shield, and Watch through generic AMC evidence drilldown previews, not through a TraceMind integration.

The closure uses existing `buildScoreEvidenceDrilldown` and `buildWatchObsStudioSourceArtifactLinks` behavior. It does not add a TraceMind adapter, SDK integration, dashboard clone, FastAPI service, React panel, LLM-as-judge runner, hallucination detector, A/B testing engine, CI/CD gate, or source-specific Studio route.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through score finding evidence drilldowns with accepted/rejected evidence previews. |
| Shield | Relevant because metadata-only observability claims are rejected without signed evidence. |
| Watch | Relevant through source artifact links, preview hashes, empty/error states, and fail-closed drilldown behavior. |
| Enforce | No runtime policy changed. |
| Vault | No TraceMind traces, API keys, eval datasets, dashboard data, or SDK events stored. |
| Fleet | Observability platform context only; no AMC fleet topology changed. |
| Passport | No badge/passport semantics changed. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing Studio evidence drilldown primitives with a synthetic AMC-owned TraceMind-style drilldown lens. The positive path requires a UI route, source artifact links, evidence preview, accepted/rejected evidence, signed evidence, preview hashes, empty/error-state receipts, and row hash. The negative path proves that TraceMind, Open-source AI evaluation and observability platform, self-hosted, no vendor lock-in, quality drops, score drops, alerts, automatic quality scoring, eval suites, regression alerts, hallucination detection, Prompt A/B testing, Live trace streaming, Mann-Whitney U test, Cohen's d, GitHub metadata, and README labels alone fail closed without AMC-owned drilldown proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Star 14, Fork 0, Issues 1, Pull requests 0, 69 Commits, folder names, file names, Open-source AI evaluation and observability platform labels, self-hosted labels, no vendor lock-in labels, quality-drop labels, score-drop labels, alert labels, Automatic quality scoring labels, Eval suites against golden datasets labels, Regression alerts labels, Hallucination detection labels, Prompt A/B testing labels, Live trace streaming labels, Mann-Whitney U test labels, Cohen's d labels, local backlog metadata, or source identity alone must fail closed for Studio evidence drilldown. Passing drilldown proof requires UI route, source artifact links, evidence preview, empty/error states, signed evidence refs, row hashes, and fail-closed missing-state behavior.

## No-bloat boundary

No TraceMind adapter, SDK integration, dashboard clone, FastAPI service, React panel, LLM-as-judge runner, hallucination detector, A/B testing engine, CI/CD gate, trace ingestion route, eval dataset importer, Slack webhook, statistical test implementation, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific scoring path was added. No upstream Python code, TypeScript code, SDK snippets, Docker files, dashboard UI, README prose beyond minimal metadata facts, screenshots, eval datasets, golden test cases, alert configs, statistical testing code, LLM judge code, ReAct agent implementation, API keys, package metadata, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0918TraceMindStudioDrilldownBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the Studio drilldown behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0918TraceMindStudioDrilldownBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0917PocketFlowZigLiveDriftBoundary.test.ts tests/gap0918TraceMindStudioDrilldownBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
