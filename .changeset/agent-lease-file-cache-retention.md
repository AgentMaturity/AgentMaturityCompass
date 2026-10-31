---
"agent-maturity-compass": patch
---

`amc agent-loop run` and `chat` accept `--lease-file <path>`: an issued agent lease (`amc lease issue`) in a private 0600 file you own, verified for the workspace and agent before use and never logged. Under a plan whose identity-binding requires an agent lease, a run with tools and no lease is now refused once at start with recovery steps (Studio, `amc lease issue`, `--lease-file`) instead of denying every governed call. Routes can set a prompt-cache retention (`short` or `long`): Anthropic gets 1h cache breakpoints for `long`, and OpenAI Chat and Responses get a stable `prompt_cache_key` with `in_memory` or `24h` retention. Retention routes use new encoder versions (anthropic-messages@5, openai-chat@5, openai-responses@4), so every earlier request digest stays reconstructable and routes without retention keep their current encoder.
