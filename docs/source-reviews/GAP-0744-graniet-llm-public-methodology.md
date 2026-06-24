# GAP-0744 - graniet/llm public-methodology boundary

- Gap: `GAP-0744`
- Dimension: `std-public-methodology`
- AMC surfaces requested: Score, Shield, Watch
- Source reviewed: `https://github.com/graniet/llm` and README `https://github.com/graniet/llm/blob/main/README.md`
- Retrieval: `2026-06-21` via GitHub connector repository metadata and README fetch; shell network remains DNS-restricted in this environment.
- Status: skipped as a public-methodology version change; no AMC methodology version bump, diagnostic migration, badge change, LLM backend adapter, Rust crate integration, or CLI wrapper added.

## Live source metadata

The GitHub connector identifies `graniet/llm` as a public, unarchived repository with default branch `main`. The README identifies the project as a Rust library and CLI for multiple LLM backends through a unified API. Relevant source-review signals include OpenAI, Anthropic Claude, Ollama, DeepSeek, xAI, Phind, Groq, Google, Cohere, Mistral, Hugging Face, ElevenLabs, multi-step chains, templates, builder pattern, validation, retry/backoff, evaluation, parallel evaluation, function calling, REST API serving, vision, reasoning, structured output, speech-to-text, text-to-speech, memory, agentic behavior, shared memory, CLI usage, and `llm = { version = "1.3.8" }` crate examples. The README also states that the crate name previously belonged to a different archived project at `rustformers/llm`.

These facts are useful as LLM orchestration and evaluation-library context, but they do not define AMC scoring semantics, evidence taxonomy, changelog entries, deprecation notices, migration guidance, validation artifacts, badge behavior, or public comparability rules. Repository metadata, README feature lists, provider/backend lists, examples, CLI usage, crate version labels, or evaluation/parallel-evaluation labels alone cannot justify an AMC methodology version bump. No upstream README prose beyond minimal metadata facts, code snippets, command examples, Cargo snippets, example names, configs, or implementation details were copied into AMC.

## Relevance decision

GAP-0744 is relevant to AMC only as public-methodology boundary evidence. The source reinforces that multi-provider LLM orchestration libraries can evaluate outputs across backends, but AMC already has public methodology/versioning primitives and should not treat a general-purpose Rust crate as a methodology source.

The accepted AMC primitive is the existing public methodology manifest and versioning path. This slice intentionally does not change that path because `graniet/llm` metadata and README features do not provide AMC-owned methodology proof. A source citation can be retained only as context; any public methodology claim still requires AMC-owned methodology versioning receipts, validation artifacts, signed evidence refs, row hashes, badge assurance, and report-binding proof.

## AMC/8 surface check

| Surface | Decision |
| --- | --- |
| Score | Background evaluation-library context only; no accepted public scoring-methodology proof or version bump. |
| Shield | Background validation/resilience context only; no new safety threshold or assurance rule. |
| Watch | Background provider/backend context only; no new drift methodology, monitor, or alert. |
| Enforce | No runtime provider router, policy, validation, retry, function-calling, or circuit-breaker behavior changed. |
| Vault | No API keys, provider credentials, prompts, audio, memory, or secure-storage behavior changed. |
| Fleet | Agentic/shared-memory context only; no orchestration adapter or fleet topology changed. |
| Passport | No portable proof-bundle field, badge credential, or external proof token changed. |
| Comply | No compliance mapping changed. |

## Product closure

No `src/methodology/publicMethodology.ts`, `src/diagnostic/methodologyVersioning.ts`, `src/badge/badgeCli.ts`, API, CLI, Studio, diagnostic question bank, scoring code, Watch monitor, Shield verifier, Enforce runtime, provider adapter, Rust crate integration, backend registry, CLI wrapper, REST serving layer, memory subsystem, agentic workflow, speech/vision/structured-output workflow, or public methodology docs changed for GAP-0744.

The closure is a no-bloat source-review boundary: `graniet/llm`, Rust library, CLI, unified API, multiple backend, evaluation, parallel evaluation, memory, agentic, speech-to-text, text-to-speech, vision, reasoning, REST API, and provider labels are not accepted as public methodology proof without AMC-owned methodology receipts.

## Fail-closed rule

Repository URL, README URL, repository name, stars, language, public/unarchived status, default branch, provider/backend labels, evaluation labels, parallel-evaluation labels, validation labels, retry/backoff labels, REST API labels, CLI labels, crate version labels, example names, memory labels, agentic labels, speech/vision/reasoning labels, local backlog metadata, or source identity alone must fail closed for public methodology claims. Passing evidence requires AMC-owned methodology versioning receipts, versioned scoring rules, changelog rows, deprecation notice, migration guidance, validation artifacts, signed evidence refs, row hashes, badge assurance, report-binding proof, and no-copy proof.

## No-bloat boundary

No Rust crate integration, LLM backend adapter, provider router, CLI wrapper, REST serving layer, evaluator runner, parallel-evaluation runner, function-calling wrapper, validation engine, retry/backoff wrapper, memory subsystem, agentic workflow, speech-to-text workflow, text-to-speech workflow, vision workflow, reasoning workflow, structured-output workflow, repository importer, GitHub importer, methodology version bump, badge parameter, API route, CLI command, Studio panel, Watch monitor, Shield verifier, Enforce policy module, Passport field, diagnostic question-bank migration, package dependency, or source-specific scoring path was added. No upstream README prose beyond minimal metadata facts, code snippets, command examples, Cargo snippets, example names, configs, or implementation details were copied.

## Verification

- Focused regression: `npx vitest run tests/gap0744GranietLlmPublicMethodologyBoundary.test.ts --reporter=dot`
- Static checks: `git diff --check -- . ':(exclude)AMC_OS'`
- Typecheck: `npm run typecheck`
- Full suite: blocked in this sandbox by local server `listen EPERM: operation not permitted 127.0.0.1` failures.
