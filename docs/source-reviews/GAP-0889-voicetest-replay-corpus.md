# GAP-0889 - voicetest replay-corpus boundary

- Gap: `GAP-0889`
- Dimension: `eval-replay-corpus`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `voicetestdev/voicetest`, `https://github.com/voicetestdev/voicetest`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 24, Fork 3, Issues 4, Pull requests 0, 118 Commits, README.md, LICENSE, Apache-2.0 license, Releases 47, latest release `v0.49` on Jun 7, 2026, Python 79.6%, Svelte 13.2%, TypeScript 7.2%, repository folders `.claude-plugin`, `.claude`, `.github/ workflows`, `assets`, `claude-plugin`, `docs`, `scripts`, `tests`, `voicetest`, and `web`, and files including `.env.example`, `CLAUDE.md`, `CONTRIBUTING.md`, `Dockerfile.dev`, `docker-compose.dev.yml`, `mkdocs.yml`, `pyproject.toml`, and `uv.lock`.
- Status: completed as `Done`.

## Live source metadata

The live repository describes voicetest as a Test harness for voice agents and an open-source test harness for voice agent workflows. It lists Retell, VAPI, Bland, Telnyx, LiveKit, XLSForm, custom agents, autonomous simulations, LLM judges, unified AgentGraph conversion, real-time streaming transcripts, run history, diagnosis, CLI, Web UI, REST API, CI/CD, model settings, `GROQ_API_KEY`, `max_turns`, `audio_eval`, and `streaming`.

Those facts make the source relevant to AMC's replayable benchmark corpus boundary, because voice-agent workflow testing can only affect AMC Score, Shield, and Watch when there is an AMC-owned replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, row hashes, regression thresholds, and no-copy proof. No upstream Python, Svelte, TypeScript, docs prose, prompts, test cases, test agents, sample healthcare receptionist data, platform configs, API keys, transcripts, judge prompts, GitHub Actions workflow, AgentGraph schema, Web UI assets, or implementation details were copied into AMC.

## Relevance decision

`GAP-0889` is relevant to AMC as a replay-corpus proof boundary. The source signal is not that AMC should become a voice-agent test harness or import Retell, VAPI, Bland, Telnyx, or LiveKit projects. The source-review signal is that replayable workflow evaluation needs reproducible fixtures, fixed seeds, score deltas, signed evidence, regression thresholds, and CI receipts.

The closure uses existing AMC replay-corpus receipts only. It does not add a voicetest adapter, voice simulator, platform importer, LLM judge runner, REST API route, Web UI integration, or provider-specific workflow runner.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing replay-corpus score-delta receipts. |
| Shield | Relevant only when replay rows carry signed evidence and fail-closed proof. |
| Watch | Relevant through existing replay-corpus CI/lifecycle receipt visibility. |
| Enforce | No runtime voice-agent guardrail or platform policy changed. |
| Vault | No platform credentials, API keys, prompts, transcripts, or datasets stored. |
| Fleet | Voice-agent orchestration context only; no agent platform topology added. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runReplayBenchmarkCorpus` and `buildEvalReplayCorpusEvidenceReceipt` behavior with a synthetic AMC-owned voice-agent replay fixture. The positive path requires Score/Shield/Watch coverage, source refs, signed evidence refs, fixture hash, fixed seed, and score delta. The negative path proves that voicetest, Retell, VAPI, Bland, Telnyx, LiveKit, autonomous simulations, LLM judges, AgentGraph, Web UI, REST API, and CI/CD metadata fails closed without AMC-owned replay evidence.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, Apache-2.0 license metadata, Star 24, Fork 3, Issues 4, Pull requests 0, 118 Commits, Releases 47, `v0.49`, Jun 7, 2026 release metadata, language percentages, folder names, file names, Test harness for voice agents labels, Retell/VAPI/Bland/Telnyx/LiveKit support labels, autonomous simulations labels, LLM judges labels, unified AgentGraph labels, real-time streaming transcripts labels, run history labels, CI/CD labels, model settings labels, `GROQ_API_KEY`, `max_turns`, `audio_eval`, `streaming`, local backlog metadata, or source identity alone must fail closed for replay-corpus proof. Passing proof requires an AMC-owned replay manifest, fixture hash, fixed seed, score delta, CI receipt, signed evidence refs, source refs, row hashes, regression thresholds, and no-copy proof.

## No-bloat boundary

No voicetest adapter, voice-agent simulator, platform importer, Retell integration, VAPI integration, Bland integration, Telnyx integration, LiveKit integration, XLSForm importer, AgentGraph importer, LLM judge runner, transcript parser, audio evaluator, diagnosis loop, prompt repair loop, REST API route, Web UI panel, CI workflow generator, package dependency, provider credential storage, source-specific implementation module, or source-specific scoring path was added. No upstream Python, Svelte, TypeScript, docs prose, prompts, test cases, test agents, sample healthcare receptionist data, platform configs, API keys, transcripts, judge prompts, GitHub Actions workflow, AgentGraph schema, Web UI assets, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0889VoicetestReplayCorpusBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the replay-corpus behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0889VoicetestReplayCorpusBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0888RagEvaluationHarnessesPublicMethodologyBoundary.test.ts tests/gap0889VoicetestReplayCorpusBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
