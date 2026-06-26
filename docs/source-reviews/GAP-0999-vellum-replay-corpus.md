# GAP-0999 - Vellum replay-corpus boundary

- Gap: `GAP-0999`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: live Vellum site at `https://www.vellum.ai`, docs overview at `https://docs.vellum.ai/home/getting-started/overview`, model profiles docs at `https://www.vellum.ai/docs/key-concepts/model-profiles`, public repository at `https://github.com/vellum-ai/vellum-assistant`, GitHub repository API at `https://api.github.com/repos/vellum-ai/vellum-assistant`, raw README at `https://raw.githubusercontent.com/vellum-ai/vellum-assistant/main/README.md`, raw evals README at `https://raw.githubusercontent.com/vellum-ai/vellum-assistant/main/evals/README.md`, license API at `https://api.github.com/repos/vellum-ai/vellum-assistant/license`, release API, GitHub contents APIs for `evals`, `evals/benchmarks`, and `benchmarking`, `git ls-remote`, and local backlog metadata.
- Retrieval: `2026-06-24` live source review through HTTPS, GitHub API, raw GitHub content, release API, `git ls-remote`, and local backlog metadata.
- Status: closed through existing replayable benchmark corpus receipts only; no Vellum eval runner, benchmark mirror, fixture importer, JSONL export parser, report server, workflow importer, docs importer, API route, CLI command, Studio panel, package dependency, or source-specific replay-corpus subsystem added.
- Linear: `AMC-1278`

## Live source metadata

The live Vellum homepage returns HTTP 200 and identifies the product as `Personal Intelligence`. The site links to the public `vellum-ai/vellum-assistant` repository and presents personal-assistant, memory, skills, channel, hosting, and security context. The docs overview returns HTTP 200 at `https://docs.vellum.ai/home/getting-started/overview` and presents Vellum as an AI development platform with evaluation, testing, monitoring, workflows, RAG, SDK/API, and collaborative product-development context. The model profiles page returns HTTP 200 at `https://www.vellum.ai/docs/key-concepts/model-profiles` and presents model-profile and call-site override context for assistant jobs.

The GitHub API identifies `vellum-ai/vellum-assistant` as a public TypeScript repository with description `An AI Assistant that’s easy to setup, does your work 24/7, knows your preferences and gets better over time.`, MIT License metadata, default branch `main`, 754 stars, 114 forks, 117 open issues, created_at `2026-02-07T21:19:17Z`, pushed_at `2026-06-24T13:41:24Z`, and updated_at `2026-06-24T13:42:30Z`. Repository topics include agent, agentic-ai, ai-assistant, anthropic, autonomous-agents, claude, ios, macos, memory, open-source, openai, slack, telegram-bot, and vellum-ai.

`git ls-remote https://github.com/vellum-ai/vellum-assistant.git HEAD refs/heads/main` verified default branch `main` at `62a63081ba267deaf9adcd226b7cb4bd6f2d702d`. The GitHub releases API identifies release `v0.10.1` published `2026-06-24T01:04:54Z` on target branch `main`.

GitHub content metadata identified README blob `3cff3313823fc3f515b989f28b54ed4ed84e79c7`, LICENSE blob `f41a2e835e9e7fad2f9de8e6be854a70859cb584`, root `evals` tree `81382fb2b8426e48a848bbac7b68cee32a383c34`, `evals/README.md` blob `2b0715cee55e82691529ccf7f60f4d6769adc17d`, `evals/benchmarks` tree `f653c46a7edaef6c3828b607116e9e921e76c1c8`, and `benchmarking` tree `e5e77d582433d2399d2d830c8156ef50f2bd5a3f`.

Relevant source-review signals include the Vellum Personal-Intelligence Benchmark, `evals/benchmarks`, benchmark directory names `compaction-thrash`, `longmemeval-v2`, and `personal-intelligence`, eval profile/run/export/report-server labels, score aggregates, test lists, metric-card labels, transcript labels, container event log labels, test-runner progress labels, JSONL export labels, model-profile/call-site override context, and AI development/evaluation docs context.

No Vellum website prose beyond short metadata facts, docs prose beyond short metadata facts, README prose beyond short metadata facts, evals README prose beyond short metadata facts, repository code, prompts, workflow definitions, benchmark units, fixtures, metrics, transcripts, report rows, JSONL exports, run artifacts, container logs, screenshots, images, configuration files, examples, generated outputs, or implementation details were copied into AMC.

## Relevance decision

GAP-0999 is relevant to AMC because the current Vellum docs and repository expose evaluation, benchmark, report/export, and replay-adjacent artifacts. That maps to AMC only through the existing replayable benchmark corpus primitive.

The accepted AMC primitive already exists: `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt`. Valid proof requires a replay manifest, fixture hash, fixed seed, source refs, Score/Shield/Watch surface coverage, baseline and candidate scores, score delta, signed evidence refs, row hashes, and CI receipt. Vellum product pages, docs navigation, repository metadata, benchmark directory names, eval command labels, export labels, report-server labels, transcript labels, metric labels, model-profile labels, and source identity alone must not affect Score, Shield, or Watch.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant only through AMC-owned replay rows with fixed fixtures, score deltas, source refs, row hashes, and signed evidence. |
| Shield | Relevant when replay rows prove safety, permission, tool-use, transcript, or policy regressions through AMC-owned evidence. |
| Enforce | No runtime policy, workflow, model-profile, call-site override, permission, or action-router behavior changed. |
| Vault | No credential, memory, privacy, channel, hosting, or storage behavior changed. |
| Watch | Relevant through replay CI/lifecycle receipts and regression evidence, not through Vellum pages or repo metadata alone. |
| Fleet | Assistant benchmark context can inform fleet-level risk, but no Fleet topology, orchestration, channel, or skill behavior changed. |
| Passport | Existing replay receipts can feed proof bundles, but no Passport schema changed. |
| Comply | License and source context only; no compliance mapping changed. |

## Product closure

No product code changed. The focused regression proves existing replay-corpus primitives can accept Vellum-style evaluation context only when AMC has an AMC-owned replay manifest, fixture hash, fixed seed, Score/Shield/Watch coverage, baseline and candidate signed evidence, score delta, row hashes, source refs, and CI/lifecycle receipt proof.

The positive path produces a ready replay-corpus evidence receipt with signed evidence and a score delta. The negative path fails closed when Vellum site metadata, docs metadata, repository metadata, evals README metadata, benchmark directory names, eval command labels, report/export labels, transcript labels, model-profile labels, release labels, and local backlog metadata replace AMC-owned replay evidence.

## Fail-closed rule

Vellum homepage positioning, docs overview labels, model-profile labels, call-site override labels, GitHub star/fork/issue counts, default-branch SHA, release label, MIT License label, TypeScript language label, repository topics, README labels, evals README labels, benchmark directory names, eval command labels, JSONL export labels, report-server labels, transcript labels, metric-card labels, container-event-log labels, test-runner labels, local backlog metadata, or source identity alone cannot prove a replayable benchmark corpus.

A replay-corpus claim must fail closed unless replay manifest, fixture hash, fixed seed, source refs, Score/Shield/Watch coverage, baseline score, candidate score, score delta, evidence refs, signed evidence refs, row hashes, CI or lifecycle receipt, and no-copy proof exist.

## No-bloat boundary

No Vellum adapter, eval runner, benchmark mirror, fixture importer, JSONL export parser, report-server integration, transcript importer, metric importer, container-log importer, workflow importer, prompt importer, model-profile importer, action-override importer, docs scraper, repository mirror, package dependency, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Score method, Passport field, methodology version bump, diagnostic question-bank migration, or source-specific replay-corpus subsystem was added.

No Vellum website prose beyond short metadata facts, docs prose beyond short metadata facts, README prose beyond short metadata facts, evals README prose beyond short metadata facts, repository code, prompts, workflow definitions, benchmark units, fixtures, metrics, transcripts, report rows, JSONL exports, run artifacts, container logs, screenshots, images, configuration files, examples, generated outputs, or implementation details were copied.

## Verification

- TDD expected failure: `npx vitest run tests/gap0999VellumReplayCorpusBoundary.test.ts --reporter=dot` failed before this document existed with `ENOENT: no such file or directory, open 'docs/source-reviews/GAP-0999-vellum-replay-corpus.md'`; 3 replay-corpus primitive tests passed.
- Focused regression: `npx vitest run tests/gap0999VellumReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
- Paired regression: `npx vitest run tests/gap0998SmallcodeProviderDriftBoundary.test.ts tests/gap0999VellumReplayCorpusBoundary.test.ts --reporter=dot` passed, 2 files / 8 tests.
- Source-specific implementation token scan: `rg -n "vellum-ai/vellum-assistant|https://www.vellum.ai|Vellum Personal-Intelligence Benchmark|vellum_replay_corpus" src/benchmarks/replayBenchmarkCorpus.ts src/eval/replayCorpusEvidenceReceipt.ts src/diagnostic/evalReplayCorpusBoundary.ts` returned no product-module matches.
- Diff whitespace check: `git diff --check -- . ':(exclude)AMC_OS'` passed.
- Typecheck: `npm run typecheck` passed.
- Full test suite: `npm test -- --reporter=dot` passed, 846 files / 7,377 tests.
- Post-doc focused rerun: `npx vitest run tests/gap0999VellumReplayCorpusBoundary.test.ts --reporter=dot` passed, 1 file / 4 tests.
