# GAP-0995 — SWE-agent live drift

- Gap: `GAP-0995`
- Dimension: Live score and behavior drift alerts (`obs-live-drift-alerts`)
- AMC surfaces requested: Score; Shield; Watch
- Source reviewed: `SWE-agent/SWE-agent`
- Retrieval: live GitHub API, raw GitHub files, release API, docs HEAD, arXiv HEAD, and `git ls-remote` on `2026-06-24`
- Status: Done

## Relevance decision

SWE-agent is relevant to AMC only as agent-evaluation and software-agent benchmark context for the existing Score/Shield/Watch live score and behavior drift path. The source can label a review boundary because it is an active public software-engineering agent project with benchmark, trajectory, docs, and security-mode signals, but those signals do not prove an AMC agent drifted.

The accepted AMC claim remains bounded to an AMC-owned baseline distribution, live sample, drift statistic, and alert receipt. Repository metadata, release notes, README claims, package dependencies, stars, forks, open issue counts, docs availability, and SWE-bench or EnIGMA labels fail closed unless paired with signed AMC evidence rows.

Live metadata facts reviewed:

- Repository/API: `https://github.com/SWE-agent/SWE-agent` and `https://api.github.com/repos/SWE-agent/SWE-agent`
- Raw README: `https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/README.md`
- Raw license: `https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/LICENSE`
- Raw package metadata: `https://raw.githubusercontent.com/SWE-agent/SWE-agent/main/pyproject.toml`
- Latest release: `https://github.com/SWE-agent/SWE-agent/releases/tag/v1.1.0`
- Docs endpoint: `https://swe-agent.com/latest/`
- arXiv record: `https://arxiv.org/abs/2405.15793`
- Related project signal: `https://github.com/SWE-agent/mini-swe-agent/`
- Security-mode signal: `https://enigma-agent.com/`
- Repository state: public, not archived, not disabled, not a fork, language `Python`, license `MIT License`, default branch `main`
- Repository counts at retrieval: `19,609 stars`, `2,145 forks`, `28 open issues`
- Repository timestamps: created_at `2024-04-02T04:09:47Z`, pushed_at `2026-06-22T21:51:09Z`, updated_at `2026-06-24T12:39:38Z`
- Git HEAD/main: `abd7d69724d1413b30fea43d4724bb5b463906b4`
- latest release `v1.1.0`, published_at `2025-05-22T16:11:39Z`
- Package metadata includes project `sweagent`, requires-python `>=3.11`, and dependency signals `litellm`, `swe-rex>=1.4.0`, and `textual>=1.0.0`
- README metadata references `mini-swe-agent`, `SWE-bench`, `EnIGMA`, and `NeurIPS 2024`

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only when score movement is computed from AMC-owned baseline/live rows and signed evidence refs. |
| Shield | Relevant only as a fail-closed assurance gate for behavior, error, invalid-action, and evidence gaps. |
| Enforce | Not changed; this gap does not add runtime policy enforcement or circuit breakers. |
| Vault | Not changed; this gap does not add secrets, DLP, privacy, or storage behavior. |
| Watch | Relevant through existing live-drift alert receipts and Watch alert construction. |
| Fleet | Not changed; no fleet topology or orchestration behavior is added. |
| Passport | Not changed; no portable trust token or external proof bundle field is added. |
| Comply | Not changed; no compliance mapping or regulatory artifact is added. |

## Product closure

No product code changed. Existing AMC live-drift primitives already support the required closure:

- baseline distribution rows
- live sample rows
- drift statistic computation
- signed evidence reference checks
- alert receipt generation
- Watch alert projection
- fail-closed behavior for missing evidence

The focused regression test binds SWE-agent metadata to that existing AMC-owned primitive and verifies that material score, behavior, invalid-action, error-attribution, latency, and cost drift produce an alert receipt only when signed evidence is present.

## Fail-closed rule

SWE-agent metadata must fail closed when it substitutes for evidence. The following are insufficient by themselves:

- repository popularity, stars, forks, topics, language, license, default branch, commit SHA, or release tag
- README claims about SWE-bench, mini-swe-agent, EnIGMA, cybersecurity usage, docs, or research status
- package metadata such as `requires-python`, `litellm`, `swe-rex>=1.4.0`, or `textual>=1.0.0`
- docs endpoint availability or arXiv availability

A live-drift claim can pass only with AMC-owned baseline/live rows, evidence refs, signed evidence refs, row hashes, thresholds, drift statistics, and the generated alert receipt.

## No-bloat boundary

This gap did not add and must not add a SWE-agent runner, GitHub issue executor, SWE-bench wrapper, benchmark importer, trajectory importer, EnIGMA adapter, mini-swe-agent adapter, OpenTelemetry/OpenLLMetry path, source-specific Watch monitor, source-specific drift module, API route, CLI command, Studio panel, dependency, methodology version bump, copied README prose, copied release text, copied config, copied datasets, copied trajectories, or copied upstream code.

## Verification

- Expected-red focused test before doc: `npx vitest run tests/gap0995SweAgentLiveDriftBoundary.test.ts --reporter=dot` failed only because `docs/source-reviews/GAP-0995-swe-agent-live-drift.md` did not exist; the three live-drift primitive tests passed.
- Focused test after doc: `npx vitest run tests/gap0995SweAgentLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired adjacent source-review tests: `npx vitest run tests/gap0994BeirProviderDriftBoundary.test.ts tests/gap0995SweAgentLiveDriftBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Source-specific implementation token scan: `rg -n "SWE-agent/SWE-agent|https://github.com/SWE-agent/SWE-agent|swe_agent_live_drift|SWE-agent live drift" src/watch/liveDriftAlerts.ts src/drift/continuousMonitor.ts src/score/index.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 842 files / 7,362 tests.
- Post-doc focused rerun: `npx vitest run tests/gap0995SweAgentLiveDriftBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
