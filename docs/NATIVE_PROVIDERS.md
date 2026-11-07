# Native provider routes

The native agent harness (`amc agent-loop run`, `amc acp`, the schedules runner, `amc wire`, and the TypeScript and Python SDKs, which spawn `acp`) sends model requests through AMC's own adapter seam: a route is pinned once per call, the request is committed in a signed `request/header` before any bytes leave, the credential is resolved per request by reference, the egress gate runs, and the settlement is signed. This page lists the routes `--provider` accepts, what each one sends, and the limits that hold in the current source build. Gateway templates (`docs/PROVIDERS.md`) are a different surface: they configure the recording proxy, not these routes.

`amc agent-loop providers --json` prints the bundled adapter contracts, explicit unknowns and the reporting rules. It never probes a server, a model, a credential or a cache.

## Routes

| `--provider` | Wire and adapter | Default origin | Default credential reference | Notes |
| --- | --- | --- | --- | --- |
| `anthropic` | Messages API, `anthropic-messages@4` (`@5` with `--cache-retention`) | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` | Cache breakpoints on system, last tool and last message block; thinking is tools-free only (below). |
| `openai` | Chat Completions, `openai-chat@4` (`@5` with retention) | `https://api.openai.com` | `OPENAI_API_KEY` | `cached_tokens` recorded as cache reads. |
| `openai-responses` | Responses API, `openai-responses@3` (`@4` with retention) | `https://api.openai.com` | `OPENAI_API_KEY` | Stateless (`store: false`); reasoning output items are refused. |
| `azure-openai` | Chat Completions on Azure's v1 surface, `azure-openai-chat@1` | none: `--base-url https://<resource>.openai.azure.com/openai` | `AZURE_OPENAI_API_KEY` | Authenticates with the `api-key` header, no bearer, no `api-version` query (the registry refuses a query string). |
| `gemini`, `gemini-audio` | `generateContent` SSE, `gemini-generate-content@1`/`@2` | `https://generativelanguage.googleapis.com` | `GEMINI_API_KEY` | Implicit caching reported; explicit `cachedContent` refused. |
| `deepseek` | native Chat wire, `deepseek-chat@1` | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` | Thinking with full-text replay beside tools; cache hit/miss partition. |
| `ollama` | `/api/chat` NDJSON, `ollama-chat@1` | `http://127.0.0.1:11434` | none | Credential optional; `think` supported. |
| `groq` | Chat Completions dialect, `openai-compatible-chat@1` | `https://api.groq.com/openai` | `GROQ_API_KEY` | |
| `mistral` | same | `https://api.mistral.ai` | `MISTRAL_API_KEY` | |
| `xai` | same | `https://api.x.ai` | `XAI_API_KEY` | |
| `openrouter` | same | `https://openrouter.ai/api` | `OPENROUTER_API_KEY` | |
| `together` | same | `https://api.together.xyz` | `TOGETHER_API_KEY` | |
| `fireworks` | same | `https://api.fireworks.ai/inference` | `FIREWORKS_API_KEY` | |
| `lmstudio` | same | `http://127.0.0.1:1234` | none on loopback | |
| `vllm` | same | `http://127.0.0.1:8000` | none on loopback | |
| `llamacpp` | same (llama.cpp `llama-server`) | `http://127.0.0.1:8080` | none on loopback | |
| `stub` | local recording demonstration | — | none | Synthetic usage; `--fail-first` injects 429s. |
| `pi-ai:groq`, `pi-ai:huggingface`, `pi-ai:together` | bytes built by the optional `@earendil-works/pi-ai@1.3.0` peer | pi-ai catalog | `GROQ_API_KEY`, `HF_TOKEN`, `TOGETHER_API_KEY` | `agent-loop run` only; see ADR-016. The native `groq` and `together` routes above are the default; the pi-ai routes stay for operators who want pi-ai's catalog limits checked at prepare. |

The OpenAI-compatible routes post to `<origin>/v1/chat/completions` with the unchanged `openai-chat@4` bytes, so a recorded request on any of them is reconstructable by the existing encoder. Their identity is honest: the signed header names the real provider id and the `openai-compatible-chat` adapter, whose capability contract marks `image-input`, `cache-read-usage`, `cache-write-usage` and `video-input` **unknown** for a generic endpoint (refused before spend when a request needs them; a reported `cached_tokens` is still recorded) and `thinking-output`, `prompt-cache-control` and audio unsupported. No catalog pricing attaches to them, so cost stays `unavailable` rather than borrowing OpenAI's price list. Perplexity and DashScope (Qwen) are not listed: their endpoints do not follow the `/v1/chat/completions` path convention and would need their own route; use the gateway templates or `--provider openai --base-url` (which signs `providerId: "openai"`, a known limit).

Origins were taken from each provider's API reference on 2026-11-07 (Groq OpenAI compatibility, Mistral chat completions, xAI REST API, OpenRouter API reference, Together chat completions, Fireworks inference, LM Studio OpenAI compatibility, vLLM OpenAI-compatible server, llama.cpp `llama-server`, Azure OpenAI v1 API surface). `--base-url` always overrides, and AMC never probes an origin to pick one. Default credential references are used only against the provider's own documented origin; a different origin needs an explicit `--credential`. A local route without a credential is admitted only on a plain-http loopback origin (`127.x` or `[::1]`; `localhost` is not loopback).

Not native in this build: Anthropic on Bedrock (SigV4 and the Converse event stream) and Anthropic or Gemini on Vertex (OAuth2 access tokens). Both remain gateway templates with operator-supplied upstream and auth, and are deferred with a sketch in the providers plan.

## Reasoning controls

`--thinking enabled|disabled`, `--reasoning-effort <value>` and `--thinking-budget <tokens>` (SDK: `thinking`, `reasoningEffort`, `thinkingBudget`) are mapped by `src/llm/reasoningParams.ts`, then validated by each provider's contract. Values are sent verbatim; AMC never remaps an effort name from one provider's vocabulary to another's, so the signed header only ever carries what the operator wrote.

| Provider | `--thinking` | `--reasoning-effort` | `--thinking-budget` |
| --- | --- | --- | --- |
| `deepseek` | `thinking: {type}` | `reasoning_effort` low, high, max | refused |
| `anthropic` | `thinking: {type: "enabled", budget_tokens}` / `{type: "disabled"}` | refused | required with enabled: at least 1024 and below `--max-tokens` |
| `gemini`, `gemini-audio` | `thinkingConfig.includeThoughts` (disabled also sets `thinkingBudget: 0`) | `thinkingConfig.thinkingLevel` MINIMAL, LOW, MEDIUM, HIGH | `thinkingConfig.thinkingBudget` (not with a level) |
| `ollama` | `think: true|false` | `think` low, medium, high, max (not with `--thinking`) | refused |
| `openai`, `openai-responses`, compat routes, `azure-openai`, `stub` | refused | refused | refused |

Limits:

- Anthropic thinking is admitted only with `--tools none`. `anthropic-messages@4` records thinking blocks but cannot replay them with their signature, so a thinking turn that also calls tools, a `--session` resume, a fork and `agent-loop chat` are refused at prepare by capability admission (`thinking-replay` unsupported) before any spend. Signed replay (`signature_delta` on a signed block row, an `anthropic-messages@6` encoder) is deferred (D-01).
- OpenAI `reasoning_effort` and Responses `reasoning.effort` are not sent: both decoders refuse reasoning output and admission marks `thinking-output` unsupported, so sending the parameter would be refused at prepare. Decoding reasoning items and summaries is deferred (D-05).
- `agent-loop chat` keeps its own DeepSeek-only gate (tools-free chat needs `--thinking disabled` from the first turn); the new mappings reach run, acp, schedules and the SDKs.

## Prompt caching

- Anthropic: `cache_control` breakpoints on the system text, the last tool and the last block of the last message since `anthropic-messages@2`; `--cache-retention long` pins `anthropic-messages@5`, which marks those breakpoints `ttl: "1h"`. Usage records `cache_read_input_tokens` and `cache_creation_input_tokens` as disjoint counts; the 5m/1h `cache_creation` detail is not recorded yet.
- OpenAI Chat and Responses: automatic caching; `cached_tokens` becomes `cacheReadTokens` (subtracted from `prompt_tokens`, refused when inconsistent); Responses also reports cache writes. `--cache-retention` pins `openai-chat@5` / `openai-responses@4`, which send a deterministic `prompt_cache_key` for the stable prefix and `prompt_cache_retention` `in_memory` (short) or `24h` (long).
- DeepSeek `prompt_cache_hit_tokens`/`miss`, Gemini `cachedContentTokenCount` and Ollama's optional count are recorded as reported; a missing count stays unknown, never zero.
- `--cache-retention` is refused for every other route, including the OpenAI-compatible and Azure routes that share the OpenAI encoder: admission is keyed by adapter id (`anthropic-messages`, `openai-chat`, `openai-responses`), so a third-party server never receives retention keys under a signed header that claims a retention it may ignore.

Per-request cache reads, the request hit rate and the token read share are reported by the run report, `amc session show` and chat (`docs/NATIVE_PROVIDER_CACHE_REPORT.md`).

## Retries and provider delays

Each route freezes a retry policy at registration (`normal`: 5 retries of `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT` with 500 ms to 10 s jittered backoff; or `always`). The loop retries at the request boundary inside one step and writes a signed `loop/retry` row before each wait.

- `--max-retries <n>` and `--retry-max-delay <ms>` (SDK: `maxRetries`, `retryMaxDelayMs`) set that policy from the command line on run, acp and schedules; `--max-retries 0` gives up on the first failure. A `--retry-max-delay` below the 500 ms initial delay is refused.
- A provider's `Retry-After` (delta seconds or HTTP date) is honoured verbatim up to the route's provider ceiling, `backoff.maxProviderDelayMs` (default max(60 s, `maxDelayMs`)), which is separate from and never below the local backoff ceiling. A longer hint is clamped to the provider ceiling and the signed reason says so (`asked for 86400000ms, clamped to the route's 60000ms provider ceiling`).
- On a 429 without `Retry-After`, the wait is read from the rate-limit reset header whose remaining counter the provider reports as 0: `x-ratelimit-reset-requests` / `x-ratelimit-reset-tokens` (durations such as `6m0s`, `1.5s`, `20ms`) or `anthropic-ratelimit-{requests,input-tokens,output-tokens}-reset` (RFC 3339). When several counters are exhausted the longest wait is taken; when none is, nothing is inferred and local backoff applies. The recorded failure names the header in `providerDelayHeader` beside `providerRetryAfterMs`, so a derived wait is never signed as a `Retry-After` the provider never sent; the `loop/retry` reason repeats the header name.
- A terminal condition that arrives as a 429 (a spend cap) still retries up to the budget with waits bounded by the provider ceiling; quota wording in the body is classified `QUOTA` and not retried.

There is no fallback model chain: a step retries on the exact route it pinned, and an exhausted budget ends the turn with the typed error and a provider-outage incident when the session journaled actions. An explicit, recorded chain is designed but deferred (see the providers plan, SH-05): the design must decide the chain before the outage incident is written, register every link at composition and resolve same-provider links, none of which the current composition does.

## Model catalog and cost

Every pinned route carries a model-metadata snapshot (`modelMetadata` in the header): context window, max output, modalities, reasoning, tiered pricing, source, as-of date and freshness, from the single table in `src/product/modelPricing.ts`. Cost is projected per request and per session from that snapshot; a provider-reported cost takes precedence, and a missing component keeps the estimate `partial` or `unavailable` rather than becoming zero. The table has ten rows with legacy dates, so for most current models the run report says `unavailable (model-price)`; that is the honest state. Adding current rows is deferred: the table's schema requires routing heuristics (`qualityScore`, `typicalLatencyMs`) that no pricing page states, so new rows would have to invent them, and the DeepSeek/OpenAI/Gemini protocols never report a cache-write count, which the projection lists as missing. Both are product-schema changes recorded in the providers plan (SH-03). Operator-reviewed snapshots can be attached to a route through `LlmRouteConfig.reviewedModels` (library seam; no command-line loader yet).

## Structured output and token counting

Tool schemas are the only schema-constrained channel. `response_format`, Responses `text.format` and Gemini `responseSchema` have no surface (deferred, D-03). There is no local or remote token counting; context pressure for compaction uses the previous request's reported prompt tokens (deferred, D-04).

## Credentials

Routes hold credential references, never values (`src/credentials/credentialRef.ts`); `amc credentials list|describe|set|unset` manage the layered local store. A reference appears in route config, argv and signed rows; its value is resolved per request and never recorded.
