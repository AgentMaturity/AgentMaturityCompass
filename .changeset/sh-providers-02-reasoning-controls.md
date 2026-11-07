---
"agent-maturity-compass": minor
---

SH-PROVIDERS-02: reasoning controls on every native surface that has a decoded reasoning wire. `--thinking`, `--reasoning-effort` and the new `--thinking-budget <tokens>` (run, acp, schedules; `thinkingBudget` in the SDK) are mapped per provider by `src/llm/reasoningParams.ts`, values sent verbatim and never remapped across providers: DeepSeek as before; Anthropic `thinking: {type: "enabled", budget_tokens}` (budget at least 1024 and below `--max-tokens`, admitted only with `--tools none` because `anthropic-messages@4` cannot replay a signed thinking block beside tool calls, and a resumed session is refused at prepare before spend); Gemini `thinkingConfig` (`includeThoughts`, `thinkingBudget`, or `thinkingLevel` MINIMAL|LOW|MEDIUM|HIGH); Ollama `think` (boolean or low|medium|high|max). OpenAI Chat and Responses, the OpenAI-compatible routes, Azure and the stub refuse these flags with the limit named (OpenAI reasoning output is not decoded yet, D-05). `agent-loop chat` keeps its DeepSeek-only gate.

freeze-exception: SH-PROVIDERS — new reasoning flags on existing native commands, asked for by the harness program.
