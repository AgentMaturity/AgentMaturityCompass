# GAP-0909 - langsmithgo replay-corpus boundary

- Gap: `GAP-0909`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `devalexandre/langsmithgo`, `https://github.com/devalexandre/langsmithgo`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 16, Fork 4, Issues 0, Pull requests 0, 20 Commits, README.md, GPL-3.0 license, Releases 5, latest release `v1.0.1` on Jun 20, 2024, Packages 0, Go 100.0%, repository folders `.idea` and `docs`, and files including `.gitignore`, `LICENSE`, `README.md`, `client_test.go`, `cliente.go`, `contracts.go`, `go.mod`, and `go.sum`.
- Status: Done

## Live source metadata

The live README identifies langsmithgo as a Golang-based client library for the LangSmith API. Relevant source-review signals include tracking and monitoring large language model applications, Go developers, LangSmith's tracing capabilities, production systems, client contracts, client tests, Go module metadata, release history, and GPL-3.0 license metadata.

Those facts are relevant to AMC only as trace/monitoring context for replayable benchmark evidence. They do not allow AMC to claim LangSmithGo compatibility, call the LangSmith API, import Go client contracts, reuse client tests, ingest production traces, or copy docs. For Score, Shield, and Watch, the relevant AMC requirement remains replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, and no-copy proof.

No upstream Go source, client contracts, tests, docs, LangSmith API payloads, production traces, credentials, release content, README prose beyond minimal metadata facts, command snippets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0909` is relevant to AMC as a replayable benchmark corpus boundary. LangSmithGo's tracing and monitoring context maps to AMC replay evidence only when AMC owns the replay fixture, manifest, fixed seed, score delta, CI receipt, and signed evidence.

The closure uses existing AMC replay-corpus primitives only. It does not add a LangSmithGo client, LangSmith API integration, Go module, trace importer, client contract parser, test runner, release importer, or source-specific replay path.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through replayed score deltas from AMC-owned fixtures. |
| Shield | Relevant only when signed replay evidence proves the fixture and score delta. |
| Watch | Relevant through replay evidence that can be surfaced to operators and CI gates. |
| Enforce | No runtime LangSmith or tracing policy changed. |
| Vault | No LangSmith API credentials, traces, contracts, docs, or production data stored. |
| Fleet | Trace-client context only; no agent topology changed. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with a synthetic AMC-owned trace replay fixture. The positive path requires a replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, and Score/Shield/Watch surface coverage. The negative path proves that LangSmithGo, LangSmith API, Go tracing client, production monitoring, contracts, client tests, release metadata, and source identity alone fail closed without AMC-owned replay evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, GPL-3.0 license metadata, Star 16, Fork 4, Issues 0, Pull requests 0, 20 Commits, Releases 5, v1.0.1 labels, Jun 20, 2024 release labels, Packages 0, Go 100.0%, folder names, file names, Golang-based client library labels, LangSmith API labels, tracking and monitoring labels, large language model labels, Go developers labels, LangSmith's tracing capabilities labels, production systems labels, local backlog metadata, or source identity alone must fail closed for replayable benchmark evidence. Passing replay-corpus proof requires replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, Score/Shield/Watch coverage, and no-copy proof.

## No-bloat boundary

No LangSmithGo client, LangSmith API integration, Go module, trace importer, client contract parser, client test runner, release importer, docs importer, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, methodology version bump, badge semantics change, source-specific implementation module, or source-specific replay path was added. No upstream Go source, client contracts, tests, docs, LangSmith API payloads, production traces, credentials, release content, README prose beyond minimal metadata facts, command snippets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0909LangsmithGoReplayCorpusBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the replay-corpus behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0909LangsmithGoReplayCorpusBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0908RagnarokPublicMethodologyBoundary.test.ts tests/gap0909LangsmithGoReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
