# GAP-0891 - telephony-server provider-drift boundary

- Gap: `GAP-0891`
- Dimension: `llmops-provider-drift`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `steinathan/telephony-server`, `https://github.com/steinathan/telephony-server`
- Retrieval: `2026-06-22` via live GitHub repository page and README review. The live GitHub repository page opened successfully through the web channel and showed Star 23, Fork 3, Issues 0, Pull requests 0, 10 Commits, README.md, LICENSE, BSD-2-Clause license in repository metadata, No releases published, Python 100.0%, repository folders `.vscode`, `apps`, `streaming_providers`, and `telephony`, and files including `.env.example`, `.gitignore`, `.python-version`, `__init__.py`, `pyproject.toml`, and `uv.lock`. The README license section says MIT License, so the source-review note treats license metadata as inconsistent and non-authoritative for AMC proof.
- Status: completed as `Done`.

## Live source metadata

The live README identifies Telephony Server as inspired by Vocode and as a bridge between telephony providers and real-time communication platforms. The source mentions Twilio, Vonage, Plivo, LiveKit, Jay.so, Pipecat, call routing, multi-provider support, metrics collection, observability, system health, call quality, Webhooks, Docker prerequisites, telephony account prerequisites, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `TO_PHONE`, `FROM_PHONE`, Redis, `uvicorn`, Docker deployment, Prometheus, Grafana, and ELK Stack.

Those facts are relevant to AMC only as provider-drift context. They do not allow AMC to claim telephony routing coverage, voice-agent workflow support, provider integration, or compatibility with Twilio, Vonage, Plivo, LiveKit, Jay.so, or Pipecat. For Score, Shield, and Watch, the relevant proof remains provider version, canary results, drift statistic, alert or waiver, signed evidence refs, source refs, row hashes, metric thresholds, and no-copy proof.

No upstream Python source, README code sample, taxi-dispatch prompt, environment values, API key names beyond minimal metadata facts, telephony config, provider config, Redis config, webhook handlers, call-routing logic, call transcripts, platform credentials, deployment files, or implementation details were copied into AMC.

## Relevance decision

`GAP-0891` is relevant to AMC as a provider and model drift benchmark boundary. Telephony-provider and real-time-communication provider context is a valid canary scenario only when represented by AMC-owned provider-drift rows, evaluator config hashes, generated test-data hashes, trace exports, metric reports, signed evidence, and CI/Watch gate proof.

The closure uses existing AMC provider-drift primitives only. It does not add a telephony adapter, Twilio/Vonage/Plivo integration, LiveKit/Jay.so/Pipecat integration, outbound-call runner, voice simulator, webhook handler, Redis dependency, Prometheus/Grafana integration, ELK integration, API route, or source-specific benchmark runner.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Relevant through existing provider-drift score, refusal, latency, cost, and guardrail canary metrics. |
| Shield | Relevant only when signed provider-drift evidence and fail-closed proof are present. |
| Watch | Relevant through existing provider-drift Watch alerts and CI gates. |
| Enforce | No runtime telephony policy, provider policy, or call-routing guardrail changed. |
| Vault | No credentials, phone numbers, call data, API keys, or environment files stored. |
| Fleet | Telephony-provider context only; no agent topology or communication platform bridge added. |
| Passport | Existing proof bundles are unchanged. |
| Comply | No compliance framework mapping changed. |

## Product closure

The focused regression exercises existing `runProviderDriftBenchmark`, `buildProviderDriftEvalPack`, `buildProviderDriftWatchAlerts`, and `buildProviderDriftCiGate` behavior with a synthetic AMC-owned telephony-provider canary. The positive path requires provider version, canary results, drift statistic, no alert or waiver need, signed evidence, row hashes, metric coverage, and CI pass. The negative path proves that telephony-server, Twilio, Vonage, Plivo, LiveKit, Jay.so, Pipecat, observability, Webhooks, Prometheus, Grafana, and ELK Stack metadata fails closed without AMC-owned provider-drift proof.

No product implementation module needed a source-specific change.

## Fail-closed rule

Live GitHub repository page reachability, README.md presence, BSD-2-Clause license metadata, README MIT License text, Star 23, Fork 3, Issues 0, Pull requests 0, 10 Commits, No releases published, Python 100.0%, folder names, file names, inspired by Vocode labels, Twilio/Vonage/Plivo labels, LiveKit/Jay.so/Pipecat labels, call routing labels, metrics collection labels, observability labels, Webhooks labels, environment variable labels, Redis labels, `uvicorn` labels, Prometheus/Grafana labels, ELK Stack labels, local backlog metadata, or source identity alone must fail closed for provider drift. Passing provider-drift proof requires provider version, canary results, drift statistic, alert or waiver, evaluator config hash, generated test-data hash, trace export hash, metric report hash, signed evidence refs, source refs, row hashes, thresholds, and CI/Watch gate proof.

## No-bloat boundary

No telephony adapter, telephony bridge, Twilio integration, Vonage integration, Plivo integration, LiveKit integration, Jay.so integration, Pipecat integration, Vocode compatibility layer, outbound-call runner, voice simulator, taxi dispatcher fixture, webhook handler, Redis dependency, Prometheus integration, Grafana integration, ELK Stack integration, phone-number storage, credential storage, API route, CLI command, Studio panel, Watch monitor, Shield verifier, source-specific implementation module, or source-specific scoring path was added. No upstream Python source, README code sample, taxi-dispatch prompt, environment values, API key names beyond minimal metadata facts, telephony config, provider config, Redis config, webhook handlers, call-routing logic, call transcripts, platform credentials, deployment files, or implementation details were copied.

## Verification

- Initial focused TDD regression: `npx vitest run tests/gap0891TelephonyServerProviderDriftBoundary.test.ts --reporter=dot` failed only because this source-review doc did not exist; the provider-drift behavior tests already passed.
- Focused regression after doc addition: `npx vitest run tests/gap0891TelephonyServerProviderDriftBoundary.test.ts --reporter=dot`
- Paired regression: `npx vitest run tests/gap0890DingusReplayCorpusBoundary.test.ts tests/gap0891TelephonyServerProviderDriftBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: `npm test -- --reporter=dot` previously failed in this sandbox with localhost server timeouts and repeated `listen EPERM: operation not permitted 127.0.0.1` errors; 609 files / 6507 tests passed before the sandbox-blocked failures were reported.
