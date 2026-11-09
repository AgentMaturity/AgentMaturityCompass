---
"agent-maturity-compass": minor
---

The Python SDK's `AmcAgent` takes the native reasoning, retention and retry options the TypeScript SDK already had: `thinking`, `reasoning_effort` and the new `thinking_budget` reach deepseek, anthropic, gemini and ollama (refused for any other provider before anything is spawned, with `amc acp` checking each provider's exact values at startup), and `cache_retention`, `max_retries`, `retry_max_delay_ms` and `retry_max_provider_delay_ms` set the route's retention and retry policy, each bounded before launch as the CLI bounds it. `reasoning_effort` is no longer limited to DeepSeek's low, high and max.
