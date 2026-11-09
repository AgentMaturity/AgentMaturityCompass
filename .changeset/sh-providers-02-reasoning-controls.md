---
"agent-maturity-compass": minor
---

SH-PROVIDERS-02: reasoning controls on every native surface that has a decoded reasoning wire. `--thinking`, `--reasoning-effort` and the new `--thinking-budget <tokens>` (run, acp, schedules; `thinkingBudget` in the SDK) are mapped per provider by `src/llm/reasoningParams.ts`, values sent verbatim and never remapped across providers: DeepSeek as before; Anthropic `--thinking enabled` as adaptive thinking (`thinking: {type: "adaptive"}`, Claude 4.6 and later) or, with `--thinking-budget`, manual `{type: "enabled", budget_tokens}` (Claude 4.5/4.6; budget at least 1024 and below `--max-tokens`), both admitted only with `--tools none` because `anthropic-messages@4` cannot replay a signed thinking block beside tool calls (a resumed session is refused at prepare before spend), and `--reasoning-effort low|medium|high|xhigh|max` as `output_config.effort`, admitted beside tools; Gemini `thinkingConfig` (`includeThoughts`, `thinkingBudget`, or `thinkingLevel` MINIMAL|LOW|MEDIUM|HIGH); Ollama `think` (boolean or low|medium|high|max). OpenAI Chat and Responses, the OpenAI-compatible routes, Azure and the stub refuse these flags with the limit named (OpenAI reasoning output is not decoded yet, D-05). `agent-loop chat` applies the same mapping before its first turn and forwards the flags to each turn; it keeps the tools-free DeepSeek rule and refuses Anthropic `--thinking enabled`, whose second turn could not replay the thinking block.

The TypeScript sdk-api snapshot records provider-specific reasoning effort, thinking budget, cache retention and retry options.

freeze-exception: SH-PROVIDERS — new reasoning flags on existing native commands, asked for by the harness program.
